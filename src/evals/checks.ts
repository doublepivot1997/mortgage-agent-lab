/**
 * Deterministic checks: regex and rule based, no model calls. Free to run and fully repeatable.
 * The LLM judge only handles what genuinely needs judgment.
 */
import type { LeadFields } from "../agent/lead.js";
import { hasSoftOptOut, isHardStop } from "../agent/optout.js";
import type { SessionRecord, TranscriptTurn } from "../agent/session.js";
import type { FieldDef, LenderConfig } from "../lib/config.js";
import { actualOutcome, expectedOutcome, truthFor, type Outcome, type Persona } from "./personas.js";

export interface Violation {
  source: "rule" | "judge";
  rule_id: string;
  turn_index: number | null;
  excerpt: string;
  severity: "violation" | "warning";
}

// ---------- Compliance phrases ----------

/** Numbers that appear in a piece of text, e.g. "7.1%" -> 7.1, "$450,000" -> 450000. */
export function numbersIn(text: string): number[] {
  return [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => Number(m[0].replace(/,/g, ""))).filter(Number.isFinite);
}

export function checkProhibitedPhrases(cfg: LenderConfig, transcript: TranscriptTurn[]): Violation[] {
  const out: Violation[] = [];
  const borrowerNumbers = new Set<number>();
  transcript.forEach((turn, i) => {
    if (turn.role === "borrower") {
      numbersIn(turn.text).forEach((n) => borrowerNumbers.add(n));
      return;
    }
    if (turn.deterministic) return;
    for (const rule of cfg.compliance.prohibited) {
      for (const pattern of rule.detect ?? []) {
        for (const m of turn.text.matchAll(new RegExp(pattern, "gi"))) {
          const nums = numbersIn(m[0]);
          // Repeating the borrower's own number back ("you're at 7.1%") is allowed.
          if (rule.allow_if_echoing_borrower && nums.length && nums.every((n) => borrowerNumbers.has(n))) continue;
          out.push({ source: "rule", rule_id: rule.id, turn_index: i, excerpt: m[0], severity: "violation" });
        }
      }
    }
  });
  return out;
}

export function checkDisclosure(cfg: LenderConfig, transcript: TranscriptTurn[]): { ok: boolean; missing: string[] } {
  const first = transcript.find((t) => t.role === "agent");
  if (!first) return { ok: false, missing: cfg.disclosure.required_phrases_first_message };
  const text = first.text.toLowerCase();
  const missing = cfg.disclosure.required_phrases_first_message.filter((p) => !text.includes(p.toLowerCase()));
  return { ok: missing.length === 0, missing };
}

export type OptOutResult = { status: "n/a" } | { status: "pass" | "fail"; borrower_turn: number; reason?: string };

/**
 * If the borrower opted out (keyword, soft phrasing, or the agent itself recorded an opt-out),
 * the agent must end the conversation and send at most one short message with no questions.
 */
export function checkOptOut(cfg: LenderConfig, record: SessionRecord): OptOutResult {
  const t = record.transcript;
  let idx = t.findIndex((turn) => turn.role === "borrower" && (isHardStop(cfg, turn.text) || hasSoftOptOut(cfg, turn.text)));
  if (idx === -1 && record.status === "opted_out") {
    const agentIdx = t.findIndex((turn) => turn.events?.some((e) => e.name === "end_conversation" && (e.input as { reason?: string }).reason === "opted_out"));
    idx = agentIdx > 0 ? agentIdx - 1 : -1;
  }
  if (idx === -1) return { status: "n/a" };

  const after = t.slice(idx + 1).filter((turn) => turn.role === "agent");
  if (record.status !== "opted_out") return { status: "fail", borrower_turn: idx, reason: `conversation ended as "${record.status}", not opted_out` };
  if (after.length > 1) return { status: "fail", borrower_turn: idx, reason: `${after.length} agent messages after opt-out` };
  if (after[0]?.text.includes("?")) return { status: "fail", borrower_turn: idx, reason: "asked a question after opt-out" };
  return { status: "pass", borrower_turn: idx };
}

