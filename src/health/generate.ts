/**
 * SYNTHETIC call data for the account health view. Nothing here is real.
 *
 * A seeded generator, so the same seed always produces the same dataset. The rates below are
 * invented but plausible, and three patterns are planted on purpose so the health view has
 * something to find:
 *   1. A drop-off spike at the self-reported credit question.
 *   2. Weekend live transfers often go unanswered by a loan officer.
 *   3. Leads from a rate-comparison partner opt out and ask "how did you get my info?" more often.
 */

export const QUESTION_STAGES = ["loan_goal", "home_value", "loan_balance", "current_rate", "credit_band", "occupancy", "timeline"] as const;
export type QuestionStage = (typeof QUESTION_STAGES)[number];

export const LEAD_SOURCES = ["web_form", "rate_comparison_partner", "refinance_ad"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const OBJECTIONS = ["just_shopping", "busy", "how_got_info", "already_have_lender"] as const;
export type Objection = (typeof OBJECTIONS)[number];

export type CallOutcome =
  | "no_response" // never replied to the opener
  | "opted_out"
  | "abandoned" // stopped replying mid-qualification
  | "not_interested"
  | "callback_booked" // busy, or chose a later call
  | "loan_officer_review" // not eligible for live transfer; review booked
  | "transferred";

export interface SyntheticCall {
  id: string;
  synthetic: true;
  lender_id: string;
  created_local: string; // lender's local time, ISO without zone
  week: number; // 1-based week of the dataset
  day_of_week: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
  is_weekend: boolean;
  hour: number;
  lead_source: LeadSource;
  speed_to_lead_seconds: number;
  replied: boolean;
  objections: Objection[];
  /** Last qualification question the borrower answered, or null if none. */
  last_answered: QuestionStage | null;
  /** Question the borrower stopped at without answering (abandon or opt-out), or null. */
  stopped_at: QuestionStage | "opener" | null;
  opted_out: boolean;
  qualified: boolean;
  outcome: CallOutcome;
  /** For transfers: did a loan officer actually reach the borrower within the promised window? */
  transfer_connected: boolean | null;
  borrower_turns: number;
  end_sentiment: "positive" | "neutral" | "frustrated";
}

// ---------- Seeded randomness ----------

/** mulberry32: tiny, fast, deterministic PRNG. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(r: () => number, weighted: [T, number][]): T {
  const total = weighted.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [v, w] of weighted) if ((x -= w) < 0) return v;
  return weighted[weighted.length - 1]![0];
}

// ---------- Assumptions (all invented) ----------

const REPLY_RATE: Record<LeadSource, number> = { web_form: 0.74, rate_comparison_partner: 0.6, refinance_ad: 0.66 };
const OBJECTION_RATE: Record<Objection, Record<LeadSource, number>> = {
  just_shopping: { web_form: 0.18, rate_comparison_partner: 0.4, refinance_ad: 0.2 },
  busy: { web_form: 0.14, rate_comparison_partner: 0.12, refinance_ad: 0.15 },
  how_got_info: { web_form: 0.05, rate_comparison_partner: 0.26, refinance_ad: 0.09 },
  already_have_lender: { web_form: 0.06, rate_comparison_partner: 0.09, refinance_ad: 0.07 },
};
/** Chance of opting out right after the opener. Much higher when "how did you get my info?" comes up. */
const OPENER_OPT_OUT: Record<LeadSource, number> = { web_form: 0.02, rate_comparison_partner: 0.06, refinance_ad: 0.03 };
const OPT_OUT_IF_HOW_GOT_INFO = 0.32;
/** Chance a borrower stops replying when asked each question. Pattern 1: credit is the spike. */
const ABANDON_AT: Record<QuestionStage, number> = {
  loan_goal: 0.04,
  home_value: 0.05,
  loan_balance: 0.04,
  current_rate: 0.05,
  credit_band: 0.17,
  occupancy: 0.02,
  timeline: 0.02,
};
const NOT_ELIGIBLE_RATE = 0.08; // LTV above the live-transfer limit
const BUSY_TAKES_CALLBACK = 0.6;
const QUALIFIED_CHOOSES_LATER = 0.1;
/** Pattern 2: loan officers answer live transfers far less often on weekends. */
const TRANSFER_CONNECTS = { weekday: 0.94, weekend: 0.63 };

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export interface GenerateOptions {
  seed?: number;
  count?: number;
  lenderId?: string;
  /** First day of the dataset (local date, YYYY-MM-DD). */
  startDate?: string;
  days?: number;
}

export function generateCalls(opts: GenerateOptions = {}): SyntheticCall[] {
  const { seed = 20261025, count = 420, lenderId = "harborline", startDate = "2026-09-28", days = 28 } = opts;
  const r = rng(seed);
  const start = new Date(`${startDate}T00:00:00Z`);
  const calls: SyntheticCall[] = [];

  for (let i = 0; i < count; i++) {
    // When: weekdays busier than weekends, evenings busier than mornings.
    let dayOffset: number;
    let dow: (typeof DAYS)[number];
    do {
      dayOffset = Math.floor(r() * days);
      dow = DAYS[new Date(start.getTime() + dayOffset * 86_400_000).getUTCDay()]!;
    } while ((dow === "sat" || dow === "sun") && r() < 0.35);
    const hour = pick(r, [[8, 2], [10, 4], [12, 5], [14, 4], [16, 4], [18, 6], [19, 7], [20, 6], [21, 4], [22, 2]] as [number, number][]);
    const minute = Math.floor(r() * 60);
    const date = new Date(start.getTime() + dayOffset * 86_400_000);
    const created_local = `${date.toISOString().slice(0, 10)}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    const is_weekend = dow === "sat" || dow === "sun";

    const lead_source = pick(r, [["web_form", 0.55], ["rate_comparison_partner", 0.3], ["refinance_ad", 0.15]] as [LeadSource, number][]);
    const speed_to_lead_seconds = Math.round(8 + -Math.log(1 - r()) * 18); // ~ median 20s

    const call: SyntheticCall = {
      id: `syn-${lenderId}-${String(i + 1).padStart(4, "0")}`,
      synthetic: true,
      lender_id: lenderId,
      created_local,
      week: Math.floor(dayOffset / 7) + 1,
      day_of_week: dow,
      is_weekend,
      hour,
      lead_source,
      speed_to_lead_seconds,
      replied: r() < REPLY_RATE[lead_source],
      objections: [],
      last_answered: null,
      stopped_at: null,
      opted_out: false,
      qualified: false,
      outcome: "no_response",
      transfer_connected: null,
      borrower_turns: 0,
      end_sentiment: "neutral",
    };
    calls.push(call);
    if (!call.replied) continue;

    call.borrower_turns = 1;
    for (const o of OBJECTIONS) if (r() < OBJECTION_RATE[o][lead_source]) call.objections.push(o);

    // Opener: opt-out risk (pattern 3).
    const optOutP = call.objections.includes("how_got_info") ? OPT_OUT_IF_HOW_GOT_INFO : OPENER_OPT_OUT[lead_source];
    if (r() < optOutP) {
      Object.assign(call, { opted_out: true, stopped_at: "opener", outcome: "opted_out", end_sentiment: "neutral" });
      continue;
    }
    if (call.objections.includes("already_have_lender") && r() < 0.55) {
      Object.assign(call, { outcome: "not_interested", stopped_at: "opener" });
      continue;
    }
    if (call.objections.includes("busy") && r() < BUSY_TAKES_CALLBACK) {
      call.outcome = "callback_booked";
      call.borrower_turns += 1;
      call.end_sentiment = "positive";
      continue;
    }

    // Qualification questions.
    let abandoned = false;
    for (const stage of QUESTION_STAGES) {
      // Rate shoppers are a bit less patient at every question.
      const p = ABANDON_AT[stage] * (call.objections.includes("just_shopping") ? 1.4 : 1);
      if (r() < p) {
        call.stopped_at = stage;
        if (r() < 0.12) {
          call.opted_out = true;
          call.outcome = "opted_out";
        } else {
          call.outcome = "abandoned";
        }
        abandoned = true;
        break;
      }
      call.last_answered = stage;
      call.borrower_turns += 1;
    }
    if (abandoned) continue;

    if (r() < NOT_ELIGIBLE_RATE) {
      call.outcome = "loan_officer_review";
      call.end_sentiment = r() < 0.8 ? "neutral" : "positive";
      continue;
    }
    call.qualified = true;
    if (r() < QUALIFIED_CHOOSES_LATER) {
      call.outcome = "callback_booked";
      call.end_sentiment = "positive";
      continue;
    }
    call.outcome = "transferred";
    call.transfer_connected = r() < (is_weekend ? TRANSFER_CONNECTS.weekend : TRANSFER_CONNECTS.weekday);
    call.end_sentiment = call.transfer_connected ? (r() < 0.75 ? "positive" : "neutral") : r() < 0.7 ? "frustrated" : "neutral";
  }
  return calls.sort((a, b) => a.created_local.localeCompare(b.created_local));
}

export function toCsv(calls: SyntheticCall[]): string {
  const cols: (keyof SyntheticCall)[] = [
    "id", "synthetic", "lender_id", "created_local", "week", "day_of_week", "is_weekend", "hour", "lead_source",
    "speed_to_lead_seconds", "replied", "objections", "last_answered", "stopped_at", "opted_out", "qualified",
    "outcome", "transfer_connected", "borrower_turns", "end_sentiment",
  ];
  const esc = (v: unknown) => {
    const s = Array.isArray(v) ? v.join(";") : v === null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...calls.map((c) => cols.map((k) => esc(c[k])).join(","))].join("\n") + "\n";
}
