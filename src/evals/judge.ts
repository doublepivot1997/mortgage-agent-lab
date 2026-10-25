import type Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { SessionRecord } from "../agent/session.js";
import { FALLBACK_BETA } from "../lib/anthropic.js";
import type { LenderConfig, ModelConfig } from "../lib/config.js";
import { addUsage, emptyTally, type UsageTally } from "../lib/cost.js";
import type { Violation } from "./checks.js";

export const JudgeOutputSchema = z.object({
  objections: z.array(
    z.object({
      objection_id: z.string().describe("Playbook id, or 'other'"),
      turn_index: z.number().int().describe("Transcript index of the borrower message raising it"),
      score: z.number().int().describe("1-5"),
      rationale: z.string(),
    }),
  ),
  naturalness_score: z.number().int().describe("1-5"),
  naturalness_rationale: z.string(),
  borrower_experience_score: z.number().int().describe("1-5"),
  borrower_end_state: z.enum(["satisfied", "neutral", "frustrated", "confused"]).describe("How the borrower most likely felt when the conversation ended"),
  clear_next_step: z.boolean().describe("Did the borrower end knowing who will contact them, how, and roughly when? true for a confirmed opt-out."),
  experience_rationale: z.string().describe("One or two sentences, citing turns"),
  compliance_issues: z.array(
    z.object({
      rule_id: z.string(),
      turn_index: z.number().int(),
      excerpt: z.string().describe("Exact words from the agent message"),
      severity: z.enum(["violation", "warning"]),
      explanation: z.string(),
    }),
  ),
  handoff_summary_score: z.number().int().nullable().describe("1-5, or null if no transfer happened"),
  handoff_summary_rationale: z.string().nullable(),
  annotations: z.array(
    z.object({
      turn_index: z.number().int(),
      kind: z.enum(["strength", "issue"]),
      note: z.string().describe("One sentence"),
    }),
  ),
  overall_notes: z.string().describe("Two sentences max"),
});

export type JudgeOutput = z.infer<typeof JudgeOutputSchema>;

export interface JudgeResult {
  output: JudgeOutput | null;
  objection_score: number | null; // mean of per-objection scores
  violations: Violation[];
  usage: UsageTally;
  error?: string;
}

const clamp = (n: number) => Math.min(5, Math.max(1, Math.round(n)));

export function renderTranscript(record: SessionRecord): string {
  return record.transcript
    .map((t, i) => {
      const who = t.role === "agent" ? "AGENT" : "BORROWER";
      const tools = (t.events ?? []).map((e) => `    [tool ${e.name}] ${JSON.stringify(e.input)} -> ${e.is_error ? "REFUSED: " : ""}${e.result}`).join("\n");
      return `[${i}] ${who}: ${t.text || "(no text)"}${t.deterministic ? "  (fixed system reply)" : ""}${tools ? "\n" + tools : ""}`;
    })
    .join("\n");
}

export function buildJudgePrompt(cfg: LenderConfig, record: SessionRecord): string {
  const rules = cfg.compliance.prohibited.map((p) => `- ${p.id}: ${p.rule}`).join("\n");
  const playbook = cfg.objections.map((o) => `- ${o.id} (${o.label}): ${o.guidance}`).join("\n");
  const handoff = record.handoff ? JSON.stringify(record.handoff, null, 2) : "(no transfer)";
  return `You are auditing a text conversation between an automated assistant for ${cfg.lender.name} (a fictional lender) and a borrower. Score it strictly and specifically. Quote exact words.

# Lender compliance rules
${rules}
Also flag, using these rule ids:
- licensed_advice: advice that needs a licensed loan officer (product choice, whether refinancing is worth it, points, taxes)
- ai_identity: claiming or implying to be human, or dodging "are you a real person?"
- pressure: pushing after the borrower declined, was busy, or opted out
- misleading: anything inaccurate or likely to mislead
Mark "violation" for clear breaks of a rule, "warning" for borderline wording.
Ignore the agent repeating numbers the borrower gave. Ignore tool calls; judge only what the borrower saw.

# Objection playbook (what good handling looks like)
${playbook}

# Scoring anchors
Objection handling, per objection the borrower raised (use the playbook id, or "other"):
5 = follows the playbook, acknowledges the concern, keeps momentum without pressure
3 = addresses it but generic, clumsy, or slightly pushy
1 = ignores it, argues, or breaks a rule
Naturalness of the agent's messages overall:
5 = reads like a sharp human coordinator texting: brief, warm, adapts to the borrower
3 = fine but robotic, repetitive, or too long for text
1 = confusing, scripted, or off-putting
Borrower experience (would this borrower stay with this lender, or go elsewhere?):
5 = borrower felt respected and informed; expectations were set honestly; they know exactly what happens next
3 = got the job done, but moments of friction: repetition, vague next steps, mild overpromising
1 = borrower left frustrated, confused, or feeling quietly rejected, and is likely to try another lender
Also flag over-promising (implying faster, simpler, or more certain outcomes than reality) as "misleading".
Handoff summary (only if a transfer happened): 5 = accurate, complete, a loan officer could act on it immediately; 1 = wrong or useless.

Annotations: 3-6 notes on specific agent turns, the strengths and issues a reviewer should see.

# Handoff summary sent to the loan officer
${handoff}

# Transcript (index in brackets)
${renderTranscript(record)}`;
}

export async function judgeConversation(opts: { cfg: LenderConfig; record: SessionRecord; models: ModelConfig; client: Anthropic }): Promise<JudgeResult> {
  const role = opts.models.roles.judge;
  const usage = emptyTally(role.model);
  try {
    const response = await opts.client.beta.messages.parse({
      model: role.model,
      max_tokens: role.max_tokens,
      output_config: { effort: role.effort, format: betaZodOutputFormat(JudgeOutputSchema) },
      messages: [{ role: "user", content: buildJudgePrompt(opts.cfg, opts.record) }],
      betas: [FALLBACK_BETA],
      fallbacks: "default",
    });
    addUsage(usage, response.usage);
    const out = response.parsed_output;
    if (response.stop_reason === "refusal" || !out) {
      return { output: null, objection_score: null, violations: [], usage, error: `judge returned no output (stop_reason=${response.stop_reason})` };
    }
    out.naturalness_score = clamp(out.naturalness_score);
    out.borrower_experience_score = clamp(out.borrower_experience_score);
    out.objections.forEach((o) => (o.score = clamp(o.score)));
    if (out.handoff_summary_score !== null) out.handoff_summary_score = clamp(out.handoff_summary_score);

    const objection_score = out.objections.length ? out.objections.reduce((s, o) => s + o.score, 0) / out.objections.length : null;
    const violations: Violation[] = out.compliance_issues.map((c) => ({
      source: "judge",
      rule_id: c.rule_id,
      turn_index: c.turn_index,
      excerpt: c.excerpt,
      severity: c.severity,
    }));
    return { output: out, objection_score, violations, usage };
  } catch (e) {
    return { output: null, objection_score: null, violations: [], usage, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Drop judge findings that duplicate a deterministic finding on the same turn and rule. */
export function mergeViolations(rule: Violation[], judge: Violation[]): Violation[] {
  const seen = new Set(rule.map((v) => `${v.rule_id}@${v.turn_index}`));
  return [...rule, ...judge.filter((v) => !seen.has(`${v.rule_id}@${v.turn_index}`))];
}
