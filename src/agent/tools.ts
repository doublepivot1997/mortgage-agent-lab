import type Anthropic from "@anthropic-ai/sdk";
import type { FieldDef, LenderConfig } from "../lib/config.js";

type Tool = Anthropic.Beta.BetaTool;
type JsonSchema = Record<string, unknown>;

function fieldSchema(f: FieldDef): JsonSchema {
  const base: JsonSchema =
    f.type === "enum"
      ? { type: "string", enum: f.values }
      : f.type === "number"
        ? { type: "number" }
        : { type: "boolean" };
  return { anyOf: [base, { type: "null" }], description: `${f.label}. ${f.ask} Use null if not stated.` };
}

/** Tool definitions are generated from the lender config, in a fixed order so the prompt prefix caches. */
export function buildTools(cfg: LenderConfig): Tool[] {
  const fields = cfg.qualification.fields;
  const who = cfg.lender.customer_term;

  const recordLead: Tool = {
    name: "record_lead_info",
    description: `Save qualification details the ${who} has stated. Call whenever they share any detail. Fields not mentioned must be null.`,
    strict: true,
    input_schema: {
      type: "object",
      properties: Object.fromEntries(fields.map((f) => [f.id, fieldSchema(f)])),
      required: fields.map((f) => f.id),
      additionalProperties: false,
    },
  };

  const transfer: Tool = {
    name: "transfer_to_loan_officer",
    description: `Warm-transfer the ${who} to a licensed loan officer with a handoff summary. The system checks handoff rules and may refuse with instructions.`,
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string", enum: ["qualified", "licensed_question", "borrower_requested_human"] },
        borrower_summary: { type: "string", description: `One or two sentences: who the ${who} is and their situation.` },
        borrower_goal: { type: "string", description: "What they want, in their words where possible." },
        sentiment: { type: "string", enum: ["positive", "neutral", "hesitant", "frustrated"] },
        objections_raised: { type: "array", items: { type: "string" }, description: "Objections raised, if any." },
        open_questions: { type: "array", items: { type: "string" }, description: "Questions the loan officer should answer." },
        recommended_next_step: { type: "string", description: "What the loan officer should do first." },
      },
      required: ["reason", "borrower_summary", "borrower_goal", "sentiment", "objections_raised", "open_questions", "recommended_next_step"],
      additionalProperties: false,
    },
  };

  const callback: Tool = {
    name: "schedule_callback",
    description: `Book a call from a loan officer when the ${who} is busy, asks for later, live transfer is unavailable, or their situation needs a loan officer's personal review.`,
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string", enum: ["borrower_busy", "borrower_request", "after_hours", "transfer_unavailable", "loan_officer_review"] },
        preferred_time: { type: "string", description: `When the ${who} wants the call, in their words (e.g. "tomorrow after 5pm").` },
        notes: { type: "string", description: "Anything the loan officer should know." },
      },
      required: ["reason", "preferred_time", "notes"],
      additionalProperties: false,
    },
  };

  const end: Tool = {
    name: "end_conversation",
    description: `End the conversation. Use for opt-outs, ${who}s who are not interested, and leads routed to email follow-up.`,
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string", enum: ["opted_out", "not_interested", "follow_up_by_email", "not_a_member", "other"] },
        notes: { type: "string" },
      },
      required: ["reason", "notes"],
      additionalProperties: false,
    },
  };

  return [recordLead, transfer, callback, end];
}

export type TransferInput = {
  reason: "qualified" | "licensed_question" | "borrower_requested_human";
  borrower_summary: string;
  borrower_goal: string;
  sentiment: "positive" | "neutral" | "hesitant" | "frustrated";
  objections_raised: string[];
  open_questions: string[];
  recommended_next_step: string;
};

export type CallbackInput = {
  reason: "borrower_busy" | "borrower_request" | "after_hours" | "transfer_unavailable" | "loan_officer_review";
  preferred_time: string;
  notes: string;
};

export type EndInput = {
  reason: "opted_out" | "not_interested" | "follow_up_by_email" | "not_a_member" | "other";
  notes: string;
};
