# "Work on these first": rank the inbox by expected recovery

First read `.cursor/commands/eis-00-working-rules.md` and follow it.

## Goal
Help officers start with the cases most worth their time, and say why. The ranking is a simple, explainable score, not a model: **expected recovery = amount at stake x that rule's precision**, where precision is the share of ruled-on alerts for that check that turned out to be real overpayments (already computed per rule by `OverviewService.ruleHealth`, `precisionPercent`).

## Build
1. **Score** (`PriorityService`): for each open alert, `score = amountDelta x precision`. Where a rule has fewer than 10 rulings (`enoughEvidence` false) or no precision, use the overall precision across all rules, and mark the score as "estimated". Alerts with no amount (for example 805, S06) get a small fixed weight (configurable `officer.integrity.priority.no-amount-weight`, default 5000) so they are not invisible. Add a tie-break on severity then age.
2. **API:** add `priority` and `priorityReason` (for example "Likely ₹7,200 recoverable: ₹10,000 at stake, this check is confirmed 72% of the time") to the alert list response (`GET /v1/alerts`), computed server-side, same domain read rules. No change to what an alert is.
3. **Portal** (`ExpenditureIntegrity.jsx`): a "Work on these first" sort option (the default sort stays as is), a "Priority" column showing the expected rupee figure and a small bar, the reason as a tooltip, and a banner above the inbox listing the top three with a click-through. Keep the existing search, sort and paging behaviour and the 162 portal tests green.
4. Document the formula in `docs/EXPENDITURE_INTEGRITY_ASSUMPTIONS.md` in two sentences, including that it is a heuristic that improves as more cases are ruled on.

## Tests
Score arithmetic, the fallback to overall precision, alerts without an amount, ordering and tie-breaks, SENIOR_MGMT still 403 on alerts, portal sort and tooltip.

## Live check
Open the beneficiary inbox, switch to "Work on these first", and confirm the top rows are the large 802 and 803 cases and that each reason sentence is accurate against the Rule health table.
