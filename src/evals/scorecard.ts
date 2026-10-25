import type { ModelConfig } from "../lib/config";
import { costUsd, type UsageTally } from "../lib/cost";
import type { DeterministicResult, Violation } from "./checks";
import type { JudgeOutput } from "./judge";
import type { Outcome } from "./personas";

export interface ConversationScore {
  persona_id: string;
  run_index: number;
  expected_outcome: Outcome;
  actual_outcome: Outcome;
  handoff_correct: boolean;
  borrower_chose_callback: boolean;
  field_precision: number | null;
  field_recall: number | null; // null when recall doesn't apply (opt-out, callback, follow-up)
  disclosure_ok: boolean;
  opt_out: "pass" | "fail" | "n/a";
  violations: Violation[]; // severity "violation" only counts against compliance
  objection_score: number | null;
  naturalness: number | null;
  borrower_experience: number | null;
  clear_next_step: boolean | null;
  borrower_end_state: string | null;
  handoff_summary_score: number | null;
  borrower_turns: number;
  stopped_because: string;
  cost: { agent: number; simulator: number; judge: number; total: number };
  judge_error?: string;
}

export function buildConversationScore(args: {
  persona_id: string;
  run_index: number;
  checks: DeterministicResult;
  violations: Violation[];
  judge: JudgeOutput | null;
  objection_score: number | null;
  judge_error?: string;
  stopped_because: string;
  usage: { agent: UsageTally; simulator: UsageTally; judge: UsageTally };
  pricing: ModelConfig["pricing"];
}): ConversationScore {
  const c = args.checks;
  const agent = costUsd(args.pricing, args.usage.agent);
  const simulator = costUsd(args.pricing, args.usage.simulator);
  const judge = costUsd(args.pricing, args.usage.judge);
  return {
    persona_id: args.persona_id,
    run_index: args.run_index,
    expected_outcome: c.expected_outcome,
    actual_outcome: c.actual_outcome,
    handoff_correct: c.handoff_correct,
    borrower_chose_callback: c.borrower_chose_callback,
    field_precision: c.fields.precision,
    field_recall: c.recall_applicable ? c.fields.recall : null,
    disclosure_ok: c.disclosure.ok,
    opt_out: c.opt_out.status,
    violations: args.violations,
    objection_score: args.objection_score,
    naturalness: args.judge?.naturalness_score ?? null,
    borrower_experience: args.judge?.borrower_experience_score ?? null,
    clear_next_step: args.judge ? args.judge.clear_next_step : null,
    borrower_end_state: args.judge?.borrower_end_state ?? null,
    handoff_summary_score: args.judge?.handoff_summary_score ?? null,
    borrower_turns: c.borrower_turns,
    stopped_because: args.stopped_because,
    cost: { agent, simulator, judge, total: round(agent + simulator + judge, 4) },
    ...(args.judge_error ? { judge_error: args.judge_error } : {}),
  };
}

// ---------- Aggregation ----------

export interface Metrics {
  conversations: number;
  handoff_accuracy: number | null;
  field_precision: number | null;
  field_recall: number | null;
  compliance_clean_rate: number | null; // share of conversations with zero "violation"-severity findings
  violations_total: number;
  warnings_total: number;
  disclosure_rate: number | null;
  opt_out_honored_rate: number | null;
  objection_handling: number | null;
  naturalness: number | null;
  borrower_experience: number | null;
  clear_next_step_rate: number | null;
  frustrated_or_confused_rate: number | null;
  handoff_summary_quality: number | null;
  avg_borrower_turns: number | null;
  cost_total: number;
  cost_per_conversation: number | null;
}

export interface Scorecard {
  lender_id: string;
  run_id: string;
  created_at: string;
  models: { agent: string; simulator: string; judge: string };
  config: { conversations_per_persona: number; max_borrower_turns: number };
  overall: Metrics;
  by_persona: Record<string, Metrics>;
  violations_by_rule: Record<string, number>;
  conversations: ConversationScore[];
  notes: string[];
}

