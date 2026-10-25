# Eval findings log

What each eval run found, what changed, and what is still open. All runs use simulated
borrowers against a fictional lender; results are synthetic, not real-world.

## 2026-10-25 · Harborline · smoke run 1 (`2026-10-25T17-16-12`, 2 conversations, $0.23)

**Finding: rate shopper transferred with zero fields.** After "just ballpark it," the agent
transferred immediately with reason `licensed_question`. The loan officer would have received an
empty lead. Rule-based recall caught it (0%); the LLM judge rated the conversation clean and the
handoff 5/5, which is a reminder not to rely on the judge alone.
- Root cause: two config rules disagreed. "Licensed questions go to a human immediately" vs.
  the just-shopping playbook, "collect the basics first."
- Fix: new `handoff.licensed_question_min_fields: [loan_goal, home_value, loan_balance]`. The
  transfer tool refuses a licensed-question transfer until those are known, and the prompt says so.

**Finding (warning): underwater close implied a lower payment** ("options to lower your
payment"). Fix: `not_eligible_guidance` now says not to imply a lower rate, payment, or approval.

## 2026-10-25 · Harborline · smoke run 2 (`2026-10-25T19-55-58`, 2 conversations, $0.22)

**Fix verified.** The rate shopper pushed for a number three times. The agent never gave one,
collected the three required basics, then transferred (recall 0% → 43%; the 3 of 7 fields is the
designed minimum).

**Open: overpromising on speed.** "That's all I needed" and "a real quote right away," when the
loan officer will still need credit, occupancy, and current rate. Judge: warning. Candidate fix:
transfer guidance that sets expectations ("they'll confirm a few details and quote you").

**Open: abrupt underwater close.** The agent ended right after learning the borrower was
underwater, without finishing intake or explaining next steps. The outcome was correct
(no transfer, no "you don't qualify"), but the judge flagged that it reads like a quiet
rejection. Candidate fix: finish the remaining fields so the loan officer's email can be
specific, and give a timeframe. This is a lender policy question to confirm with the customer.

**Not yet changed (parked by request):** prefill fields from the web form, rule-based
recommended next steps per lender, clarify ambiguous timelines ("next few months").

Caveat: n=1 per persona. A full run (3 conversations each) is needed before trusting the rates.

## 2026-10-25 · Harborline · experience changes + re-test (`2026-10-25T20-05-26`, 2 conversations, $0.32)

Direction from review: no overpromising, be transparent about requirements, no abrupt closes,
never leave a borrower frustrated.
- Added `persona.experience_rules` (transparency, always a clear next step, acknowledge stress,
  never imply rejection).
- Non-transferable leads now get a booked loan-officer review (`not_eligible_action: book_callback`,
  `follow_up_timeframe: within one business day`) instead of an email-only close.
- Judge now scores borrower experience (1-5), clear next step (yes/no), and end state.
- Result: underwater went from "quiet rejection" to experience 5/5, "satisfied," call booked.
  Rate shopper named the remaining details at handoff instead of "that's all I needed."
- Judge caught "(no credit check)" applied to the loan officer's process; credit question wording
  now scopes "no credit check" to the agent's question only.

## 2026-10-25 · Harborline · first full run (`2026-10-25T20-07-26`, 21 conversations, $2.46)

Handoff correctness 100% · zero violations · opt-out honored 100% · ended frustrated 0% ·
experience 4.3/5 · clear next step 86% · recall 83% (rate shopper 57% by design).

**Open: transfer wording I wrote in the config causes most warnings (10, all "warning").**
- "You won't need to repeat yourself" (from `transfer_message_guidance`) is flagged as an
  overpromise, since the loan officer confirms details.
- The config never says *how* a transfer reaches the borrower (call? text? how soon?).
  Skeptical cash-out ended without a clear next step in 3 of 3 runs.
- "Your situation is one a loan officer should review personally" (from `not_eligible_guidance`)
  reads as hinting at a problem; "You're all set" reads as an approval.

## 2026-10-25 · Harborline · transfer wording fix + full re-run (`2026-10-25T20-16-14`, 21 conversations, $2.47)

Changes: new `handoff.transfer_mechanics` ("a licensed loan officer calls ... usually within
5 minutes"); transfer message no longer promises "you won't need to repeat yourself";
not-eligible borrowers get the same neutral "go over your options" call offer as anyone;
experience rule against decision-sounding phrases ("you're all set").

| Metric | Before (`20-07-26`) | After (`20-16-14`) |
|---|---|---|
| Warnings | 10 | 2 |
| Ended with a clear next step | 86% | 100% |
| Skeptical cash-out: clear next step | 0 of 3 | 3 of 3 |
| Borrower experience | 4.3 | 4.6 |
| Handoff summary quality | 4.4 | 4.5 |
| Violations / frustrated endings | 0 / 0% | 0 / 0% |
| Handoff correctness | 100% | 95% (1 miss, below) |

**Open: one "miss" is a scoring question, not an agent error.** A rushed, qualified borrower
asked "can someone call me today? free after 4," and the agent booked that callback. The eval
expected an immediate transfer. The borrower got what they asked for, but the agent never
offered the faster option (a loan officer calling within minutes), which matters for
speed-to-lead. Decision pending: offer the immediate call first, and/or count a borrower-chosen
callback as correct.

**Remaining warnings (2):** rate shopper told "then a loan officer can call you with a real
quote" before credit and occupancy are known. Minor wording.

## 2026-10-25 · Harborline · offer the immediate call first (`2026-10-25T20-25-36`, 21 conversations, $2.64)

Decision: when a qualified borrower asks for a later call, the agent first offers the immediate
call ("a loan officer can call you in about 5 minutes, or I can book after 4 - which works?") and
books the later time only if the borrower chooses it (speed-to-lead).
- Config: `handoff.offer_immediate_before_callback: true`.
- Enforced in code: `schedule_callback` now has `immediate_call_offered`; for a qualified borrower
  with live transfer available, an optional callback without the offer is refused with instructions.
- Scoring: a callback counts as a correct handoff for a should-transfer borrower only if the
  immediate call was offered and the borrower chose later.
- Softened rate-shopper wording ("go over rate options once they've confirmed your details").

| Metric | Before (`20-16-14`) | After (`20-25-36`) |
|---|---|---|
| Handoff correctness | 95% | 100% |
| Handoff summary quality | 4.5 | 5.0 |
| Naturalness | 4.3 | 4.5 |
| Borrower experience | 4.6 | 4.5 |
| Clear next step / frustrated endings | 100% / 0% | 100% / 0% |
| Violations / warnings | 0 / 2 | 0 / 3 |

No simulated borrower asked for a later call in this run, so the new path was verified with a
scripted chat at a simulated 10am: the agent offered the 5-minute call unprompted, the borrower
chose 4pm, and the callback was booked with `immediate_call_offered: true`. (At the real clock,
4:31pm, the agent correctly noticed "after 4" was already now and transferred.)

Remaining warnings (3, minor): "they'll need a few basics to give you real numbers";
underwater "set you up to talk with one shortly" and "today or tomorrow evening" (the agent
narrowing "within one business day" on its own).

## 2026-10-25 · Milestone 3: Harborline vs. Bayview, same 10-persona suite (`2026-10-25T20-59-36`, 60 conversations, ~$7.80)

Bayview Community Credit Union was created by config only (53 settings changed, zero agent
code changed). Three new personas were designed so the correct outcome differs by lender:
non-member, Saturday-night borrower, and a 92.5% LTV cash-out. **All three were handled
correctly at both lenders in 3 of 3 runs.** Handoff correctness 100% at both lenders.
Full side-by-side: `data/comparisons/harborline-vs-bayview.md`.

| | Harborline | Bayview |
|---|---|---|
| Handoff correctness | 100% | 100% |
| Violations / warnings (as recorded) | 0 / 1 | 2 / 19 |
| Borrower experience | 4.6 | 4.3 |
| Clear next step / frustrated endings | 100% / 0% | 100% / 0% |

**Fixed: both Bayview "violations" were false positives in the rule checks.**
- `savings_promise` flagged "*Whether* it would lower your payment depends on your details," which
  is the hedged wording we want. Added `allow_if_hedged` with a deliberately narrow hedge list
  ("if you refinance, it would lower your payment" is still flagged).
- `rate_quote` flagged "your current rate of 7.25%," an allowed echo. The pattern stopped at "7",
  so the echo check compared 7 to 7.25. Matches now extend through the whole number, and the
  pattern captures decimals. This bug existed for Harborline too; it just didn't trigger.
- Also: one finding per rule per message (two patterns matching one phrase counted twice).
- Verified offline on the saved transcripts: Bayview rule violations 2 -> 0, Harborline 0 -> 0.

**Fixed: 13 "usually within 10 minutes" warnings were the judge missing context.** It wanted
"during business hours" added, but every one of those transfers happened on a Wednesday at
11am. The judge now sees each conversation's local time and is told that time-dependent rules
are enforced by the system.

**Open (decision needed): non-member experience 3.3/5.** The agent asks one question, learns
the borrower isn't a member, and ends with "joining is simple; Member Services will email you."
The judge calls it a soft brush-off of an eager, qualified borrower, who is likely to go to
another lender. "Joining is simple" is also flagged as an overpromise.

## 2026-10-25 · Bayview · non-members: stay and help (`2026-10-25T21-20-18`, 30 conversations, $4.63)

Decision: don't drop qualified non-members. The agent explains membership honestly (new
`handoff.membership_info`: who can join, $5 savings account, Member Services confirms
eligibility), offers to finish the intake so a loan officer is ready, and books a Member
Services call at a time the borrower chooses (`non_member_action: book_callback`, callback
reason `membership_services`). Enforced in code: a transfer attempt for a non-member is refused
with these instructions. "Joining is simple" removed.

| Bayview | Before (`20-59-36`) | After (`21-20-18`) |
|---|---|---|
| Non-member experience | 3.3 | 4.7 |
| Non-member conversation length | 2 borrower turns | 11 |
| Borrower experience (all) | 4.3 | 4.6 |
| Violations / warnings | 2 / 19 | 0 / 2 |
| Handoff correctness | 100% | 100% |

The "before" warnings also include the two scoring fixes above (judge time context, rule-check
false positives), so the 19 -> 2 drop is not all from this change.

**Open: knowledge gap the eval surfaced.** A non-member asked "can I open the savings account
online?" and the agent correctly said it didn't know. With a real credit union, this is a
question for kickoff: what membership details the agent may share (online joining, branches,
eligibility edge cases).

**Caveat on the side-by-side:** the Harborline run (`20-59-36`) predates the judge's
local-time context. Harborline had 1 warning in that run, so the effect is small.
