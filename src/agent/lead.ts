import type { FieldDef, LenderConfig } from "../lib/config";

export type FieldValue = string | number | boolean;
export type LeadFields = Record<string, FieldValue>;

// ---------- Field capture ----------

export interface MergeResult {
  applied: string[];
  rejected: { field: string; value: unknown; reason: string }[];
}

const NUMBER_BOUNDS: Record<string, [number, number]> = {
  current_rate: [0, 25],
  home_value: [1_000, 100_000_000],
  loan_balance: [0, 100_000_000],
  cash_out_amount: [0, 100_000_000],
};

export function validateFieldValue(def: FieldDef, value: unknown): { ok: true; value: FieldValue } | { ok: false; reason: string } {
  switch (def.type) {
    case "enum":
      if (typeof value === "string" && def.values!.includes(value)) return { ok: true, value };
      return { ok: false, reason: `must be one of ${def.values!.join(", ")}` };
    case "number": {
      const n = typeof value === "string" ? Number(value.replace(/[$,%\s]/g, "")) : value;
      if (typeof n !== "number" || !Number.isFinite(n)) return { ok: false, reason: "must be a number" };
      const [lo, hi] = NUMBER_BOUNDS[def.id] ?? [0, Number.MAX_SAFE_INTEGER];
      if (n < lo || n > hi) return { ok: false, reason: `out of range (${lo}-${hi})` };
      return { ok: true, value: n };
    }
    case "boolean":
      if (typeof value === "boolean") return { ok: true, value };
      return { ok: false, reason: "must be true or false" };
  }
}

/** Merge a partial update into the lead. `null`/`undefined` means "not mentioned" and is ignored. */
export function mergeLeadFields(cfg: LenderConfig, lead: LeadFields, update: Record<string, unknown>): MergeResult {
  const defs = new Map(cfg.qualification.fields.map((f) => [f.id, f]));
  const result: MergeResult = { applied: [], rejected: [] };
  for (const [key, raw] of Object.entries(update)) {
    if (raw === null || raw === undefined) continue;
    const def = defs.get(key);
    if (!def) {
      result.rejected.push({ field: key, value: raw, reason: "unknown field" });
      continue;
    }
    const v = validateFieldValue(def, raw);
    if (v.ok) {
      lead[key] = v.value;
      result.applied.push(key);
    } else {
      result.rejected.push({ field: key, value: raw, reason: v.reason });
    }
  }
  return result;
}

export function isFieldRequired(def: FieldDef, lead: LeadFields): boolean {
  if (def.required) return true;
  if (!def.required_if) return false;
  return Object.entries(def.required_if).every(([k, v]) => lead[k] === v);
}

export function missingRequiredFields(cfg: LenderConfig, lead: LeadFields): string[] {
  return cfg.qualification.fields.filter((f) => isFieldRequired(f, lead) && lead[f.id] === undefined).map((f) => f.id);
}

/** Loan-to-value including any cash out. Null if we don't have the numbers yet. */
export function computeLtv(lead: LeadFields): number | null {
  const value = lead.home_value;
  const balance = lead.loan_balance;
  if (typeof value !== "number" || typeof balance !== "number" || value <= 0) return null;
  const cashOut = typeof lead.cash_out_amount === "number" ? lead.cash_out_amount : 0;
  return Math.round(((balance + cashOut) / value) * 1000) / 1000;
}

// ---------- Business hours ----------

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export function localClock(now: Date, timeZone: string): { day: (typeof DAY_KEYS)[number]; hhmm: string; label: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = get("weekday").slice(0, 3).toLowerCase() as (typeof DAY_KEYS)[number];
  const hhmm = `${get("hour")}:${get("minute")}`;
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(now);
  return { day, hhmm, label };
}

export function isWithinBusinessHours(cfg: LenderConfig, now: Date): boolean {
  const h = cfg.handoff;
  if (h.live_transfer_available === "always") return true;
  const bh = h.business_hours!;
  const { day, hhmm } = localClock(now, cfg.lender.timezone);
  return bh.days.includes(day) && hhmm >= bh.start && hhmm < bh.end;
}

// ---------- Handoff decision ----------

export type TransferReason = "qualified" | "licensed_question" | "borrower_requested_human";

export type HandoffDecision =
  | { action: "transfer"; ltv: number | null }
  | { action: "ask_more"; missing: string[]; detail: string }
  | { action: "callback"; detail: string }
  | { action: "follow_up"; detail: string; why: "not_eligible" | "not_member" };

/**
 * The single source of truth for "should this lead go to a live loan officer right now?"
 * Used by the transfer tool (as a guard) and by evals (as the expected outcome).
 */
export function evaluateHandoff(cfg: LenderConfig, lead: LeadFields, now: Date, reason: TransferReason): HandoffDecision {
  const h = cfg.handoff;
  const q = h.qualified_when;

  if (h.membership_required) {
    const member = lead[h.membership_field!];
    if (member === false) {
      return { action: "follow_up", why: "not_member", detail: h.non_member_guidance ?? "Live transfer is for members only." };
    }
    if (member === undefined) {
      return { action: "ask_more", missing: [h.membership_field!], detail: "Confirm membership before any transfer." };
    }
  }

  const ltv = computeLtv(lead);
  if (ltv !== null && ltv > q.max_ltv) {
    return {
      action: "follow_up",
      why: "not_eligible",
      detail: `LTV ${ltv} is above the ${q.max_ltv} live-transfer limit. ${h.not_eligible_guidance}`,
    };
  }
  const credit = lead.credit_band;
  if (typeof credit === "string" && q.exclude_credit_bands.includes(credit)) {
    return { action: "follow_up", why: "not_eligible", detail: `Credit band ${credit} is routed to follow-up. ${h.not_eligible_guidance}` };
  }
  const timeline = lead.timeline;
  if (typeof timeline === "string" && q.exclude_timelines.includes(timeline)) {
    return { action: "follow_up", why: "not_eligible", detail: `Timeline ${timeline} is routed to follow-up. ${h.not_eligible_guidance}` };
  }

  if (reason === "qualified" && q.all_required_fields) {
    const missing = missingRequiredFields(cfg, lead);
    if (missing.length) return { action: "ask_more", missing, detail: `Still missing: ${missing.join(", ")}.` };
  }

  if (reason !== "qualified") {
    const missing = h.licensed_question_min_fields.filter((f) => lead[f] === undefined);
    if (missing.length) {
      return {
        action: "ask_more",
        missing,
        detail: `Before a loan officer can answer that, collect: ${missing.join(", ")}. Tell the borrower the loan officer needs these to give a real answer.`,
      };
    }
  }

  if (reason !== "qualified" && h.licensed_question_action === "book_callback") {
    return { action: "callback", detail: "This lender routes licensed questions to a scheduled callback." };
  }

  if (!isWithinBusinessHours(cfg, now)) {
    const bh = h.business_hours!;
    return {
      action: "callback",
      detail: `Loan officers are available ${bh.days.join("/")} ${bh.start}-${bh.end} (${cfg.lender.timezone}). ${h.after_hours_guidance ?? "Offer to book a callback."}`,
    };
  }

  return { action: "transfer", ltv };
}
