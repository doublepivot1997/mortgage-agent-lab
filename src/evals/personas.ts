import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { evaluateHandoff, type LeadFields } from "../agent/lead";
import type { SessionRecord } from "../agent/session";
import { ConfigError, ROOT, type LenderConfig } from "../lib/config";

export const PersonaSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  label: z.string(),
  description: z.string(),
  intake: z.object({
    first_name: z.string(),
    last_name: z.string(),
    form_answers: z.record(z.string(), z.string()),
  }),
  /** Simulated wall-clock time for the conversation. Default: a Wednesday at 2pm Eastern. */
  simulated_now: z.string().datetime().optional(),
  intent: z.enum(["proceed", "opt_out", "callback"]),
  objections: z.array(z.string()),
  ground_truth: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  behavior: z.string(),
});

export type Persona = z.infer<typeof PersonaSchema>;

export const DEFAULT_SIMULATED_NOW = "2026-10-21T18:00:00Z"; // Wed 2:00pm America/New_York

export function personaNow(p: Persona): Date {
  return new Date(p.simulated_now ?? DEFAULT_SIMULATED_NOW);
}

export function loadPersonas(dir = path.join(ROOT, "evals", "personas")): Persona[] {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".yaml"))
    .sort()
    .map((f) => {
      const result = PersonaSchema.safeParse(parseYaml(fs.readFileSync(path.join(dir, f), "utf8")));
      if (!result.success) {
        throw new ConfigError(`Invalid persona ${f}:\n${result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n")}`);
      }
      if (`${result.data.id}.yaml` !== f) throw new ConfigError(`Persona ${f}: id "${result.data.id}" must match file name`);
      return result.data;
    });
}

/** Ground-truth values for the fields this lender actually collects. */
export function truthFor(cfg: LenderConfig, p: Persona): LeadFields {
  const ids = new Set(cfg.qualification.fields.map((f) => f.id));
  return Object.fromEntries(Object.entries(p.ground_truth).filter(([k]) => ids.has(k)));
}

/** Check a persona against a lender's config so a typo in ground truth fails loudly, not as a silent miss. */
export function validatePersonaForLender(cfg: LenderConfig, p: Persona): void {
  const objectionIds = new Set(cfg.objections.map((o) => o.id));
  for (const o of p.objections) {
    if (!objectionIds.has(o)) throw new ConfigError(`Persona ${p.id}: objection "${o}" is not in ${cfg.lender.id}'s playbook`);
  }
  for (const f of cfg.qualification.fields) {
    const v = p.ground_truth[f.id];
    if (v === undefined) continue;
    if (f.type === "enum" && !f.values!.includes(String(v))) {
      throw new ConfigError(`Persona ${p.id}: ${f.id}="${v}" is not one of ${f.values!.join(", ")}`);
    }
    if (f.type === "number" && typeof v !== "number") throw new ConfigError(`Persona ${p.id}: ${f.id} must be a number`);
    if (f.type === "boolean" && typeof v !== "boolean") throw new ConfigError(`Persona ${p.id}: ${f.id} must be true/false`);
  }
}

export type Outcome = "transferred" | "follow_up" | "callback_booked" | "opted_out" | "ended_other" | "incomplete";

/**
 * What *should* happen, derived from the lender's own handoff rules applied to the persona's
 * hidden ground truth. Because it reuses evaluateHandoff, a stricter lender config automatically
 * changes the expected outcome (e.g. after-hours -> callback).
 */
export function expectedOutcome(cfg: LenderConfig, p: Persona): Outcome {
  if (p.intent === "opt_out") return "opted_out";
  if (p.intent === "callback") return "callback_booked";
  const decision = evaluateHandoff(cfg, truthFor(cfg, p), personaNow(p), "qualified");
  switch (decision.action) {
    case "transfer":
      return "transferred";
    case "follow_up":
      return "follow_up";
    case "callback":
      return "callback_booked";
    case "ask_more":
      throw new ConfigError(`Persona ${p.id} is missing ground truth for ${cfg.lender.id}: ${decision.missing.join(", ")}`);
  }
}

export function actualOutcome(r: Pick<SessionRecord, "status" | "end" | "callback">): Outcome {
  switch (r.status) {
    case "transferred":
      return "transferred";
    case "callback_booked":
      // A booked loan-officer review is this lender's form of follow-up for non-transferable leads.
      return r.callback?.reason === "loan_officer_review" || r.callback?.reason === "membership_services" ? "follow_up" : "callback_booked";
    case "opted_out":
      return "opted_out";
    case "ended":
      return r.end?.reason === "follow_up_by_email" || r.end?.reason === "not_a_member" ? "follow_up" : "ended_other";
    case "active":
      return "incomplete";
  }
}
