import type { HealthReport } from "./analyze.js";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pct = (n: number) => `${Math.round(n * 100)}%`;

interface BarRow {
  label: string;
  value: number; // 0..1 share used for bar length
  display: string;
  tip: string;
  emphasis?: boolean;
}

/** Horizontal bar list. One hue: emphasized rows use the strong step, the rest a lighter step. */
function bars(rows: BarRow[], opts: { max?: number; caption: string; id: string }): string {
  const max = opts.max ?? Math.max(...rows.map((r) => r.value), 0.0001);
  return `<figure class="bars" aria-labelledby="${opts.id}-cap">
  <figcaption id="${opts.id}-cap" class="sr-only">${esc(opts.caption)}</figcaption>
  ${rows
    .map(
      (r) => `<div class="bar-row" data-tip="${esc(r.tip)}" tabindex="0">
    <span class="bar-label">${esc(r.label)}</span>
    <span class="bar-track"><span class="bar ${r.emphasis ? "bar-strong" : ""}" style="width:${Math.max(0.5, (r.value / max) * 100).toFixed(1)}%"></span></span>
    <span class="bar-value">${esc(r.display)}</span>
  </div>`,
    )
    .join("\n  ")}
</figure>`;
}

function table(caption: string, head: string[], rows: (string | number)[][]): string {
  return `<details class="data-table"><summary>Show data table</summary>
<table><caption>${esc(caption)}</caption>
<thead><tr>${head.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead>
<tbody>${rows.map((r) => `<tr>${r.map((c, i) => (i === 0 ? `<th scope="row">${esc(String(c))}</th>` : `<td>${esc(String(c))}</td>`)).join("")}</tr>`).join("")}</tbody>
</table></details>`;
}

