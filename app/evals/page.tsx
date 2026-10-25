import type { Metadata } from "next";
import Link from "next/link";
import { lenders, listRuns, runNotes, showcaseRun } from "../../src/web/data";
import { Kpi, SyntheticBadge, five, pct, usd } from "../components/ui";

export const metadata: Metadata = { title: "Eval scorecards" };

export default function EvalsPage() {
  const notes = runNotes();
  return (
    <main className="container">
      <SyntheticBadge />
      <h1 style={{ marginTop: 12 }}>Eval scorecards</h1>
      <p className="lead">
        Each run plays every simulated borrower against the agent several times. Rule-based checks score what can be checked exactly; an LLM
        judge, blind to the borrower&apos;s hidden details, scores the judgment calls.
      </p>

      <div className="grid grid-2">
        <div className="card">
          <h3>Rule-based (free, repeatable)</h3>
          <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Handoff correctness:</strong> outcome vs. the lender&apos;s own rules applied to hidden ground truth</li>
            <li><strong>Qualification accuracy:</strong> captured fields vs. ground truth, with tolerances</li>
            <li><strong>Compliance phrases:</strong> rate quotes, approval promises, savings claims (borrower echoes allowed)</li>
            <li><strong>AI disclosure</strong> in the first message, and <strong>opt-out honored</strong></li>
          </ul>
        </div>
        <div className="card">
          <h3>LLM judge (judgment calls)</h3>
          <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Objection handling</strong> and <strong>naturalness</strong>, 1-5 with anchors</li>
            <li><strong>Borrower experience</strong> and whether they ended with a <strong>clear next step</strong></li>
            <li><strong>Compliance gray areas:</strong> licensed advice, pressure, misleading or over-promising wording</li>
            <li>Turn-level notes, shown on each <Link href="/transcripts">transcript</Link></li>
          </ul>
        </div>
      </div>

      {lenders().map((cfg) => {
        const sc = showcaseRun(cfg.lender.id);
        const runs = listRuns(cfg.lender.id);
        if (!sc) return null;
        const o = sc.overall;
        return (
          <section key={cfg.lender.id}>
            <h2>{cfg.lender.name}</h2>
            <p className="small muted">Showcase run {sc.run_id} · {o.conversations} conversations · agent {sc.models.agent}, judge {sc.models.judge}</p>
            <div className="kpis">
              <Kpi label="Correct handoffs" value={pct(o.handoff_accuracy)} sub="rule-based" />
              <Kpi label="Qualification recall" value={pct(o.field_recall)} sub="should-transfer borrowers" />
              <Kpi label="Compliance-clean" value={pct(o.compliance_clean_rate)} sub={`${o.violations_total} violations · ${o.warnings_total} warnings`} />
              <Kpi label="Borrower experience" value={five(o.borrower_experience)} sub="out of 5 · judge" />
              <Kpi label="Clear next step" value={pct(o.clear_next_step_rate)} sub={`${pct(o.frustrated_or_confused_rate)} ended frustrated`} />
              <Kpi label="Cost / conversation" value={usd(o.cost_per_conversation)} sub="agent + simulator + judge" />
            </div>

            <h3 style={{ marginTop: 20 }}>By borrower</h3>
            <div className="card table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Borrower</th><th className="num">n</th><th className="num">Handoff</th><th className="num">Recall</th>
                    <th className="num">Clean</th><th className="num">Objections</th><th className="num">Natural</th><th className="num">Experience</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(sc.by_persona).map(([id, m]) => (
                    <tr key={id}>
                      <th scope="row">{id.replace(/-/g, " ")}</th>
                      <td className="num">{m.conversations}</td>
                      <td className="num">{pct(m.handoff_accuracy)}</td>
                      <td className="num">{pct(m.field_recall)}</td>
                      <td className="num">{pct(m.compliance_clean_rate)}</td>
                      <td className="num">{five(m.objection_handling)}</td>
                      <td className="num">{five(m.naturalness)}</td>
                      <td className="num">{five(m.borrower_experience)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 style={{ marginTop: 20 }}>Run history</h3>
            <p className="small muted">Every eval run, oldest first. Each change was made because the previous run surfaced something.</p>
            <div className="card table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Run</th><th>What changed</th><th className="num">n</th><th className="num">Handoff</th>
                    <th className="num">Violations</th><th className="num">Warnings</th><th className="num">Experience</th><th className="num">Next step</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.run_id}>
                      <td className="small" style={{ whiteSpace: "nowrap" }}>{r.run_id.replace("T", " ").slice(0, 16)}</td>
                      <td className="small">{notes[r.run_id] ?? <span className="muted">—</span>}</td>
                      <td className="num">{r.conversations}</td>
                      <td className="num">{pct(r.overall.handoff_accuracy)}</td>
                      <td className="num">{r.overall.violations_total}</td>
                      <td className="num">{r.overall.warnings_total}</td>
                      <td className="num">{five(r.overall.borrower_experience)}</td>
                      <td className="num">{pct(r.overall.clear_next_step_rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </main>
  );
}
