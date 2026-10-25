import { describe, expect, it } from "vitest";
import { ConfigError, listLenders, loadLenderConfig, loadModelConfig, parseLenderConfig } from "../src/lib/config";
import { harborline, tweak } from "./helpers";

describe("lender config loading", () => {
  it("loads Harborline and validates it", () => {
    const cfg = loadLenderConfig("harborline");
    expect(cfg.lender.name).toBe("Harborline Home Loans");
    expect(cfg.qualification.fields.map((f) => f.id)).toContain("credit_band");
    expect(cfg.objections.map((o) => o.id)).toEqual(expect.arrayContaining(["just_shopping", "busy", "how_got_info"]));
  });

  it("lists every lender config on disk", () => {
    expect(listLenders()).toContain("harborline");
  });

  it("rejects unknown lenders and path tricks", () => {
    expect(() => loadLenderConfig("nope")).toThrow(ConfigError);
    expect(() => loadLenderConfig("../models")).toThrow(/bad lender id/);
  });

  it("reports which field is wrong", () => {
    const bad = tweak(harborline(), (c) => {
      (c.persona as { agent_name?: string }).agent_name = undefined;
    });
    expect(() => parseLenderConfig(bad)).toThrow(/persona\.agent_name/);
  });

  it("requires enum fields to list values", () => {
    const bad = tweak(harborline(), (c) => {
      c.qualification.fields[0]!.values = [];
    });
    expect(() => parseLenderConfig(bad)).toThrow(/enum fields need/);
  });

  it("rejects duplicate field ids and missing LTV fields", () => {
    const dupe = tweak(harborline(), (c) => {
      c.qualification.fields.push({ ...c.qualification.fields[0]! });
    });
    expect(() => parseLenderConfig(dupe)).toThrow(/duplicate field ids: loan_goal/);

    const noValue = tweak(harborline(), (c) => {
      c.qualification.fields = c.qualification.fields.filter((f) => f.id !== "home_value");
    });
    expect(() => parseLenderConfig(noValue)).toThrow(/home_value/);
  });

  it("requires business hours when transfers are hours-limited", () => {
    const bad = tweak(harborline(), (c) => {
      c.handoff.live_transfer_available = "business_hours";
      c.handoff.business_hours = null;
    });
    expect(() => parseLenderConfig(bad)).toThrow(/business_hours is required/);
  });

  it("requires a real membership field when membership is required", () => {
    const bad = tweak(harborline(), (c) => {
      c.handoff.membership_required = true;
      c.handoff.membership_field = "is_member";
    });
    expect(() => parseLenderConfig(bad)).toThrow(/membership_field/);
  });

  it("rejects invalid compliance regexes", () => {
    const bad = tweak(harborline(), (c) => {
      c.compliance.prohibited[0]!.detect = ["(unclosed"];
    });
    expect(() => parseLenderConfig(bad)).toThrow(/invalid regex/);
  });
});

describe("model config loading", () => {
  it("has pricing for every role's model", () => {
    const m = loadModelConfig();
    for (const role of Object.values(m.roles)) expect(m.pricing[role.model]).toBeDefined();
  });
});
