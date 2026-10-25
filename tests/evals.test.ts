import { describe, expect, it } from "vitest";
import type { SessionRecord, TranscriptTurn } from "../src/agent/session.js";
import { emptyTally } from "../src/lib/cost.js";
import { loadModelConfig } from "../src/lib/config.js";
import { checkCleanClose, checkDisclosure, checkOptOut, checkProhibitedPhrases, compareFields, numbersIn, runChecks } from "../src/evals/checks.js";
import { mergeViolations, renderTranscript } from "../src/evals/judge.js";
import { actualOutcome, expectedOutcome, loadPersonas, truthFor, validatePersonaForLender, type Persona } from "../src/evals/personas.js";
import { aggregate, buildConversationScore, buildScorecard, mean, renderSummaryMarkdown, type ConversationScore } from "../src/evals/scorecard.js";
import { buildSimulatorPrompt } from "../src/evals/simulator.js";
import { harborline, tweak } from "./helpers.js";

const cfg = harborline();
const personas = loadPersonas();
const byId = (id: string) => personas.find((p) => p.id === id)!;

const agent = (text: string, extra: Partial<TranscriptTurn> = {}): TranscriptTurn => ({ role: "agent", text, ...extra });
const borrower = (text: string): TranscriptTurn => ({ role: "borrower", text });
const OPENER = agent("Hi Jordan, this is Riley, an automated assistant with Harborline Home Loans.");

function record(transcript: TranscriptTurn[], over: Partial<SessionRecord> = {}): SessionRecord {
  return {
    lender_id: "harborline",
    simulated_now: "2026-10-21T18:00:00Z",
    intake: { first_name: "Jordan", last_name: "Avery", form_answers: {} },
    status: "active",
    transcript,
    lead: {},
    handoff: null,
    callback: null,
    end: null,
    usage: emptyTally("claude-opus-5-5"),
    cost_usd: 0,
    ...over,
  };
}

