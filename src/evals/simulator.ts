import type Anthropic from "@anthropic-ai/sdk";
import { AgentSession, type SessionRecord } from "../agent/session.js";
import { FALLBACK_BETA } from "../lib/anthropic.js";
import type { LenderConfig, ModelConfig } from "../lib/config.js";
import { addUsage, emptyTally, type UsageTally } from "../lib/cost.js";
import { personaNow, truthFor, type Persona } from "./personas.js";

const END = "[END]";

function plain(v: string | number | boolean): string {
  return typeof v === "string" ? v.replace(/_/g, " ") : String(v);
}

export function buildSimulatorPrompt(cfg: LenderConfig, p: Persona): string {
  const labels = new Map(cfg.qualification.fields.map((f) => [f.id, f.label]));
  const facts = Object.entries(truthFor(cfg, p))
    .map(([k, v]) => `- ${labels.get(k) ?? k}: ${plain(v)}`)
    .join("\n");
  return `You are role-playing a person texting with an automated assistant from ${cfg.lender.name}, a fictional ${cfg.lender.kind.replace(/_/g, " ")}. This is a test of that assistant. Stay fully in character and never say you are simulated or an AI.

# Who you are
${p.intake.first_name} ${p.intake.last_name}. A few minutes ago you submitted a refinance inquiry on their website.

# Your real situation (the truth; never contradict it)
${facts}

# How you behave
${p.behavior}

# Rules
- Write like a real text message: usually 1-2 short sentences.
- Share facts when asked or when your personality says to. Don't recite everything at once.
- If asked something not covered above, improvise a plausible answer and stay consistent.
- When the conversation is over for you (you were connected to a person, a callback is set, you opted out and it was confirmed, or the assistant said goodbye), reply with exactly ${END}.
- Output only the text you would send. No narration, no quotes.`;
}

/** Plays a borrower persona. The agent's messages arrive as "user" turns; the borrower's are "assistant" turns. */
export class BorrowerSimulator {
  readonly usage: UsageTally;
  private history: Anthropic.Beta.BetaMessageParam[] = [];
  private readonly system: string;

  constructor(
    private readonly cfg: LenderConfig,
    private readonly persona: Persona,
    private readonly models: ModelConfig,
    private readonly client: Anthropic,
  ) {
    this.system = buildSimulatorPrompt(cfg, persona);
    this.usage = emptyTally(models.roles.simulator.model);
  }

  /** Returns the borrower's next message, or null if they are done talking. */
  async reply(agentText: string): Promise<string | null> {
    const role = this.models.roles.simulator;
    this.history.push({ role: "user", content: agentText });
    const response = await this.client.beta.messages.create({
      model: role.model,
      max_tokens: role.max_tokens,
      output_config: { effort: role.effort },
      cache_control: { type: "ephemeral" },
      system: this.system,
      messages: this.history,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
    });
    addUsage(this.usage, response.usage);
    this.history.push({ role: "assistant", content: response.content });
    if (response.stop_reason === "refusal") return null;

    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join(" ")
      .replace(END, "")
      .trim();
    return text || null;
  }
}

export interface ConversationResult {
  persona_id: string;
  run_index: number;
  record: SessionRecord;
  simulator_usage: UsageTally;
  stopped_because: "agent_closed" | "borrower_done" | "max_turns" | "agent_silent" | "error";
  error?: string;
}

/** Play one persona against the agent until someone ends it or we hit the turn limit. */
export async function runConversation(opts: {
  cfg: LenderConfig;
  persona: Persona;
  models: ModelConfig;
  client: Anthropic;
  runIndex: number;
  maxBorrowerTurns: number;
}): Promise<ConversationResult> {
  const { cfg, persona, models, client } = opts;
  const session = new AgentSession({ lender: cfg, intake: persona.intake, now: personaNow(persona), models, client });
  const sim = new BorrowerSimulator(cfg, persona, models, client);
  let stopped: ConversationResult["stopped_because"] = "max_turns";
  let error: string | undefined;

  try {
    let agentText = (await session.start()).text;
    for (let turn = 0; turn < opts.maxBorrowerTurns; turn++) {
      if (session.status !== "active") {
        stopped = "agent_closed";
        break;
      }
      if (!agentText) {
        stopped = "agent_silent";
        break;
      }
      const borrowerText = await sim.reply(agentText);
      if (!borrowerText) {
        stopped = "borrower_done";
        break;
      }
      agentText = (await session.send(borrowerText)).text;
    }
    if (stopped === "max_turns" && session.status !== "active") stopped = "agent_closed";
  } catch (e) {
    stopped = "error";
    error = e instanceof Error ? e.message : String(e);
  }

  return {
    persona_id: persona.id,
    run_index: opts.runIndex,
    record: session.toRecord(),
    simulator_usage: { ...sim.usage },
    stopped_because: stopped,
    ...(error ? { error } : {}),
  };
}
