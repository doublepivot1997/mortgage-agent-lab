/**
 * Compare two lenders: config diff, expected outcomes, and their latest eval scorecards.
 *
 *   npm run compare                              # harborline vs bayview, latest runs
 *   npm run compare -- --a harborline --b bayview --run-a <id> --run-b <id>
 */
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { ROOT, loadLenderConfig } from "../lib/config.js";
import { diffConfigs, renderComparison } from "../evals/compare.js";
import { loadPersonas } from "../evals/personas.js";
import type { Scorecard } from "../evals/scorecard.js";

const { values } = parseArgs({
  options: {
    a: { type: "string", default: "harborline" },
    b: { type: "string", default: "bayview" },
    "run-a": { type: "string" },
    "run-b": { type: "string" },
  },
});

function loadScorecard(lenderId: string, runId?: string): Scorecard | null {
  const dir = path.join(ROOT, "data", "runs", lenderId);
  if (!fs.existsSync(dir)) return null;
  const id = runId ?? fs.readdirSync(dir).filter((d) => fs.existsSync(path.join(dir, d, "scorecard.json"))).sort().at(-1);
  if (!id) return null;
  return JSON.parse(fs.readFileSync(path.join(dir, id, "scorecard.json"), "utf8")) as Scorecard;
}

const a = { cfg: loadLenderConfig(values.a!), scorecard: loadScorecard(values.a!, values["run-a"]) };
const b = { cfg: loadLenderConfig(values.b!), scorecard: loadScorecard(values.b!, values["run-b"]) };
const md = renderComparison({ a, b, personas: loadPersonas() });

const outDir = path.join(ROOT, "data", "comparisons");
fs.mkdirSync(outDir, { recursive: true });
const base = path.join(outDir, `${values.a}-vs-${values.b}`);
fs.writeFileSync(`${base}.md`, md);
fs.writeFileSync(
  `${base}.json`,
  JSON.stringify({ a: values.a, b: values.b, run_a: a.scorecard?.run_id ?? null, run_b: b.scorecard?.run_id ?? null, config_changes: diffConfigs(a.cfg, b.cfg) }, null, 2),
);
console.log(md);
console.log(`\nSaved ${path.relative(ROOT, base)}.md and .json`);