function round(n: number, digits = 3): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** Mean of the non-null values, or null if there are none. */
export function mean(values: (number | null | undefined)[]): number | null {
  const v = values.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  return v.length ? round(v.reduce((s, x) => s + x, 0) / v.length) : null;
}

const rate = (bools: boolean[]): number | null => (bools.length ? round(bools.filter(Boolean).length / bools.length) : null);

export function aggregate(scores: ConversationScore[]): Metrics {
  const hard = (s: ConversationScore) => s.violations.filter((v) => v.severity === "violation");
  const cost_total = round(scores.reduce((s, c) => s + c.cost.total, 0), 4);
  return {
    conversations: scores.length,
    handoff_accuracy: rate(scores.map((s) => s.handoff_correct)),
    field_precision: mean(scores.map((s) => s.field_precision)),
    field_recall: mean(scores.map((s) => s.field_recall)),
    compliance_clean_rate: rate(scores.map((s) => hard(s).length === 0)),
    violations_total: scores.reduce((n, s) => n + hard(s).length, 0),
    warnings_total: scores.reduce((n, s) => n + s.violations.length - hard(s).length, 0),
    disclosure_rate: rate(scores.map((s) => s.disclosure_ok)),
    opt_out_honored_rate: rate(scores.filter((s) => s.opt_out !== "n/a").map((s) => s.opt_out === "pass")),
    objection_handling: mean(scores.map((s) => s.objection_score)),
    naturalness: mean(scores.map((s) => s.naturalness)),
    borrower_experience: mean(scores.map((s) => s.borrower_experience)),
    clear_next_step_rate: rate(scores.filter((s) => s.clear_next_step !== null).map((s) => s.clear_next_step === true)),
    frustrated_or_confused_rate: rate(scores.filter((s) => s.borrower_end_state !== null).map((s) => s.borrower_end_state === "frustrated" || s.borrower_end_state === "confused")),
    handoff_summary_quality: mean(scores.map((s) => s.handoff_summary_score)),
    avg_borrower_turns: mean(scores.map((s) => s.borrower_turns)),
    cost_total,
    cost_per_conversation: scores.length ? round(cost_total / scores.length, 4) : null,
  };
}

export function buildScorecard(base: Omit<Scorecard, "overall" | "by_persona" | "violations_by_rule" | "notes">): Scorecard {
  const by_persona: Record<string, Metrics> = {};
  for (const id of [...new Set(base.conversations.map((c) => c.persona_id))].sort()) {
    by_persona[id] = aggregate(base.conversations.filter((c) => c.persona_id === id));
  }
  const violations_by_rule: Record<string, number> = {};
  for (const v of base.conversations.flatMap((c) => c.violations)) {
    const key = v.severity === "warning" ? `${v.rule_id} (warning)` : v.rule_id;
    violations_by_rule[key] = (violations_by_rule[key] ?? 0) + 1;
  }
  const notes: string[] = [];
  const errors = base.conversations.filter((c) => c.stopped_because === "error" || c.judge_error).length;
  if (errors) notes.push(`${errors} conversation(s) hit an API or judge error; see conversation files.`);
  const chose = base.conversations.filter((c) => c.borrower_chose_callback).length;
  if (chose) notes.push(`${chose} qualified borrower(s) were offered an immediate call and chose a later callback; counted as correct.`);
  const maxed = base.conversations.filter((c) => c.stopped_because === "max_turns").length;
  if (maxed) notes.push(`${maxed} conversation(s) hit the turn limit without finishing.`);
  return { ...base, overall: aggregate(base.conversations), by_persona, violations_by_rule, notes };
}

// ---------- Rendering ----------

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);
const five = (n: number | null) => (n === null ? "—" : n.toFixed(1));
const usd = (n: number | null) => (n === null ? "—" : `$${n.toFixed(2)}`);

