import { describe, expect, it } from "vitest";
import {
  computeLtv,
  evaluateHandoff,
  isWithinBusinessHours,
  mergeLeadFields,
  missingRequiredFields,
  type LeadFields,
} from "../src/agent/lead";
import { harborline, tweak } from "./helpers";

const fullLead = (): LeadFields => ({
  loan_goal: "rate_and_term",
  home_value: 500_000,
  loan_balance: 300_000,
  current_rate: 7.25,
  credit_band: "good_680_739",
  occupancy: "primary_residence",
  timeline: "within_3_months",
});

// Wednesday 2026-10-21 14:00 in New York = 18:00 UTC
const WED_2PM_ET = new Date("2026-10-21T18:00:00Z");
// Saturday 2026-10-24 22:00 in New York
const SAT_10PM_ET = new Date("2026-10-25T02:00:00Z");

describe("field extraction / merge", () => {
  it("applies valid values and ignores nulls", () => {
    const lead: LeadFields = {};
    const r = mergeLeadFields(harborline(), lead, { loan_goal: "cash_out", home_value: 450000, current_rate: null, timeline: undefined });
    expect(r.applied).toEqual(["loan_goal", "home_value"]);
    expect(lead).toEqual({ loan_goal: "cash_out", home_value: 450000 });
  });

  it("coerces number strings like '$450,000' and '6.5%'", () => {
    const lead: LeadFields = {};
    mergeLeadFields(harborline(), lead, { home_value: "$450,000", current_rate: "6.5%" });
    expect(lead).toEqual({ home_value: 450000, current_rate: 6.5 });
  });

  it("rejects bad enums, unknown fields, and out-of-range numbers without clobbering", () => {
    const lead: LeadFields = { credit_band: "good_680_739" };
    const r = mergeLeadFields(harborline(), lead, { credit_band: "amazing", favorite_color: "blue", current_rate: 65 });
    expect(r.applied).toEqual([]);
    expect(r.rejected.map((x) => x.field)).toEqual(["credit_band", "favorite_color", "current_rate"]);
    expect(lead.credit_band).toBe("good_680_739");
  });

  it("later answers overwrite earlier ones", () => {
    const lead: LeadFields = { home_value: 400000 };
    mergeLeadFields(harborline(), lead, { home_value: 425000 });
    expect(lead.home_value).toBe(425000);
  });

  it("tracks required and conditionally-required fields", () => {
    const cfg = harborline();
    const lead = fullLead();
    expect(missingRequiredFields(cfg, lead)).toEqual([]);
    lead.loan_goal = "cash_out";
    expect(missingRequiredFields(cfg, lead)).toEqual(["cash_out_amount"]);
    expect(missingRequiredFields(cfg, {})).toHaveLength(7);
  });
});

describe("LTV", () => {
  it("includes cash out", () => {
    expect(computeLtv({ home_value: 500000, loan_balance: 300000 })).toBe(0.6);
    expect(computeLtv({ home_value: 500000, loan_balance: 300000, cash_out_amount: 100000 })).toBe(0.8);
  });
  it("is null until both numbers are known", () => {
    expect(computeLtv({ home_value: 500000 })).toBeNull();
  });
});

describe("handoff decision", () => {
  const cfg = harborline();

  it("transfers a fully qualified lead", () => {
    expect(evaluateHandoff(cfg, fullLead(), WED_2PM_ET, "qualified")).toEqual({ action: "transfer", ltv: 0.6 });
  });

  it("asks for missing fields before a 'qualified' transfer", () => {
    const lead = fullLead();
    delete lead.occupancy;
    const d = evaluateHandoff(cfg, lead, WED_2PM_ET, "qualified");
    expect(d).toMatchObject({ action: "ask_more", missing: ["occupancy"] });
  });

  it("lets licensed questions through once the minimum basics are known", () => {
    const basics = { loan_goal: "rate_and_term", home_value: 500000, loan_balance: 300000 };
    expect(evaluateHandoff(cfg, basics, WED_2PM_ET, "licensed_question").action).toBe("transfer");
  });

  it("does not transfer a licensed question with nothing collected (eval finding)", () => {
    expect(evaluateHandoff(cfg, {}, WED_2PM_ET, "licensed_question")).toMatchObject({ action: "ask_more", missing: ["loan_goal", "home_value", "loan_balance"] });
  });

  it("routes underwater / high-LTV leads to follow-up, even for licensed questions", () => {
    const lead = { ...fullLead(), loan_balance: 520_000 };
    expect(evaluateHandoff(cfg, lead, WED_2PM_ET, "qualified")).toMatchObject({ action: "follow_up", why: "not_eligible" });
    expect(evaluateHandoff(cfg, lead, WED_2PM_ET, "licensed_question").action).toBe("follow_up");
  });

  it("treats LTV exactly at the limit as eligible", () => {
    const lead = { ...fullLead(), home_value: 400_000, loan_balance: 380_000 }; // 0.95
    expect(evaluateHandoff(cfg, lead, WED_2PM_ET, "qualified").action).toBe("transfer");
  });

  it("honors excluded credit bands", () => {
    const strict = tweak(cfg, (c) => {
      c.handoff.qualified_when.exclude_credit_bands = ["below_620"];
    });
    expect(evaluateHandoff(strict, { ...fullLead(), credit_band: "below_620" }, WED_2PM_ET, "qualified").action).toBe("follow_up");
  });

  describe("business hours + membership (credit-union style rules)", () => {
    const cu = tweak(cfg, (c) => {
      c.handoff.live_transfer_available = "business_hours";
      c.handoff.business_hours = { days: ["mon", "tue", "wed", "thu", "fri"], start: "09:00", end: "17:00" };
      c.qualification.fields.push({ id: "is_member", label: "Member", type: "boolean", required: true, ask: "Are you a member?" });
      c.handoff.membership_required = true;
      c.handoff.membership_field = "is_member";
    });

    it("knows when it is inside business hours (in the lender's time zone)", () => {
      expect(isWithinBusinessHours(cu, WED_2PM_ET)).toBe(true);
      expect(isWithinBusinessHours(cu, SAT_10PM_ET)).toBe(false);
      expect(isWithinBusinessHours(cu, new Date("2026-10-21T21:00:00Z"))).toBe(false); // Wed 5:00pm ET, end is exclusive
      expect(isWithinBusinessHours(cfg, SAT_10PM_ET)).toBe(true); // Harborline is always on
    });

    it("books a callback after hours instead of transferring", () => {
      expect(evaluateHandoff(cu, { ...fullLead(), is_member: true }, SAT_10PM_ET, "qualified").action).toBe("callback");
      expect(evaluateHandoff(cu, { ...fullLead(), is_member: true }, WED_2PM_ET, "qualified").action).toBe("transfer");
    });

    it("never transfers non-members and asks when membership is unknown", () => {
      expect(evaluateHandoff(cu, { ...fullLead(), is_member: false }, WED_2PM_ET, "qualified")).toMatchObject({ action: "follow_up", why: "not_member" });
      expect(evaluateHandoff(cu, fullLead(), WED_2PM_ET, "licensed_question")).toMatchObject({ action: "ask_more", missing: ["is_member"] });
    });
  });
});
