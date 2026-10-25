import { describe, expect, it } from "vitest";
import { buildIntakeMessage, buildSystemPrompt } from "../src/agent/prompt.js";
import { AgentSession } from "../src/agent/session.js";
import { buildTools } from "../src/agent/tools.js";
import { fakeClient, harborline, tweak } from "./helpers.js";

const intake = { first_name: "Jordan", last_name: "Avery", form_answers: { goal: "Refinance" } };
const WED_2PM_ET = new Date("2026-10-21T18:00:00Z");

describe("prompt is built from config, not hard-coded", () => {
  it("includes the config's persona, objections, and rules", () => {
    const p = buildSystemPrompt(harborline());
    expect(p).toContain("You are Riley, an automated assistant for Harborline Home Loans");
    expect(p).toContain("Just shopping rates");
    expect(p).toContain("Never state, estimate, or imply a specific interest rate");
    expect(p).toContain("at most 0.95");
    expect(p).toContain("# Borrower experience (always)");
    expect(p).toContain("Never make the next step sound faster, simpler, or more certain");
    expect(p).toContain("within one business day");
    expect(p).toContain("How a transfer works: A licensed loan officer calls the borrower");
    expect(p).not.toContain("so they won't need to repeat themselves");
  });

  it("changes completely when the config changes", () => {
    const other = tweak(harborline(), (c) => {
      c.lender.name = "Test Lender";
      c.lender.short_name = "Test";
      c.persona.agent_name = "Sam";
      c.disclosure.required_phrases_first_message = ["automated assistant", "Test Lender"];
      c.disclosure.opening_guidance = "Say hi.";
      c.channel.trigger = "A lead came in.";
      c.objections = [];
      c.compliance.opt_out.canned_reply = "Bye.";
      c.handoff.not_eligible_guidance = "Follow up.";
      c.handoff.transfer_message_guidance = "Connecting you.";
      c.objections = [];
    });
    const p = buildSystemPrompt(other);
    expect(p).toContain("You are Sam, an automated assistant for Test Lender");
    // Some objection guidance in the shared YAML mentions the lender; with it removed, no trace should remain.
    expect(p).not.toMatch(/Harborline|Riley/);
  });

  it("is deterministic (so the prefix caches)", () => {
    expect(buildSystemPrompt(harborline())).toBe(buildSystemPrompt(harborline()));
  });

  it("puts the simulated local time in the intake note", () => {
    expect(buildIntakeMessage(harborline(), intake, WED_2PM_ET)).toContain("Wednesday, 2:00 PM EDT");
  });
});

describe("tools", () => {
  it("generates a strict record_lead_info schema from the config fields", () => {
    const cfg = harborline();
    const [record] = buildTools(cfg);
    expect(record!.name).toBe("record_lead_info");
    expect(record!.strict).toBe(true);
    const schema = record!.input_schema as unknown as { properties: Record<string, unknown>; required: string[]; additionalProperties: boolean };
    expect(Object.keys(schema.properties)).toEqual(cfg.qualification.fields.map((f) => f.id));
    expect(schema.required).toEqual(cfg.qualification.fields.map((f) => f.id));
    expect(schema.additionalProperties).toBe(false);
  });
});

