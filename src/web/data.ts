import fs from "node:fs";
import path from "node:path";
import type { HealthReport } from "../health/analyze";
import type { DeterministicResult } from "../evals/checks";
import type { JudgeOutput } from "../evals/judge";
import type { Persona } from "../evals/personas";
import type { ConversationScore, Scorecard } from "../evals/scorecard";
import type { ConversationResult } from "../evals/simulator";
import { ROOT, listLenders, loadLenderConfig, type LenderConfig } from "../lib/config";

/** Server-side readers for everything the site shows. All data is produced by the CLI scripts. */

const runsRoot = path.join(ROOT, "data", "runs");

export interface ConversationFile {
  persona: Persona;
  result: ConversationResult;
  checks: DeterministicResult;
  judge: JudgeOutput | null;
  score: ConversationScore;
}

export interface RunSummary {
  lender_id: string;
  run_id: string;
  created_at: string;
  conversations: number;
  overall: Scorecard["overall"];
}

/** Display order: the original lender first, then the lender it was adapted for. */
const DISPLAY_ORDER = ["harborline", "bayview"];

export function lenders(): LenderConfig[] {
  const rank = (id: string) => (DISPLAY_ORDER.includes(id) ? DISPLAY_ORDER.indexOf(id) : DISPLAY_ORDER.length);
  return listLenders()
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map(loadLenderConfig);
}

export function listRuns(lenderId: string): RunSummary[] {
  const dir = path.join(runsRoot, lenderId);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((d) => fs.existsSync(path.join(dir, d, "scorecard.json")))
    .sort()
    .map((d) => {
      const sc = loadScorecard(lenderId, d)!;
      return { lender_id: lenderId, run_id: d, created_at: sc.created_at, conversations: sc.overall.conversations, overall: sc.overall };
    });
}

export function loadScorecard(lenderId: string, runId: string): Scorecard | null {
  const f = path.join(runsRoot, lenderId, runId, "scorecard.json");
  return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, "utf8")) as Scorecard) : null;
}

/** The run shown on the site: the latest run with the most conversations (the full suite). */
export function showcaseRun(lenderId: string): Scorecard | null {
  const runs = listRuns(lenderId);
  if (!runs.length) return null;
  const maxN = Math.max(...runs.map((r) => r.conversations));
  const best = runs.filter((r) => r.conversations === maxN).at(-1)!;
  return loadScorecard(lenderId, best.run_id);
}

export function conversationIds(lenderId: string, runId: string): string[] {
  const dir = path.join(runsRoot, lenderId, runId, "conversations");
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")).sort() : [];
}

export function loadConversation(lenderId: string, runId: string, id: string): ConversationFile | null {
  if (![lenderId, runId, id].every((s) => /^[A-Za-z0-9_.-]+$/.test(s))) return null;
  const f = path.join(runsRoot, lenderId, runId, "conversations", `${id}.json`);
  return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, "utf8")) as ConversationFile) : null;
}

export function loadHealth(lenderId = "harborline"): HealthReport | null {
  const f = path.join(ROOT, "data", "health", `${lenderId}-synthetic-health.json`);
  return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, "utf8")) as HealthReport) : null;
}

/** Every showcase conversation, for static generation of transcript pages. */
export function showcaseConversationParams(): { lender: string; run: string; convo: string }[] {
  return lenders().flatMap((cfg) => {
    const sc = showcaseRun(cfg.lender.id);
    if (!sc) return [];
    return conversationIds(cfg.lender.id, sc.run_id).map((convo) => ({ lender: cfg.lender.id, run: sc.run_id, convo }));
  });
}

/** Map run id -> short description of what changed, parsed from the findings log headings. */
export function runNotes(): Record<string, string> {
  const f = path.join(ROOT, "docs", "eval-findings.md");
  if (!fs.existsSync(f)) return {};
  const notes: Record<string, string> = {};
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^## .*· (.+?) \(`([0-9T-]+)`/);
    if (m) notes[m[2]!] = m[1]!;
  }
  return notes;
}
