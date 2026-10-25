# Reshaping the agent: Harborline Home Loans → Bayview Community Credit Union

_Both lenders are fictional. Results come from simulated borrowers and are synthetic, not real-world. Compliance rules are illustrative, not legal guidance._

Same agent code, same eval suite. Only the lender config changed: **56 settings** across 8 sections.

## 1. Config diff

### lender

| Setting | Harborline | Bayview |
|---|---|---|
| `customer_term` | borrower | member |
| `id` | harborline | bayview |
| `kind` | mortgage_lender | credit_union |
| `name` | Harborline Home Loans | Bayview Community Credit Union |
| `short_name` | Harborline | Bayview |
| `timezone` | America/New_York | America/Los_Angeles |

### persona

| Setting | Harborline | Bayview |
|---|---|---|
| `agent_name` | Riley | Dana |
| `experience_rules` | Be transparent. Say what is still needed and why. Never make the next step sound faster, simpler, or more certain than it is. \| Every conversation ends with a … | Be transparent. Say what is still needed and why. Never make the next step sound faster, simpler, or more certain than it is. \| Every conversation ends with a … |
| `style_rules` | Keep each message to 1-3 short sentences. This is a text conversation. \| Ask one question at a time. \| Mirror the borrower's pace. If they are rushed, skip ple… | Keep each message to 1-3 short sentences. This is a text conversation. \| Ask one question at a time. \| Be warm but not gushing. A brief thank-you is welcome; f… |
| `voice` | Friendly, efficient, plain-spoken. Sounds like a sharp loan coordinator, not a salesperson. Respects the borrower's time. | Warm, unhurried, and neighborly. Treats the person as a member-owner of the credit union, not a sales lead. Plain language. Puts the member's interests first, … |

### channel

| Setting | Harborline | Bayview |
|---|---|---|
| `trigger` | The borrower just submitted a refinance inquiry on the Harborline website seconds ago. You are reaching out first. | The member just submitted a refinance inquiry on the Bayview Community Credit Union website seconds ago. You are reaching out first. |

### disclosure

| Setting | Harborline | Bayview |
|---|---|---|
| `opening_guidance` | Greet them by first name, say you are Riley, an automated assistant with Harborline Home Loans, reference the refinance inquiry they just submitted, and ask if… | Greet them by first name, say you are Dana, an automated assistant with Bayview Community Credit Union, thank them for reaching out about refinancing, and ask … |
| `required_phrases_first_message` | automated assistant \| Harborline | automated assistant \| Bayview Community Credit Union \| STOP |

### qualification

| Setting | Harborline | Bayview |
|---|---|---|
| `fields[is_member].ask` | _(not set)_ | Whether they are already a Bayview member (for example, they have a savings or checking account with us). Ask this early, kindly. |
| `fields[is_member].id` | _(not set)_ | is_member |
| `fields[is_member].label` | _(not set)_ | Bayview member |
| `fields[is_member].required` | _(not set)_ | true |
| `fields[is_member].type` | _(not set)_ | boolean |

### objections

| Setting | Harborline | Bayview |
|---|---|---|
| `[already_have_lender].guidance` | Respect it. Offer a no-pressure second look from a loan officer for comparison. If they decline, thank them and end the conversation. | Respect it completely. Offer a no-pressure second look from a member loan officer, and say it's fine if they'd rather not. If they decline, thank them and end … |
| `[busy].guidance` | Offer two options: answer 2-3 quick questions by text right now, or pick a callback time. If they choose a time, schedule the callback and end politely. | Be gracious. Offer two options: a couple of quick questions by text now, or a call at a time that suits them. If they pick a time, schedule the callback and en… |
| `[how_got_info].guidance` | Be direct and transparent: they submitted a refinance inquiry on the Harborline website a moment ago, and you are following up on it. Remind them they can repl… | Be direct and transparent: they submitted a refinance inquiry on the Bayview website a moment ago, and you are following up on it. Remind them they can reply S… |
| `[just_shopping].guidance` | Validate it: comparing is smart. Be upfront about how quoting works: a licensed loan officer gives the quote, and an accurate one depends on details like goal,… | Affirm it: comparing is a smart thing for any member to do, and there's no pressure. Explain that a licensed member loan officer gives rate information, and an… |

### compliance

