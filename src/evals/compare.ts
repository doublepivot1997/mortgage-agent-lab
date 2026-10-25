import type { LenderConfig } from "../lib/config";
import { expectedOutcome, type Persona } from "./personas";
import type { Metrics, Scorecard } from "./scorecard";

// ---------- Config diff ----------

type Flat = Map<string, string>;

/**
 * Flatten a config to "path -> value" so two lenders can be compared line by line.
 * Arrays of objects with an `id` are keyed by id (e.g. qualification.fields[is_member].label),
 * so reordering or inserting a field shows up as one change, not a cascade.
 */
export function flattenConfig(value: unknown, prefix = "", out: Flat = new Map()): Flat {
  if (Array.isArray(value)) {
    if (value.every((v) => v === null || typeof v !== "object")) {
      out.set(prefix, value.join(" | "));
    } else {
      value.forEach((item, i) => {
        const key = item && typeof item === "object" && "id" in item ? String((item as { id: unknown }).id) : String(i);
        flattenConfig(item, `${prefix}[${key}]`, out);
      });
    }
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) flattenConfig(v, prefix ? `${prefix}.${k}` : k, out);
  } else {
    out.set(prefix, value === null || value === undefined ? "(none)" : String(value).replace(/\s+/g, " ").trim());
  }
  return out;
}

export interface ConfigChange {
  section: string;
  path: string;
  kind: "changed" | "added" | "removed";
  a: string | null;
  b: string | null;
}

