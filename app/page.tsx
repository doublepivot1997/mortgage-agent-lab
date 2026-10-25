import Link from "next/link";
import { diffConfigs } from "../src/evals/compare";
import { lenders, listRuns, showcaseRun } from "../src/web/data";
import { five, pct } from "./components/ui";

export default function Home() {
  const cfgs = lenders();
  const showcase = cfgs.map((c) => ({ cfg: c, sc: showcaseRun(c.lender.id) }));
  const totalConversations = cfgs.reduce((n, c) => n + listRuns(c.lender.id).reduce((m, r) => m + r.conversations, 0), 0);
  const changes = cfgs.length >= 2 ? diffConfigs(cfgs[1]!, cfgs[0]!).length : 0;

  return (
    <main className="container">
      <span className="badge badge-warn">FICTIONAL LENDERS · SIMULATED DATA</span>
      <h1 style={{ marginTop: 12 }}>An AI lead-qualification agent for mortgage lenders, reshaped per lender and proven with evals</h1>
      <p className="lead">
        A borrower submits a refinance inquiry; the agent texts them within seconds, qualifies the lead, handles objections, stays compliant,
        and warm-transfers qualified borrowers to a licensed loan officer with a structured handoff. Every behavior lives in a lender config,
        and every change is tested against simulated borrowers before it ships.
      </p>
      <div className="row" style={{ margin: "20px 0 8px" }}>
        <Link className="btn" href="/chat">Chat with the agent</Link>
        <Link className="btn btn-secondary" href="/transcripts">Watch a replay</Link>
      </div>

      <h2>Latest results</h2>
      <div className="table-wrap card">
        <table>
          <thead>
            <tr>
              <th>Lender</th>
              <th className="num">Conversations</th>
              <th className="num">Correct handoffs</th>
              <th className="num">Compliance-clean</th>
              <th className="num">Borrower experience</th>
              <th className="num">Clear next step</th>
            </tr>
          </thead>
          <tbody>
            {showcase.map(({ cfg, sc }) => (
              <tr key={cfg.lender.id}>
                <th scope="row">{cfg.lender.name}</th>
                <td className="num">{sc?.overall.conversations ?? "—"}</td>
                <td className="num">{pct(sc?.overall.handoff_accuracy)}</td>
                <td className="num">{pct(sc?.overall.compliance_clean_rate)}</td>
                <td className="num">{five(sc?.overall.borrower_experience)} / 5</td>
                <td className="num">{pct(sc?.overall.clear_next_step_rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small muted" style={{ marginTop: 10, marginBottom: 0 }}>
          {totalConversations} simulated conversations run so far across all eval runs. Scores from simulated borrowers and an LLM judge; not real-world results.
        </p>
      </div>

      <h2>Explore</h2>
      <div className="grid grid-3">
        <Link className="card link-card" href="/chat">
          <h3>Live chat</h3>
          <p>Text with either lender&apos;s agent as a borrower. See the fields it captures and the handoff it writes. Rate-limited.</p>
        </Link>
        <Link className="card link-card" href="/transcripts">
          <h3>Transcripts and replays</h3>
          <p>Recorded eval conversations with the judge&apos;s notes inline. Replays run without any API calls.</p>
        </Link>
        <Link className="card link-card" href="/evals">
          <h3>Eval scorecards</h3>
          <p>Rule-based checks plus an LLM judge, scored per behavior, and how the agent improved run over run.</p>
        </Link>
        <Link className="card link-card" href="/compare">
          <h3>Reshaping for a second lender</h3>
          <p>A credit union with stricter rules: {changes} config settings changed, zero lines of agent code, same eval suite.</p>
        </Link>
        <Link className="card link-card" href="/health">
          <h3>Account health</h3>
          <p>A weekly-review view over synthetic call data, with three recommended agent changes, each tied to a number.</p>
        </Link>
      </div>

      <h2>How it works</h2>
      <div className="grid grid-2">
        <div className="card">
          <h3>1. The lender lives in config</h3>
          <p className="small muted" style={{ margin: 0 }}>
            Persona, qualification fields, objection playbook, compliance rules, and handoff rules are YAML. The prompt and tools are generated from it.
          </p>
        </div>
        <div className="card">
          <h3>2. Hard rules are enforced in code</h3>
          <p className="small muted" style={{ margin: 0 }}>
            &quot;STOP&quot; ends the chat without a model call. The transfer tool checks LTV, required fields, hours, and membership, and refuses with instructions.
          </p>
        </div>
        <div className="card">
          <h3>3. Simulated borrowers test every change</h3>
          <p className="small muted" style={{ margin: 0 }}>
            Ten personas with hidden ground truth. The expected outcome comes from each lender&apos;s own rules, so a stricter lender changes what &quot;correct&quot; means.
          </p>
        </div>
        <div className="card">
          <h3>4. Rules first, judge second</h3>
          <p className="small muted" style={{ margin: 0 }}>
            Regex and field comparisons catch what they can, for free and repeatably. An LLM judge, blind to ground truth, scores the judgment calls.
          </p>
        </div>
      </div>
    </main>
  );
}
