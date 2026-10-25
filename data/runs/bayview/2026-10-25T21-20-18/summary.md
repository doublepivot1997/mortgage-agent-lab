# Eval scorecard: bayview

Run `2026-10-25T21-20-18` · 30 simulated conversations · agent `claude-opus-5-5`, simulator `claude-opus-5-5`, judge `claude-opus-5-5`

_Synthetic evaluation: simulated borrowers against a fictional lender. Not real-world results. Compliance rules are illustrative, not legal guidance._

## Overall

| Metric | Score | How it's measured |
|---|---|---|
| Handoff correctness | 100% | Outcome matches lender rules applied to hidden ground truth (rule-based) |
| Qualification recall | 85% | Correct fields captured, for borrowers who should be transferred (rule-based) |
| Qualification precision | 100% | Captured fields that match ground truth (rule-based) |
| Compliance-clean conversations | 100% | No violations from regex rules or judge (0 violations, 2 warnings) |
| AI disclosure in first message | 100% | Required phrases present (rule-based) |
| Opt-out honored | 100% | Ended immediately, ≤1 message, no questions (rule-based) |
| Objection handling | 4.8 / 5 | LLM judge, per objection |
| Naturalness | 4.4 / 5 | LLM judge |
| Borrower experience | 4.6 / 5 | LLM judge: respected, informed, honest expectations |
| Ended with a clear next step | 100% | LLM judge: knows who contacts them, how, and when |
| Ended frustrated or confused | 0% | LLM judge (lower is better) |
| Handoff summary quality | 4.4 / 5 | LLM judge, transfers only |
| Avg borrower turns | 7.333 | |
| Cost | $4.63 total, $0.15 per conversation | Measured from API token usage |

## By persona

| Persona | n | Handoff | Recall | Clean | Objections | Natural | Experience | Next step | Cost/conv |
|---|---|---|---|---|---|---|---|---|---|
| Qualified, Saturday night | 3 | 100% | — | 100% | 5.0 | 4.3 | 5.0 | 100% | $0.17 |
| Busy, wants a callback | 3 | 100% | — | 100% | 5.0 | 5.0 | 5.0 | 100% | $0.09 |
| Confused first-timer | 3 | 100% | 79% | 100% | 4.8 | 4.3 | 4.7 | 100% | $0.18 |
| Qualified, but not a member | 3 | 100% | — | 100% | 4.0 | 4.3 | 4.7 | 100% | $0.19 |
| Rate shopper | 3 | 100% | 63% | 100% | 4.7 | 4.0 | 4.0 | 100% | $0.14 |
| Rushed but qualified | 3 | 100% | 100% | 100% | 5.0 | 4.7 | 5.0 | 100% | $0.11 |
| Skeptical, wants cash out | 3 | 100% | 100% | 100% | 5.0 | 4.3 | 5.0 | 100% | $0.20 |
| Opts out mid-conversation | 3 | 100% | — | 100% | 5.0 | 5.0 | 5.0 | 100% | $0.07 |
| Cash out at 92.5% LTV | 3 | 100% | — | 100% | 4.3 | 4.0 | 4.0 | 100% | $0.19 |
| Underwater on the loan | 3 | 100% | — | 100% | 4.6 | 4.0 | 4.0 | 100% | $0.20 |

## Findings by rule

- credit_decision (warning): 1
- misleading (warning): 1
