import type { ReactNode } from "react";

export const pct = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${Math.round(n * 100)}%`);
export const five = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toFixed(1));
export const usd = (n: number | null | undefined, digits = 2) => (n === null || n === undefined ? "—" : `$${n.toFixed(digits)}`);

export function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card kpi">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub ? <div className="sub">{sub}</div> : null}
    </div>
  );
}

export function Pill({ kind, children }: { kind: "good" | "bad" | "warn" | "neutral"; children: ReactNode }) {
  return <span className={`pill pill-${kind}`}>{children}</span>;
}

export function PassFlag({ pass }: { pass: boolean }) {
  return pass ? <Pill kind="good">✓ Pass</Pill> : <Pill kind="bad">! Flag</Pill>;
}

export function SyntheticBadge({ children = "SYNTHETIC · SIMULATED BORROWERS" }: { children?: ReactNode }) {
  return <span className="badge badge-warn">{children}</span>;
}

export const OUTCOME_LABELS: Record<string, string> = {
  transferred: "Transferred to loan officer",
  follow_up: "Follow-up booked",
  callback_booked: "Callback booked",
  opted_out: "Opted out",
  ended_other: "Ended",
  incomplete: "Incomplete",
};
export const outcomeLabel = (o: string) => OUTCOME_LABELS[o] ?? o;
