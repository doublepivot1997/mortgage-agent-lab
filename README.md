# Mortgage Agent Lab

**A forward-deployed PM prototype:** an AI lead-qualification agent for mortgage lenders,
reshaped for a second lender without touching agent code, and proven with simulated borrowers,
rule-based checks, and an LLM judge.

**Live demo:** _link added at deploy_ · chat with the agent, replay recorded conversations,
read the scorecards, and see the account health view.

> Everything here is fictional. Harborline Home Loans and Bayview Community Credit Union are
> made-up lenders. All metrics come from simulated conversations or synthetic data, not
> real-world results. Compliance behavior is illustrative and **not legal guidance**. The agent
> never places real calls or sends real texts.

---

## What it does

A borrower submits a refinance inquiry. Within seconds the agent texts them and:

- **opens honestly:** says it's an automated assistant, names the lender, and offers STOP;
- **qualifies the lead:** loan goal, home value, balance, current rate, credit range,
  occupancy, timeline (plus membership for the credit union);
- **handles objections:** "just shopping rates," "I'm busy," "how did you get my info?";
- **stays inside the lines:** never quotes a rate, never implies approval, never gives
  licensed advice, and routes those moments to a human;
- **hands off well:** warm-transfers qualified borrowers to a (simulated) licensed loan
  officer with a structured summary, or books a callback, and always ends with a clear next step.

## Results

Same agent code, same 10-persona eval suite, 30 simulated conversations per lender:

| | Harborline (mortgage lender) | Bayview (credit union) |
|---|---|---|
| Correct handoffs | 100% | 100% |
| Compliance violations | 0 | 0 |
| Opt-outs honored | 100% | 100% |
| Borrower experience (LLM judge) | 4.6 / 5 | 4.6 / 5 |
| Ended with a clear next step | 100% | 100% |
| Ended frustrated or confused | 0% | 0% |
| Cost per conversation (agent + simulator + judge) | $0.12 | $0.15 |

Getting there took **159 simulated conversations across 9 eval runs (about $21 of API usage)**.
Each run surfaced something; each fix is logged in [`docs/eval-findings.md`](docs/eval-findings.md).
Three examples:

| What the eval found | Root cause | Fix | Result |
|---|---|---|---|
| A rate shopper was transferred after two messages with **zero** details collected. The judge called it clean; rule-based recall (0%) caught it. | Two config rules contradicted each other | `licensed_question_min_fields`: collect the basics before a rate-question handoff | Recall 0% → 43% (the designed minimum); no rate ever quoted |
| Underwater borrowers got an abrupt email-only close the judge read as a "quiet rejection." | Not-eligible guidance optimized for speed, not for the person | Finish the intake, offer a call in neutral terms, book it | Re-test: 5/5, "satisfied," call booked. Later full runs: 4.0–4.3, no frustrated endings |
| Non-members at the credit union were dropped after one question (3.3/5). | Members-only rule implemented as a dead end | Explain membership honestly, keep collecting details, book a Member Services call | Non-member experience 3.3 → 4.7 |

## How it works

```
config/lenders/*.yaml ──► prompt + tool schemas ──► agent (Claude) ──► transcript
        │                                              │
        │                     code-enforced rules ◄────┘  (STOP, LTV, hours, membership)
        ▼
evals/personas/*.yaml ──► simulated borrowers ──► rule checks + LLM judge ──► scorecard
```

1. **The lender lives in config.** Persona, fields, objection playbook, compliance rules,
   and handoff rules are YAML, validated on load. The system prompt and tool schemas are
   generated from it; no lender detail is hard-coded.
2. **Hard rules are enforced in code, not only requested in the prompt.** A bare "STOP" ends
   the chat without a model call. The transfer tool checks required fields, loan-to-value,
   business hours, and membership, and refuses with instructions when the model gets it wrong.
3. **Simulated borrowers with hidden ground truth.** Ten personas (rushed, skeptical,
   first-timer, rate shopper, underwater, opt-out, busy, non-member, Saturday night, 92.5% LTV).
   The expected outcome is derived from each lender's own rules, so a stricter lender
   automatically changes what "correct" means.
