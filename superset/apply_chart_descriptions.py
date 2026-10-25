#!/usr/bin/env python3
"""Apply chart descriptions for DG20 executive dashboards."""
from superset.app import create_app

CHART_DESCRIPTIONS = {
    # Dashboard 1 — Gujarat Welfare Pulse
    "Active Beneficiaries": (
        "Total number of citizens currently enrolled and receiving welfare benefits "
        "across all active schemes. The trendline shows week-over-week growth — a "
        "rising line means the platform is reaching more eligible citizens over time."
    ),
    "Families Registered": (
        "Total household records in the Gujarat Family Registry — the authoritative "
        "database used by the scheme engine to identify eligible beneficiaries. Each "
        "family contains complete demographic, income, and caste profiles for all members."
    ),
    "Avg Processing Time": (
        "Average number of days between a citizen being identified as eligible "
        "(system detection) and an officer confirming the beneficiary record. Lower is "
        "better. The platform SLA target is 3 days — this metric directly measures "
        "officer responsiveness."
    ),
    "Pending Confirmation": (
        "Beneficiaries the eligibility engine has identified but an officer has not "
        "yet reviewed. These citizens are eligible for a scheme but are not yet receiving "
        "benefits. High numbers here indicate a review backlog that needs field attention."
    ),
    "Geographic Coverage by District": (
        "Each rectangle represents one Gujarat district. Size is proportional to number "
        "of active beneficiaries — larger rectangle means more citizens covered. Smaller "
        "rectangles in less-served districts (e.g. Kutch, Dang) indicate gaps where "
        "field teams should focus outreach."
    ),
    "Beneficiaries by Scheme": (
        "Breakdown of all active beneficiaries across each welfare scheme running on "
        "the platform. Shows that Citizen Services is not a single-purpose system — it delivers "
        "Old Age Pension, OBC Scholarship, BPL Ration, Widow Pension, and other schemes "
        "simultaneously from one platform."
    ),
    "Beneficiary Pipeline": (
        "The four-stage lifecycle of every beneficiary: Identified (system-flagged as "
        "eligible) → Confirmed (officer-approved) → Active (receiving benefits) → "
        "Removed (exited scheme). The gap between Identified and Active is the efficiency "
        "story — a healthy platform shows most beneficiaries moving quickly to Active."
    ),
    "Caste Representation Across Schemes": (
        "Stacked bar showing how beneficiaries are distributed by caste category "
        "(SC, ST, OBC, NT, General) within each scheme. This is the equity audit — it "
        "verifies that schemes designed for specific communities are actually reaching "
        "those communities, and flags any unexpected demographic skew."
    ),
    "Processing Speed by Scheme": (
        "Trend of average officer confirmation time per scheme over the past 10 weeks. "
        "A downward slope means improving efficiency. A spike in a specific week may "
        "indicate a holiday, staff shortage, or system issue. Compare schemes against "
        "each other to identify which departments process faster."
    ),
    "Integrity Signal Summary": (
        "Count of beneficiaries where the platform's automated rules engine has detected "
        "a potential anomaly. MULTI_SCHEME_OVERLAP: same person enrolled in two incompatible "
        "schemes. AGE_ANOMALY: recorded age is implausible (>100 years). INCOME_CLIFF: "
        "family income is suspiciously close to the scheme's income ceiling. "
        "FAMILY_INCOME_MISMATCH: deceased member's income was counted in the total. These "
        "are flags for officer review — not automatic disqualifications."
    ),
    "Family Income Distribution": (
        "Histogram of annual family income across all confirmed beneficiaries, grouped in "
        "₹25,000 bands. The expected pattern for a well-targeted welfare system is a sharp "
        "spike in the ₹0–₹1L range. If significant counts appear above ₹2L, it may indicate "
        "eligibility criteria need tightening or fraud signals need review."
    ),
    # Dashboard 2 — Scheme Performance Intelligence
    "Total Identified": (
        "Number of citizens the eligibility engine has flagged as potentially eligible "
        "for the currently selected scheme. These citizens meet all rule criteria but "
        "are awaiting officer confirmation. Use the scheme selector at the top to change "
        "which scheme this reflects."
    ),
    "Total Active": (
        "Number of citizens currently confirmed and actively receiving benefits under the "
        "selected scheme. This is the headline outcome metric — the actual delivery count, "
        "not just pipeline or eligibility."
    ),
    "Avg Confirmation Time": (
        "Average days from scheme identification to officer confirmation for the selected "
        "scheme. Directly measures the speed of government service delivery for this "
        "specific scheme. Lower values indicate efficient review; values above 5 days "
        "warrant investigation into officer workload or documentation bottlenecks."
    ),
    "Scheme Penetration by District": (
        "Each rectangle is a Gujarat district. Size shows number of confirmed beneficiaries "
        "in that district for the selected scheme. When a specific scheme is selected, compare "
        "district sizes — a district with a small rectangle despite large population "
        "(e.g. Kutch for Old Age Pension) indicates low penetration where field mobilisation "
        "is needed."
    ),
    "Weekly Identification Trend": (
        "Bar chart showing how many new beneficiaries were identified each week by the "
        "eligibility engine. A healthy pattern shows steady or growing identification. A "
        "sudden drop may indicate a scheme rule change, data quality issue, or that "
        "saturation is being reached in covered areas."
    ),
    "Avg Days to Confirm by Scheme": (
        "Horizontal bar showing how long each scheme takes on average for officer "
        "confirmation. The vertical reference line marks the 3-day SLA. Schemes with bars "
        "extending past this line are breaching the commitment. This chart tells you exactly "
        "which department needs process intervention — not which officers, but which schemes."
    ),
    "Age Distribution": (
        "Distribution of beneficiary ages in 5–10 year bands for the selected scheme. The "
        "shape tells you whether the scheme is reaching its intended demographic. Old Age "
        "Pension should spike at 60–74. OBC Scholarship should spike at 15–24. Any bar in "
        "the 100+ band is a live AGE_ANOMALY fraud signal and should trigger immediate review."
    ),
    "Gender Distribution": (
        "Gender split of confirmed beneficiaries for the selected scheme. For gender-neutral "
        "schemes, expect roughly 40–60 M/F. For Widow Pension, this should be 100% Female — "
        "any male beneficiaries indicate a data entry or eligibility error."
    ),
    "Marital Status Split": (
        "Marital status breakdown of confirmed beneficiaries. For Widow Pension, this should "
        "be near-100% Widowed. For general schemes, a spread across Married/Single is expected. "
        "Deviations from scheme intent here are a data quality signal worth reviewing."
    ),
    "Top 10 Talukas": (
        "The ten sub-district areas (talukas) with the highest beneficiary counts for the "
        "selected scheme. These are the platform's highest-impact delivery zones. Use this "
        "to prioritise field officer presence, camp sites for document collection, and "
        "grievance redressal drives. Named talukas (e.g. Bavla, Deesa, Katargam) correspond "
        "to real communities in the family registry."
    ),
    "Income Band Distribution": (
        "Income histogram filtered to the selected scheme's beneficiaries. Confirms whether "
        "the scheme is reaching its intended income group. For BPL Ration Card, 95%+ should "
        "be below ₹1L. A spike near the scheme's income ceiling (e.g. ₹1.2L–₹1.5L for Old Age "
        "Pension) is the INCOME_CLIFF signal made visible at population level — worth reviewing "
        "those cases."
    ),
}