export function renderHealthHtml(r: HealthReport, lenderName: string): string {
  const k = r.kpis;
  const worstDrop = Math.max(...r.dropoff.map((d) => d.rate));
  const worstSourceOpt = Math.max(...r.sources.map((s) => s.opt_out_rate));

  const tiles = [
    { label: "Leads", value: String(k.leads), sub: `${r.period.weeks} weeks` },
    { label: "Replied", value: pct(k.reply_rate), sub: `${k.replied} of ${k.leads} leads` },
    { label: "Qualified", value: pct(k.qualification_rate), sub: `${k.qualified} of ${k.replied} who replied` },
    { label: "Transferred", value: pct(k.transfer_rate), sub: `${k.transferred} of ${k.qualified} qualified` },
    { label: "Loan officer connected", value: pct(k.transfer_connect_rate), sub: "of live transfers" },
    { label: "Opted out", value: pct(k.opt_out_rate), sub: "of those who replied" },
    { label: "Speed to lead", value: `${k.median_speed_to_lead_seconds}s`, sub: "median first text" },
  ];

  const recCards = r.recommendations
    .map(
      (rec, i) => `<article class="rec">
  <div class="rec-num">${i + 1}</div>
  <div class="rec-body">
    <h3>${esc(rec.title)}</h3>
    <p class="rec-headline">${esc(rec.headline)}</p>
    <ul>${rec.evidence.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>
    <p><strong>Change:</strong> ${esc(rec.change)}</p>
    <details><summary>Config change</summary><pre><code>${esc(rec.config_snippet)}</code></pre></details>
    <p><strong>How we'd validate:</strong> ${esc(rec.validate)}</p>
    <p class="rec-impact">${esc(rec.impact)}</p>
  </div>
</article>`,
    )
    .join("\n");

  const funnelRows: BarRow[] = r.funnel.map((f) => ({
    label: f.label.replace("Answered: ", ""),
    value: f.share_of_replied,
    display: `${f.count} · ${pct(f.share_of_replied)}`,
    tip: `${f.label}: ${f.count} borrowers (${pct(f.share_of_replied)} of those who replied)`,
    emphasis: f.id === "credit_band" || f.id === "connected",
  }));

  const dropRows: BarRow[] = r.dropoff.map((d) => ({
    label: d.label,
    value: d.rate,
    display: pct(d.rate),
    tip: `${d.label}: ${d.stopped} of ${d.asked} asked stopped replying (${pct(d.rate)})`,
    emphasis: d.rate === worstDrop,
  }));

  const tc = r.transfer_connect;
  const connectRows: BarRow[] = [
    { label: "Weekdays", value: tc.weekday.rate, display: pct(tc.weekday.rate), tip: `Weekdays: ${tc.weekday.connected} of ${tc.weekday.transfers} transfers connected` },
    { label: "Weekends", value: tc.weekend.rate, display: pct(tc.weekend.rate), tip: `Weekends: ${tc.weekend.connected} of ${tc.weekend.transfers} transfers connected`, emphasis: true },
  ];

  const optRows: BarRow[] = r.sources.map((s) => ({
    label: s.label,
    value: s.opt_out_rate,
    display: pct(s.opt_out_rate),
    tip: `${s.label}: ${pct(s.opt_out_rate)} opted out (${s.leads} leads)`,
    emphasis: s.opt_out_rate === worstSourceOpt,
  }));
  const hgiRows: BarRow[] = r.sources.map((s) => ({
    label: s.label,
    value: s.how_got_info_rate,
    display: pct(s.how_got_info_rate),
    tip: `${s.label}: ${pct(s.how_got_info_rate)} asked "how did you get my info?"`,
    emphasis: s.opt_out_rate === worstSourceOpt,
  }));
  const objRows: BarRow[] = r.objections.map((o) => ({
    label: o.label,
    value: o.share_of_replied,
    display: pct(o.share_of_replied),
    tip: `${o.label}: ${o.count} conversations. Qualified ${pct(o.qualification_rate_with)} when raised vs ${pct(o.qualification_rate_without)} when not.`,
  }));

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Account Health</title>
<style>
:root {
  color-scheme: light;
  --page: #f9f9f7; --surface: #fcfcfb; --ink: #0b0b0b; --ink-2: #52514e; --muted: #898781;
  --grid: #e1e0d9; --axis: #c3c2b7; --ring: rgba(11,11,11,0.10);
  --bar-strong: #2a78d6; --bar-soft: #86b6ef; --track: #f0efec;
  --badge-bg: #fff4d6; --badge-ink: #6b4a00; --code-bg: #f3f2ee;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --page: #0d0d0d; --surface: #1a1a19; --ink: #f0efec; --ink-2: #c3c2b7; --muted: #898781;
    --grid: #2c2c2a; --axis: #383835; --ring: rgba(255,255,255,0.10);
    --bar-strong: #3987e5; --bar-soft: #184f95; --track: #242422;
    --badge-bg: #3a2e0d; --badge-ink: #f5d27a; --code-bg: #232321;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --page: #0d0d0d; --surface: #1a1a19; --ink: #f0efec; --ink-2: #c3c2b7; --muted: #898781;
  --grid: #2c2c2a; --axis: #383835; --ring: rgba(255,255,255,0.10);
  --bar-strong: #3987e5; --bar-soft: #184f95; --track: #242422;
  --badge-bg: #3a2e0d; --badge-ink: #f5d27a; --code-bg: #232321;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--page); color: var(--ink); font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif; }
main { max-width: 1080px; margin: 0 auto; padding: 32px 16px 64px; }
header h1 { font-size: 26px; margin: 0 0 4px; letter-spacing: -0.01em; }
header p { margin: 0; color: var(--ink-2); }
.badge { display: inline-block; background: var(--badge-bg); color: var(--badge-ink); font-weight: 600; font-size: 12px; padding: 3px 10px; border-radius: 999px; margin-bottom: 10px; letter-spacing: 0.02em; }
h2 { font-size: 18px; margin: 40px 0 12px; }
h3 { font-size: 16px; margin: 0 0 6px; }
.card { background: var(--surface); border-radius: 12px; box-shadow: 0 0 0 1px var(--ring); padding: 18px 20px; }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(135px, 1fr)); gap: 12px; margin-top: 24px; }
.kpi .label { color: var(--ink-2); font-size: 13px; }
.kpi .value { font-size: 28px; font-weight: 650; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; margin: 2px 0; }
.kpi .sub { color: var(--muted); font-size: 12px; }
.rec { display: flex; gap: 16px; background: var(--surface); border-radius: 12px; box-shadow: 0 0 0 1px var(--ring); padding: 18px 20px; margin-bottom: 12px; }
.rec-num { flex: none; width: 28px; height: 28px; border-radius: 50%; background: var(--bar-strong); color: #fff; font-weight: 700; display: grid; place-items: center; font-size: 14px; }
.rec-body { min-width: 0; }
.rec-headline { font-size: 17px; font-weight: 600; margin: 0 0 8px; }
.rec ul { margin: 0 0 10px; padding-left: 18px; color: var(--ink-2); }
.rec p { margin: 6px 0; }
.rec-impact { color: var(--ink-2); font-size: 14px; }
pre { background: var(--code-bg); border-radius: 8px; padding: 12px; overflow-x: auto; font-size: 13px; }
details summary { cursor: pointer; color: var(--ink-2); font-size: 14px; }
.grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 12px; }
@media (max-width: 480px) { .grid2 { grid-template-columns: 1fr; } }
.chart-title { font-weight: 600; margin: 0 0 2px; }
.chart-sub { color: var(--ink-2); font-size: 13px; margin: 0 0 12px; }
.bars { margin: 0; }
.bar-row { display: grid; grid-template-columns: minmax(110px, 38%) 1fr 72px; align-items: center; gap: 10px; padding: 4px 0; border-radius: 6px; }
.bar-row:hover, .bar-row:focus { background: var(--track); outline: none; }
.bar-label { font-size: 13px; color: var(--ink-2); line-height: 1.25; }
.bar-track { height: 14px; position: relative; border-left: 1px solid var(--axis); }
.bar { position: absolute; left: 0; top: 0; bottom: 0; background: var(--bar-soft); border-radius: 0 4px 4px 0; }
.bar-strong { background: var(--bar-strong); }
.bar-value { font-size: 13px; font-variant-numeric: tabular-nums; text-align: right; }
.data-table { margin-top: 10px; }
table { border-collapse: collapse; width: 100%; font-size: 13px; margin-top: 8px; font-variant-numeric: tabular-nums; }
caption { text-align: left; color: var(--ink-2); padding-bottom: 4px; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--grid); }
td { text-align: right; }
thead th:not(:first-child) { text-align: right; }
.tip { position: fixed; pointer-events: none; background: var(--ink); color: var(--surface); font-size: 12px; padding: 6px 9px; border-radius: 6px; max-width: 280px; opacity: 0; transition: opacity .1s; z-index: 10; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
footer { margin-top: 48px; color: var(--muted); font-size: 13px; }
@media (max-width: 520px) { .bar-row { grid-template-columns: 40% 1fr 56px; } .rec { flex-direction: column; gap: 8px; } }
</style>
</head>
<body>
<main>
<header>
  <span class="badge">SYNTHETIC DATA · NOT REAL RESULTS</span>
  <h1>${esc(lenderName)} · Account health</h1>
  <p>${r.kpis.leads} simulated lead conversations, ${esc(r.period.start)} to ${esc(r.period.end)}. Generated by a seeded script with planted patterns, to show how I'd run a weekly account review.</p>
</header>

<section class="kpis" aria-label="Key metrics">
${tiles.map((t) => `<div class="card kpi"><div class="label">${esc(t.label)}</div><div class="value">${esc(t.value)}</div><div class="sub">${esc(t.sub)}</div></div>`).join("\n")}
</section>

<h2>${r.recommendations.length} recommended agent changes</h2>
${recCards || `<p class="card">No changes recommended: no metric crossed its threshold this period.</p>`}

<h2>The evidence</h2>
<div class="grid2">
  <section class="card">
    <p class="chart-title">Qualification funnel</p>
    <p class="chart-sub">Share of borrowers who replied, by how far they got</p>
    ${bars(funnelRows, { id: "funnel", caption: "Qualification funnel", max: 1 })}
    ${table("Qualification funnel", ["Step", "Borrowers", "Share of replied"], r.funnel.map((f) => [f.label, f.count, pct(f.share_of_replied)]))}
  </section>
  <section class="card">
    <p class="chart-title">Drop-off by question</p>
    <p class="chart-sub">Of borrowers asked each question, the share who stopped replying</p>
    ${bars(dropRows, { id: "drop", caption: "Drop-off by question" })}
    ${table("Drop-off by question", ["Question", "Asked", "Stopped", "Rate"], r.dropoff.map((d) => [d.label, d.asked, d.stopped, pct(d.rate)]))}
  </section>
  <section class="card">
    <p class="chart-title">Live transfers that reached a loan officer</p>
    <p class="chart-sub">Within the promised 5 minutes</p>
    ${bars(connectRows, { id: "connect", caption: "Transfer connect rate, weekday vs weekend", max: 1 })}
    ${table("Transfer connect rate", ["Period", "Transfers", "Connected", "Rate"], [["Weekdays", tc.weekday.transfers, tc.weekday.connected, pct(tc.weekday.rate)], ["Weekends", tc.weekend.transfers, tc.weekend.connected, pct(tc.weekend.rate)]])}
  </section>
  <section class="card">
    <p class="chart-title">Objections raised</p>
    <p class="chart-sub">Share of conversations; hover for qualification impact</p>
    ${bars(objRows, { id: "obj", caption: "Objection frequency" })}
    ${table("Objections", ["Objection", "Conversations", "Share", "Qualified when raised", "Qualified when not"], r.objections.map((o) => [o.label, o.count, pct(o.share_of_replied), pct(o.qualification_rate_with), pct(o.qualification_rate_without)]))}
  </section>
  <section class="card">
    <p class="chart-title">Opt-out rate by lead source</p>
    <p class="chart-sub">Of borrowers who replied</p>
    ${bars(optRows, { id: "opt", caption: "Opt-out rate by lead source" })}
  </section>
  <section class="card">
    <p class="chart-title">"How did you get my info?" by lead source</p>
    <p class="chart-sub">Of borrowers who replied</p>
    ${bars(hgiRows, { id: "hgi", caption: "How-did-you-get-my-info rate by lead source" })}
    ${table("Lead sources", ["Source", "Leads", "Replied", "Opted out", "Asked how we got info", "Qualified"], r.sources.map((s) => [s.label, s.leads, pct(s.reply_rate), pct(s.opt_out_rate), pct(s.how_got_info_rate), pct(s.qualification_rate)]))}
  </section>
</div>

<footer>
  <p>All data on this page is synthetic, generated for a portfolio prototype with a fictional lender. It does not describe any real company or real results. Compliance behavior shown elsewhere in this project is illustrative and not legal guidance.</p>
</footer>
</main>
<div class="tip" role="tooltip" id="tip"></div>
<script>
(() => {
  const tip = document.getElementById("tip");
  const show = (el, x, y) => { tip.textContent = el.dataset.tip; tip.style.opacity = 1; const w = tip.offsetWidth; tip.style.left = Math.min(x + 14, innerWidth - w - 8) + "px"; tip.style.top = (y + 14) + "px"; };
  document.querySelectorAll("[data-tip]").forEach((el) => {
    el.addEventListener("mousemove", (e) => show(el, e.clientX, e.clientY));
    el.addEventListener("mouseleave", () => (tip.style.opacity = 0));
    el.addEventListener("focus", () => { const b = el.getBoundingClientRect(); show(el, b.left + b.width / 2, b.bottom); });
    el.addEventListener("blur", () => (tip.style.opacity = 0));
  });
})();
</script>
</body>
</html>
`;
}

export function renderHealthMarkdown(r: HealthReport, lenderName: string): string {
  const k = r.kpis;
  return [
    `# ${lenderName}: account health (SYNTHETIC DATA)`,
    ``,
    `_${k.leads} simulated conversations, ${r.period.start} to ${r.period.end}. Not real results._`,
    ``,
    `| Leads | Replied | Qualified | Transferred | LO connected | Opted out | Speed to lead |`,
    `|---|---|---|---|---|---|---|`,
    `| ${k.leads} | ${pct(k.reply_rate)} | ${pct(k.qualification_rate)} | ${pct(k.transfer_rate)} | ${pct(k.transfer_connect_rate)} | ${pct(k.opt_out_rate)} | ${k.median_speed_to_lead_seconds}s |`,
    ``,
    `## Recommended agent changes`,
    ``,
    ...r.recommendations.flatMap((rec, i) => [
      `### ${i + 1}. ${rec.title}`,
      ``,
      `**${rec.headline}**`,
      ``,
      ...rec.evidence.map((e) => `- ${e}`),
      ``,
      `**Change:** ${rec.change}`,
      ``,
      "```yaml",
      rec.config_snippet,
      "```",
      ``,
      `**Validate:** ${rec.validate}`,
      ``,
      `_${rec.impact}_`,
      ``,
    ]),
  ].join("\n");
}