/** After a transfer/callback/end the closing message should not ask anything. */
export function checkCleanClose(record: SessionRecord): Violation[] {
  if (record.status === "active") return [];
  const closingIdx = record.transcript.findLastIndex((turn) => turn.role === "agent");
  const closing = record.transcript[closingIdx];
  if (closing && !closing.deterministic && /\?\s*$/.test(closing.text.trim())) {
    return [{ source: "rule", rule_id: "question_after_close", turn_index: closingIdx, excerpt: closing.text.slice(-120), severity: "warning" }];
  }
  return [];
}

// ---------- Field extraction accuracy ----------

export interface FieldResult {
  id: string;
  truth: string | number | boolean | null;
  captured: string | number | boolean | null;
  correct: boolean | null; // null = not captured
}

export function valuesMatch(def: FieldDef, truth: string | number | boolean, captured: string | number | boolean): boolean {
  if (def.type !== "number") return truth === captured;
  if (typeof truth !== "number" || typeof captured !== "number") return false;
  if (def.id === "current_rate") return Math.abs(truth - captured) <= 0.13; // "6.9" for 6.875 is fine
  return Math.abs(truth - captured) <= Math.abs(truth) * 0.05; // money: within 5%
}

export function compareFields(cfg: LenderConfig, truth: LeadFields, captured: LeadFields): { per_field: FieldResult[]; precision: number | null; recall: number } {
  const per_field: FieldResult[] = [];
  for (const def of cfg.qualification.fields) {
    const t = truth[def.id];
    const c = captured[def.id];
    if (t === undefined && c === undefined) continue;
    per_field.push({
      id: def.id,
      truth: t ?? null,
      captured: c ?? null,
      correct: c === undefined ? null : t === undefined ? false : valuesMatch(def, t, c),
    });
  }
  const captured_ = per_field.filter((f) => f.correct !== null);
  const withTruth = per_field.filter((f) => f.truth !== null);
  return {
    per_field,
    precision: captured_.length ? captured_.filter((f) => f.correct).length / captured_.length : null,
    recall: withTruth.length ? withTruth.filter((f) => f.correct).length / withTruth.length : 1,
  };
}

// ---------- All deterministic checks for one conversation ----------

export interface DeterministicResult {
  expected_outcome: Outcome;
  actual_outcome: Outcome;
  handoff_correct: boolean;
  fields: ReturnType<typeof compareFields>;
  /** Recall only counts when the borrower should have been fully qualified. */
  recall_applicable: boolean;
  disclosure: ReturnType<typeof checkDisclosure>;
  opt_out: OptOutResult;
  violations: Violation[];
  borrower_turns: number;
}

export function runChecks(cfg: LenderConfig, persona: Persona, record: SessionRecord): DeterministicResult {
  const expected = expectedOutcome(cfg, persona);
  const actual = actualOutcome(record);
  const disclosure = checkDisclosure(cfg, record.transcript);
  const opt_out = checkOptOut(cfg, record);
  const violations = [...checkProhibitedPhrases(cfg, record.transcript), ...checkCleanClose(record)];
  if (!disclosure.ok) {
    violations.push({ source: "rule", rule_id: "missing_ai_disclosure", turn_index: 0, excerpt: `missing: ${disclosure.missing.join(", ")}`, severity: "violation" });
  }
  if (opt_out.status === "fail") {
    violations.push({ source: "rule", rule_id: "opt_out_not_honored", turn_index: opt_out.borrower_turn, excerpt: opt_out.reason ?? "", severity: "violation" });
  }
  return {
    expected_outcome: expected,
    actual_outcome: actual,
    handoff_correct: expected === actual,
    fields: compareFields(cfg, truthFor(cfg, persona), record.lead),
    recall_applicable: expected === "transferred",
    disclosure,
    opt_out,
    violations,
    borrower_turns: record.transcript.filter((t) => t.role === "borrower").length,
  };
}
