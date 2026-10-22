import type { LenderConfig } from "../lib/config.js";

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the whole message is a hard-stop keyword ("STOP", "unsubscribe!", "Opt out."). */
export function isHardStop(cfg: LenderConfig, message: string): boolean {
  const msg = normalize(message);
  if (!msg) return false;
  return cfg.compliance.opt_out.hard_stop_keywords.some((k) => normalize(k) === msg);
}

/** True when the message contains softer opt-out phrasing. Used by evals to know an opt-out happened. */
export function hasSoftOptOut(cfg: LenderConfig, message: string): boolean {
  const msg = normalize(message.replace(/['’]/g, ""));
  return cfg.compliance.opt_out.soft_signals.some((s) => msg.includes(normalize(s.replace(/['’]/g, ""))));
}
