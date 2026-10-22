import { describe, expect, it } from "vitest";
import { hasSoftOptOut, isHardStop } from "../src/agent/optout.js";
import { loadModelConfig } from "../src/lib/config.js";
import { addUsage, costUsd, emptyTally, sumCosts } from "../src/lib/cost.js";
import { harborline } from "./helpers.js";

describe("opt-out detection", () => {
  const cfg = harborline();

  it("treats a bare keyword as a hard stop, regardless of case and punctuation", () => {
    for (const m of ["STOP", "stop.", " Stop! ", "unsubscribe", "Opt out", "OPT-OUT"]) expect(isHardStop(cfg, m)).toBe(true);
  });

  it("does not hard-stop on sentences that merely contain the word", () => {
    for (const m of ["don't stop now", "can you stop by later?", "I'll end up refinancing", "", "?"]) expect(isHardStop(cfg, m)).toBe(false);
  });

  it("detects softer opt-out phrasing", () => {
    expect(hasSoftOptOut(cfg, "Please don't contact me again")).toBe(true);
    expect(hasSoftOptOut(cfg, "Stop texting me")).toBe(true);
    expect(hasSoftOptOut(cfg, "Sure, go ahead")).toBe(false);
  });
});

describe("cost math", () => {
  const { pricing } = loadModelConfig();

  it("prices each token type separately", () => {
    const t = emptyTally("claude-opus-5-5");
    addUsage(t, { input_tokens: 1_000_000, output_tokens: 0 });
    expect(costUsd(pricing, t)).toBe(4);
    addUsage(t, { input_tokens: 0, output_tokens: 100_000, cache_creation_input_tokens: 200_000, cache_read_input_tokens: 1_000_000 });
    // 4 + 2.00 (output) + 1.00 (cache write) + 0.20 (cache read)
    expect(costUsd(pricing, t)).toBeCloseTo(7.2, 6);
    expect(t.calls).toBe(2);
  });

  it("treats missing cache fields as zero", () => {
    const t = emptyTally("claude-haiku-5-5");
    addUsage(t, { input_tokens: 2_000_000, output_tokens: 1_000_000, cache_creation_input_tokens: null });
    expect(costUsd(pricing, t)).toBeCloseTo(0.7, 6);
  });

  it("sums across roles and refuses unknown models", () => {
    const a = emptyTally("claude-opus-5-5");
    addUsage(a, { input_tokens: 500_000, output_tokens: 0 });
    const b = emptyTally("claude-sonnet-5-5");
    addUsage(b, { input_tokens: 500_000, output_tokens: 0 });
    expect(sumCosts(pricing, [a, b])).toBe(3);
    expect(() => costUsd(pricing, emptyTally("mystery-model"))).toThrow(/No pricing/);
  });
});