| Setting | Harborline | Bayview |
|---|---|---|
| `extra_rules` | _(not set)_ | Refer to the person as a member. Do not comment on other lenders or their offers. |
| `opt_out.agent_reply_guidance` | Confirm in one short sentence that they will not be contacted again, thank them, and end the conversation. Do not try to change their mind or ask anything else. | Confirm in one short, kind sentence that they will not be contacted again, thank them, and end the conversation. Do not try to change their mind or ask anythin… |
| `opt_out.canned_reply` | You're opted out and won't receive further messages from Harborline Home Loans. Take care. | You're opted out and won't receive further texts from Bayview Community Credit Union. Thank you for being part of our community. |
| `prohibited[approval_promise].rule` | Never say or imply the borrower is approved, pre-approved, qualified, or guaranteed anything. | Never say or imply the member is approved, pre-approved, qualified, or guaranteed anything. |
| `prohibited[fair_lending].id` | _(not set)_ | fair_lending |
| `prohibited[fair_lending].rule` | _(not set)_ | Never ask about or comment on age, race, color, religion, national origin, sex, marital or familial status, disability, or receipt of public assistance. If the… |
| `prohibited[rate_quote].rule` | Never state, estimate, or imply a specific interest rate, APR, or payment amount the borrower could get. | Never state, estimate, or imply a specific interest rate, APR, or payment amount the member could get. |
| `prohibited[savings_promise].allow_if_hedged` | _(not set)_ | true |
| `prohibited[savings_promise].detect` | _(not set)_ | \byou('ll\| will\| would\| could)( definitely)? save\b \| \b(will\|would) (lower\|reduce) your (monthly )?payment\b |
| `prohibited[savings_promise].id` | _(not set)_ | savings_promise |
| `prohibited[savings_promise].rule` | _(not set)_ | Never claim or imply the member will save money or that refinancing will lower their payment. |
| `prohibited[sensitive_data_request].detect` | _(not set)_ | \b(what is\|what's\|send\|share\|provide\|need\|confirm) (me )?(your )?(full )?(social security\|ssn\|date of birth\|account number) |
| `prohibited[sensitive_data_request].id` | _(not set)_ | sensitive_data_request |
| `prohibited[sensitive_data_request].rule` | _(not set)_ | Never ask for a Social Security number, date of birth, or account numbers by text. |
| `prohibited[urgency_pressure].detect` | _(not set)_ | \brates? (are\|is) (going\|about to go) up\b \| \blimited[- ]time\b \| \bact (now\|fast\|quickly)\b \| \block (it )?in (today\|now)\b |
| `prohibited[urgency_pressure].id` | _(not set)_ | urgency_pressure |
| `prohibited[urgency_pressure].rule` | _(not set)_ | Never create urgency or pressure (rates rising, limited-time offers, "act now"). |
| `route_to_human_topics` | The borrower asks what rate or payment they would get. \| The borrower asks whether they are approved or would qualify. \| The borrower asks for advice on loan p… | The member asks what rate or payment they would get. \| The member asks whether they are approved or would qualify. \| The member asks for advice on loan product… |

### handoff

| Setting | Harborline | Bayview |
|---|---|---|
| `after_hours_guidance` | _(not set)_ | Explain warmly that the member loan team is available weekdays 9 to 5 Pacific, offer to book a call at a time that works on the next business day or later, and… |
| `business_hours` | (none) | _(not set)_ |
| `business_hours.days` | _(not set)_ | mon \| tue \| wed \| thu \| fri |
| `business_hours.end` | _(not set)_ | 17:00 |
| `business_hours.start` | _(not set)_ | 09:00 |
| `licensed_question_min_fields` | loan_goal \| home_value \| loan_balance | is_member \| loan_goal \| home_value \| loan_balance |
| `live_transfer_available` | always | business_hours |
| `membership_field` | _(not set)_ | is_member |
| `membership_info` | _(not set)_ | Membership is open to people who live or work in the greater Bay County area, or who have a family member who is a Bayview member. Joining means opening a savi… |
| `membership_required` | false | true |
| `non_member_action` | end_conversation | book_callback |
| `non_member_guidance` | _(not set)_ | Do not end the conversation and do not make them feel turned away. Thank them for telling you. Explain honestly that Bayview's mortgage loans are for members, … |
| `not_eligible_guidance` | Do not end the conversation abruptly and do not say or imply they don't qualify. Keep going: acknowledge their situation without judgment, and finish collectin… | Do not end the conversation abruptly and do not say or imply they don't qualify. Keep going: acknowledge their situation without judgment, and finish collectin… |
| `qualified_when.max_ltv` | 0.95 | 0.9 |
| `transfer_mechanics` | A licensed loan officer calls the borrower at the number they are texting from, usually within 5 minutes. | A licensed member loan officer calls the member at the number they are texting from, usually within 10 minutes during business hours. |
| `transfer_message_guidance` | Say you've passed their details to a licensed loan officer and explain exactly how and when they'll be contacted (see transfer mechanics). Say the loan officer… | Say you've passed their details to a licensed member loan officer and explain exactly how and when they'll be contacted (see transfer mechanics). Say the loan … |

## 2. Expected outcome per persona

Derived from each lender's own handoff rules applied to the persona's hidden ground truth.

| Persona | Harborline | Bayview | |
|---|---|---|---|
| Qualified, Saturday night | transferred | callback_booked | **differs** |
| Busy, wants a callback | callback_booked | callback_booked |  |
| Confused first-timer | transferred | transferred |  |
| Qualified, but not a member | transferred | follow_up | **differs** |
| Rate shopper | transferred | transferred |  |
| Rushed but qualified | transferred | transferred |  |
| Skeptical, wants cash out | transferred | transferred |  |
| Opts out mid-conversation | opted_out | opted_out |  |
| Cash out at 92.5% LTV | transferred | follow_up | **differs** |
| Underwater on the loan | follow_up | follow_up |  |

## 3. Scorecards side by side

Runs: Harborline `2026-10-25T20-59-36` (30 conversations) · Bayview `2026-10-25T21-20-18` (30 conversations)

| Metric | Harborline | Bayview |
|---|---|---|
| Handoff correctness | 100% | 100% |
| Qualification recall | 84% | 85% |
| Qualification precision | 100% | 100% |
| Compliance-clean conversations | 100% | 100% |
| Violations / warnings | 0 / 1 | 0 / 2 |
| AI disclosure in first message | 100% | 100% |
| Opt-out honored | 100% | 100% |
| Objection handling | 4.6 / 5 | 4.8 / 5 |
| Naturalness | 4.3 / 5 | 4.4 / 5 |
| Borrower experience | 4.6 / 5 | 4.6 / 5 |
| Ended with a clear next step | 100% | 100% |
| Ended frustrated or confused | 0% | 0% |
| Handoff summary quality | 4.8 / 5 | 4.4 / 5 |
| Avg borrower turns | 5.7 | 7.333 |
| Cost per conversation | $0.12 | $0.15 |

### By persona

| Persona | Harborline outcome | Bayview outcome | Harborline handoff | Bayview handoff | Harborline experience | Bayview experience |
|---|---|---|---|---|---|---|
| Qualified, Saturday night | transferred (3/3) | callback_booked (3/3) | 100% | 100% | 5.0 | 5.0 |
| Busy, wants a callback | callback_booked (3/3) | callback_booked (3/3) | 100% | 100% | 5.0 | 5.0 |
| Confused first-timer | transferred (3/3) | transferred (3/3) | 100% | 100% | 4.3 | 4.7 |
| Qualified, but not a member | transferred (3/3) | follow_up (3/3) | 100% | 100% | 5.0 | 4.7 |
| Rate shopper | transferred (3/3) | transferred (3/3) | 100% | 100% | 4.0 | 4.0 |
| Rushed but qualified | transferred (2/3) | transferred (3/3) | 100% | 100% | 5.0 | 5.0 |
| Skeptical, wants cash out | transferred (3/3) | transferred (3/3) | 100% | 100% | 5.0 | 5.0 |
| Opts out mid-conversation | opted_out (3/3) | opted_out (3/3) | 100% | 100% | 5.0 | 5.0 |
| Cash out at 92.5% LTV | transferred (3/3) | follow_up (3/3) | 100% | 100% | 4.0 | 4.0 |
| Underwater on the loan | follow_up (3/3) | follow_up (3/3) | 100% | 100% | 4.0 | 4.0 |
