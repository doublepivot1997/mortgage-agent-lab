import type { Metadata } from "next";
import Link from "next/link";
import { conversationIds, lenders, loadConversation, showcaseRun } from "../../src/web/data";
import { PassFlag, SyntheticBadge, five, outcomeLabel, usd } from "../components/ui";

export const metadata: Metadata = { title: "Transcripts" };

export default function TranscriptsPage() {
  const sections = lenders().map((cfg) => {
    const sc = showcaseRun(cfg.lender.id);
    const convos = sc ? conversationIds(cfg.lender.id, sc.run_id).map((id) => ({ id, c: loadConversation(cfg.lender.id, sc.run_id, id)! })) : [];
    return { cfg, sc, convos };
  });

  return (
    <main className="container">
      <SyntheticBadge />
      <h1 style={{ marginTop: 12 }}>Transcripts and replays</h1>
      <p className="lead">
        Recorded eval conversations: a simulated borrower (with hidden ground truth) texting the agent, then scored by rules and an LLM judge.
        Open one to read the judge&apos;s notes inline, or press Replay to watch it unfold. No API calls.
      </p>
      {sections.map(({ cfg, sc, convos }) => (
        <section key={cfg.lender.id}>
          <h2>{cfg.lender.name}</h2>
          {sc ? <p className="small muted">Run {sc.run_id} · {convos.length} conversations · agent {sc.models.agent}</p> : <p>No runs yet.</p>}
          <div className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Borrower</th>
                  <th>Outcome</th>
                  <th>Expected</th>
                  <th>Result</th>
                  <th className="num">Experience</th>
                  <th className="num">Turns</th>
                  <th className="num">Cost</th>
                </tr>
              </thead>
              <tbody>
                {convos.map(({ id, c }) => {
                  const s = c.score;
                  const pass = s.handoff_correct && !s.violations.some((v) => v.severity === "violation");
                  return (
                    <tr key={id}>
                      <th scope="row">
                        <Link href={`/transcripts/${cfg.lender.id}/${sc!.run_id}/${id}`}>
                          {c.persona.label} <span className="muted small">#{s.run_index}</span>
                        </Link>
                      </th>
                      <td>{outcomeLabel(s.actual_outcome)}</td>
                      <td className="muted">{outcomeLabel(s.expected_outcome)}</td>
                      <td><PassFlag pass={pass} /></td>
                      <td className="num">{five(s.borrower_experience)}</td>
                      <td className="num">{s.borrower_turns}</td>
                      <td className="num">{usd(s.cost.total, 3)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </main>
  );
}
