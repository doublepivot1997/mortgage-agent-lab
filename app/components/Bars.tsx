"use client";
import { useState } from "react";

export interface BarRow {
  label: string;
  value: number;
  display: string;
  tip: string;
  emphasis?: boolean;
}

/** Horizontal bar list with hover/focus tooltips. One hue; emphasis uses the stronger step. */
export function Bars({ rows, max, caption }: { rows: BarRow[]; max?: number; caption: string }) {
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const top = max ?? Math.max(...rows.map((r) => r.value), 0.0001);
  return (
    <figure className="bars">
      <figcaption className="sr-only">{caption}</figcaption>
      {rows.map((r) => (
        <div
          key={r.label}
          className="bar-row"
          tabIndex={0}
          aria-label={r.tip}
          onMouseMove={(e) => setTip({ text: r.tip, x: e.clientX, y: e.clientY })}
          onMouseLeave={() => setTip(null)}
          onFocus={(e) => {
            const b = e.currentTarget.getBoundingClientRect();
            setTip({ text: r.tip, x: b.left + b.width / 2, y: b.bottom });
          }}
          onBlur={() => setTip(null)}
        >
          <span className="bar-label">{r.label}</span>
          <span className="bar-track">
            <span className={`bar ${r.emphasis ? "bar-strong" : ""}`} style={{ width: `${Math.max(0.5, (r.value / top) * 100)}%` }} />
          </span>
          <span className="bar-value">{r.display}</span>
        </div>
      ))}
      {tip ? (
        <div className="tip" role="tooltip" style={{ left: Math.min(tip.x + 14, (typeof window !== "undefined" ? window.innerWidth : 1200) - 290), top: tip.y + 14 }}>
          {tip.text}
        </div>
      ) : null}
    </figure>
  );
}