describe("AgentSession (scripted model, no network)", () => {
  const nulls = Object.fromEntries(harborline().qualification.fields.map((f) => [f.id, null]));
  const handoffInput = {
    reason: "qualified",
    borrower_summary: "Homeowner looking to lower their rate.",
    borrower_goal: "Lower monthly payment",
    sentiment: "positive",
    objections_raised: [],
    open_questions: ["What rate can I get?"],
    recommended_next_step: "Quote rate-and-term options.",
  };

  it("opens, records fields, and blocks a premature transfer", async () => {
    const { client, calls } = fakeClient([
      [{ type: "text", text: "Hi Jordan, this is Riley, an automated assistant with Harborline Home Loans." }],
      [{ type: "tool_use", name: "record_lead_info", input: { ...nulls, loan_goal: "rate_and_term" } }, { type: "tool_use", name: "transfer_to_loan_officer", input: handoffInput }],
      [{ type: "text", text: "Got it. Roughly what is the home worth?" }],
    ]);
    const s = new AgentSession({ lender: harborline(), intake, now: WED_2PM_ET, client });

    const opener = await s.start();
    expect(opener.text).toContain("automated assistant");

    const r = await s.send("I want a lower rate");
    expect(s.lead).toEqual({ loan_goal: "rate_and_term" });
    expect(r.events[1]).toMatchObject({ name: "transfer_to_loan_officer", is_error: true });
    expect(r.events[1]!.result).toMatch(/Still missing: .*home_value/);
    expect(s.status).toBe("active");

    // Request plumbing: config-driven tools, cached prefix, fallback opt-in.
    expect(calls[0]!.tools!.map((t) => ("name" in t ? t.name : ""))).toEqual(["record_lead_info", "transfer_to_loan_officer", "schedule_callback", "end_conversation"]);
    expect(calls[0]!.cache_control).toEqual({ type: "ephemeral" });
    expect(calls[0]!.fallbacks).toBe("default");
    // Tool results go back as a single user message.
    const last = calls[2]!.messages.at(-1)!;
    expect(Array.isArray(last.content) && last.content.length).toBe(2);
  });

  it("transfers a qualified lead with a structured handoff summary", async () => {
    const full = { ...nulls, loan_goal: "rate_and_term", home_value: 500000, loan_balance: 300000, current_rate: 7.1, credit_band: "good_680_739", occupancy: "primary_residence", timeline: "asap" };
    const { client } = fakeClient([
      [{ type: "text", text: "Hi Jordan, this is Riley, an automated assistant with Harborline Home Loans." }],
      [{ type: "tool_use", name: "record_lead_info", input: full }, { type: "tool_use", name: "transfer_to_loan_officer", input: handoffInput }],
      [{ type: "text", text: "Connecting you with a licensed loan officer now." }],
    ]);
    const s = new AgentSession({ lender: harborline(), intake, now: WED_2PM_ET, client });
    await s.start();
    const r = await s.send("all the details at once");
    expect(r.status).toBe("transferred");
    expect(s.handoff).toMatchObject({ ltv: 0.6, missing_fields: [], sentiment: "positive", borrower: { first_name: "Jordan" } });
    expect(s.handoff!.qualification.current_rate).toBe(7.1);

    // Closed conversations do not call the model again.
    expect(await s.send("hello?")).toEqual({ text: null, status: "transferred", events: [] });
    expect(s.toRecord().usage.calls).toBe(3);
    expect(s.toRecord().cost_usd).toBeGreaterThan(0);
  });

  it("honors a hard STOP without calling the model", async () => {
    const { client, calls } = fakeClient([[{ type: "text", text: "Hi Jordan, this is Riley, an automated assistant with Harborline Home Loans." }]]);
    const s = new AgentSession({ lender: harborline(), intake, now: WED_2PM_ET, client });
    await s.start();
    const r = await s.send("STOP");
    expect(r.status).toBe("opted_out");
    expect(r.text).toMatch(/opted out/);
    expect(calls).toHaveLength(1);
    expect(s.transcript.at(-1)).toMatchObject({ role: "agent", deterministic: true });
  });

  it("routes an underwater borrower to a booked loan-officer review instead of a transfer", async () => {
    const under = { ...nulls, loan_goal: "rate_and_term", home_value: 300000, loan_balance: 340000 };
    const { client } = fakeClient([
      [{ type: "text", text: "Hi Jordan, this is Riley, an automated assistant with Harborline Home Loans." }],
      [{ type: "tool_use", name: "record_lead_info", input: under }, { type: "tool_use", name: "transfer_to_loan_officer", input: { ...handoffInput, reason: "licensed_question" } }],
      [{ type: "tool_use", name: "schedule_callback", input: { reason: "loan_officer_review", preferred_time: "tomorrow at noon", notes: "Owes more than value" } }],
      [{ type: "text", text: "You're set: a licensed loan officer will call you tomorrow at noon to go over your situation." }],
    ]);
    const s = new AgentSession({ lender: harborline(), intake, now: WED_2PM_ET, client });
    await s.start();
    const r = await s.send("home's worth 300k, I owe 340k. what rate can I get?");
    expect(r.events[1]).toMatchObject({ is_error: true });
    expect(r.events[1]!.result).toMatch(/schedule_callback with reason "loan_officer_review"/);
    expect(r.events[1]!.result).not.toMatch(/follow_up_by_email/);
    expect(r.events[2]!.result).toMatch(/within one business day/);
    expect(s.status).toBe("callback_booked");
    expect(s.handoff).toBeNull();
    expect(s.callback?.reason).toBe("loan_officer_review");
  });
});
