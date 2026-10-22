import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

export const ROOT = process.cwd();

// ---------- Lender config schema ----------

const FieldSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_]*$/),
    label: z.string(),
    type: z.enum(["enum", "number", "boolean"]),
    values: z.array(z.string()).optional(),
    required: z.boolean(),
    required_if: z.record(z.string(), z.string()).optional(),
    ask: z.string(),
  })
  .refine((f) => f.type !== "enum" || (f.values && f.values.length > 0), {
    message: "enum fields need a non-empty `values` list",
  });

const ObjectionSchema = z.object({
  id: z.string(),
  label: z.string(),
  signals: z.array(z.string()).min(1),
  guidance: z.string(),
});

const ProhibitedSchema = z.object({
  id: z.string(),
  rule: z.string(),
  detect: z.array(z.string()).optional(),
  allow_if_echoing_borrower: z.boolean().optional(),
});

const DaySchema = z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
const HHMM = z.string().regex(/^\d{2}:\d{2}$/);

const BusinessHoursSchema = z.object({
  days: z.array(DaySchema).min(1),
  start: HHMM,
  end: HHMM,
});

export const LenderConfigSchema = z
  .object({
    lender: z.object({
      id: z.string().regex(/^[a-z0-9-]+$/),
      name: z.string(),
      short_name: z.string(),
      kind: z.string(),
      customer_term: z.string(),
      timezone: z.string(),
    }),
    persona: z.object({
      agent_name: z.string(),
      voice: z.string(),
      style_rules: z.array(z.string()),
    }),
    channel: z.object({ type: z.string(), trigger: z.string() }),
    disclosure: z.object({
      required_phrases_first_message: z.array(z.string()).min(1),
      opening_guidance: z.string(),
    }),
    qualification: z.object({ fields: z.array(FieldSchema).min(1) }),
    objections: z.array(ObjectionSchema),
    compliance: z.object({
      prohibited: z.array(ProhibitedSchema),
      route_to_human_topics: z.array(z.string()),
      opt_out: z.object({
        hard_stop_keywords: z.array(z.string()).min(1),
        soft_signals: z.array(z.string()),
        canned_reply: z.string(),
        agent_reply_guidance: z.string(),
      }),
      extra_rules: z.array(z.string()).optional(),
    }),
    handoff: z.object({
      live_transfer_available: z.enum(["always", "business_hours"]),
      business_hours: BusinessHoursSchema.nullable(),
      membership_required: z.boolean(),
      membership_field: z.string().optional(),
      non_member_guidance: z.string().optional(),
      qualified_when: z.object({
        all_required_fields: z.boolean(),
        max_ltv: z.number().gt(0),
        exclude_credit_bands: z.array(z.string()),
        exclude_timelines: z.array(z.string()),
      }),
      not_eligible_action: z.enum(["follow_up_by_email", "book_callback"]),
      not_eligible_guidance: z.string(),
      licensed_question_action: z.enum(["transfer_if_available", "book_callback"]),
      transfer_message_guidance: z.string(),
      after_hours_guidance: z.string().optional(),
    }),
  })
  .superRefine((cfg, ctx) => {
    const ids = cfg.qualification.fields.map((f) => f.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dupes.length) {
      ctx.addIssue({ code: "custom", message: `duplicate field ids: ${dupes.join(", ")}` });
    }
    for (const needed of ["home_value", "loan_balance"]) {
      if (!ids.includes(needed)) {
        ctx.addIssue({ code: "custom", message: `LTV rules need a "${needed}" field` });
      }
    }
    const h = cfg.handoff;
    if (h.live_transfer_available === "business_hours" && !h.business_hours) {
      ctx.addIssue({ code: "custom", message: "business_hours is required when live_transfer_available = business_hours" });
    }
    if (h.membership_required && (!h.membership_field || !ids.includes(h.membership_field))) {
      ctx.addIssue({ code: "custom", message: "membership_required needs a membership_field that exists in qualification.fields" });
    }
    for (const p of cfg.compliance.prohibited) {
      for (const pattern of p.detect ?? []) {
        try {
          new RegExp(pattern, "i");
        } catch {
          ctx.addIssue({ code: "custom", message: `invalid regex in compliance.${p.id}: ${pattern}` });
        }
      }
    }
  });

export type LenderConfig = z.infer<typeof LenderConfigSchema>;
export type FieldDef = LenderConfig["qualification"]["fields"][number];

// ---------- Model config schema ----------

const RoleSchema = z.object({
  model: z.string(),
  effort: z.enum(["low", "medium", "high", "xhigh", "max"]),
  max_tokens: z.number().int().positive(),
});

const PriceSchema = z.object({
  input: z.number(),
  output: z.number(),
  cache_write: z.number(),
  cache_read: z.number(),
});

export const ModelConfigSchema = z
  .object({
    roles: z.object({ agent: RoleSchema, simulator: RoleSchema, judge: RoleSchema }),
    pricing: z.record(z.string(), PriceSchema),
  })
  .superRefine((cfg, ctx) => {
    for (const [role, r] of Object.entries(cfg.roles)) {
      if (!cfg.pricing[r.model]) {
        ctx.addIssue({ code: "custom", message: `no pricing entry for ${role} model "${r.model}"` });
      }
    }
  });

export type ModelConfig = z.infer<typeof ModelConfigSchema>;
export type RoleConfig = z.infer<typeof RoleSchema>;

// ---------- Loaders ----------

export class ConfigError extends Error {}

function formatIssues(err: z.ZodError): string {
  return err.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
}

export function parseLenderConfig(raw: unknown, source = "lender config"): LenderConfig {
  const result = LenderConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new ConfigError(`Invalid ${source}:\n${formatIssues(result.error)}`);
  }
  return result.data;
}

export function lenderConfigPath(lenderId: string): string {
  if (!/^[a-z0-9-]+$/.test(lenderId)) throw new ConfigError(`bad lender id: ${lenderId}`);
  return path.join(ROOT, "config", "lenders", `${lenderId}.yaml`);
}

export function listLenders(): string[] {
  return fs
    .readdirSync(path.join(ROOT, "config", "lenders"))
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => f.replace(/\.yaml$/, ""))
    .sort();
}

export function loadLenderConfig(lenderId: string): LenderConfig {
  const file = lenderConfigPath(lenderId);
  if (!fs.existsSync(file)) throw new ConfigError(`No config for lender "${lenderId}" at ${file}`);
  const cfg = parseLenderConfig(parseYaml(fs.readFileSync(file, "utf8")), file);
  if (cfg.lender.id !== lenderId) {
    throw new ConfigError(`${file}: lender.id "${cfg.lender.id}" does not match file name`);
  }
  return cfg;
}

export function loadModelConfig(): ModelConfig {
  const file = path.join(ROOT, "config", "models.yaml");
  const result = ModelConfigSchema.safeParse(parseYaml(fs.readFileSync(file, "utf8")));
  if (!result.success) throw new ConfigError(`Invalid ${file}:\n${formatIssues(result.error)}`);
  return result.data;
}
