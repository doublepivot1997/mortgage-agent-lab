"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ChatView } from "../../src/web/chat-service";

export interface LenderInfo {
  id: string;
  name: string;
  agentName: string;
  customerTerm: string;
  blurb: string;
  fields: { id: string; label: string }[];
}

const STATUS_TEXT: Record<string, string> = {
  active: "In progress",
  transferred: "Transferred to a loan officer",
  callback_booked: "Call booked",
  ended: "Ended",
  opted_out: "Opted out",
};

const STARTERS = ["yes, now works", "what rate can I get?", "how did you get my number?", "I'm busy right now", "STOP"];

function fmt(v: unknown): string {
  if (typeof v === "number") return v >= 1000 ? `$${v.toLocaleString("en-US")}` : String(v);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v).replace(/_/g, " ");
}

export function ChatClient({ lenders, scenarios, enabled, maxChars }: { lenders: LenderInfo[]; scenarios: { id: string; label: string }[]; enabled: boolean; maxChars: number }) {
  const [lenderId, setLenderId] = useState(lenders[0]!.id);
  const [scenario, setScenario] = useState("live");
  const [name, setName] = useState("");
  const [view, setView] = useState<ChatView | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [showTools, setShowTools] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lender = lenders.find((l) => l.id === (view?.lender ?? lenderId))!;

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [view, pending, busy]);

  async function call(body: object) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setView(data as ChatView);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  async function start() {
    setView(null);
    await call({ action: "start", lender: lenderId, scenario, first_name: name || undefined });
    inputRef.current?.focus();
  }

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || !view || busy) return;
    setInput("");
    setPending(msg);
    const ok = await call({ action: "send", token: view.token, message: msg });
    if (!ok) setInput(msg);
    inputRef.current?.focus();
  }

  const ended = view && view.status !== "active";

  return (
    <div className="chat-layout">
      <section className="card chat-window" aria-label="Conversation">
        <div className="chat-head">
          <div>
            <strong>{view ? `${lender.agentName} · ${lender.name}` : "New conversation"}</strong>
            <div className="small muted">{view ? `Lender local time: ${view.local_time}` : "Pick a lender and start"}</div>
          </div>
          {view ? (
            <label className="small row" style={{ gap: 6 }}>
              <input type="checkbox" checked={showTools} onChange={(e) => setShowTools(e.target.checked)} /> Show agent actions
            </label>
          ) : null}
        </div>

        <div className="chat-scroll" ref={scroller} aria-live="polite">
          {!view && !busy ? (
            <div className="stack" style={{ margin: "auto", maxWidth: 420, width: "100%" }}>
              {!enabled ? (
                <div className="notice notice-warn">
                  Live chat is off on this deployment. <Link href="/transcripts">Watch recorded conversations</Link> instead; they need no API calls.
                </div>
              ) : null}
              <div className="segmented" role="group" aria-label="Lender">
                {lenders.map((l) => (
                  <button key={l.id} aria-pressed={l.id === lenderId} onClick={() => setLenderId(l.id)}>
                    {l.name.split(" ")[0]}
                  </button>
                ))}
              </div>
              <p className="small muted" style={{ margin: 0 }}>{lenders.find((l) => l.id === lenderId)!.blurb}</p>
              <label className="field">
                Simulated time
                <select value={scenario} onChange={(e) => setScenario(e.target.value)}>
                  {scenarios.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Your first name (optional)
                <input type="text" value={name} maxLength={24} placeholder="Alex" onChange={(e) => setName(e.target.value)} />
              </label>
              <button className="btn" onClick={start} disabled={!enabled}>Start conversation</button>
            </div>
          ) : null}

          {view?.turns.map((t, i) => (
            <div key={i} className={`bubble-wrap ${t.role}`}>
              <span className="who">{t.role === "agent" ? lender.agentName : "You"}</span>
              {t.text ? <div className="bubble">{t.text}</div> : null}
              {showTools && t.events?.length ? (
                <div className="tool-events">
                  {t.events.map((e, j) => (
                    <div key={j} className={`tool-event ${e.is_error ? "refused" : ""}`}>
                      <strong>{e.name}</strong>
                      {e.is_error ? " · refused by rules" : ""}
                      <details>
                        <summary className="small">details</summary>
                        <div>input: {JSON.stringify(e.input)}</div>
                        <div>result: {e.result}</div>
                      </details>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
          {pending ? (
            <div className="bubble-wrap borrower">
              <span className="who">You</span>
              <div className="bubble">{pending}</div>
            </div>
          ) : null}
          {busy ? (
            <div className="bubble-wrap agent" aria-label="Agent is typing">
              <div className="bubble typing"><span /><span /><span /></div>
            </div>
          ) : null}
          {error ? <div className="notice notice-bad" role="alert">{error}</div> : null}
        </div>

        {view && !ended && view.turns.filter((t) => t.role === "borrower").length === 0 ? (
          <div className="suggestions">
            {STARTERS.map((s) => (
              <button key={s} className="chip" onClick={() => send(s)} disabled={busy}>{s}</button>
            ))}
          </div>
        ) : null}

        <form
          className="chat-input"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          {ended ? (
            <div className="spread" style={{ width: "100%" }}>
              <span className="small muted">Conversation ended: {STATUS_TEXT[view!.status]}.</span>
              <button type="button" className="btn btn-small" onClick={() => setView(null)}>New conversation</button>
            </div>
          ) : (
            <>
              <input
                ref={inputRef}
                type="text"
                aria-label="Your message"
                placeholder={view ? "Type your reply" : "Start a conversation first"}
                value={input}
                maxLength={maxChars}
                disabled={!view || busy}
                onChange={(e) => setInput(e.target.value)}
              />
              <button className="btn" type="submit" disabled={!view || busy || !input.trim()}>Send</button>
            </>
          )}
        </form>
      </section>

      <aside className="stack side-panel">
        <div className="card">
          <div className="spread">
            <h3 style={{ margin: 0 }}>Status</h3>
            <span className={`pill ${!view ? "pill-neutral" : view.status === "active" ? "pill-neutral" : view.status === "opted_out" ? "pill-warn" : "pill-good"}`}>
              {view ? STATUS_TEXT[view.status] : "Not started"}
            </span>
          </div>
          {view ? <p className="small muted" style={{ margin: "8px 0 0" }}>{view.messages_left} messages left in this demo conversation.</p> : null}
        </div>

        <div className="card">
          <h3>What the agent has captured</h3>
          <dl className="fields">
            {lender.fields.map((f) => (
              <div key={f.id} style={{ display: "contents" }}>
                <dt>{f.label.replace(/ \(.*\)$/, "")}</dt>
                <dd>{view?.lead[f.id] !== undefined ? fmt(view.lead[f.id]) : <span className="muted">—</span>}</dd>
              </div>
            ))}
          </dl>
        </div>

        {view?.handoff ? (
          <div className="card">
            <h3>Handoff to the loan officer</h3>
            <p className="small" style={{ marginBottom: 6 }}>{view.handoff.borrower_summary}</p>
            <dl className="fields">
              <dt>Goal</dt><dd>{view.handoff.borrower_goal}</dd>
              <dt>Sentiment</dt><dd>{view.handoff.sentiment}</dd>
              <dt>LTV</dt><dd>{view.handoff.ltv ?? "—"}</dd>
              <dt>Next step</dt><dd>{view.handoff.recommended_next_step}</dd>
            </dl>
            {view.handoff.open_questions.length ? (
              <>
                <p className="small muted" style={{ margin: "8px 0 2px" }}>Open questions</p>
                <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{view.handoff.open_questions.map((q) => <li key={q}>{q}</li>)}</ul>
              </>
            ) : null}
          </div>
        ) : null}
        {view?.callback ? (
          <div className="card">
            <h3>Call booked</h3>
            <dl className="fields">
              <dt>When</dt><dd>{view.callback.preferred_time}</dd>
              <dt>Why</dt><dd>{view.callback.reason.replace(/_/g, " ")}</dd>
            </dl>
          </div>
        ) : null}
        <p className="small muted">
          The agent runs on Claude with the lender&apos;s config. Live chats are rate-limited to keep this public demo affordable.
        </p>
      </aside>
    </div>
  );
}
