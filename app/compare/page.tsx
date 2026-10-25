import type { Metadata } from "next";
import { diffConfigs } from "../../src/evals/compare";
import { expectedOutcome, loadPersonas } from "../../src/evals/personas";
import { loadLenderConfig } from "../../src/lib/config";
import { showcaseRun } from "../../src/web/data";
import { SyntheticBadge, five, outcomeLabel, pct, usd } from "../components/ui";
import type { Metrics, Scorecard } from "../../src/evals/scorecard";

export const metadata: Metadata = { title: "Two lenders" };

const SECTION_TITLES: Record<string, string> = {
  lender: "Lender",
  persona: "Persona and tone",
  channel: "Channel",
  disclosure: "Disclosure",
  qualification: "Qualification fields",
  objections: "Objection playbook",
  compliance: "Compliance",
  handoff: "Handoff rules",
};

function majority(sc: Scorecard | null, id: string): string {
  const convs = sc?.conversations.filter((c) => c.persona_id === id) ?? [];
  if (!convs.length) return "—";
  const counts = new Map<string, number>();
  convs.forEach((c) => counts.set(c.actual_outcome, (counts.get(c.actual_outcome) ?? 0) + 1));
  const [o, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]!;
  return `${outcomeLabel(o)} (${n}/${convs.length})`;
}

export default function ComparePage() {
  const a = loadLenderConfig("harborline");
  const b = loadLenderConfig("bayview");
  const sa = showcaseRun("harborline");
  const sb = showcaseRun("bayview");
  const changes = diffConfigs(a, b);
  const personas = loadPersonas();
  const sections = Object.keys(SECTION_TITLES).filter((s) => changes.some((c) => c.section === s));
  const metric = (label: string, f: (m: Metrics) => string) => (
    <tr key={label}>
      <th scope="row">{label}</th>
      <td className="num">{sa ? f(sa.overall) : "—"}</td>
      <td className="num">{sb ? f(sb.overall) : "—"}</td>
    </tr>
  );

  return (
    <main className="container">
      <SyntheticBadge>FICTIONAL LENDERS · SIMULATED BORROWERS</SyntheticBadge>
      <h1 style={{ marginTop: 12 }}>Reshaping the agent for a second lender</h1>
      <p className="lead">
        {b.lender.name} is a credit union with stricter compliance, members-only service, business-hours transfers, and a warmer tone. Adapting
        the agent took <strong>{changes.length} config changes and zero lines of agent code</strong>. The same eval suite proves it still works.
      </p>

      <h2>Same borrower, different correct outcome</h2>
      <p className="small muted">Expected outcomes come from each lender&apos;s own rules applied to the borrower&apos;s hidden details. Actual outcomes are from the latest runs.</p>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr><th>Borrower</th><th>{a.lender.short_name}: expected</th><th>{a.lender.short_name}: actual</th><th>{b.lender.short_name}: expected</th><th>{b.lender.short_name}: actual</th></tr>
          </thead>
          <tbody>
            {personas.map((p) => {
              const ea = expectedOutcome(a, p);
              const eb = expectedOutcome(b, p);
              return (
                <tr key={p.id} style={ea !== eb ? { background: "var(--surface-2)" } : undefined}>
                  <th scope="row">{p.label}{ea !== eb ? <span className="pill pill-neutral" style={{ marginLeft: 6 }}>differs</span> : null}</th>
                  <td className="small">{outcomeLabel(ea)}</td>
                  <td className="small">{majority(sa, p.id)}</td>
                  <td className="small">{outcomeLabel(eb)}</td>
                  <td className="small">{majority(sb, p.id)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2>Scorecards side by side</h2>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Metric</th><th className="num">{a.lender.short_name}</th><th className="num">{b.lender.short_name}</th></tr></thead>
          <tbody>
            {metric("Conversations", (m) => String(m.conversations))}
            {metric("Correct handoffs", (m) => pct(m.handoff_accuracy))}
            {metric("Qualification recall", (m) => pct(m.field_recall))}
            {metric("Compliance-clean conversations", (m) => pct(m.compliance_clean_rate))}
            {metric("Violations / warnings", (m) => `${m.violations_total} / ${m.warnings_total}`)}
            {metric("AI disclosure in first message", (m) => pct(m.disclosure_rate))}
            {metric("Opt-out honored", (m) => pct(m.opt_out_honored_rate))}
            {metric("Objection handling", (m) => `${five(m.objection_handling)} / 5`)}
            {metric("Naturalness", (m) => `${five(m.naturalness)} / 5`)}
            {metric("Borrower experience", (m) => `${five(m.borrower_experience)} / 5`)}
            {metric("Ended with a clear next step", (m) => pct(m.clear_next_step_rate))}
            {metric("Handoff summary quality", (m) => `${five(m.handoff_summary_quality)} / 5`)}
            {metric("Cost per conversation", (m) => usd(m.cost_per_conversation))}
          </tbody>
        </table>
      </div>

      <h2>The config diff</h2>
      <p className="small muted">Every setting that differs between the two lender files, grouped by section.</p>
      {sections.map((s) => (
        <details key={s} className="card" open={s === "handoff" || s === "compliance"}>
          <summary><strong style={{ color: "var(--ink)" }}>{SECTION_TITLES[s]}</strong> <span className="muted">· {changes.filter((c) => c.section === s).length} changes</span></summary>
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table>
              <thead><tr><th>Setting</th><th>{a.lender.short_name}</th><th>{b.lender.short_name}</th></tr></thead>
              <tbody>
                {changes.filter((c) => c.section === s).map((c) => (
                  <tr key={c.path}>
                    <td className="small"><code>{c.path.slice(s.length).replace(/^\./, "") || s}</code></td>
                    <td className="small">{c.a ?? <span className="muted">not set</span>}</td>
                    <td className="small">{c.b ?? <span className="muted">not set</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ))}
    </main>
  );
}