export function diffConfigs(a: LenderConfig, b: LenderConfig): ConfigChange[] {
  const fa = flattenConfig(a);
  const fb = flattenConfig(b);
  const paths = [...new Set([...fa.keys(), ...fb.keys()])].sort();
  const changes: ConfigChange[] = [];
  for (const path of paths) {
    const va = fa.get(path) ?? null;
    const vb = fb.get(path) ?? null;
    if (va === vb) continue;
    changes.push({
      section: path.split(/[.[]/)[0]!,
      path,
      kind: va === null ? "added" : vb === null ? "removed" : "changed",
      a: va,
      b: vb,
    });
  }
  return changes;
}

// ---------- Rendering ----------

const SECTION_ORDER = ["lender", "persona", "channel", "disclosure", "qualification", "objections", "compliance", "handoff"];
const pct = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${Math.round(n * 100)}%`);
const five = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toFixed(1));
const usd = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `$${n.toFixed(2)}`);
const cell = (s: string | null, max = 160) => {
  if (s === null) return "_(not set)_";
  const t = s.length > max ? s.slice(0, max - 1) + "…" : s;
  return t.replace(/\|/g, "\\|");
};

/** Majority actual outcome for a persona in a run, e.g. "transferred (3/3)". */
function outcomeSummary(sc: Scorecard, personaId: string): string {
  const convs = sc.conversations.filter((c) => c.persona_id === personaId);
  if (!convs.length) return "—";
  const counts = new Map<string, number>();
  for (const c of convs) counts.set(c.actual_outcome, (counts.get(c.actual_outcome) ?? 0) + 1);
  const [top, n] = [...counts.entries()].sort((x, y) => y[1] - x[1])[0]!;
  return `${top} (${n}/${convs.length})`;
}

export interface ComparisonInput {
  a: { cfg: LenderConfig; scorecard: Scorecard | null };
  b: { cfg: LenderConfig; scorecard: Scorecard | null };
  personas: Persona[];
}

export function renderComparison({ a, b, personas }: ComparisonInput): string {
  const A = a.cfg.lender.short_name;
  const B = b.cfg.lender.short_name;
  const changes = diffConfigs(a.cfg, b.cfg);
  const lines: string[] = [
    `# Reshaping the agent: ${a.cfg.lender.name} → ${b.cfg.lender.name}`,
    ``,
    `_Both lenders are fictional. Results come from simulated borrowers and are synthetic, not real-world. Compliance rules are illustrative, not legal guidance._`,
    ``,
    `Same agent code, same eval suite. Only the lender config changed: **${changes.length} settings** across ${new Set(changes.map((c) => c.section)).size} sections.`,
    ``,
    `## 1. Config diff`,
    ``,
  ];

  const sections = [...new Set(changes.map((c) => c.section))].sort((x, y) => SECTION_ORDER.indexOf(x) - SECTION_ORDER.indexOf(y));
  for (const s of sections) {
    lines.push(`### ${s}`, ``, `| Setting | ${A} | ${B} |`, `|---|---|---|`);
    for (const c of changes.filter((x) => x.section === s)) {
      lines.push(`| \`${c.path.slice(s.length).replace(/^\./, "") || s}\` | ${cell(c.a)} | ${cell(c.b)} |`);
    }
    lines.push(``);
  }

  lines.push(`## 2. Expected outcome per persona`, ``, `Derived from each lender's own handoff rules applied to the persona's hidden ground truth.`, ``);
  lines.push(`| Persona | ${A} | ${B} | |`, `|---|---|---|---|`);
  for (const p of personas) {
    const ea = expectedOutcome(a.cfg, p);
    const eb = expectedOutcome(b.cfg, p);
    lines.push(`| ${p.label} | ${ea} | ${eb} | ${ea !== eb ? "**differs**" : ""} |`);
  }
  lines.push(``);

  if (a.scorecard && b.scorecard) {
    const oa = a.scorecard.overall;
    const ob = b.scorecard.overall;
    const row = (label: string, f: (m: Metrics) => string) => `| ${label} | ${f(oa)} | ${f(ob)} |`;
    lines.push(
      `## 3. Scorecards side by side`,
      ``,
      `Runs: ${A} \`${a.scorecard.run_id}\` (${oa.conversations} conversations) · ${B} \`${b.scorecard.run_id}\` (${ob.conversations} conversations)`,
      ``,
      `| Metric | ${A} | ${B} |`,
      `|---|---|---|`,
      row("Handoff correctness", (m) => pct(m.handoff_accuracy)),
      row("Qualification recall", (m) => pct(m.field_recall)),
      row("Qualification precision", (m) => pct(m.field_precision)),
      row("Compliance-clean conversations", (m) => pct(m.compliance_clean_rate)),
      row("Violations / warnings", (m) => `${m.violations_total} / ${m.warnings_total}`),
      row("AI disclosure in first message", (m) => pct(m.disclosure_rate)),
      row("Opt-out honored", (m) => pct(m.opt_out_honored_rate)),
      row("Objection handling", (m) => `${five(m.objection_handling)} / 5`),
      row("Naturalness", (m) => `${five(m.naturalness)} / 5`),
      row("Borrower experience", (m) => `${five(m.borrower_experience)} / 5`),
      row("Ended with a clear next step", (m) => pct(m.clear_next_step_rate)),
      row("Ended frustrated or confused", (m) => pct(m.frustrated_or_confused_rate)),
      row("Handoff summary quality", (m) => `${five(m.handoff_summary_quality)} / 5`),
      row("Avg borrower turns", (m) => String(m.avg_borrower_turns ?? "—")),
      row("Cost per conversation", (m) => usd(m.cost_per_conversation)),
      ``,
      `### By persona`,
      ``,
      `| Persona | ${A} outcome | ${B} outcome | ${A} handoff | ${B} handoff | ${A} experience | ${B} experience |`,
      `|---|---|---|---|---|---|---|`,
    );
    for (const p of personas) {
      const ma = a.scorecard.by_persona[p.id];
      const mb = b.scorecard.by_persona[p.id];
      lines.push(
        `| ${p.label} | ${outcomeSummary(a.scorecard, p.id)} | ${outcomeSummary(b.scorecard, p.id)} | ${pct(ma?.handoff_accuracy)} | ${pct(mb?.handoff_accuracy)} | ${five(ma?.borrower_experience)} | ${five(mb?.borrower_experience)} |`,
      );
    }
    lines.push(``);
    const missingA = personas.filter((p) => !a.scorecard!.by_persona[p.id]).map((p) => p.id);
    const missingB = personas.filter((p) => !b.scorecard!.by_persona[p.id]).map((p) => p.id);
    if (missingA.length || missingB.length) {
      lines.push(`> Note: runs don't cover the same personas (${A} missing: ${missingA.join(", ") || "none"}; ${B} missing: ${missingB.join(", ") || "none"}).`, ``);
    }
  } else {
    lines.push(`## 3. Scorecards side by side`, ``, `_Run the eval for both lenders to fill this in._`, ``);
  }
  return lines.join("\n");
}
