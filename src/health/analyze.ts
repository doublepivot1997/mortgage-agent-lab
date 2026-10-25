import { LEAD_SOURCES, OBJECTIONS, QUESTION_STAGES, type LeadSource, type Objection, type QuestionStage, type SyntheticCall } from "./generate.js";

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const rate = (num: number, den: number) => (den ? r3(num / den) : 0);
const pct = (n: number) => `${Math.round(n * 100)}%`;

export interface Kpis {
  leads: number;
  replied: number;
  reply_rate: number; // replied / leads
  qualified: number;
  qualification_rate: number; // qualified / replied
  transferred: number;
  transfer_rate: number; // transferred / qualified
  transfer_connect_rate: number; // connected / transferred
  opt_out_rate: number; // opted out / replied
  median_speed_to_lead_seconds: number;
}

export interface FunnelStep {
  id: string;
  label: string;
  count: number;
  share_of_replied: number;
}

export interface StageDropoff {
  stage: QuestionStage;
  label: string;
  asked: number;
  stopped: number;
  rate: number;
}

export interface ObjectionStat {
  id: Objection;
  label: string;
  count: number;
  share_of_replied: number;
  qualification_rate_with: number;
  qualification_rate_without: number;
}

export interface SourceStat {
  source: LeadSource;
  label: string;
  leads: number;
  reply_rate: number;
  opt_out_rate: number;
  how_got_info_rate: number;
  qualification_rate: number;
}

export interface Recommendation {
  id: string;
  title: string;
  /** The single number the recommendation rests on, stated plainly. */
  headline: string;
  evidence: string[];
  change: string;
  config_snippet: string;
  validate: string;
  impact: string;
}

export interface HealthReport {
  synthetic: true;
  lender_id: string;
  period: { start: string; end: string; weeks: number };
  kpis: Kpis;
  funnel: FunnelStep[];
  dropoff: StageDropoff[];
  objections: ObjectionStat[];
  sources: SourceStat[];
  transfer_connect: { weekday: { transfers: number; connected: number; rate: number }; weekend: { transfers: number; connected: number; rate: number }; missed_frustrated_rate: number };
  weekly: { week: number; leads: number; qualification_rate: number }[];
  outcomes: { outcome: string; count: number }[];
  recommendations: Recommendation[];
}

export const STAGE_LABELS: Record<QuestionStage, string> = {
  loan_goal: "Loan goal",
  home_value: "Home value",
  loan_balance: "Loan balance",
  current_rate: "Current rate",
  credit_band: "Credit range",
  occupancy: "Occupancy",
  timeline: "Timeline",
};
const OBJECTION_LABELS: Record<Objection, string> = {
  just_shopping: "Just shopping rates",
  busy: "Busy right now",
  how_got_info: "How did you get my info?",
  already_have_lender: "Already have a lender",
};
export const SOURCE_LABELS: Record<LeadSource, string> = {
  web_form: "Own web form",
  rate_comparison_partner: "Comparison site",
  refinance_ad: "Refinance ad",
};

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Index of the stage a call stopped at, or Infinity if it got past every question. */
function stageIndexReached(c: SyntheticCall): number {
  if (!c.replied) return -2;
  if (c.stopped_at === "opener") return -1;
  if (c.stopped_at) return QUESTION_STAGES.indexOf(c.stopped_at);
  // Callbacks for busy borrowers skipped the questions entirely.
  if (c.last_answered === null) return -1;
  return Infinity;
}

