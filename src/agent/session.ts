import type Anthropic from "@anthropic-ai/sdk";
import { FALLBACK_BETA, getClient } from "../lib/anthropic.js";
import { loadLenderConfig, loadModelConfig, type LenderConfig, type ModelConfig } from "../lib/config.js";
import { addUsage, costUsd, emptyTally, type UsageTally } from "../lib/cost.js";
import { computeLtv, evaluateHandoff, mergeLeadFields, missingRequiredFields, type LeadFields } from "./lead.js";
import { isHardStop } from "./optout.js";
import { buildIntakeMessage, buildSystemPrompt, type LeadIntake } from "./prompt.js";
import { buildTools, type CallbackInput, type EndInput, type TransferInput } from "./tools.js";

export type SessionStatus = "active" | "transferred" | "callback_booked" | "ended" | "opted_out";

export interface ToolEvent {
  name: string;
  input: unknown;
  result: string;
  is_error: boolean;
}

export interface TranscriptTurn {
  role: "agent" | "borrower";
  text: string;
  events?: ToolEvent[];
  /** Set when a reply was produced without calling the model (e.g. hard-stop opt-out). */
  deterministic?: boolean;
}

export interface HandoffSummary {
  lender: string;
  borrower: { first_name: string; last_name: string };
  reason: TransferInput["reason"];
  borrower_summary: string;
  borrower_goal: string;
  qualification: LeadFields;
  missing_fields: string[];
  ltv: number | null;
  sentiment: TransferInput["sentiment"];
  objections_raised: string[];
  open_questions: string[];
  recommended_next_step: string;
}

export interface SessionRecord {
  lender_id: string;
  simulated_now: string;
  intake: LeadIntake;
  status: SessionStatus;
  transcript: TranscriptTurn[];
  lead: LeadFields;
  handoff: HandoffSummary | null;
  callback: CallbackInput | null;
  end: EndInput | null;
  usage: UsageTally;
  cost_usd: number;
}

export interface AgentReply {
  text: string | null;
  status: SessionStatus;
  events: ToolEvent[];
}

export interface SessionOptions {
  lender: string | LenderConfig;
  intake: LeadIntake;
  /** Simulated "now", so evals can test business-hours rules. Defaults to the real clock. */
  now?: Date;
  models?: ModelConfig;
  client?: Anthropic;
}

const MAX_TOOL_ROUNDS = 6;

export class AgentSession {
  readonly cfg: LenderConfig;
  readonly models: ModelConfig;
  readonly now: Date;
  readonly intake: LeadIntake;

  status: SessionStatus = "active";
  lead: LeadFields = {};
  transcript: TranscriptTurn[] = [];
  handoff: HandoffSummary | null = null;
  callback: CallbackInput | null = null;
  end: EndInput | null = null;
  usage: UsageTally;

  private client: Anthropic | undefined;
  private history: Anthropic.Beta.BetaMessageParam[] = [];
  private readonly system: string;
  private readonly tools: Anthropic.Beta.BetaTool[];

  constructor(opts: SessionOptions) {
    this.cfg = typeof opts.lender === "string" ? loadLenderConfig(opts.lender) : opts.lender;
    this.models = opts.models ?? loadModelConfig();
    this.now = opts.now ?? new Date();
    this.intake = opts.intake;
    this.client = opts.client;
    this.system = buildSystemPrompt(this.cfg);
    this.tools = buildTools(this.cfg);
    this.usage = emptyTally(this.models.roles.agent.model);
  }

  /** The agent's opening outreach message. */
  async start(): Promise<AgentReply> {
    if (this.history.length) throw new Error("session already started");
    this.history.push({ role: "user", content: buildIntakeMessage(this.cfg, this.intake, this.now) });
    return this.runAgentTurn();
  }

