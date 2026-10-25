# Eval scorecard: harborline

Run `2026-10-25T20-16-14` · 21 simulated conversations · agent `claude-opus-5-5`, simulator `claude-opus-5-5`, judge `claude-opus-5-5`

_Synthetic evaluation: simulated borrowers against a fictional lender. Not real-world results. Compliance rules are illustrative, not legal guidance._

## Overall

| Metric | Score | How it's measured |
|---|---|---|
| Handoff correctness | 95% | Outcome matches lender rules applied to hidden ground truth (rule-based) |
| Qualification recall | 82% | Correct fields captured, for borrowers who should be transferred (rule-based) |
| Qualification precision | 100% | Captured fields that match ground truth (rule-based) |
| Compliance-clean conversations | 100% | No violations from regex rules or judge (0 violations, 2 warnings) |
| AI disclosure in first message | 100% | Required phrases present (rule-based) |
| Opt-out honored | 100% | Ended immediately, ≤1 message, no questions (rule-based) |
| Objection handling | 4.6 / 5 | LLM judge, per objection |
| Naturalness | 4.3 / 5 | LLM judge |
| Borrower experience | 4.6 / 5 | LLM judge: respected, informed, honest expectations |
| Ended with a clear next step | 100% | LLM judge: knows who contacts them, how, and when |
| Ended frustrated or confused | 0% | LLM judge (lower is better) |
| Handoff summary quality | 4.5 / 5 | LLM judge, transfers only |
| Avg borrower turns | 5.333 | |
| Cost | $2.47 total, $0.12 per conversation | Measured from API token usage |

## By persona

| Persona | n | Handoff | Recall | Clean | Objections | Natural | Experience | Next step | Cost/conv |
|---|---|---|---|---|---|---|---|---|---|
| Busy, wants a callback | 3 | 100% | — | 100% | 5.0 | 4.0 | 5.0 | 100% | $0.07 |
| Confused first-timer | 3 | 100% | 86% | 100% | 4.5 | 4.0 | 4.3 | 100% | $0.15 |
| Rate shopper | 3 | 100% | 48% | 100% | 4.4 | 4.0 | 4.0 | 100% | $0.11 |
| Rushed but qualified | 3 | 67% | 95% | 100% | 4.0 | 5.0 | 5.0 | 100% | $0.10 |
| Skeptical, wants cash out | 3 | 100% | 100% | 100% | 5.0 | 4.0 | 5.0 | 100% | $0.16 |
| Opts out mid-conversation | 3 | 100% | — | 100% | 5.0 | 5.0 | 5.0 | 100% | $0.06 |
| Underwater on the loan | 3 | 100% | — | 100% | 4.5 | 4.0 | 4.0 | 100% | $0.17 |

## Findings by rule

- misleading (warning): 2

## Handoff misses

- rushed-qualified #1: expected **transferred**, got **callback_booked** (agent_closed)
