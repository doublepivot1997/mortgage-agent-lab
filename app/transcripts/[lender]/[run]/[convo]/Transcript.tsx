"use client";
import { useEffect, useRef, useState } from "react";

export interface TranscriptItem {
  role: "agent" | "borrower";
  text: string;
  events: { name: string; refused: boolean; input: string; result: string }[];
  notes: { kind: "strength" | "issue" | "violation"; text: string }[];
}

/** Full transcript with judge notes; "Replay" animates it message by message (no API calls). */
export function Transcript({ items, agentName }: { items: TranscriptItem[]; agentName: string }) {
  const [shown, setShown] = useState(items.length);
  const [playing, setPlaying] = useState(false);
  const [typing, setTyping] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [notes, setNotes] = useState(true);
  const [tools, setTools] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!playing) return;
    if (shown >= items.length) {
      setPlaying(false);
      return;
    }
    const next = items[shown]!;
    const words = next.text.split(/\s+/).length;
    const delay = (next.role === "agent" ? Math.min(2600, 700 + words * 45) : Math.min(1800, 500 + words * 60)) / speed;
    setTyping(next.role === "agent");
    const t = setTimeout(() => {
      setTyping(false);
      setShown((n) => n + 1);
    }, delay);
    return () => clearTimeout(t);
  }, [playing, shown, items, speed]);

  useEffect(() => {
    if (playing) scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [shown, typing, playing]);

  return (
    <section className="card chat-window" aria-label="Transcript">
      <div className="chat-head">
        <div className="row" style={{ gap: 8 }}>
          {playing ? (
            <button className="btn btn-small" onClick={() => setPlaying(false)}>Pause</button>
          ) : (
            <button
              className="btn btn-small"
              onClick={() => {
                if (shown >= items.length) setShown(0);
                setPlaying(true);
              }}
            >
              {shown >= items.length ? "▶ Replay" : "▶ Resume"}
            </button>
          )}
          <div className="segmented" role="group" aria-label="Replay speed">
            {[1, 2, 4].map((s) => (
              <button key={s} aria-pressed={speed === s} onClick={() => setSpeed(s)}>{s}×</button>
            ))}
          </div>
          {shown < items.length && !playing ? (
            <button className="btn btn-small btn-secondary" onClick={() => setShown(items.length)}>Show all</button>
          ) : null}
        </div>
        <div className="row small" style={{ gap: 10 }}>
          <label className="row" style={{ gap: 4 }}><input type="checkbox" checked={notes} onChange={(e) => setNotes(e.target.checked)} /> Judge notes</label>
          <label className="row" style={{ gap: 4 }}><input type="checkbox" checked={tools} onChange={(e) => setTools(e.target.checked)} /> Agent actions</label>
        </div>
      </div>
      <div className="chat-scroll" ref={scroller} aria-live={playing ? "polite" : "off"}>
        {items.slice(0, shown).map((t, i) => (
          <div key={i} className={`bubble-wrap ${t.role}`}>
            <span className="who">{t.role === "agent" ? agentName : "Simulated borrower"} · #{i}</span>
            {t.text ? <div className="bubble">{t.text}</div> : null}
            {tools && t.events.length ? (
              <div className="tool-events">
                {t.events.map((e, j) => (
                  <div key={j} className={`tool-event ${e.refused ? "refused" : ""}`}>
                    <strong>{e.name}</strong>{e.refused ? " · refused by rules" : ""}
                    <details><summary className="small">details</summary><div>input: {e.input}</div><div>result: {e.result}</div></details>
                  </div>
                ))}
              </div>
            ) : null}
            {notes ? t.notes.map((n, j) => (
              <div key={j} className={`annotation ${n.kind}`}>
                {n.kind === "strength" ? "✓ " : n.kind === "violation" ? "✗ " : "! "}
                {n.text}
              </div>
            )) : null}
          </div>
        ))}
        {typing ? (
          <div className="bubble-wrap agent" aria-label={`${agentName} is typing`}>
            <div className="bubble typing"><span /><span /><span /></div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