def main():
    app = create_app()
    with app.app_context():
        import json

        from superset import db
        from superset.models.slice import Slice

        session = db.session
        updated = 0
        missing = []

        for slice_name, description in CHART_DESCRIPTIONS.items():
            chart = session.query(Slice).filter_by(slice_name=slice_name).one_or_none()
            if not chart:
                missing.append(slice_name)
                continue
            chart.description = description
            updated += 1
            print(f"Updated: {slice_name}")

        session.commit()
        print(f"\nDone — {updated} chart descriptions applied.")
        if missing:
            print(f"Warning: {len(missing)} charts not found:")
            for name in missing:
                print(f"  - {name}")


def collapse_dashboard_descriptions():
    """Remove expanded description boxes — descriptions show on ℹ️ hover only."""
    app = create_app()
    with app.app_context():
        import json

        from superset import db
        from superset.models.dashboard import Dashboard

        session = db.session
        for slug in ("gujarat-welfare-pulse", "scheme-performance"):
            dash = session.query(Dashboard).filter_by(slug=slug).one_or_none()
            if not dash:
                continue
            metadata = json.loads(dash.json_metadata or "{}")
            metadata["expanded_slices"] = {}
            dash.json_metadata = json.dumps(metadata)
            print(f"Collapsed descriptions on dashboard: {slug}")
        session.commit()


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "--collapse-only":
        collapse_dashboard_descriptions()
    else:
        main()
        collapse_dashboard_descriptions()
