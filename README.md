# Mortgage Agent Lab

**A forward-deployed product manager (PM) prototype:** an AI assistant that follows up with
people who ask a mortgage lender about refinancing. It was adapted for a second lender without
changing any code, and every change was tested against simulated borrowers before it shipped.

**Live demo:** _link added at deploy_ · chat with the assistant, replay recorded conversations,
read the scorecards, and see the account health view.

> Everything here is fictional. Harborline Home Loans and Bayview Community Credit Union are
> made-up lenders. All metrics come from simulated conversations or synthetic data, not
> real-world results. Compliance behavior is illustrative and **not legal guidance**. The
> assistant never places real calls or sends real texts.

**On AI:** the assistant tells every borrower, in its first message, that it is an automated
assistant. Using AI isn't a secret, and it shouldn't be. It's the right choice only as long as it
makes the borrower's journey better: a faster reply, no repeated questions, honest answers, a
clear next step, and a real person whenever one is needed.

---

## Terms used here

| Term | Meaning |
|---|---|
| **STOP** | The word a person can text back to stop all messages immediately. It's the standard opt-out for text messages. The assistant mentions it in its first message, and replying STOP (or "unsubscribe," "cancel," and similar) ends the conversation without the AI being involved. |
| **Opt-out** | Asking not to be contacted again, whether by replying STOP or in their own words ("please don't text me"). |
| **AI / agent / assistant** | The automated texting assistant. Here it runs on Claude, a large language model. |
| **LLM** | Large language model: the kind of AI that reads and writes text. |
| **Loan officer** | The licensed person at the lender who can quote rates, discuss loan options, and take an application. The assistant can't do those things. |
| **Warm transfer** | Handing the borrower to a loan officer along with everything they've already shared, so they don't have to start over. |
| **Handoff summary** | The note the loan officer receives at transfer: who the borrower is, what they want, the details collected, their mood, and a suggested next step. |
| **Refinance** | Replacing a current mortgage with a new one. **Rate-and-term** means lowering the rate or changing the length; **cash-out** means borrowing extra against the home's value. |
| **LTV (loan-to-value)** | How much is owed (plus any cash out) divided by what the home is worth. Owing $300k on a $400k home is 75% LTV. Lenders set limits on it. |
| **Underwater** | Owing more than the home is worth (LTV over 100%). |
| **APR** | Annual percentage rate: the yearly cost of a loan including fees. The assistant never quotes one. |
| **Credit union / member** | A not-for-profit lender owned by its members. Bayview serves members only. |
| **Config** | The settings file that describes one lender: tone, questions, rules. Changing it changes the assistant without changing code. |
| **Eval** | An automated test run: simulated borrowers text the assistant, and every conversation gets scored. |
| **Persona / simulated borrower** | A made-up borrower with hidden "true" details (home value, credit, intent) used to test the assistant. |
| **LLM judge** | A second AI that reads each test conversation and scores the parts that need judgment, like tone and how well pushback was handled. |
| **CRM** | Customer relationship management system: where a lender tracks leads and contacts. |
| **FAQ** | Frequently asked questions, with answers the lender has approved. |
| **SSN / DOB** | Social Security number and date of birth. The assistant never asks for them. |
| **Speed to lead** | How quickly a new inquiry gets its first reply. |

---

## What it does

A borrower submits a refinance inquiry on a lender's website. Within seconds the assistant
texts them and:

- **opens honestly:** says it's an automated assistant, names the lender, and says they can
  reply STOP at any time to stop messages;
- **learns what a loan officer needs to know:** whether they want a lower rate or cash out,
  home value, what they owe, current rate, a self-reported credit range (no credit check),
  whether they live there, and how soon they want to move (plus membership at the credit union);
- **handles pushback:** "just shopping rates," "I'm busy," "how did you get my info?";
- **stays inside the lines:** never quotes a rate, never implies approval or rejection, never
  gives advice that needs a licensed loan officer, and hands those moments to a person;
- **hands off well:** warm-transfers ready borrowers to a (simulated) loan officer with a
  handoff summary, or books a call, and always ends by saying who will contact them, how, and when.

## Results

Same assistant code and the same 10 simulated borrowers, 30 conversations per lender:

| | Harborline (mortgage lender) | Bayview (credit union) |
|---|---|---|
| Borrowers handed off correctly | 100% | 100% |
| Compliance violations | 0 | 0 |
| Opt-outs honored immediately | 100% | 100% |
| Borrower experience (LLM judge) | 4.6 / 5 | 4.6 / 5 |
| Ended knowing who contacts them, how, and when | 100% | 100% |
| Ended frustrated or confused | 0% | 0% |
| Cost per test conversation | $0.12 | $0.15 |