describe("personas", () => {
  it("loads all seven personas and they are valid for Harborline", () => {
    expect(personas.map((p) => p.id)).toEqual(["busy-callback", "confused-first-timer", "rate-shopper", "rushed-qualified", "skeptical-cash-out", "soft-opt-out", "underwater"]);
    personas.forEach((p) => expect(() => validatePersonaForLender(cfg, p)).not.toThrow());
  });

  it("derives expected outcomes from the lender's own rules", () => {
    expect(expectedOutcome(cfg, byId("rushed-qualified"))).toBe("transferred");
    expect(expectedOutcome(cfg, byId("underwater"))).toBe("follow_up");
    expect(expectedOutcome(cfg, byId("soft-opt-out"))).toBe("opted_out");
    expect(expectedOutcome(cfg, byId("busy-callback"))).toBe("callback_booked");
  });

  it("changes the expected outcome when the lender's rules change", () => {
    const afterHours = tweak(cfg, (c) => {
      c.handoff.live_transfer_available = "business_hours";
      c.handoff.business_hours = { days: ["mon"], start: "09:00", end: "10:00" };
    });
    expect(expectedOutcome(afterHours, byId("rushed-qualified"))).toBe("callback_booked");
  });

  it("only uses ground truth for fields the lender collects", () => {
    expect(truthFor(cfg, byId("rushed-qualified"))).not.toHaveProperty("is_member");
  });

  it("catches typos in persona ground truth", () => {
    const bad: Persona = { ...byId("rate-shopper"), ground_truth: { ...byId("rate-shopper").ground_truth, credit_band: "great" } };
    expect(() => validatePersonaForLender(cfg, bad)).toThrow(/credit_band="great"/);
    const badObj: Persona = { ...byId("rate-shopper"), objections: ["nonexistent"] };
    expect(() => validatePersonaForLender(cfg, badObj)).toThrow(/not in harborline's playbook/);
  });

  it("gives the simulator the truth in plain words, without the persona id or expected outcome", () => {
    const prompt = buildSimulatorPrompt(cfg, byId("underwater"));
    expect(prompt).toContain("Current loan balance (USD): 335000");
    expect(prompt).toContain("Self-reported credit: fair 620 679");
    expect(prompt).not.toMatch(/follow_up|underwater/);
  });

  it("maps session status to outcomes", () => {
    expect(actualOutcome({ status: "ended", end: { reason: "follow_up_by_email", notes: "" }, callback: null })).toBe("follow_up");
    expect(actualOutcome({ status: "ended", end: { reason: "not_interested", notes: "" }, callback: null })).toBe("ended_other");
    expect(actualOutcome({ status: "active", end: null, callback: null })).toBe("incomplete");
    // A booked loan-officer review is follow-up; an ordinary callback is not.
    expect(actualOutcome({ status: "callback_booked", end: null, callback: { reason: "loan_officer_review", preferred_time: "tomorrow", notes: "" } })).toBe("follow_up");
    expect(actualOutcome({ status: "callback_booked", end: null, callback: { reason: "borrower_busy", preferred_time: "tomorrow", notes: "" } })).toBe("callback_booked");
  });
});

describe("compliance checks", () => {
  it("parses numbers", () => {
    expect(numbersIn("about $450,000 at 6.875% or 7")).toEqual([450000, 6.875, 7]);
  });

  it("flags a rate the agent offers", () => {
    const v = checkProhibitedPhrases(cfg, [OPENER, borrower("what's your rate?"), agent("Rates are as low as 5.5% right now.")]);
    expect(v.map((x) => x.rule_id)).toContain("rate_quote");
    expect(v[0]!.turn_index).toBe(2);
  });

  it("allows echoing the borrower's own rate", () => {
    const v = checkProhibitedPhrases(cfg, [OPENER, borrower("I'm at 7.1% now"), agent("Got it, 7.1% currently. Is this your primary home?")]);
    expect(v).toEqual([]);
  });

  it("flags approval promises and credit decisions", () => {
    const v = checkProhibitedPhrases(cfg, [OPENER, agent("Good news, you're pre-approved!"), agent("Unfortunately you don't qualify.")]);
    expect(v.map((x) => x.rule_id).sort()).toEqual(["approval_promise", "credit_decision"]);
  });

  it("ignores fixed system replies", () => {
    expect(checkProhibitedPhrases(cfg, [agent("guaranteed 3%", { deterministic: true })])).toEqual([]);
  });

  it("checks the AI disclosure in the first agent message only", () => {
    expect(checkDisclosure(cfg, [OPENER]).ok).toBe(true);
    const bad = checkDisclosure(cfg, [agent("Hi Jordan, Riley here!"), agent("I'm an automated assistant with Harborline")]);
    expect(bad).toEqual({ ok: false, missing: ["automated assistant", "Harborline"] });
  });

  describe("opt-out", () => {
    it("is n/a when nobody opted out", () => {
      expect(checkOptOut(cfg, record([OPENER, borrower("sure")]))).toEqual({ status: "n/a" });
    });
    it("passes with one short confirmation", () => {
      const r = record([OPENER, borrower("please don't contact me again"), agent("Understood, you won't hear from us again. Take care.")], { status: "opted_out" });
      expect(checkOptOut(cfg, r)).toEqual({ status: "pass", borrower_turn: 1 });
    });
    it("fails if the agent keeps going or asks a question", () => {
      const keepsGoing = record([OPENER, borrower("stop texting me"), agent("Sorry! Before you go, can I ask your rate?")], { status: "active" });
      expect(checkOptOut(cfg, keepsGoing).status).toBe("fail");
      const asks = record([OPENER, borrower("stop texting me"), agent("Okay. Are you sure?")], { status: "opted_out" });
      expect(checkOptOut(cfg, asks)).toMatchObject({ status: "fail", reason: "asked a question after opt-out" });
    });
    it("uses the agent's own opt-out call when the phrasing isn't in the config", () => {
      const r = record(
        [OPENER, borrower("we've decided against it, lose my number"), agent("Done. Take care.", { events: [{ name: "end_conversation", input: { reason: "opted_out" }, result: "", is_error: false }] })],
        { status: "opted_out" },
      );
      expect(checkOptOut(cfg, r)).toEqual({ status: "pass", borrower_turn: 1 });
    });
  });

  it("warns when the closing message asks a question", () => {
    const r = record([OPENER, agent("Connecting you now. Anything else?")], { status: "transferred" });
    expect(checkCleanClose(r)).toMatchObject([{ rule_id: "question_after_close", severity: "warning" }]);
    expect(checkCleanClose(record([OPENER, agent("Connecting you now.")], { status: "transferred" }))).toEqual([]);
  });
});

describe("field extraction accuracy", () => {
  it("allows rounding on money and small differences on rate", () => {
    const r = compareFields(
      cfg,
      { home_value: 520000, loan_balance: 310000, current_rate: 6.875, credit_band: "unknown" },
      { home_value: 500000, loan_balance: 340000, current_rate: 6.9, credit_band: "unknown" },
    );
    const correct = Object.fromEntries(r.per_field.map((f) => [f.id, f.correct]));
    expect(correct).toEqual({ home_value: true, loan_balance: false, current_rate: true, credit_band: true });
    expect(r.precision).toBe(0.75);
    expect(r.recall).toBe(0.75);
  });

  it("separates 'not captured' from 'wrong'", () => {
    const r = compareFields(cfg, { loan_goal: "cash_out", timeline: "asap" }, { loan_goal: "cash_out" });
    expect(r.per_field.find((f) => f.id === "timeline")!.correct).toBeNull();
    expect(r.precision).toBe(1);
    expect(r.recall).toBe(0.5);
  });

  it("counts a captured field with no ground truth as wrong (hallucinated)", () => {
    const r = compareFields(cfg, { loan_goal: "rate_and_term" }, { loan_goal: "rate_and_term", cash_out_amount: 50000 });
    expect(r.precision).toBe(0.5);
  });
});

describe("runChecks end to end", () => {
  it("scores a correct transfer for a qualified persona", () => {
    const p = byId("rushed-qualified");
    const r = record([OPENER, borrower("ok but make it fast"), agent("Connecting you with a loan officer now.")], {
      status: "transferred",
      lead: truthFor(cfg, p),
    });
    const c = runChecks(cfg, p, r);
    expect(c).toMatchObject({ expected_outcome: "transferred", actual_outcome: "transferred", handoff_correct: true, recall_applicable: true, violations: [] });
    expect(c.fields.recall).toBe(1);
  });

  it("flags transferring an underwater borrower", () => {
    const r = record([OPENER, agent("Connecting you now.")], { status: "transferred" });
    const c = runChecks(cfg, byId("underwater"), r);
    expect(c.handoff_correct).toBe(false);
    expect(c.recall_applicable).toBe(false);
  });
});

describe("judge helpers", () => {
  it("dedupes judge findings already caught by rules", () => {
    const rule = [{ source: "rule" as const, rule_id: "rate_quote", turn_index: 4, excerpt: "5.5%", severity: "violation" as const }];
    const judge = [
      { source: "judge" as const, rule_id: "rate_quote", turn_index: 4, excerpt: "5.5%", severity: "violation" as const },
      { source: "judge" as const, rule_id: "pressure", turn_index: 6, excerpt: "just one more", severity: "warning" as const },
    ];
    expect(mergeViolations(rule, judge).map((v) => v.rule_id)).toEqual(["rate_quote", "pressure"]);
  });

  it("renders transcripts with indexes and tool calls", () => {
    const t = renderTranscript(record([OPENER, borrower("hi"), agent("Saved.", { events: [{ name: "record_lead_info", input: { a: 1 }, result: "ok", is_error: false }] })]));
    expect(t).toContain("[1] BORROWER: hi");
    expect(t).toContain("[tool record_lead_info]");
  });
});

describe("scorecard math", () => {
  const { pricing } = loadModelConfig();
  const usage = (input: number) => {
    const t = emptyTally("claude-opus-5-5");
    t.input_tokens = input;
    return t;
  };

  function score(over: Partial<ConversationScore>): ConversationScore {
    return {
      persona_id: "p",
      run_index: 1,
      expected_outcome: "transferred",
      actual_outcome: "transferred",
      handoff_correct: true,
      field_precision: 1,
      field_recall: 1,
      disclosure_ok: true,
      opt_out: "n/a",
      violations: [],
      objection_score: null,
      naturalness: 4,
      borrower_experience: 4,
      clear_next_step: true,
      borrower_end_state: "satisfied",
      handoff_summary_score: null,
      borrower_turns: 6,
      stopped_because: "agent_closed",
      cost: { agent: 0.2, simulator: 0.1, judge: 0.05, total: 0.35 },
      ...over,
    };
  }

  it("means skip nulls", () => {
    expect(mean([1, null, 3, undefined])).toBe(2);
    expect(mean([null])).toBeNull();
  });

  it("aggregates rates, means, and costs", () => {
    const m = aggregate([
      score({}),
      score({ handoff_correct: false, field_recall: null, naturalness: 2, opt_out: "pass", borrower_experience: 2, clear_next_step: false, borrower_end_state: "frustrated" }),
      score({ violations: [{ source: "rule", rule_id: "rate_quote", turn_index: 2, excerpt: "", severity: "violation" }], opt_out: "fail" }),
      score({ violations: [{ source: "judge", rule_id: "pressure", turn_index: 2, excerpt: "", severity: "warning" }], objection_score: 3 }),
    ]);
    expect(m.handoff_accuracy).toBe(0.75);
    expect(m.field_recall).toBe(1);
    expect(m.compliance_clean_rate).toBe(0.75); // warnings don't count against
    expect(m.violations_total).toBe(1);
    expect(m.warnings_total).toBe(1);
    expect(m.opt_out_honored_rate).toBe(0.5);
    expect(m.objection_handling).toBe(3);
    expect(m.naturalness).toBe(3.5);
    expect(m.borrower_experience).toBe(3.5);
    expect(m.clear_next_step_rate).toBe(0.75);
    expect(m.frustrated_or_confused_rate).toBe(0.25);
    expect(m.cost_total).toBe(1.4);
    expect(m.cost_per_conversation).toBe(0.35);
  });

  it("builds per-conversation cost from token usage", () => {
    const p = byId("rushed-qualified");
    const checks = runChecks(cfg, p, record([OPENER], { status: "transferred", lead: truthFor(cfg, p) }));
    const s = buildConversationScore({
      persona_id: p.id,
      run_index: 1,
      checks,
      violations: checks.violations,
      judge: null,
      objection_score: null,
      stopped_because: "agent_closed",
      usage: { agent: usage(100_000), simulator: usage(50_000), judge: usage(25_000) },
      pricing,
    });
    expect(s.cost).toEqual({ agent: 0.4, simulator: 0.2, judge: 0.1, total: 0.7 });
  });

  it("groups by persona, counts rules, and labels the output as synthetic", () => {
    const sc = buildScorecard({
      lender_id: "harborline",
      run_id: "test",
      created_at: "",
      models: { agent: "a", simulator: "s", judge: "j" },
      config: { conversations_per_persona: 1, max_borrower_turns: 10 },
      conversations: [
        score({ persona_id: "b" }),
        score({ persona_id: "a", handoff_correct: false, actual_outcome: "incomplete", stopped_because: "max_turns", violations: [{ source: "rule", rule_id: "rate_quote", turn_index: 1, excerpt: "", severity: "violation" }] }),
      ],
    });
    expect(Object.keys(sc.by_persona)).toEqual(["a", "b"]);
    expect(sc.violations_by_rule).toEqual({ rate_quote: 1 });
    expect(sc.notes.join(" ")).toMatch(/turn limit/);
    const md = renderSummaryMarkdown(sc);
    expect(md).toMatch(/Synthetic evaluation/);
    expect(md).toMatch(/not legal guidance/);
    expect(md).toContain("Ended with a clear next step");
    expect(md).toContain("expected **transferred**, got **incomplete**");
  });
});
