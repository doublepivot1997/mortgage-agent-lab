/**
 * Run the eval suite: simulated borrowers vs. a lender's agent, scored by rules + an LLM judge.
 *
 *   npm run eval -- --lender harborline                 # full run (personas x conversations_per_persona)
 *   npm run eval -- --n 1 --personas rate-shopper,underwater
 *   npm run eval -- --dry-run                            # show plan + cost estimate, spend nothing
 *   npm run eval -- --max-cost 5 --no-judge
 */
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { getClient } from "../lib/anthropic.js";
import { ROOT, loadLenderConfig, loadModelConfig } from "../lib/config.js";
import { loadLocalEnv } from "../lib/env.js";
import { runChecks } from "../evals/checks.js";
import { judgeConversation, mergeViolations } from "../evals/judge.js";
import { expectedOutcome, loadPersonas, validatePersonaForLender } from "../evals/personas.js";
import { buildConversationScore, buildScorecard, renderSummaryMarkdown, type ConversationScore, type Scorecard } from "../evals/scorecard.js";
import { runConversation } from "../evals/simulator.js";
import { emptyTally } from "../lib/cost.js";

loadLocalEnv();

const { values } = parseArgs({
  options: {
    lender: { type: "string", default: "harborline" },
    n: { type: "string" },
    personas: { type: "string" },
    concurrency: { type: "string" },
    "max-cost": { type: "string" },
    "max-turns": { type: "string" },
    "no-judge": { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
  },
});

const models = loadModelConfig();
const cfg = loadLenderConfig(values.lender!);
const n = Number(values.n ?? models.eval.conversations_per_persona);
const concurrency = Number(values.concurrency ?? models.eval.concurrency);
const maxCost = Number(values["max-cost"] ?? models.eval.max_cost_usd);
const maxTurns = Number(values["max-turns"] ?? models.eval.max_borrower_turns);
const useJudge = !values["no-judge"];

let personas = loadPersonas();
if (values.personas) {
  const wanted = values.personas.split(",").map((s) => s.trim());
  const unknown = wanted.filter((w) => !personas.some((p) => p.id === w));
  if (unknown.length) throw new Error(`Unknown persona(s): ${unknown.join(", ")}. Available: ${personas.map((p) => p.id).join(", ")}`);
  personas = personas.filter((p) => wanted.includes(p.id));
}
personas.forEach((p) => validatePersonaForLender(cfg, p));

// ---------- Plan + cost estimate ----------

const runsDir = path.join(ROOT, "data", "runs", cfg.lender.id);
function lastMeasuredCostPerConversation(): number | null {
  if (!fs.existsSync(runsDir)) return null;
  const runs = fs.readdirSync(runsDir).filter((d) => fs.existsSync(path.join(runsDir, d, "scorecard.json"))).sort();
  const last = runs.at(-1);
  if (!last) return null;
  const sc = JSON.parse(fs.readFileSync(path.join(runsDir, last, "scorecard.json"), "utf8")) as Scorecard;
  return sc.overall.cost_per_conversation;
}
const measured = lastMeasuredCostPerConversation();
const perConv = measured ?? models.eval.default_cost_per_conversation;
const total = personas.length * n;

console.log(`\nEval plan: ${cfg.lender.name} (fictional)`);
console.log(`  ${personas.length} personas x ${n} = ${total} conversations, up to ${maxTurns} borrower turns each, concurrency ${concurrency}`);
console.log(`  models: agent ${models.roles.agent.model}, simulator ${models.roles.simulator.model}, judge ${useJudge ? models.roles.judge.model : "(off)"}`);
console.log(`  estimated cost: ~$${(perConv * total).toFixed(2)} ($${perConv.toFixed(2)}/conversation, ${measured ? "measured on last run" : "default guess, no prior run"})`);
console.log(`  spend cap: $${maxCost.toFixed(2)} (no new conversations start past this)\n`);
for (const p of personas) console.log(`  - ${p.id.padEnd(22)} expected: ${expectedOutcome(cfg, p)}`);
console.log("");

if (values["dry-run"]) process.exit(0);

// ---------- Run ----------

const client = getClient();
const runId = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const runDir = path.join(runsDir, runId);
fs.mkdirSync(path.join(runDir, "conversations"), { recursive: true });

const jobs = personas.flatMap((p) => Array.from({ length: n }, (_, i) => ({ persona: p, runIndex: i + 1 })));
const scores: ConversationScore[] = [];
let spent = 0;
let skipped = 0;

async function runJob(job: (typeof jobs)[number]) {
  const result = await runConversation({ cfg, persona: job.persona, models, client, runIndex: job.runIndex, maxBorrowerTurns: maxTurns });
  const checks = runChecks(cfg, job.persona, result.record);
  const judge = useJudge
    ? await judgeConversation({ cfg, record: result.record, models, client })
    : { output: null, objection_score: null, violations: [], usage: emptyTally(models.roles.judge.model) };

  const score = buildConversationScore({
    persona_id: job.persona.id,
    run_index: job.runIndex,
    checks,
    violations: mergeViolations(checks.violations, judge.violations),
    judge: judge.output,
    objection_score: judge.objection_score,
    judge_error: "error" in judge ? judge.error : undefined,
    stopped_because: result.stopped_because,
    usage: { agent: result.record.usage, simulator: result.simulator_usage, judge: judge.usage },
    pricing: models.pricing,
  });
  spent += score.cost.total;
  scores.push(score);

  const file = path.join(runDir, "conversations", `${job.persona.id}-${job.runIndex}.json`);
  fs.writeFileSync(file, JSON.stringify({ persona: job.persona, result, checks, judge: judge.output, score }, null, 2));

  const mark = score.handoff_correct && !score.violations.some((v) => v.severity === "violation") ? "PASS" : "FLAG";
  const hard = score.violations.filter((v) => v.severity === "violation").length;
  console.log(
    `  [${mark}] ${job.persona.id} #${job.runIndex}: ${score.actual_outcome} (expected ${score.expected_outcome}) · ${score.borrower_turns} turns · ` +
      `${hard} violation(s) · natural ${score.naturalness ?? "—"} · experience ${score.borrower_experience ?? "—"} (${score.borrower_end_state ?? "—"}) · $${score.cost.total.toFixed(3)}${result.error ? ` · ERROR ${result.error}` : ""}`,
  );
}

const queue = [...jobs];
await Promise.all(
  Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) {
      if (spent >= maxCost) {
        skipped += queue.length;
        queue.length = 0;
        break;
      }
      await runJob(queue.shift()!);
    }
  }),
);

// ---------- Scorecard ----------

scores.sort((a, b) => a.persona_id.localeCompare(b.persona_id) || a.run_index - b.run_index);
const scorecard = buildScorecard({
  lender_id: cfg.lender.id,
  run_id: runId,
  created_at: new Date().toISOString(),
  models: { agent: models.roles.agent.model, simulator: models.roles.simulator.model, judge: useJudge ? models.roles.judge.model : "(off)" },
  config: { conversations_per_persona: n, max_borrower_turns: maxTurns },
  conversations: scores,
});
if (skipped) scorecard.notes.push(`Spend cap of $${maxCost} reached: ${skipped} conversation(s) skipped.`);

const labels = Object.fromEntries(personas.map((p) => [p.id, p.label]));
const summary = renderSummaryMarkdown(scorecard, labels);
fs.writeFileSync(path.join(runDir, "scorecard.json"), JSON.stringify(scorecard, null, 2));
fs.writeFileSync(path.join(runDir, "summary.md"), summary);

console.log("\n" + summary);
console.log(`Saved ${path.relative(ROOT, runDir)}/ (scorecard.json, summary.md, conversations/)`);