  async send(borrowerText: string): Promise<AgentReply> {
    if (!this.history.length) throw new Error("call start() first");
    if (this.status !== "active") return { text: null, status: this.status, events: [] };

    this.transcript.push({ role: "borrower", text: borrowerText });
    this.history.push({ role: "user", content: borrowerText });

    // Hard-stop keywords are honored in code, before the model is involved.
    if (isHardStop(this.cfg, borrowerText)) {
      const text = this.cfg.compliance.opt_out.canned_reply.trim();
      this.status = "opted_out";
      this.end = { reason: "opted_out", notes: "Hard-stop keyword" };
      this.history.push({ role: "assistant", content: text });
      this.transcript.push({ role: "agent", text, deterministic: true });
      return { text, status: this.status, events: [] };
    }
    return this.runAgentTurn();
  }

  get costUsd(): number {
    return costUsd(this.models.pricing, this.usage);
  }

  toRecord(): SessionRecord {
    return {
      lender_id: this.cfg.lender.id,
      simulated_now: this.now.toISOString(),
      intake: this.intake,
      status: this.status,
      transcript: this.transcript,
      lead: { ...this.lead },
      handoff: this.handoff,
      callback: this.callback,
      end: this.end,
      usage: { ...this.usage },
      cost_usd: this.costUsd,
    };
  }

  // ---------- internals ----------

