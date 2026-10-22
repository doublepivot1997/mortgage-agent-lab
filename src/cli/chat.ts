/**
 * Chat with a lender's agent in the terminal.
 *
 *   npm run chat                                  # Harborline, interactive
 *   npm run chat -- --lender bayview --now 2026-10-24T22:00:00Z
 *   npm run chat -- --say "yes" --say "cash out, about 50k"   # scripted, non-interactive
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { parseArgs } from "node:util";
import { AgentSession, type AgentReply } from "../agent/session.js";
import { ROOT } from "../lib/config.js";
import { loadLocalEnv } from "../lib/env.js";

loadLocalEnv();

const { values } = parseArgs({
  options: {
    lender: { type: "string", default: "harborline" },
    first: { type: "string", default: "Jordan" },
    last: { type: "string", default: "Avery" },
    now: { type: "string" },
    say: { type: "string", multiple: true },
  },
});

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;

function show(reply: AgentReply, agentName: string) {
  for (const e of reply.events) {
    console.log(dim(`  [tool] ${e.name} ${JSON.stringify(e.input)}`));
    console.log(dim(`         -> ${e.is_error ? "REFUSED: " : ""}${e.result}`));
  }
  if (reply.text) console.log(`${cyan(agentName + ":")} ${reply.text}`);
}

const session = new AgentSession({
  lender: values.lender!,
  intake: {
    first_name: values.first!,
    last_name: values.last!,
    form_answers: { "What are you looking to do?": "Refinance", "Property state": "(fictional demo)" },
  },
  now: values.now ? new Date(values.now) : undefined,
});
const agentName = session.cfg.persona.agent_name;

console.log(dim(`--- ${session.cfg.lender.name} (fictional) | model ${session.models.roles.agent.model} | type STOP to opt out, Ctrl+C to quit ---\n`));
show(await session.start(), agentName);

const scripted = values.say ?? [];
const rl = scripted.length ? null : readline.createInterface({ input: process.stdin, output: process.stdout });

for (let i = 0; session.status === "active"; i++) {
  let msg: string;
  if (rl) {
    msg = (await rl.question("you: ")).trim();
    if (!msg) continue;
  } else {
    if (i >= scripted.length) break;
    msg = scripted[i]!;
    console.log(`you: ${msg}`);
  }
  show(await session.send(msg), agentName);
}
rl?.close();

const record = session.toRecord();
console.log(dim(`\n--- status: ${record.status} | ${record.usage.calls} API calls | est. cost $${record.cost_usd.toFixed(4)} ---`));
if (record.handoff) console.log("\nHandoff summary for the loan officer:\n" + JSON.stringify(record.handoff, null, 2));
if (record.callback) console.log("\nCallback booked:\n" + JSON.stringify(record.callback, null, 2));

const dir = path.join(ROOT, "data", "chats");
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `${record.lender_id}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(file, JSON.stringify(record, null, 2));
console.log(dim(`saved ${path.relative(ROOT, file)}`));
