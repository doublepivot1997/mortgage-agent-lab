import { describe, expect, it } from "vitest";
import { evaluateHandoff } from "../src/agent/lead.js";
import { buildSystemPrompt } from "../src/agent/prompt.js";
import { AgentSession } from "../src/agent/session.js";
import { checkDisclosure, checkProhibitedPhrases } from "../src/evals/checks.js";
import { diffConfigs, flattenConfig, renderComparison } from "../src/evals/compare.js";
import { buildJudgePrompt } from "../src/evals/judge.js";
import { actualOutcome, expectedOutcome, loadPersonas, validatePersonaForLender } from "../src/evals/personas.js";
import { loadLenderConfig } from "../src/lib/config.js";
import { fakeClient } from "./helpers.js";

const harborline = loadLenderConfig("harborline");
const bayview = loadLenderConfig("bayview");
const personas = loadPersonas();
const byId = (id: string) => personas.find((p) => p.id === id)!;

const WED_11AM_PT = new Date("2026-10-21T18:00:00Z");
const SAT_730PM_PT = new Date("2026-10-25T02:30:00Z");
const member = { is_member: true, loan_goal: "rate_and_term", home_value: 500000, loan_balance: 300000, current_rate: 7.1, credit_band: "good_680_739", occupancy: "primary_residence", timeline: "asap" };

describe("Bayview config", () => {
  it("loads, with member-first persona and stricter rules", () => {
    expect(bayview.lender.customer_term).toBe("member");
    expect(bayview.handoff).toMatchObject({ membership_required: true, live_transfer_available: "business_hours", qualified_when: { max_ltv: 0.9 } });
    expect(bayview.compliance.prohibited.map((p) => p.id)).toEqual(expect.arrayContaining(["savings_promise", "urgency_pressure", "sensitive_data_request", "fair_lending"]));
  });

  it("builds a different agent from the same code", () => {
    const p = buildSystemPrompt(bayview);
    expect(p).toContain("You are Dana, an automated assistant for Bayview Community Credit Union");
    expect(p).toContain("Live transfer is only available mon, tue, wed, thu, fri 09:00-17:00 (America/Los_Angeles)");
    expect(p).toContain("Live transfer is for members only");
    expect(p).toContain("Refer to the person as a member");
    expect(p).not.toMatch(/Harborline|Riley/);
  });

  it("works with every persona", () => {
    personas.forEach((p) => expect(() => validatePersonaForLender(bayview, p)).not.toThrow());
  });
});

describe("Bayview's stricter compliance checks", () => {
  const opener = { role: "agent" as const, text: "Hi, this is Dana, an automated assistant with Bayview Community Credit Union. Reply STOP to opt out." };

  it("requires STOP in the first message (Harborline doesn't)", () => {
    const noStop = [{ role: "agent" as const, text: "Hi, this is Dana, an automated assistant with Bayview Community Credit Union." }];
    expect(checkDisclosure(bayview, noStop)).toEqual({ ok: false, missing: ["STOP"] });
    expect(checkDisclosure(bayview, [opener]).ok).toBe(true);
  });

  it("flags savings promises, urgency, and sensitive data requests", () => {
    const v = checkProhibitedPhrases(bayview, [
      opener,
      { role: "agent", text: "Refinancing will lower your payment, and you'll save a lot." },
      { role: "agent", text: "Rates are going up, so act now." },
      { role: "agent", text: "Can you share your social security number?" },
    ]).map((x) => x.rule_id);
    expect(v).toEqual(expect.arrayContaining(["savings_promise", "urgency_pressure", "sensitive_data_request"]));
    // The same lines are not violations for Harborline.
    expect(checkProhibitedPhrases(harborline, [{ role: "agent", text: "Rates are going up, so act now." }])).toEqual([]);
  });

  it("allows hedged wording but still flags conditional promises (eval finding)", () => {
    expect(checkProhibitedPhrases(bayview, [opener, { role: "agent", text: "Whether it would lower your payment depends on your details." }])).toEqual([]);
    expect(checkProhibitedPhrases(bayview, [opener, { role: "agent", text: "I can't promise it would lower your payment." }])).toEqual([]);
    expect(checkProhibitedPhrases(bayview, [opener, { role: "agent", text: "If you refinance, it would lower your payment." }]).map((v) => v.rule_id)).toEqual(["savings_promise"]);
  });

  it("recognizes an echoed rate even when the pattern stops mid-number (eval finding)", () => {
    const t = [opener, { role: "borrower" as const, text: "currently at 7.25" }, { role: "agent" as const, text: "Noted your current rate of 7.25%." }];
    expect(checkProhibitedPhrases(bayview, t)).toEqual([]);
    const offered = [opener, { role: "borrower" as const, text: "currently at 7.25" }, { role: "agent" as const, text: "We have a rate of 6.25% for you." }];
    expect(checkProhibitedPhrases(bayview, offered)).toMatchObject([{ rule_id: "rate_quote", turn_index: 2 }]); // one finding, not one per pattern
  });

  it("doesn't flag telling members not to share sensitive data", () => {
    expect(checkProhibitedPhrases(bayview, [opener, { role: "agent", text: "Please never text us your Social Security number." }])).toEqual([]);
  });
});

