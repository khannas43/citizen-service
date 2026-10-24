from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.db import get_pool

router = APIRouter(prefix="/v1/analytics", tags=["AI-5 Dashboard Analytics"])


class DashboardAnalytics(BaseModel):
    kpis: list[dict[str, Any]]
    geoDistribution: list[dict[str, Any]]
    weeklyGrowth: list[dict[str, Any]]
    incomeBands: list[dict[str, Any]]
    ageBands: list[dict[str, Any]]
    casteBreakdown: list[dict[str, Any]]
    grievanceSummary: list[dict[str, Any]]
    grievanceCorrelation: list[dict[str, Any]]


async def _fetch(conn, query: str, args: list | tuple = ()) -> list[dict[str, Any]]:
    rows = await conn.fetch(query, *args)
    return [dict(r) for r in rows]


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    text = value.strip()
    if not text or text.upper() == "ALL":
        return None
    return text


def _beneficiary_filters(district: str | None, scheme_id: str | None, alias: str = "b") -> tuple[str, list[Any]]:
    args: list[Any] = []
    parts: list[str] = []
    if district:
        args.append(district)
        parts.append(
            f"LOWER(TRIM(COALESCE({alias}.family_district, ''))) = LOWER(TRIM(${len(args)}))"
        )
    if scheme_id:
        args.append(scheme_id)
        parts.append(f"{alias}.scheme_id = ${len(args)}::uuid")
    suffix = (" AND " + " AND ".join(parts)) if parts else ""
    return suffix, args


