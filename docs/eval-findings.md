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
