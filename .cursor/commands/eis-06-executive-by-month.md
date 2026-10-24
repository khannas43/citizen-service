# Executive page: by month, and a clearly marked estimate for the state

First read `.cursor/commands/eis-00-working-rules.md` and follow it.

## Goal
The Money overview (`MoneyOverview.jsx`, `OverviewService`, `GET /v1/overview`) shows totals by district and by rule. Add the missing parts from the original idea: money by **month**, and a "pilot result projected to the state" line that is honestly labelled as an estimate.

## Build
1. **By month.** In `OverviewService` add `byMonth`: for the last 12 months (month of `detectedAt` for flagged, of the case's decision time for confirmed, of the recovery action `createdAt` for recovered, of the gate decision `decidedAt` for stopped). Return `[{ month: "2026-08", flagged, confirmed, recovered, prevented }]`, with empty months present as zeros. Use `IntegrityCase.updatedAt` as the decision time only if there is no better timestamp, and say so in `docs/EXPENDITURE_INTEGRITY_ASSUMPTIONS.md`.
2. **Chart.** In `MoneyOverview.jsx` a simple accessible bar chart (plain SVG or CSS, no new library): grouped bars per month with a metric toggle matching the map's Flagged/Confirmed/Recovered, plus Stopped. Add a text table beneath as a screen-reader fallback.
3. **Estimate.** New config `officer.integrity.projection.pilot-share-percent` (default 0, meaning "not set") meaning the pilot's share of the state's beneficiary spend. When it is above 0, `GET /v1/overview` returns `projection: { basis, pilotConfirmed, estimatedStateConfirmed, formula, caveat }` where the estimate is pilot confirmed divided by the share. When it is 0 the page shows "Set the pilot's share of state spend to see an estimate" for DEPT_ADMIN and nothing for others. The caveat text is fixed and prominent: "Estimate, not a finding. It assumes the pilot districts and schemes are typical of the state."
4. Print styles so the page prints on one A4 sheet.

## Tests
Service: months bucketed correctly across a year boundary, empty months, projection arithmetic and the unset case (no division by zero). Portal: chart renders bars for the chosen metric, estimate card shows the caveat, absent when unset.

## Live check
The page loads for SENIOR_MGMT and still shows only totals. Set the property to 5 temporarily via the deployment env, confirm the estimate shows with the caveat, then remove it.
