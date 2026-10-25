# What I'd add in production

This prototype deliberately stores nothing about the people who use it: a live chat lives only in
the visitor's browser, and every borrower in the evals is simulated. A real deployment needs the
opposite, carefully. This is the list of what I'd build, roughly in priority order, and what each
one depends on.

## 1. Customer memory (stored, with consent)

Storing customer data is what makes the agent feel like a real relationship instead of a form.
Two use cases came up while testing the demo:

**Resume an interrupted conversation.** Borrowers get pulled away mid-chat. Today, if they come
back, the agent starts over. In production the agent should pick up where it left off: "Welcome
back, Jordan. Last time you told me the home is worth about $450k and you owe $280k. Want to
keep going?" It should confirm stored answers rather than assume they're still true.
- Needs: a conversation store keyed to the borrower (phone number or lead ID), the captured
  fields, where the conversation stopped, and a resume rule in the lender config (how long a
  conversation stays resumable, which fields must be re-confirmed after N days).
- Eval to add: an "interrupted" persona who drops off at the credit question and returns a day
  later. Pass = no repeated questions, stale values re-confirmed, same outcome as an
  uninterrupted run.

**Recognize returning customers.** A repeat borrower, for example one who owns several
properties and wants to refinance more than one, shouldn't be treated as a stranger. The agent
should recall who they are and what they've done before, and qualify each property separately.
- Needs: a borrower profile (identity, contact preferences, opt-out status, history) separate
  from per-property loan scenarios; the qualification model must support one borrower with
  many properties (today the lead record assumes one).
- Product questions for the lender: Does a second property route to the same loan officer?
  Does an investment property change the questions (rental income, occupancy)? What may the
  agent say about a previous application?
- Eval to add: a returning multi-property persona. Pass = recognized, no re-asking known
  facts, each property qualified and handed off on its own.

**Guardrails that come with stored data** (illustrative, not legal guidance; confirm with the
lender's compliance team):
- Consent: record when and how the borrower agreed to automated contact, and honor opt-outs
  across every conversation and property, permanently.
- Minimize: store only what the loan officer needs; never collect SSNs, DOBs, or account numbers
  by text.
- Retention and deletion: a defined retention period per lender, and a working "delete my data"
  path.
- Security: encryption at rest and in transit, access limited to the lender's own staff,
  audit logs of who viewed what.
- Isolation: one lender's borrowers are never visible to another lender's agent.
- Transparency: if the agent uses remembered information, it says so ("from our last
  conversation").

## 2. Real integrations

- **CRM / lead intake:** receive leads from the lender's web forms and partners in real time,
  including lead source (the health view showed source matters) and consent records.
- **Loan officer routing:** a real warm transfer (call bridge or text handoff) to the right
  licensed loan officer by state, product, and availability, with the handoff summary written
  into the CRM.
- **Scheduling:** book callbacks into loan officers' actual calendars instead of free text.
- **Licensing data:** route only to loan officers licensed in the borrower's state.

## 3. Voice

Phone is where most of these conversations happen. Add a voice channel on the same configs and
evals, plus voice-specific checks: interruptions, latency, mishearing numbers ("fifteen" vs
"fifty"), and a spoken AI disclosure. Test calls only ever go to numbers the team owns.

## 4. Production monitoring

- The account health view on live data instead of synthetic, refreshed daily.
- Alerts on the escalation triggers from the README playbook (opt-out spike, transfer connect
  rate drop, any compliance violation).
- Sample real conversations weekly for human review alongside the LLM judge, and track how
  often the judge and humans disagree.

## 5. Eval harness, grown up

- Turn real (consented, anonymized) conversations that went wrong into new eval personas.
- Run the suite automatically on every config change, and block the change if handoff
  correctness or compliance regresses.
- Multiple runs per persona with confidence intervals, so small differences aren't mistaken for
  improvements.
- Calibrate the judge against human ratings on a labeled sample.

## 6. Lender self-serve

A safe way for a lender's team to change wording (opener, objection responses) without an
engineer, with the eval suite running before anything goes live and a clear diff of what
changed. Rules like LTV limits and business hours stay behind review.