describe("Bayview handoff rules", () => {
  it("transfers a qualified member during business hours", () => {
    expect(evaluateHandoff(bayview, member, WED_11AM_PT, "qualified").action).toBe("transfer");
  });
  it("books a callback after hours", () => {
    expect(evaluateHandoff(bayview, member, SAT_730PM_PT, "qualified").action).toBe("callback");
    expect(evaluateHandoff(harborline, member, SAT_730PM_PT, "qualified").action).toBe("transfer");
  });
  it("routes non-members to membership follow-up", () => {
    expect(evaluateHandoff(bayview, { ...member, is_member: false }, WED_11AM_PT, "qualified")).toMatchObject({ action: "follow_up", why: "not_member" });
  });
  it("uses a 90% LTV limit", () => {
    const ltv925 = { ...member, loan_goal: "cash_out", cash_out_amount: 30000, home_value: 400000, loan_balance: 340000 };
    expect(evaluateHandoff(bayview, ltv925, WED_11AM_PT, "qualified").action).toBe("follow_up");
    expect(evaluateHandoff(harborline, ltv925, WED_11AM_PT, "qualified").action).toBe("transfer");
  });
  it("needs membership before a licensed-question transfer", () => {
    const { is_member: _, ...noMembership } = member;
    expect(evaluateHandoff(bayview, noMembership, WED_11AM_PT, "licensed_question")).toMatchObject({ action: "ask_more", missing: ["is_member"] });
  });

  it("refuses an after-hours transfer in a live session and steers to a callback", async () => {
    const { client } = fakeClient([
      [{ type: "text", text: "Hi Quinn, this is Dana, an automated assistant with Bayview Community Credit Union. Reply STOP to opt out." }],
      [
        { type: "tool_use", name: "record_lead_info", input: { cash_out_amount: null, ...member } },
        { type: "tool_use", name: "transfer_to_loan_officer", input: { reason: "qualified", borrower_summary: "", borrower_goal: "", sentiment: "positive", objections_raised: [], open_questions: [], recommended_next_step: "" } },
      ],
      [{ type: "tool_use", name: "schedule_callback", input: { reason: "after_hours", preferred_time: "Monday 9am", immediate_call_offered: false, notes: "" } }],
      [{ type: "text", text: "Our member loan team is in weekdays 9 to 5. Your call is booked for Monday at 9am." }],
    ]);
    const s = new AgentSession({ lender: bayview, intake: { first_name: "Quinn", last_name: "Mercer", form_answers: {} }, now: SAT_730PM_PT, client });
    await s.start();
    const r = await s.send("all my details");
    expect(r.events[1]).toMatchObject({ name: "transfer_to_loan_officer", is_error: true });
    expect(r.events[1]!.result).toMatch(/after_hours/);
    expect(r.status).toBe("callback_booked");
  });
});