4. **Rules first, judge second.** Regex and field comparisons catch what they can, for free and
   repeatably. A blind LLM judge (structured output) scores objection handling, naturalness,
   borrower experience, clear next step, and compliance gray areas, with turn-level notes.
5. **Reshaping for a new lender is a config change.** Bayview differs from Harborline in
   56 settings and zero lines of agent code. See `npm run compare`.

Stack: TypeScript, Anthropic SDK (Claude Opus 5.5, model names in `config/models.yaml`),
Next.js on Vercel, Vitest (118 tests on the deterministic parts).

---

## The forward-deployed PM playbook

How I'd run a real lender deployment after the contract is signed. Thresholds are starting
points to agree with the lender, not universal truths.

### 1. Kickoff (week 1)

**In the room:** head of sales or the mortgage operations lead, a compliance officer, one or two
top loan officers, and whoever owns the CRM and lead sources.

**Leave with answers to these, and a first config draft by the end of the week.** Every
section of the lender config maps to a kickoff question:

| Config section | Questions to answer |
|---|---|
| `lender`, `persona` | Who are your borrowers? What should the agent sound like? What words do you never use? |
| `qualification` | What does a loan officer need before the first call? What can wait? |
| `objections` | Pull 20 real call recordings or texts. What do people push back on, and what do your best LOs say? |
| `compliance` | Required disclosures, prohibited claims, state-specific rules, consent records, opt-out handling |
| `handoff` | Who takes transfers, when, and how fast? What happens after hours? Who's not a fit, and what do they hear instead? |
| Lead sources | Where do leads come from? What did the borrower see before we text them? |

**Then:** build personas from the real recordings, run the eval suite against the draft config,
and walk the lender through three replayed conversations before anything goes live.

### 2. Success metrics

| Tier | Metric | Starting target |
|---|---|---|
| North star | Qualified leads that reach a live loan officer conversation, per 100 inquiries | Beat the lender's pre-launch baseline in 30 days |
| Funnel | Reply rate · qualification rate · transfer rate · transfer connect rate | Tracked weekly against baseline |
| Speed | Median time to first text | < 60 seconds |
| Guardrails (must hold) | Compliance violations · opt-outs honored · AI disclosure present | 0 · 100% · 100% |
| Experience | Ended with a clear next step · ended frustrated | ≥ 95% · ≤ 5% |
| Quality | Handoff summary rated useful by loan officers (weekly sample) | ≥ 4 / 5 |

Guardrail metrics are gates, not goals: a funnel win that costs a compliance violation is a loss.

### 3. Launch checklist

- [ ] Config reviewed and signed off by compliance (disclosures, prohibited claims, opt-out text)
- [ ] Eval suite passes on the lender's config: 100% handoff correctness, 0 violations, 100% opt-outs honored
- [ ] Personas include the lender's own edge cases (from kickoff recordings), not just the defaults
- [ ] Loan officers have seen real handoff summaries and agreed the format works
- [ ] Transfer and callback paths tested end to end, including after hours
- [ ] Consent and lead-source data flowing from the CRM; STOP honored across every channel
- [ ] Monitoring and escalation contacts set; kill switch tested
- [ ] Soft launch on one lead source or a percentage of traffic, then widen

### 4. Weekly health review (30 minutes with the lender)

The [account health view](app/health/page.tsx) is the agenda:

1. **Funnel vs. last week and baseline.** Where did people drop off?
2. **Guardrails.** Any violation, missed opt-out, or frustrated ending gets read in full.
3. **Five conversations.** Two great, two weak, one random. The LLM judge picks; humans read.
4. **One to three changes,** each tied to a number, each with a config change and how we'll
   know it worked. Example from the synthetic data: credit-question drop-off is 14% vs. 4% at a
   typical question, so ask it last, lead with "no credit check," and make "not sure" easy.
5. **Decide what isn't an agent problem.** Weekend transfers connecting only 60% of the time
   (vs. 96% on weekdays) may be a staffing fix for the sales manager, not a prompt fix.

