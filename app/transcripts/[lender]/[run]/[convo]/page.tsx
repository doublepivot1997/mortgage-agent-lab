import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadLenderConfig } from "../../../../../src/lib/config";
import { loadConversation, showcaseConversationParams } from "../../../../../src/web/data";
import { PassFlag, Pill, SyntheticBadge, five, outcomeLabel, usd } from "../../../../components/ui";
import { Transcript, type TranscriptItem } from "./Transcript";

type Params = { lender: string; run: string; convo: string };

export function generateStaticParams(): Params[] {
  return showcaseConversationParams();
}
export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const p = await params;
  const c = loadConversation(p.lender, p.run, p.convo);
  return { title: c ? `${c.persona.label} · transcript` : "Transcript" };
}

const fmt = (v: unknown) => (v === null || v === undefined ? "—" : typeof v === "number" && v >= 1000 ? `$${v.toLocaleString("en-US")}` : String(v).replace(/_/g, " "));

export default async function ConversationPage({ params }: { params: Promise<Params> }) {
  const p = await params;
  const c = loadConversation(p.lender, p.run, p.convo);
  if (!c) notFound();
  const cfg = loadLenderConfig(p.lender);
  const s = c.score;
  const pass = s.handoff_correct && !s.violations.some((v) => v.severity === "violation");
  const rec = c.result.record;

  const items: TranscriptItem[] = rec.transcript.map((t, i) => ({
    role: t.role,
    text: t.text,
    events: (t.events ?? []).map((e) => ({ name: e.name, refused: e.is_error, input: JSON.stringify(e.input), result: e.result })),
    notes: [
      ...(c.judge?.annotations ?? []).filter((a) => a.turn_index === i).map((a) => ({ kind: a.kind, text: a.note })),
      ...s.violations.filter((v) => v.turn_index === i).map((v) => ({ kind: v.severity === "violation" ? ("violation" as const) : ("issue" as const), text: `${v.source === "rule" ? "Rule check" : "Judge"} · ${v.rule_id.replace(/_/g, " ")}: “${v.excerpt}”` })),
    ],
  }));

  return (
    <main className="container">
      <p className="small"><Link href="/transcripts">← All transcripts</Link></p>
      <SyntheticBadge />
      <h1 style={{ marginTop: 12 }}>{c.persona.label}</h1>
      <p className="lead">{c.persona.description}</p>
      <div className="row" style={{ marginBottom: 16 }}>
        <Pill kind="neutral">{cfg.lender.name}</Pill>
        <PassFlag pass={pass} />
        <span className="small muted">Expected: {outcomeLabel(s.expected_outcome)} · Got: {outcomeLabel(s.actual_outcome)}</span>
      </div>

      <div className="chat-layout">
        <Transcript items={items} agentName={cfg.persona.agent_name} />
        <aside className="stack side-panel">
          <div className="card">
            <h3>Scores</h3>
            <dl className="fields">
              <dt>Handoff</dt><dd>{s.handoff_correct ? "Correct" : "Incorrect"}</dd>
              <dt>Experience</dt><dd>{five(s.borrower_experience)} / 5</dd>
              <dt>Naturalness</dt><dd>{five(s.naturalness)} / 5</dd>
              <dt>Objections</dt><dd>{five(s.objection_score)} / 5</dd>
              <dt>Clear next step</dt><dd>{s.clear_next_step === null ? "—" : s.clear_next_step ? "Yes" : "No"}</dd>
              <dt>Violations</dt><dd>{s.violations.filter((v) => v.severity === "violation").length}</dd>
              <dt>Warnings</dt><dd>{s.violations.filter((v) => v.severity === "warning").length}</dd>
              <dt>Cost</dt><dd>{usd(s.cost.total, 3)}</dd>
            </dl>
          </div>
          {c.judge ? (
            <div className="card">
              <h3>Judge&apos;s summary</h3>
              <p className="small" style={{ margin: 0 }}>{c.judge.overall_notes}</p>
              <p className="small muted" style={{ margin: "8px 0 0" }}>{c.judge.experience_rationale}</p>
            </div>
          ) : null}
          <div className="card">
            <h3>Hidden ground truth vs. captured</h3>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Field</th><th>Truth</th><th>Captured</th></tr></thead>
                <tbody>
                  {c.checks.fields.per_field.map((f) => (
                    <tr key={f.id}>
                      <th scope="row" className="small">{f.id.replace(/_/g, " ")}</th>
                      <td className="small">{fmt(f.truth)}</td>
                      <td className="small">
                        {fmt(f.captured)} {f.correct === true ? <span aria-label="correct">✓</span> : f.correct === false ? <span aria-label="wrong">✗</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {rec.handoff ? (
            <div className="card">
              <h3>Handoff summary</h3>
              <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(rec.handoff, null, 2)}</pre>
            </div>
          ) : null}
        </aside>
      </div>
    </main>
  );
}