export function renderSummaryMarkdown(sc: Scorecard, labels: Record<string, string> = {}): string {
  const o = sc.overall;
  const lines = [
    `# Eval scorecard: ${sc.lender_id}`,
    ``,
    `Run \`${sc.run_id}\` · ${o.conversations} simulated conversations · agent \`${sc.models.agent}\`, simulator \`${sc.models.simulator}\`, judge \`${sc.models.judge}\``,
    ``,
    `_Synthetic evaluation: simulated borrowers against a fictional lender. Not real-world results. Compliance rules are illustrative, not legal guidance._`,
    ``,
    `## Overall`,
    ``,
    `| Metric | Score | How it's measured |`,
    `|---|---|---|`,
    `| Handoff correctness | ${pct(o.handoff_accuracy)} | Outcome matches lender rules applied to hidden ground truth (rule-based) |`,
    `| Qualification recall | ${pct(o.field_recall)} | Correct fields captured, for borrowers who should be transferred (rule-based) |`,
    `| Qualification precision | ${pct(o.field_precision)} | Captured fields that match ground truth (rule-based) |`,
    `| Compliance-clean conversations | ${pct(o.compliance_clean_rate)} | No violations from regex rules or judge (${o.violations_total} violations, ${o.warnings_total} warnings) |`,
    `| AI disclosure in first message | ${pct(o.disclosure_rate)} | Required phrases present (rule-based) |`,
    `| Opt-out honored | ${pct(o.opt_out_honored_rate)} | Ended immediately, ≤1 message, no questions (rule-based) |`,
    `| Objection handling | ${five(o.objection_handling)} / 5 | LLM judge, per objection |`,
    `| Naturalness | ${five(o.naturalness)} / 5 | LLM judge |`,
    `| Borrower experience | ${five(o.borrower_experience)} / 5 | LLM judge: respected, informed, honest expectations |`,
    `| Ended with a clear next step | ${pct(o.clear_next_step_rate)} | LLM judge: knows who contacts them, how, and when |`,
    `| Ended frustrated or confused | ${pct(o.frustrated_or_confused_rate)} | LLM judge (lower is better) |`,
    `| Handoff summary quality | ${five(o.handoff_summary_quality)} / 5 | LLM judge, transfers only |`,
    `| Avg borrower turns | ${o.avg_borrower_turns ?? "—"} | |`,
    `| Cost | ${usd(o.cost_total)} total, ${usd(o.cost_per_conversation)} per conversation | Measured from API token usage |`,
    ``,
    `## By persona`,
    ``,
    `| Persona | n | Handoff | Recall | Clean | Objections | Natural | Experience | Next step | Cost/conv |`,
    `|---|---|---|---|---|---|---|---|---|---|`,
    ...Object.entries(sc.by_persona).map(
      ([id, m]) =>
        `| ${labels[id] ?? id} | ${m.conversations} | ${pct(m.handoff_accuracy)} | ${pct(m.field_recall)} | ${pct(m.compliance_clean_rate)} | ${five(m.objection_handling)} | ${five(m.naturalness)} | ${five(m.borrower_experience)} | ${pct(m.clear_next_step_rate)} | ${usd(m.cost_per_conversation)} |`,
    ),
    ``,
  ];
  const rules = Object.entries(sc.violations_by_rule);
  lines.push(`## Findings by rule`, ``);
  lines.push(rules.length ? rules.map(([k, n]) => `- ${k}: ${n}`).join("\n") : "- none", ``);
  const misses = sc.conversations.filter((c) => !c.handoff_correct);
  if (misses.length) {
    lines.push(`## Handoff misses`, ``);
    for (const m of misses) lines.push(`- ${m.persona_id} #${m.run_index}: expected **${m.expected_outcome}**, got **${m.actual_outcome}** (${m.stopped_because})`);
    lines.push(``);
  }
  if (sc.notes.length) lines.push(`## Notes`, ``, ...sc.notes.map((n) => `- ${n}`), ``);
  return lines.join("\n");
}