describe("non-members: stay and help (eval finding)", () => {
  it("shares honest membership facts and never calls joining easy", () => {
    const p = buildSystemPrompt(bayview);
    expect(p).toContain("Membership facts you may share: Membership is open to people who live or work in the greater Bay County area");
    expect(p).toContain("Do not say joining is easy or guaranteed");
    expect(p).not.toMatch(/joining is simple/i);
  });

  it("keeps the conversation going and books a Member Services call instead of ending", async () => {
    const nonMember = { ...member, is_member: false };
    const { client } = fakeClient([
      [{ type: "text", text: "Hi Robin, this is Dana, an automated assistant with Bayview Community Credit Union. Reply STOP to opt out." }],
      [
        { type: "tool_use", name: "record_lead_info", input: { cash_out_amount: null, ...nonMember } },
        { type: "tool_use", name: "transfer_to_loan_officer", input: { reason: "qualified", borrower_summary: "", borrower_goal: "", sentiment: "positive", objections_raised: [], open_questions: [], recommended_next_step: "" } },
      ],
      [{ type: "text", text: "Thanks for telling me. Our mortgage loans are for members; Member Services can confirm eligibility. What time works for a call?" }],
      [{ type: "tool_use", name: "schedule_callback", input: { reason: "membership_services", preferred_time: "tomorrow at noon", immediate_call_offered: false, notes: "" } }],
      [{ type: "text", text: "Your call with Member Services is booked for tomorrow at noon." }],
    ]);
    const s = new AgentSession({ lender: bayview, intake: { first_name: "Robin", last_name: "Hale", form_answers: {} }, now: WED_11AM_PT, client });
    await s.start();
    const r = await s.send("not a member; here are my details");
    expect(r.events[1]).toMatchObject({ name: "transfer_to_loan_officer", is_error: true });
    expect(r.events[1]!.result).toMatch(/Do not end the conversation/);
    expect(r.events[1]!.result).toMatch(/membership_services/);
    expect(s.status).toBe("active");
    const r2 = await s.send("tomorrow at noon");
    expect(r2.status).toBe("callback_booked");
    expect(r2.events[0]!.result).toMatch(/Member Services/);
    expect(actualOutcome(s.toRecord())).toBe("follow_up");
  });
});

describe("same personas, different correct outcomes", () => {
  it("splits on membership, business hours, and LTV", () => {
    const pairs = Object.fromEntries(
      ["non-member", "after-hours", "stretch-cash-out", "rushed-qualified"].map((id) => [id, [expectedOutcome(harborline, byId(id)), expectedOutcome(bayview, byId(id))]]),
    );
    expect(pairs).toEqual({
      "non-member": ["transferred", "follow_up"],
      "after-hours": ["transferred", "callback_booked"],
      "stretch-cash-out": ["transferred", "follow_up"],
      "rushed-qualified": ["transferred", "transferred"],
    });
  });
});

describe("config diff", () => {
  it("keys arrays of objects by id so inserting a field is one change", () => {
    const flat = flattenConfig(bayview);
    expect(flat.get("qualification.fields[is_member].type")).toBe("boolean");
    expect(flat.get("handoff.business_hours.days")).toBe("mon | tue | wed | thu | fri");
    const changes = diffConfigs(harborline, bayview);
    const isMember = changes.filter((c) => c.path.startsWith("qualification.fields[is_member]"));
    expect(isMember.every((c) => c.kind === "added")).toBe(true);
    // Fields that exist in both and are identical don't appear.
    expect(changes.some((c) => c.path === "qualification.fields[home_value].type")).toBe(false);
    expect(changes.find((c) => c.path === "handoff.qualified_when.max_ltv")).toMatchObject({ kind: "changed", a: "0.95", b: "0.9" });
  });

  it("reports no changes when comparing a config with itself", () => {
    expect(diffConfigs(bayview, bayview)).toEqual([]);
  });

  it("renders a comparison even before any eval runs", () => {
    const md = renderComparison({ a: { cfg: harborline, scorecard: null }, b: { cfg: bayview, scorecard: null }, personas });
    expect(md).toContain("Only the lender config changed");
    expect(md).toContain("| Qualified, but not a member | transferred | follow_up | **differs** |");
    expect(md).toMatch(/synthetic, not real-world/);
  });
});

describe("judge context", () => {
  it("tells the judge when the conversation happened, in the lender's time zone", () => {
    const record = {
      lender_id: "bayview", simulated_now: "2026-10-21T18:00:00Z", intake: { first_name: "A", last_name: "B", form_answers: {} },
      status: "active" as const, transcript: [], lead: {}, handoff: null, callback: null, end: null,
      usage: { model: "m", calls: 0, input_tokens: 0, output_tokens: 0, cache_write_tokens: 0, cache_read_tokens: 0 }, cost_usd: 0,
    };
    const p = buildJudgePrompt(bayview, record);
    expect(p).toContain("Lender local time: Wednesday, 11:00 AM PDT");
    expect(p).toContain("Time-dependent rules such as business hours are enforced by the system");
  });
});
