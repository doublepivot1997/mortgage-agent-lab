import type { ModelConfig } from "./config.js";

export interface UsageTally {
  model: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cache_write_tokens: number;
  cache_read_tokens: number;
}

export function emptyTally(model: string): UsageTally {
  return { model, calls: 0, input_tokens: 0, output_tokens: 0, cache_write_tokens: 0, cache_read_tokens: 0 };
}

export interface ApiUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export function addUsage(tally: UsageTally, usage: ApiUsage): void {
  tally.calls += 1;
  tally.input_tokens += usage.input_tokens;
  tally.output_tokens += usage.output_tokens;
  tally.cache_write_tokens += usage.cache_creation_input_tokens ?? 0;
  tally.cache_read_tokens += usage.cache_read_input_tokens ?? 0;
}

/** USD cost of a tally. Throws if the model has no pricing entry, so cost is never silently $0. */
export function costUsd(pricing: ModelConfig["pricing"], tally: UsageTally): number {
  const p = pricing[tally.model];
  if (!p) throw new Error(`No pricing for model "${tally.model}" in config/models.yaml`);
  const usd =
    (tally.input_tokens * p.input +
      tally.output_tokens * p.output +
      tally.cache_write_tokens * p.cache_write +
      tally.cache_read_tokens * p.cache_read) /
    1_000_000;
  return Math.round(usd * 10_000) / 10_000;
}

export function sumCosts(pricing: ModelConfig["pricing"], tallies: UsageTally[]): number {
  return Math.round(tallies.reduce((s, t) => s + costUsd(pricing, t), 0) * 10_000) / 10_000;
}