export function analyze(calls: SyntheticCall[]): HealthReport {
  const replied = calls.filter((c) => c.replied);
  const qualified = calls.filter((c) => c.qualified);
  const transferred = calls.filter((c) => c.outcome === "transferred");
  const connected = transferred.filter((c) => c.transfer_connected);

  const kpis: Kpis = {
    leads: calls.length,
    replied: replied.length,
    reply_rate: rate(replied.length, calls.length),
    qualified: qualified.length,
    qualification_rate: rate(qualified.length, replied.length),
    transferred: transferred.length,
    transfer_rate: rate(transferred.length, qualified.length),
    transfer_connect_rate: rate(connected.length, transferred.length),
    opt_out_rate: rate(replied.filter((c) => c.opted_out).length, replied.length),
    median_speed_to_lead_seconds: median(calls.map((c) => c.speed_to_lead_seconds)),
  };

  // Funnel: how many replied borrowers answered each question, then qualified/transferred/connected.
  const funnel: FunnelStep[] = [{ id: "replied", label: "Replied", count: replied.length, share_of_replied: 1 }];
  QUESTION_STAGES.forEach((stage, i) => {
    const n = replied.filter((c) => c.last_answered !== null && QUESTION_STAGES.indexOf(c.last_answered) >= i).length;
    funnel.push({ id: stage, label: `Answered: ${STAGE_LABELS[stage]}`, count: n, share_of_replied: rate(n, replied.length) });
  });
  funnel.push(
    { id: "qualified", label: "Qualified", count: qualified.length, share_of_replied: rate(qualified.length, replied.length) },
    { id: "transferred", label: "Transferred", count: transferred.length, share_of_replied: rate(transferred.length, replied.length) },
    { id: "connected", label: "Officer connected", count: connected.length, share_of_replied: rate(connected.length, replied.length) },
  );

  // Drop-off: of borrowers asked a question, the share who stopped there.
  const dropoff: StageDropoff[] = QUESTION_STAGES.map((stage, i) => {
    const asked = replied.filter((c) => stageIndexReached(c) >= i).length;
    const stopped = replied.filter((c) => c.stopped_at === stage).length;
    return { stage, label: STAGE_LABELS[stage], asked, stopped, rate: rate(stopped, asked) };
  });

  const objections: ObjectionStat[] = OBJECTIONS.map((o) => {
    const withO = replied.filter((c) => c.objections.includes(o));
    const without = replied.filter((c) => !c.objections.includes(o));
    return {
      id: o,
      label: OBJECTION_LABELS[o],
      count: withO.length,
      share_of_replied: rate(withO.length, replied.length),
      qualification_rate_with: rate(withO.filter((c) => c.qualified).length, withO.length),
      qualification_rate_without: rate(without.filter((c) => c.qualified).length, without.length),
    };
  }).sort((a, b) => b.count - a.count);

  const sources: SourceStat[] = LEAD_SOURCES.map((s) => {
    const all = calls.filter((c) => c.lead_source === s);
    const rep = all.filter((c) => c.replied);
    return {
      source: s,
      label: SOURCE_LABELS[s],
      leads: all.length,
      reply_rate: rate(rep.length, all.length),
      opt_out_rate: rate(rep.filter((c) => c.opted_out).length, rep.length),
      how_got_info_rate: rate(rep.filter((c) => c.objections.includes("how_got_info")).length, rep.length),
      qualification_rate: rate(rep.filter((c) => c.qualified).length, rep.length),
    };
  });

  const wkT = transferred.filter((c) => !c.is_weekend);
  const weT = transferred.filter((c) => c.is_weekend);
  const missed = transferred.filter((c) => !c.transfer_connected);
  const transfer_connect = {
    weekday: { transfers: wkT.length, connected: wkT.filter((c) => c.transfer_connected).length, rate: rate(wkT.filter((c) => c.transfer_connected).length, wkT.length) },
    weekend: { transfers: weT.length, connected: weT.filter((c) => c.transfer_connected).length, rate: rate(weT.filter((c) => c.transfer_connected).length, weT.length) },
    missed_frustrated_rate: rate(missed.filter((c) => c.end_sentiment === "frustrated").length, missed.length),
  };

  const weeks = [...new Set(calls.map((c) => c.week))].sort((a, b) => a - b);
  const weekly = weeks.map((w) => {
    const wc = calls.filter((c) => c.week === w);
    const wr = wc.filter((c) => c.replied);
    return { week: w, leads: wc.length, qualification_rate: rate(wr.filter((c) => c.qualified).length, wr.length) };
  });

  const outcomeCounts = new Map<string, number>();
  for (const c of calls) outcomeCounts.set(c.outcome, (outcomeCounts.get(c.outcome) ?? 0) + 1);
  const outcomes = [...outcomeCounts.entries()].map(([outcome, count]) => ({ outcome, count })).sort((a, b) => b.count - a.count);

  const dates = calls.map((c) => c.created_local.slice(0, 10)).sort();
  const report: Omit<HealthReport, "recommendations"> = {
    synthetic: true,
    lender_id: calls[0]?.lender_id ?? "unknown",
    period: { start: dates[0] ?? "", end: dates.at(-1) ?? "", weeks: weeks.length },
    kpis,
    funnel,
    dropoff,
    objections,
    sources,
    transfer_connect,
    weekly,
    outcomes,
  };
  return { ...report, recommendations: recommend(report) };
}

// ---------- Recommendations: each fires only if the data supports it ----------

