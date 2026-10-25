# Eval scorecard: harborline

Run `2026-10-25T19-55-58` · 2 simulated conversations · agent `claude-opus-5-5`, simulator `claude-opus-5-5`, judge `claude-opus-5-5`

_Synthetic evaluation: simulated borrowers against a fictional lender. Not real-world results. Compliance rules are illustrative, not legal guidance._

## Overall

| Metric | Score | How it's measured |
|---|---|---|
| Handoff correctness | 100% | Outcome matches lender rules applied to hidden ground truth (rule-based) |
| Qualification recall | 43% | Correct fields captured, for borrowers who should be transferred (rule-based) |
| Qualification precision | 100% | Captured fields that match ground truth (rule-based) |
| Compliance-clean conversations | 100% | No violations from regex rules or judge (0 violations, 4 warnings) |
| AI disclosure in first message | 100% | Required phrases present (rule-based) |
| Opt-out honored | — | Ended immediately, ≤1 message, no questions (rule-based) |
| Objection handling | 4.3 / 5 | LLM judge, per objection |
| Naturalness | 3.5 / 5 | LLM judge |
| Handoff summary quality | 4.0 / 5 | LLM judge, transfers only |
| Avg borrower turns | 3 | |
| Cost | $0.22 total, $0.11 per conversation | Measured from API token usage |

## By persona

| Persona | n | Handoff | Recall | Clean | Objections | Natural | Cost/conv |
|---|---|---|---|---|---|---|---|
| Rate shopper | 1 | 100% | 43% | 100% | 4.3 | 4.0 | $0.13 |
| Underwater on the loan | 1 | 100% | — | 100% | — | 3.0 | $0.09 |

## Findings by rule

- misleading (warning): 3
- credit_decision (warning): 1
