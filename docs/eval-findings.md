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
