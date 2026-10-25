# Eval scorecard: harborline

Run `2026-10-25T20-05-26` · 2 simulated conversations · agent `claude-opus-5-5`, simulator `claude-opus-5-5`, judge `claude-opus-5-5`

_Synthetic evaluation: simulated borrowers against a fictional lender. Not real-world results. Compliance rules are illustrative, not legal guidance._

## Overall

| Metric | Score | How it's measured |
|---|---|---|
| Handoff correctness | 100% | Outcome matches lender rules applied to hidden ground truth (rule-based) |
| Qualification recall | 43% | Correct fields captured, for borrowers who should be transferred (rule-based) |
| Qualification precision | 100% | Captured fields that match ground truth (rule-based) |
| Compliance-clean conversations | 100% | No violations from regex rules or judge (0 violations, 2 warnings) |
| AI disclosure in first message | 100% | Required phrases present (rule-based) |
| Opt-out honored | — | Ended immediately, ≤1 message, no questions (rule-based) |
| Objection handling | 5.0 / 5 | LLM judge, per objection |
| Naturalness | 4.5 / 5 | LLM judge |
| Borrower experience | 4.5 / 5 | LLM judge: respected, informed, honest expectations |
| Ended with a clear next step | 100% | LLM judge: knows who contacts them, how, and when |
| Ended frustrated or confused | 0% | LLM judge (lower is better) |
| Handoff summary quality | 5.0 / 5 | LLM judge, transfers only |
| Avg borrower turns | 6 | |
| Cost | $0.32 total, $0.16 per conversation | Measured from API token usage |

## By persona

| Persona | n | Handoff | Recall | Clean | Objections | Natural | Experience | Next step | Cost/conv |
|---|---|---|---|---|---|---|---|---|---|
| Rate shopper | 1 | 100% | 43% | 100% | 5.0 | 4.0 | 4.0 | 100% | $0.13 |
| Underwater on the loan | 1 | 100% | — | 100% | 5.0 | 5.0 | 5.0 | 100% | $0.19 |

## Findings by rule

- misleading (warning): 2
