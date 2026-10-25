/**
 * Generate the SYNTHETIC call dataset and the account health view.
 *
 *   npm run health                     # Harborline, default seed
 *   npm run health -- --seed 7 --count 600
 */
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { ROOT, loadLenderConfig } from "../lib/config.js";
import { analyze } from "../health/analyze.js";
import { generateCalls, toCsv } from "../health/generate.js";
import { renderHealthHtml, renderHealthMarkdown } from "../health/render.js";

const { values } = parseArgs({
  options: {
    lender: { type: "string", default: "harborline" },
    seed: { type: "string", default: "20261025" },
    count: { type: "string", default: "420" },
  },
});

const cfg = loadLenderConfig(values.lender!);
const calls = generateCalls({ seed: Number(values.seed), count: Number(values.count), lenderId: cfg.lender.id });
const report = analyze(calls);

const dir = path.join(ROOT, "data", "health");
fs.mkdirSync(dir, { recursive: true });
const base = path.join(dir, `${cfg.lender.id}-synthetic`);
fs.writeFileSync(`${base}-calls.json`, JSON.stringify({ synthetic: true, note: "Generated data. Not real calls.", seed: Number(values.seed), calls }, null, 2));
fs.writeFileSync(`${base}-calls.csv`, toCsv(calls));
fs.writeFileSync(`${base}-health.json`, JSON.stringify(report, null, 2));
fs.writeFileSync(`${base}-health.md`, renderHealthMarkdown(report, cfg.lender.name));
fs.writeFileSync(`${base}-health.html`, renderHealthHtml(report, cfg.lender.name));

console.log(renderHealthMarkdown(report, cfg.lender.name));
console.log(`Saved ${path.relative(ROOT, base)}-{calls.json,calls.csv,health.json,health.md,health.html}`);
