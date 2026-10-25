# Eval scorecard: harborline

Run `2026-10-25T20-59-36` · 30 simulated conversations · agent `claude-opus-5-5`, simulator `claude-opus-5-5`, judge `claude-opus-5-5`

_Synthetic evaluation: simulated borrowers against a fictional lender. Not real-world results. Compliance rules are illustrative, not legal guidance._

## Overall

| Metric | Score | How it's measured |
|---|---|---|
| Handoff correctness | 100% | Outcome matches lender rules applied to hidden ground truth (rule-based) |
| Qualification recall | 84% | Correct fields captured, for borrowers who should be transferred (rule-based) |
| Qualification precision | 100% | Captured fields that match ground truth (rule-based) |
| Compliance-clean conversations | 100% | No violations from regex rules or judge (0 violations, 1 warnings) |
| AI disclosure in first message | 100% | Required phrases present (rule-based) |
| Opt-out honored | 100% | Ended immediately, ≤1 message, no questions (rule-based) |
| Objection handling | 4.6 / 5 | LLM judge, per objection |
| Naturalness | 4.3 / 5 | LLM judge |
| Borrower experience | 4.6 / 5 | LLM judge: respected, informed, honest expectations |
| Ended with a clear next step | 100% | LLM judge: knows who contacts them, how, and when |
| Ended frustrated or confused | 0% | LLM judge (lower is better) |
| Handoff summary quality | 4.8 / 5 | LLM judge, transfers only |
| Avg borrower turns | 5.7 | |
| Cost | $3.66 total, $0.12 per conversation | Measured from API token usage |

## By persona

| Persona | n | Handoff | Recall | Clean | Objections | Natural | Experience | Next step | Cost/conv |
|---|---|---|---|---|---|---|---|---|---|
| Qualified, Saturday night | 3 | 100% | 100% | 100% | — | 4.3 | 5.0 | 100% | $0.15 |
| Busy, wants a callback | 3 | 100% | — | 100% | 5.0 | 5.0 | 5.0 | 100% | $0.06 |
| Confused first-timer | 3 | 100% | 86% | 100% | 4.2 | 4.3 | 4.3 | 100% | $0.16 |
| Qualified, but not a member | 3 | 100% | 100% | 100% | — | 4.0 | 5.0 | 100% | $0.14 |
| Rate shopper | 3 | 100% | 52% | 100% | 4.4 | 3.7 | 4.0 | 100% | $0.11 |
| Rushed but qualified | 3 | 100% | 100% | 100% | 4.3 | 4.7 | 5.0 | 100% | $0.10 |
| Skeptical, wants cash out | 3 | 100% | 100% | 100% | 5.0 | 4.0 | 5.0 | 100% | $0.17 |
| Opts out mid-conversation | 3 | 100% | — | 100% | 5.0 | 5.0 | 5.0 | 100% | $0.06 |
| Cash out at 92.5% LTV | 3 | 100% | 50% | 100% | 4.3 | 4.0 | 4.0 | 100% | $0.11 |
| Underwater on the loan | 3 | 100% | — | 100% | 4.2 | 4.0 | 4.0 | 100% | $0.17 |

## Findings by rule

- misleading (warning): 1

## Notes

- 1 qualified borrower(s) were offered an immediate call and chose a later callback; counted as correct.