export function recommend(r: Omit<HealthReport, "recommendations">): Recommendation[] {
  const recs: Recommendation[] = [];
  const weeks = Math.max(1, r.period.weeks);

  // 1. A question where far more borrowers stop than at the others.
  const sorted = [...r.dropoff].sort((a, b) => b.rate - a.rate);
  const worst = sorted[0];
  const others = r.dropoff.filter((d) => d !== worst).map((d) => d.rate);
  const typical = median(others);
  if (worst && worst.asked >= 30 && typical > 0 && worst.rate >= 2 * typical) {
    const recoverable = Math.round(worst.asked * (worst.rate - typical) * (r.kpis.qualified / Math.max(1, r.funnel.find((f) => f.id === worst.stage)?.count ?? 1)));
    recs.push({
      id: "dropoff_spike",
      title: `Reframe the ${worst.label.toLowerCase()} question`,
      headline: `${pct(worst.rate)} of borrowers asked about ${worst.label.toLowerCase()} stopped replying, vs ${pct(typical)} at a typical question.`,
      evidence: [
        `${worst.stopped} of ${worst.asked} borrowers stopped at this question (${pct(worst.rate)}).`,
        `Median drop-off at the other ${others.length} questions: ${pct(typical)}.`,
        worst.stage === "credit_band" ? "Credit is the most sensitive question we ask; borrowers often assume it triggers a credit pull." : "It is the clearest outlier in the funnel.",
      ],
      change:
        worst.stage === "credit_band"
          ? "Ask credit last, lead with \"no credit check, just your best guess,\" and make \"not sure\" an easy answer. Allow a transfer without it, since the loan officer will review credit anyway."
          : "Move this question later and explain why it's needed.",
      config_snippet:
        worst.stage === "credit_band"
          ? `qualification:\n  fields:\n    # move credit_band after occupancy and timeline\n    - id: credit_band\n      required: false   # loan officer confirms credit\n      ask: >-\n        Lead with "this isn't a credit check, just your best guess," and offer\n        "not sure" as an answer.`
          : `# move ${worst.stage} later in qualification.fields`,
      validate: `Re-run the eval suite (recall and borrower experience must hold), then watch ${worst.label.toLowerCase()} drop-off weekly. Target: at or below ${pct(typical * 1.5)}.`,
      impact: `If drop-off here matched a typical question, about ${recoverable} more qualified leads over these ${weeks} weeks (synthetic estimate).`,
    });
  }

  // 2. Weekend transfers that don't connect.
  const tc = r.transfer_connect;
  const gap = tc.weekday.rate - tc.weekend.rate;
  if (tc.weekend.transfers >= 10 && gap >= 0.15) {
    const missedWeekend = tc.weekend.transfers - tc.weekend.connected;
    recs.push({
      id: "weekend_connect",
      title: "Stop promising a 5-minute call on weekends",
      headline: `Only ${pct(tc.weekend.rate)} of weekend transfers reached a loan officer, vs ${pct(tc.weekday.rate)} on weekdays.`,
      evidence: [
        `${missedWeekend} of ${tc.weekend.transfers} weekend transfers did not connect within the promised window.`,
        `${pct(tc.missed_frustrated_rate)} of borrowers whose transfer didn't connect ended the conversation frustrated.`,
        "The agent's transfer message says \"usually within 5 minutes,\" which is untrue on weekends.",
      ],
      change:
        "On weekends, offer a scheduled call instead of a live transfer, or tell the borrower the honest wait. Share the connect-rate gap with the lender's sales manager: it may be a staffing fix, not an agent fix.",
      config_snippet: `handoff:\n  live_transfer_available: business_hours\n  business_hours: { days: [mon, tue, wed, thu, fri], start: "08:00", end: "21:00" }\n  after_hours_guidance: >-\n    Offer a call at a time that works; don't promise an immediate callback.`,
      validate: "Add a weekend persona to the eval suite (expected: callback, clear next step). Then track weekend connect rate and frustrated endings weekly.",
      impact: `About ${Math.round(missedWeekend / weeks)} fewer broken \"5-minute\" promises per week (synthetic estimate).`,
    });
  }

  // 3. A lead source with outsized opt-outs / "how did you get my info?"
  const base = r.sources.find((s) => s.source === "web_form");
  const worstSrc = [...r.sources].filter((s) => s.source !== "web_form").sort((a, b) => b.opt_out_rate - a.opt_out_rate)[0];
  if (base && worstSrc && worstSrc.leads >= 40 && worstSrc.opt_out_rate >= 2 * base.opt_out_rate && worstSrc.opt_out_rate >= 0.05) {
    recs.push({
      id: "source_opener",
      title: `Use a source-aware opener for ${worstSrc.label.toLowerCase()} leads`,

      headline: `${pct(worstSrc.opt_out_rate)} of ${worstSrc.label.toLowerCase()} leads opted out, vs ${pct(base.opt_out_rate)} from the lender's own web form.`,
      evidence: [
        `${pct(worstSrc.how_got_info_rate)} of these leads asked some form of "how did you get my info?" (web form: ${pct(base.how_got_info_rate)}).`,
        `They came through a third-party site, so a Harborline text feels unexpected. The opener references "the inquiry you just submitted" without saying where.`,
        `Qualification rate for this source: ${pct(worstSrc.qualification_rate)} (web form: ${pct(base.qualification_rate)}).`,
      ],
      change: "Pass the lead source to the agent and name it in the first message (\"you requested refinance quotes on [partner site] a moment ago\"). Keep the STOP reminder.",
      config_snippet: `channel:\n  trigger_by_source:\n    rate_comparison_partner: >-\n      The borrower requested refinance quotes on a rate-comparison site a moment\n      ago and chose Harborline as one of the lenders to contact them. Say so.`,
      validate: "Add a partner-sourced persona to the eval suite; then watch opt-out and \"how did you get my info?\" rates for this source weekly.",
      impact: `If opt-outs fell to the web-form rate, about ${Math.round(worstSrc.leads * worstSrc.reply_rate * (worstSrc.opt_out_rate - base.opt_out_rate))} more conversations kept over these ${weeks} weeks (synthetic estimate).`,
    });
  }
  return recs;
}