Getting there took **159 simulated conversations across 9 eval runs (about $21 of AI usage)**.
Each run surfaced something; each fix is logged in [`docs/eval-findings.md`](docs/eval-findings.md).
Three examples:

| What the tests found | Why | Fix | Result |
|---|---|---|---|
| A borrower pushing for a rate was handed to a loan officer after two messages with **no** details collected. The AI judge called it fine; the rule-based check (0% of details captured) caught it. | Two settings contradicted each other | Collect the basics (goal, home value, balance) before handing off a rate question | Details captured 0% → 43% (the designed minimum); no rate ever quoted |
| Underwater borrowers got an abrupt "we'll email you" ending that the judge read as a quiet rejection. | The guidance optimized for speed, not for the person | Finish the questions, offer a call in neutral terms, book it | Re-test: 5/5, "satisfied," call booked. Later full runs: 4.0–4.3, no frustrated endings |
| At the credit union, non-members were dropped after one question (3.3/5). | "Members only" was implemented as a dead end | Explain membership honestly, keep going, book a Member Services call | Non-member experience 3.3 → 4.7 |

## How it works

```
lender config (settings) ──► instructions + tools ──► assistant (Claude) ──► conversation
          │                                                │
          │                         rules enforced in code ◄┘  (STOP, LTV, hours, membership)
          ▼
simulated borrowers ──► rule-based checks + LLM judge ──► scorecard
```

1. **Each lender is a settings file.** Tone, questions, pushback playbook, compliance rules,
   and handoff rules live in [`config/lenders/`](config/lenders). The assistant's instructions
   and tools are generated from it; nothing lender-specific is in the code.
2. **Hard rules are enforced in code, not only requested of the AI.** Replying STOP ends the
   conversation without the AI. The transfer step checks the required details, LTV, business
   hours, and membership, and refuses with instructions if the AI tries to break a rule.
3. **Simulated borrowers with hidden true details.** Ten of them: rushed, skeptical,
   first-timer, rate shopper, underwater, opts out, busy, non-member, texting Saturday night,
   and asking for cash out right at the LTV limit. What counts as "correct" comes from each
   lender's own rules, so a stricter lender automatically changes the expected outcome.
4. **Rules first, judge second.** Pattern-matching rules and exact comparisons check what they
   can: free, repeatable, no AI. An LLM judge, which never sees the hidden details, scores
   pushback handling, naturalness, experience, clear next step, and compliance gray areas, and
   leaves notes on specific messages.
5. **A new lender is a settings change.** Bayview differs from Harborline in 56 settings and
   zero lines of code. See `npm run compare`.

Built with TypeScript, Anthropic's software development kit (SDK) for Claude Opus 5.5 (models are
set in [`config/models.yaml`](config/models.yaml)), Next.js on Vercel, and 118 automated tests.

---

## The forward-deployed PM playbook

How I'd run a real lender deployment after the contract is signed. Thresholds are starting
points to agree with the lender, not universal truths.

### 1. Know the customer, and everyone else in the conversation

Before writing a single setting, understand every party the assistant serves:

| Party | What they need | How the assistant serves it |
|---|---|---|
| **Borrower** | A fast, honest reply; respect for their time and privacy; a person when it matters | Replies in seconds, discloses AI up front, offers STOP, never guesses at rates, always gives a next step |
| **Loan officer** | A lead worth calling, without re-asking everything | Handoff summary with the details, mood, open questions, and a suggested first step |
| **Lender sales and operations** | More real conversations with loan officers, and staffing that matches demand | Weekly health review: funnel, drop-off points, transfer connect rate |
| **Compliance** | Nothing said that shouldn't be, and proof of it | Rules in the settings file, enforced in code, tested every run |
| **Lead sources and partners** | Borrowers who expected the contact | Openers that say where the inquiry came from |

These questions need clear answers for every lender, revisited every week:

