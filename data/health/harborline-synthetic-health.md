# Harborline Home Loans: account health (SYNTHETIC DATA)

_420 simulated conversations, 2026-09-28 to 2026-10-25. Not real results._

| Leads | Replied | Qualified | Transferred | LO connected | Opted out | Speed to lead |
|---|---|---|---|---|---|---|
| 420 | 70% | 51% | 90% | 88% | 10% | 20s |

## Recommended agent changes

### 1. Reframe the credit range question

**14% of borrowers asked about credit range stopped replying, vs 4% at a typical question.**

- 29 of 201 borrowers stopped at this question (14%).
- Median drop-off at the other 6 questions: 4%.
- Credit is the most sensitive question we ask; borrowers often assume it triggers a credit pull.

**Change:** Ask credit last, lead with "no credit check, just your best guess," and make "not sure" an easy answer. Allow a transfer without it, since the loan officer will review credit anyway.

```yaml
qualification:
  fields:
    # move credit_band after occupancy and timeline
    - id: credit_band
      required: false   # loan officer confirms credit
      ask: >-
        Lead with "this isn't a credit check, just your best guess," and offer
        "not sure" as an answer.
```

**Validate:** Re-run the eval suite (recall and borrower experience must hold), then watch credit range drop-off weekly. Target: at or below 6%.

_If drop-off here matched a typical question, about 18 more qualified leads over these 4 weeks (synthetic estimate)._

### 2. Stop promising a 5-minute call on weekends

**Only 60% of weekend transfers reached a loan officer, vs 96% on weekdays.**

- 12 of 30 weekend transfers did not connect within the promised window.
- 75% of borrowers whose transfer didn't connect ended the conversation frustrated.
- The agent's transfer message says "usually within 5 minutes," which is untrue on weekends.

**Change:** On weekends, offer a scheduled call instead of a live transfer, or tell the borrower the honest wait. Share the connect-rate gap with the lender's sales manager: it may be a staffing fix, not an agent fix.

```yaml
handoff:
  live_transfer_available: business_hours
  business_hours: { days: [mon, tue, wed, thu, fri], start: "08:00", end: "21:00" }
  after_hours_guidance: >-
    Offer a call at a time that works; don't promise an immediate callback.
```

**Validate:** Add a weekend persona to the eval suite (expected: callback, clear next step). Then track weekend connect rate and frustrated endings weekly.

_About 3 fewer broken "5-minute" promises per week (synthetic estimate)._

### 3. Use a source-aware opener for comparison site leads

**22% of comparison site leads opted out, vs 6% from the lender's own web form.**

- 30% of these leads asked some form of "how did you get my info?" (web form: 5%).
- They came through a third-party site, so a Harborline text feels unexpected. The opener references "the inquiry you just submitted" without saying where.
- Qualification rate for this source: 43% (web form: 51%).

**Change:** Pass the lead source to the agent and name it in the first message ("you requested refinance quotes on [partner site] a moment ago"). Keep the STOP reminder.

```yaml
channel:
  trigger_by_source:
    rate_comparison_partner: >-
      The borrower requested refinance quotes on a rate-comparison site a moment
      ago and chose Harborline as one of the lenders to contact them. Say so.
```

**Validate:** Add a partner-sourced persona to the eval suite; then watch opt-out and "how did you get my info?" rates for this source weekly.

_If opt-outs fell to the web-form rate, about 13 more conversations kept over these 4 weeks (synthetic estimate)._
