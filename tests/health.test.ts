import { describe, expect, it } from "vitest";
import { analyze, recommend } from "../src/health/analyze";
import { generateCalls, rng, toCsv, type SyntheticCall } from "../src/health/generate";
import { renderHealthHtml, renderHealthMarkdown } from "../src/health/render";

function call(over: Partial<SyntheticCall>): SyntheticCall {
  return {
    id: "t",
    synthetic: true,
    lender_id: "harborline",
    created_local: "2026-10-05T12:00",
    week: 1,
    day_of_week: "mon",
    is_weekend: false,
    hour: 12,
    lead_source: "web_form",
    speed_to_lead_seconds: 20,
    replied: true,
    objections: [],
    last_answered: "timeline",
    stopped_at: null,
    opted_out: false,
    qualified: true,
    outcome: "transferred",
    transfer_connected: true,
    borrower_turns: 8,
    end_sentiment: "positive",
    ...over,
  };
}

describe("synthetic generator", () => {
  it("is deterministic for a seed and different across seeds", () => {
    expect(generateCalls({ seed: 1, count: 50 })).toEqual(generateCalls({ seed: 1, count: 50 }));
    expect(generateCalls({ seed: 1, count: 50 })).not.toEqual(generateCalls({ seed: 2, count: 50 }));
    const r = rng(42);
    const xs = Array.from({ length: 1000 }, r);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
  });

  it("labels every record synthetic and keeps records internally consistent", () => {
    const calls = generateCalls();
    expect(calls).toHaveLength(420);
    for (const c of calls) {
      expect(c.synthetic).toBe(true);
      if (!c.replied) expect(c.outcome).toBe("no_response");
      if (c.outcome === "transferred") expect(c.qualified && c.transfer_connected !== null).toBe(true);
      if (c.transfer_connected !== null) expect(c.outcome).toBe("transferred");
      if (c.opted_out) expect(c.outcome).toBe("opted_out");
      if (c.qualified) expect(c.last_answered).toBe("timeline");
      expect(c.is_weekend).toBe(c.day_of_week === "sat" || c.day_of_week === "sun");
      expect(c.week).toBeGreaterThanOrEqual(1);
      expect(c.week).toBeLessThanOrEqual(4);
    }
  });

  it("writes CSV with escaping and joined lists", () => {
    const csv = toCsv([call({ objections: ["busy", "just_shopping"], id: 'a,"b"' })]);
    const [header, row] = csv.trim().split("\n");
    expect(header!.startsWith("id,synthetic,")).toBe(true);
    expect(row).toContain('"a,""b"""');
    expect(row).toContain("busy;just_shopping");
  });
});

describe("health analysis math", () => {
  const calls = [
    call({ id: "1" }),
    call({ id: "2", is_weekend: true, day_of_week: "sat", transfer_connected: false, end_sentiment: "frustrated" }),
    call({ id: "3", qualified: false, outcome: "abandoned", last_answered: "current_rate", stopped_at: "credit_band", transfer_connected: null }),
    call({ id: "4", replied: false, qualified: false, outcome: "no_response", last_answered: null, transfer_connected: null, lead_source: "rate_comparison_partner" }),
    call({ id: "5", qualified: false, opted_out: true, outcome: "opted_out", last_answered: null, stopped_at: "opener", transfer_connected: null, objections: ["how_got_info"], lead_source: "rate_comparison_partner" }),
  ];
  const r = analyze(calls);

  it("computes KPIs with the right denominators", () => {
    expect(r.kpis).toMatchObject({
      leads: 5,
      replied: 4,
      reply_rate: 0.8,
      qualified: 2,
      qualification_rate: 0.5, // of replied
      transferred: 2,
      transfer_rate: 1, // of qualified
      transfer_connect_rate: 0.5,
      opt_out_rate: 0.25, // of replied
    });
  });

  it("builds the funnel and per-question drop-off", () => {
    const f = Object.fromEntries(r.funnel.map((s) => [s.id, s.count]));
    expect(f).toMatchObject({ replied: 4, loan_goal: 3, current_rate: 3, credit_band: 2, timeline: 2, qualified: 2, connected: 1 });
    const credit = r.dropoff.find((d) => d.stage === "credit_band")!;
    expect(credit).toMatchObject({ asked: 3, stopped: 1, rate: 0.333 });
    expect(r.dropoff.find((d) => d.stage === "loan_goal")).toMatchObject({ asked: 3, stopped: 0 });
  });

  it("splits transfer connect by weekday/weekend and sources by opt-out", () => {
    expect(r.transfer_connect.weekday).toEqual({ transfers: 1, connected: 1, rate: 1 });
    expect(r.transfer_connect.weekend).toEqual({ transfers: 1, connected: 0, rate: 0 });
    expect(r.transfer_connect.missed_frustrated_rate).toBe(1);
    const partner = r.sources.find((s) => s.source === "rate_comparison_partner")!;
    expect(partner).toMatchObject({ leads: 2, reply_rate: 0.5, opt_out_rate: 1, how_got_info_rate: 1 });
  });
});

describe("recommendations", () => {
  const full = analyze(generateCalls());

  it("fires all three on the default synthetic dataset, each tied to a number", () => {
    expect(full.recommendations.map((x) => x.id)).toEqual(["dropoff_spike", "weekend_connect", "source_opener"]);
    for (const rec of full.recommendations) {
      expect(rec.headline).toMatch(/\d+%/);
      expect(rec.impact).toMatch(/synthetic estimate/);
      expect(rec.config_snippet.length).toBeGreaterThan(0);
    }
    expect(full.recommendations[0]!.title).toBe("Reframe the credit range question");
  });

  it("stays quiet when the data doesn't support a change", () => {
    const flat = {
      ...full,
      dropoff: full.dropoff.map((d) => ({ ...d, rate: 0.05 })),
      transfer_connect: { ...full.transfer_connect, weekend: { ...full.transfer_connect.weekend, rate: full.transfer_connect.weekday.rate } },
      sources: full.sources.map((s) => ({ ...s, opt_out_rate: 0.05 })),
    };
    expect(recommend(flat)).toEqual([]);
  });

  it("ignores tiny samples", () => {
    const tiny = { ...full, transfer_connect: { ...full.transfer_connect, weekend: { transfers: 4, connected: 1, rate: 0.25 } } };
    expect(recommend(tiny).map((x) => x.id)).not.toContain("weekend_connect");
  });
});

describe("rendering", () => {
  const report = analyze(generateCalls());
  it("labels the page and markdown as synthetic", () => {
    const html = renderHealthHtml(report, "Harborline Home Loans");
    expect(html).toContain("SYNTHETIC DATA · NOT REAL RESULTS");
    expect(html).toContain("does not describe any real company");
    expect(html).toContain("Show data table"); // accessible table view
    expect(html).toContain('prefers-color-scheme: dark');
    expect(renderHealthMarkdown(report, "Harborline Home Loans")).toContain("(SYNTHETIC DATA)");
  });
  it("escapes HTML in labels", () => {
    const html = renderHealthHtml(report, "<script>x</script>");
    expect(html).not.toContain("<script>x</script>");
  });
});