| Question | How we answer it | What this prototype shows |
|---|---|---|
| **How do our customers speak?** | Read and listen to real conversations at kickoff. Use their words, match their pace, and write test borrowers in their voice. | Two tones from one codebase: Harborline efficient, Bayview warm and "member-first." Test borrowers text the way people do ("owe like 310k"). |
| **Where do we lose traction?** | Track where people stop replying, question by question, every week. | In the synthetic data, 14% stop at the credit question vs. 4% at a typical one. Recommendation: ask it last and lead with "this isn't a credit check." |
| **What's our response to pushback?** | A playbook built from what the lender's best loan officers actually say, tested objection by objection. | Four objections with written guidance; the judge scores handling 4.6–4.8 / 5. |
| **How do we make it seamless?** | Never ask twice, carry everything into the handoff, offer the fastest path, and always say what happens next. | Offers the immediate call before booking a later one; 100% of conversations end with a clear next step; handoff summaries score 4.4–4.8 / 5. |
| **How clear is our FAQ?** | Keep a lender-approved FAQ the assistant can draw on. Every "I don't know" gets logged and becomes an FAQ entry or a routing rule. | A non-member asked "can I open the account online?" The assistant correctly said it didn't know. That's a gap to close at kickoff. A lender FAQ is on the [roadmap](docs/production-roadmap.md). |
| **Is the language as clear as possible?** | Plain words, one question at a time, short messages, and every term explained on first use. The judge flags anything that over-promises. | "No credit check" now applies only to the assistant's question, not the loan officer's process; "you're all set" was removed because it sounded like an approval. |
| **How do we make it the stickiest product possible?** | For borrowers: trust, so they come back for their next property and tell others. For the lender: lift they can see and improvements every week. | Borrower experience is a scored metric; every eval run and change is visible in the run history. Remembering returning borrowers is next on the roadmap. |
| **Are we transparent?** | Internally: every metric, failure, and change is written down, including mistakes in our own measurement. With customers: AI disclosed up front, honest next steps, no implied approval or rejection, and an easy STOP. | [`docs/eval-findings.md`](docs/eval-findings.md) logs every run, including two scoring bugs I found in my own checks. |

### 2. Kickoff (week 1)

**In the room:** the head of sales or mortgage operations, a compliance officer, one or two
top loan officers, and whoever owns the CRM and lead sources.

**Leave with answers to these, and a first draft of the settings file by the end of the week.**
Every section of the file maps to a kickoff question:

| Settings section | Questions to answer |
|---|---|
| Lender and persona | Who are your borrowers? How do they talk? What should the assistant sound like? Which words do you never use? |
| Questions | What does a loan officer need before the first call? What can wait? |
| Pushback playbook | Share 20 real calls or text threads. What do people push back on, and what do your best loan officers say? |
| FAQ | What do borrowers ask most? What's the approved answer, and when should it go to a person? |
| Compliance | Required disclosures, claims we can't make, state-specific rules, consent records, opt-out handling |
| Handoff | Who takes transfers, when, and how fast? What happens after hours? Who isn't a fit, and what do they hear instead? |
| Lead sources | Where do inquiries come from? What did the borrower see before we text them? |

**Then:** build simulated borrowers from the real conversations, run the eval against the draft,
and walk the lender through three replayed conversations before anything goes live.

### 3. Success metrics

| Tier | Metric | Starting target |
|---|---|---|
| North star | Ready borrowers who reach a live loan officer conversation, per 100 inquiries | Beat the lender's pre-launch baseline within 30 days |
| Funnel | Reply rate · ready-to-hand-off rate · transfer rate · share of transfers a loan officer actually answers | Tracked weekly against baseline |
| Speed | Median time to first text (speed to lead) | Under 60 seconds |
| Guardrails (must hold) | Compliance violations · opt-outs honored · AI disclosed in first message | 0 · 100% · 100% |
| Experience | Ended knowing the next step · ended frustrated | 95% or more · 5% or less |
| Quality | Loan officers rate handoff summaries as useful (weekly sample) | 4 / 5 or better |

Guardrails are gates, not goals: a funnel win that costs a compliance violation is a loss.

### 4. Launch checklist

- [ ] Settings file reviewed and signed off by compliance (disclosures, prohibited claims, opt-out wording)
- [ ] Eval passes on the lender's settings: 100% correct handoffs, 0 violations, 100% opt-outs honored
- [ ] Simulated borrowers include the lender's own edge cases from kickoff, not just the defaults
- [ ] FAQ approved, and "I don't know" answers route to a person
- [ ] Loan officers have read real handoff summaries and agree the format works
- [ ] Transfers and booked calls tested end to end, including after hours
- [ ] Consent and lead-source data flowing from the CRM; STOP honored on every channel
- [ ] Monitoring and escalation contacts set; the off switch tested
- [ ] Soft launch on one lead source or a share of traffic, then widen

### 5. Weekly health review (30 minutes with the lender)

The [account health view](app/health/page.tsx) is the agenda:

1. **Funnel vs. last week and baseline.** Where did people stop replying?
2. **Guardrails.** Any violation, missed opt-out, or frustrated ending gets read in full.
3. **Five conversations.** Two great, two weak, one random. The judge picks; people read.
4. **New questions the assistant couldn't answer.** Each becomes an FAQ entry or a routing rule.
5. **One to three changes,** each tied to a number, each with a settings change and a way to
   know it worked. Example from the synthetic data: the credit question loses 14% of people vs.
   4% at a typical question, so ask it last, lead with "no credit check," and make "not sure" easy.