### 5. Escalation triggers

| Trigger | Threshold | Action | Response |
|---|---|---|---|
| Compliance violation in production | Any confirmed | Pause the affected flow, notify the lender's compliance contact, root-cause, add an eval case | Same day |
| Opt-out not honored | Any | Kill switch on that channel until fixed and tested | Immediate |
| Opt-out rate spike | > 2× trailing 4-week average | Review openers and lead source; check for a bad list | 24 hours |
| Transfer connect rate drop | < 85% for a day | Alert the sales manager; switch to callbacks until staffed | Same day |
| Qualification rate drop | > 20% relative, week over week | Read drop-off points; check for config or model changes | Next review, or sooner |
| Frustrated endings | > 5% of conversations | Read every one; fix the top pattern | 48 hours |
| Model or provider change | Any | Re-run the full eval suite before it reaches production | Before rollout |

### 6. How a change ships

Every change in [`docs/eval-findings.md`](docs/eval-findings.md) followed the same loop:

1. **Find it in the data:** an eval run, the health view, or a real transcript.
2. **Trace it to the cause:** usually config wording or a missing rule, sometimes the scoring itself.
3. **Change the config** (or the code-enforced rule), with a unit test for any new rule.
4. **Prove it:** re-run the affected personas, then the full suite. Compare before and after.
5. **Log it:** what changed, why, and the numbers.

The loop applies to the evals too: two Bayview "violations" turned out to be false positives in
my own regex checks (hedged wording and a truncated number), and a batch of warnings came from
the judge not knowing what time each conversation happened. Fixing the measurement is part of
the job.

---

## What I'd build next

Full list in [`docs/production-roadmap.md`](docs/production-roadmap.md). The top items:

- **Customer memory, with consent:** resume interrupted conversations without re-asking, and
  recognize returning borrowers, including one refinancing several properties, with retention,
  deletion, and isolation rules.
- **Real integrations:** CRM lead intake with consent records, licensed-LO routing by state,
  calendar booking.
- **Voice** on the same configs and evals, plus voice-specific checks.
- **Live monitoring:** the health view on real data, with alerts wired to the triggers above.
- **A harder eval harness:** real failures become personas, the suite gates every config change,
  and the judge is calibrated against human ratings.

## Run it yourself

```bash
npm install
cp .env.example .env.local      # add ANTHROPIC_API_KEY
npm test                        # 118 tests, no API calls
npm run dev                     # web demo at http://localhost:3000
npm run chat                    # chat with the agent in the terminal
npm run eval -- --dry-run       # show the eval plan and cost estimate
npm run eval -- --n 1 --personas rate-shopper,underwater    # small run, about $0.25
npm run eval -- --lender bayview                            # full run, about $4
npm run compare                 # config diff + side-by-side scorecards
npm run health                  # regenerate the synthetic dataset and health view
```

Eval runs print a cost estimate first (from the last measured run), stop starting new
conversations past `--max-cost`, and record actual cost from API token usage. Run size and
models are in [`config/models.yaml`](config/models.yaml).

The public demo protects the API bill with per-visitor and global daily caps, message limits,
signed session tokens, and a kill switch (`LIVE_CHAT_ENABLED=false`); see
[`.env.example`](.env.example).

## Repo map

```
config/lenders/        harborline.yaml, bayview.yaml: everything lender-specific
config/models.yaml     models per role, pricing, eval run size, spend cap
evals/personas/        10 simulated borrowers with hidden ground truth
src/agent/             prompt builder, tools, handoff rules, session loop
src/evals/             simulator, rule checks, LLM judge, scorecards, lender comparison
src/health/            synthetic call generator, analysis, recommendations
src/web/ + app/        Next.js demo: chat API, rate limits, pages
data/runs/             every eval run: transcripts, scorecards, summaries
data/health/           synthetic dataset (JSON + CSV) and health report
docs/                  eval findings log, production roadmap
tests/                 118 tests: config, handoff rules, compliance checks, scoring math, web
```