@router.get("/dashboard", response_model=DashboardAnalytics)
async def get_dashboard_analytics(
    district: str | None = Query(None),
    schemeId: str | None = Query(None),
):
    district = _clean(district)
    scheme_id = _clean(schemeId)
    if scheme_id:
        try:
            UUID(scheme_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid schemeId") from exc

    ben_sql, ben_args = _beneficiary_filters(district, scheme_id)
    pool = await get_pool()
    async with pool.acquire() as conn:
        kpis = await _kpi_rows(conn, district, scheme_id, ben_sql, ben_args)
        geo = await _fetch(
            conn,
            "SELECT COALESCE(b.family_district, 'Unknown') AS district, "
            "COALESCE(b.family_taluka, 'Unknown') AS taluka, "
            "b.status, COUNT(*)::bigint AS beneficiary_count "
            "FROM scheme_engine.beneficiary b "
            f"WHERE 1=1{ben_sql} "
            "GROUP BY 1, 2, 3",
            ben_args,
        )
        weekly = await _fetch(
            conn,
            "WITH weekly AS ("
            "  SELECT DATE_TRUNC('week', b.identified_at)::date AS week_start, "
            "         b.scheme_id, COUNT(*) AS newly_identified "
            "  FROM scheme_engine.beneficiary b "
            "  WHERE b.identified_at >= CURRENT_DATE - INTERVAL '12 weeks' "
            f"    AND b.status <> 'REMOVED'{ben_sql} "
            "  GROUP BY 1, 2"
            ") "
            "SELECT week_start, scheme_id, newly_identified, "
            "SUM(newly_identified) OVER ("
            "  PARTITION BY scheme_id ORDER BY week_start "
            "  ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW"
            ") AS cumulative_total "
            "FROM weekly ORDER BY week_start",
            ben_args,
        )
        income = await _fetch(
            conn,
            "SELECT s.name AS scheme_name, COALESCE(b.status, 'UNKNOWN') AS status, "
            "CASE "
            "  WHEN p.annual_income IS NULL THEN 'Unknown' "
            "  WHEN p.annual_income = 0 THEN '₹0' "
            "  WHEN p.annual_income <= 25000 THEN '₹1–25k' "
            "  WHEN p.annual_income <= 50000 THEN '₹25–50k' "
            "  WHEN p.annual_income <= 75000 THEN '₹50–75k' "
            "  WHEN p.annual_income <= 100000 THEN '₹75k–1L' "
            "  WHEN p.annual_income <= 150000 THEN '₹1L–1.5L' "
            "  WHEN p.annual_income <= 200000 THEN '₹1.5L–2L' "
            "  WHEN p.annual_income <= 300000 THEN '₹2L–3L' "
            "  WHEN p.annual_income <= 500000 THEN '₹3L–5L' "
            "  ELSE '₹5L+' END AS income_band, "
            "CASE "
            "  WHEN p.annual_income IS NULL THEN 0 "
            "  WHEN p.annual_income = 0 THEN 0 "
            "  WHEN p.annual_income <= 25000 THEN 1 "
            "  WHEN p.annual_income <= 50000 THEN 2 "
            "  WHEN p.annual_income <= 75000 THEN 3 "
            "  WHEN p.annual_income <= 100000 THEN 4 "
            "  WHEN p.annual_income <= 150000 THEN 5 "
            "  WHEN p.annual_income <= 200000 THEN 6 "
            "  WHEN p.annual_income <= 300000 THEN 7 "
            "  WHEN p.annual_income <= 500000 THEN 8 "
            "  ELSE 9 END AS band_order, "
            "COUNT(*)::bigint AS beneficiary_count "
            "FROM scheme_engine.beneficiary b "
            "JOIN family_registry.person p ON p.id::text = b.person_id "
            "JOIN scheme_engine.scheme s ON s.id = b.scheme_id "
            f"WHERE b.status <> 'REMOVED'{ben_sql} "
            "GROUP BY 1, 2, 3, 4 ORDER BY band_order",
            ben_args,
        )
        age = await _fetch(
            conn,
            "SELECT s.name AS scheme_name, "
            "CASE "
            "  WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.dob)) < 5 THEN '0–4' "
            "  WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.dob)) < 15 THEN '5–14' "
            "  WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.dob)) < 25 THEN '15–24' "
            "  WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.dob)) < 35 THEN '25–34' "
            "  WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.dob)) < 45 THEN '35–44' "
            "  WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.dob)) < 55 THEN '45–54' "
            "  WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.dob)) < 65 THEN '55–64' "
            "  WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.dob)) < 75 THEN '65–74' "
            "  WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.dob)) < 100 THEN '75–99' "
            "  ELSE '100+' END AS age_band, "
            "CASE "
            "  WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.dob)) < 5 THEN 1 "
            "  WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.dob)) < 15 THEN 2 "
            "  WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.dob)) < 25 THEN 3 "
            "  WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.dob)) < 35 THEN 4 "
            "  WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.dob)) < 45 THEN 5 "
            "  WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.dob)) < 55 THEN 6 "
            "  WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.dob)) < 65 THEN 7 "
            "  WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.dob)) < 75 THEN 8 "
            "  WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.dob)) < 100 THEN 9 "
            "  ELSE 10 END AS band_order, "
            "COUNT(*)::bigint AS beneficiary_count "
            "FROM scheme_engine.beneficiary b "
            "JOIN scheme_engine.scheme s ON s.id = b.scheme_id "
            "JOIN family_registry.person p ON p.id::text = b.person_id "
            "WHERE b.status IN ('CONFIRMED', 'ACTIVE', 'IDENTIFIED') "
            f"  AND p.dob IS NOT NULL{ben_sql} "
            "GROUP BY 1, 2, 3 ORDER BY band_order",
            ben_args,
        )
        caste = await _fetch(
            conn,
            "SELECT s.name AS scheme_name, COALESCE(b.caste_category, 'Unknown') AS caste_category, "
            "COUNT(*)::bigint AS beneficiary_count "
            "FROM scheme_engine.beneficiary b "
            "JOIN scheme_engine.scheme s ON s.id = b.scheme_id "
            "WHERE b.status IN ('CONFIRMED', 'ACTIVE', 'IDENTIFIED')"
            f"{ben_sql} "
            "GROUP BY 1, 2",
            ben_args,
        )
        grievance = await _grievance_summary(conn, district)
        correlation = await _grievance_correlation(conn, district, scheme_id, ben_sql, ben_args)

    return DashboardAnalytics(
        kpis=kpis,
        geoDistribution=geo,
        weeklyGrowth=weekly,
        incomeBands=income,
        ageBands=age,
        casteBreakdown=caste,
        grievanceSummary=grievance,
        grievanceCorrelation=correlation,
    )


async def _kpi_rows(conn, district: str | None, scheme_id: str | None, ben_sql: str, ben_args: list[Any]):
    active = await _fetch(
        conn,
        "SELECT 'Active Beneficiaries' AS kpi_name, COUNT(*)::numeric AS kpi_value "
        "FROM scheme_engine.beneficiary b "
        f"WHERE b.status <> 'REMOVED'{ben_sql}",
        ben_args,
    )
    if scheme_id:
        families = await _fetch(
            conn,
            "SELECT 'Families Registered' AS kpi_name, COUNT(DISTINCT b.family_id)::numeric AS kpi_value "
            "FROM scheme_engine.beneficiary b "
            f"WHERE b.status <> 'REMOVED'{ben_sql}",
            ben_args,
        )
    elif district:
        families = await _fetch(
            conn,
            "SELECT 'Families Registered' AS kpi_name, COUNT(*)::numeric AS kpi_value "
            "FROM family_registry.family f "
            "WHERE LOWER(TRIM(COALESCE(f.district, ''))) = LOWER(TRIM($1))",
            [district],
        )
    else:
        families = await _fetch(
            conn,
            "SELECT 'Families Registered' AS kpi_name, COUNT(*)::numeric AS kpi_value "
            "FROM family_registry.family",
        )
    pending = await _fetch(
        conn,
        "SELECT 'Pending Confirmation' AS kpi_name, COUNT(*)::numeric AS kpi_value "
        "FROM scheme_engine.beneficiary b "
        f"WHERE b.status = 'IDENTIFIED'{ben_sql}",
        ben_args,
    )
    identified = [
        {"kpi_name": "Total Identified", "kpi_value": pending[0]["kpi_value"] if pending else 0}
    ]
    total_active = [
        {"kpi_name": "Total Active", "kpi_value": active[0]["kpi_value"] if active else 0}
    ]
    return active + families + pending + identified + total_active


async def _grievance_summary(conn, district: str | None):
    if not district:
        return await _fetch(
            conn,
            "SELECT status, category, priority, grievance_count "
            "FROM analytics.grievance_summary",
        )
    return await _fetch(
        conn,
        "SELECT COALESCE(g.status, 'UNKNOWN') AS status, "
        "COALESCE(g.category, 'General') AS category, "
        "COALESCE(g.priority, 'MEDIUM') AS priority, "
        "COUNT(*)::bigint AS grievance_count "
        "FROM grievance.grievance g "
        "JOIN family_registry.person p ON p.aadhaar_ref = g.aadhaar_ref "
        "JOIN family_registry.family_member fm ON fm.person_id = p.id "
        "JOIN family_registry.family f ON f.id = fm.family_id "
        "WHERE LOWER(TRIM(COALESCE(f.district, ''))) = LOWER(TRIM($1)) "
        "GROUP BY 1, 2, 3",
        [district],
    )


async def _grievance_correlation(
    conn, district: str | None, scheme_id: str | None, ben_sql: str, ben_args: list[Any]
):
    g_where = ""
    g_args: list[Any] = []
    if district:
        g_args.append(district)
        g_where = "WHERE LOWER(TRIM(COALESCE(f.district, ''))) = LOWER(TRIM($1))"
    ben_offset = len(g_args)
    remapped_ben_sql = ben_sql
    if ben_offset:
        for idx in range(len(ben_args), 0, -1):
            remapped_ben_sql = remapped_ben_sql.replace(f"${idx}", f"${idx + ben_offset}")
    return await _fetch(
        conn,
        "WITH grievance_by_district AS ("
        "  SELECT COALESCE(f.district, 'Unknown') AS district, COUNT(*)::bigint AS grievance_count "
        "  FROM grievance.grievance g "
        "  JOIN family_registry.person p ON p.aadhaar_ref = g.aadhaar_ref "
        "  JOIN family_registry.family_member fm ON fm.person_id = p.id "
        "  JOIN family_registry.family f ON f.id = fm.family_id "
        f"  {g_where} "
        "  GROUP BY 1"
        "), beneficiary_by_district AS ("
        "  SELECT COALESCE(b.family_district, 'Unknown') AS district, COUNT(*)::bigint AS beneficiary_count "
        "  FROM scheme_engine.beneficiary b "
        f"  WHERE b.status <> 'REMOVED'{remapped_ben_sql} "
        "  GROUP BY 1"
        ") "
        "SELECT COALESCE(g.district, b.district) AS district, "
        "COALESCE(g.grievance_count, 0) AS grievance_count, "
        "COALESCE(b.beneficiary_count, 0) AS beneficiary_count, "
        "ROUND(COALESCE(g.grievance_count, 0) * 1000.0 / NULLIF(COALESCE(b.beneficiary_count, 0), 0), 2) "
        "  AS grievances_per_1000_beneficiaries "
        "FROM grievance_by_district g "
        "FULL OUTER JOIN beneficiary_by_district b ON b.district = g.district "
        "ORDER BY grievances_per_1000_beneficiaries DESC NULLS LAST",
        g_args + ben_args,
    )