6. **Decide what isn't an AI problem.** Weekend transfers reaching a loan officer only 60% of
   the time (vs. 96% on weekdays) may be a staffing fix for the sales manager, not a wording fix.

### 6. Escalation triggers

| Trigger | Threshold | Action | Response |
|---|---|---|---|
| Compliance violation in production | Any confirmed | Pause the affected flow, notify the lender's compliance contact, find the cause, add a test case | Same day |
| Opt-out not honored | Any | Turn off that channel until it's fixed and tested | Immediately |
| Opt-out spike | More than 2× the trailing 4-week average | Review openers and lead sources; check for a bad list | Within 24 hours |
| Loan officers not answering transfers | Under 85% for a day | Alert the sales manager; switch to booked calls until staffed | Same day |
| Fewer borrowers ready to hand off | Down more than 20% week over week | Read where people stop; check for settings or model changes | Next review, or sooner |
| Frustrated endings | More than 5% of conversations | Read every one; fix the top pattern | Within 48 hours |
| AI model or provider change | Any | Re-run the full eval before it reaches borrowers | Before rollout |

### 7. How a change ships

Every change in [`docs/eval-findings.md`](docs/eval-findings.md) followed the same loop:

1. **Find it in the data:** an eval run, the health view, or a real conversation.
2. **Trace it to the cause:** usually wording or a missing rule in the settings, sometimes the scoring itself.
3. **Change the settings** (or a rule enforced in code), with an automated test for any new rule.
4. **Prove it:** re-run the affected borrowers, then the full eval. Compare before and after.
5. **Write it down:** what changed, why, and the numbers.

The loop applies to the measurement too. Two Bayview "violations" turned out to be mistakes in
my own pattern-matching rules (careful, hedged wording, and a number cut off mid-match), and a
batch of warnings came from the judge not knowing what time each conversation happened.
Fixing how we measure is part of the job.

---

## What I'd build next

Full list in [`docs/production-roadmap.md`](docs/production-roadmap.md). The top items:

- **Customer memory, with consent:** pick up interrupted conversations without re-asking, and
  recognize returning borrowers, including one refinancing several properties, with rules for
  retention, deletion, and keeping each lender's data separate.
- **A lender-approved FAQ** the assistant can draw on, with every unanswered question logged.
- **Real integrations:** CRM lead intake with consent records, routing to loan officers licensed
  in the borrower's state, and calendar booking.
- **Voice,** using the same settings and evals, plus phone-specific checks.
- **Live monitoring:** the health view on real data, with alerts tied to the triggers above.
- **A tougher eval:** real conversations that went wrong become new test borrowers, the eval
  gates every settings change, and the judge is checked against human ratings.

## Run it yourself

```bash
npm install
cp .env.example .env.local      # add your ANTHROPIC_API_KEY
npm test                        # 118 tests, no AI calls
npm run dev                     # web demo at http://localhost:3000
npm run chat                    # chat with the assistant in the terminal
npm run eval -- --dry-run       # show the eval plan and cost estimate
npm run eval -- --n 1 --personas rate-shopper,underwater    # small run, about $0.25
npm run eval -- --lender bayview                            # full run, about $4
npm run compare                 # settings diff + side-by-side scorecards
npm run health                  # regenerate the synthetic dataset and health view
```

Eval runs show a cost estimate first (from the last measured run), stop starting new
conversations past `--max-cost`, and record the actual cost. Run size and AI models are set in
[`config/models.yaml`](config/models.yaml).

The public demo protects the AI bill with daily limits per visitor and overall, message limits,
signed conversation tokens that can't be edited, and an off switch (`LIVE_CHAT_ENABLED=false`);
see [`.env.example`](.env.example).

## Repo map

```
config/lenders/        harborline.yaml, bayview.yaml: everything lender-specific
config/models.yaml     AI model per role, pricing, eval size, spend cap
evals/personas/        10 simulated borrowers with hidden true details
src/agent/             instructions builder, tools, handoff rules, conversation loop
src/evals/             simulated borrower, rule-based checks, LLM judge, scorecards, lender comparison
src/health/            synthetic call data, analysis, recommendations
src/web/ + app/        Next.js demo: chat endpoint, rate limits, pages
data/runs/             every eval run: conversations, scorecards, summaries
data/health/           synthetic dataset (spreadsheet CSV and JSON files) and health report
docs/                  eval findings log, production roadmap
tests/                 118 tests: settings, handoff rules, compliance checks, scoring math, web
```