  private async runAgentTurn(): Promise<AgentReply> {
    const role = this.models.roles.agent;
    const client = (this.client ??= getClient());
    const texts: string[] = [];
    const events: ToolEvent[] = [];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const params: Anthropic.Beta.MessageCreateParamsNonStreaming = {
        model: role.model,
        max_tokens: role.max_tokens,
        output_config: { effort: role.effort },
        cache_control: { type: "ephemeral" as const }, // caches tools + system + history prefix
        system: this.system,
        tools: this.tools,
        messages: this.history,
        betas: [FALLBACK_BETA],
        fallbacks: "default",                          // re-run on Anthropic's recommended model if declined
      };
      const response = await client.beta.messages.create(params);

      addUsage(this.usage, response.usage);
      // Append the full content unchanged (keeps thinking blocks valid for the next call).
      this.history.push({ role: "assistant", content: response.content });

      if (response.stop_reason === "refusal") {
        texts.push("Thanks for your patience. I'll have a licensed loan officer follow up with you directly.");
        break;
      }

      for (const block of response.content) {
        if (block.type === "text" && block.text.trim()) texts.push(block.text.trim());
      }

      const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (response.stop_reason !== "tool_use" || toolUses.length === 0) break;

      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const use of toolUses) {
        const { result, is_error } = this.executeTool(use.name, use.input);
        events.push({ name: use.name, input: use.input, result, is_error });
        results.push({ type: "tool_result", tool_use_id: use.id, content: result, is_error });
      }
      this.history.push({ role: "user", content: results });
    }

    const text = texts.join("\n\n") || null;
    if (text || events.length) this.transcript.push({ role: "agent", text: text ?? "", events });
    return { text, status: this.status, events };
  }

  private executeTool(name: string, input: unknown): { result: string; is_error: boolean } {
    const isTerminal = name !== "record_lead_info";
    if (isTerminal && this.status !== "active") {
      return { result: `Conversation already closed (${this.status}). Send a brief closing message only.`, is_error: true };
    }
    switch (name) {
      case "record_lead_info":
        return this.recordLead(input as Record<string, unknown>);
      case "transfer_to_loan_officer":
        return this.transfer(input as TransferInput);
      case "schedule_callback": {
        const cb = input as CallbackInput;
        const optional = cb.reason === "borrower_busy" || cb.reason === "borrower_request";
        if (
          this.cfg.handoff.offer_immediate_before_callback &&
          optional &&
          !cb.immediate_call_offered &&
          evaluateHandoff(this.cfg, this.lead, this.now, "qualified").action === "transfer"
        ) {
          return {
            result:
              "Not booked yet. This borrower is qualified and a loan officer can call now. First offer the immediate call in one short message " +
              "(e.g. \"A loan officer can call you in about 5 minutes, or I can book that later time. Which works better?\"). " +
              "If they pick the later time, call schedule_callback again with immediate_call_offered true. If they pick now, transfer.",
            is_error: true,
          };
        }
        this.callback = cb;
        this.status = "callback_booked";
        return {
          result: `Callback booked. In one short message, confirm the time and say who will call (a licensed loan officer, or Member Services for a membership call)${this.cfg.handoff.follow_up_timeframe && (this.callback.reason === "loan_officer_review" || this.callback.reason === "membership_services") ? ` (${this.cfg.handoff.follow_up_timeframe} at the latest)` : ""}. Then close.`,
          is_error: false,
        };
      }
      case "end_conversation": {
        this.end = input as EndInput;
        this.status = this.end.reason === "opted_out" ? "opted_out" : "ended";
        return { result: "Conversation ended. Send one short closing message. Do not ask any questions.", is_error: false };
      }
      default:
        return { result: `Unknown tool ${name}`, is_error: true };
    }
  }

  private recordLead(update: Record<string, unknown>): { result: string; is_error: boolean } {
    const merged = mergeLeadFields(this.cfg, this.lead, update);
    const missing = missingRequiredFields(this.cfg, this.lead);
    const parts = [
      merged.applied.length ? `Saved: ${merged.applied.join(", ")}.` : "Nothing new saved.",
      merged.rejected.length ? `Rejected: ${merged.rejected.map((r) => `${r.field} (${r.reason})`).join("; ")}.` : "",
      missing.length ? `Still needed: ${missing.join(", ")}.` : "All required fields collected. Check handoff rules and transfer if appropriate.",
    ];
    return { result: parts.filter(Boolean).join(" "), is_error: merged.rejected.length > 0 && merged.applied.length === 0 };
  }

  private transfer(input: TransferInput): { result: string; is_error: boolean } {
    const decision = evaluateHandoff(this.cfg, this.lead, this.now, input.reason);
    switch (decision.action) {
      case "transfer":
        this.status = "transferred";
        this.handoff = {
          lender: this.cfg.lender.name,
          borrower: { first_name: this.intake.first_name, last_name: this.intake.last_name },
          reason: input.reason,
          borrower_summary: input.borrower_summary,
          borrower_goal: input.borrower_goal,
          qualification: { ...this.lead },
          missing_fields: missingRequiredFields(this.cfg, this.lead),
          ltv: computeLtv(this.lead),
          sentiment: input.sentiment,
          objections_raised: input.objections_raised,
          open_questions: input.open_questions,
          recommended_next_step: input.recommended_next_step,
        };
        return {
          result: `Transfer initiated.${this.cfg.handoff.transfer_mechanics ? ` ${this.cfg.handoff.transfer_mechanics.trim()}` : ""} ${this.cfg.handoff.transfer_message_guidance.trim()}`,
          is_error: false,
        };
      case "ask_more":
        return { result: `Not transferred. ${decision.detail} Ask for: ${decision.missing.join(", ")}.`, is_error: true };
      case "callback":
        return {
          result: `Not transferred: live transfer is unavailable right now. ${decision.detail} Offer a callback and use schedule_callback with reason "after_hours".`,
          is_error: true,
        };
      case "follow_up":
        return {
          result: `Not transferred. ${decision.detail} ${
            decision.why === "not_member"
              ? this.cfg.handoff.non_member_action === "book_callback"
                ? `Do not end the conversation. Follow the non-member guidance: explain membership honestly, offer to finish the remaining details, then book a Member Services call with schedule_callback (reason "membership_services").`
                : `Use end_conversation with reason "not_a_member".`
              : this.cfg.handoff.not_eligible_action === "book_callback"
                ? `Finish collecting any missing details first, then offer a call and use schedule_callback with reason "loan_officer_review".`
                : `Use end_conversation with reason "follow_up_by_email".`
          }`,
          is_error: true,
        };
    }
  }
}
