#!/usr/bin/env python3
"""Seed DG20 warehouse, analytics datasets, executive dashboards, and Public role access."""
import json
import os
import uuid

from superset.app import create_app

EGOV_URI = (
    f"postgresql+psycopg2://{os.environ.get('EGOV_DB_USER', os.environ['DB_USER'])}:"
    f"{os.environ.get('EGOV_DB_PASS', os.environ['DB_PASS'])}"
    f"@postgres.citizen.svc.cluster.local:5432/citizen_db"
)

VIEWS = [
    "beneficiary_by_status",
    "beneficiary_by_district",
    "scheme_enrollment",
    "beneficiary_caste_gender",
    "auto_removals",
    "grievance_summary",
    "family_by_district",
    "platform_snapshot",
    "platform_kpis",
    "processing_kpi",
    "beneficiary_growth_weekly",
    "beneficiary_income_bands",
    "fraud_signal_summary",
    "scheme_caste_breakdown",
    "processing_time_weekly",
    "beneficiary_age_bands",
    "beneficiary_gender_marital",
    "scheme_district_penetration",
    "scheme_taluka_top",
]

WELFARE_TITLE = "Gujarat Welfare Pulse"
WELFARE_SLUG = "gujarat-welfare-pulse"
SCHEME_TITLE = "Scheme Performance Intelligence"
SCHEME_SLUG = "scheme-performance"

PUBLIC_PERMISSIONS = [
    ("Dashboard", "can_read"),
    ("Chart", "can_read"),
    ("Dataset", "can_read"),
    ("Database", "can_read"),
    ("Superset", "can_explore_json"),
    ("TableSchemaView", "can_get_or_create_table"),
]

EXEC_COLOR_SCHEME = (
    '["#FF6B00", "#1B3C74", "#2E8B57", "#E63946", "#FFB703", "#8338EC", "#3A86FF", "#06D6A0"]'
)


def sum_metric(column="beneficiary_count", label="Count"):
    return {
        "expressionType": "SIMPLE",
        "column": {"column_name": column},
        "aggregate": "SUM",
        "label": label,
    }


def max_metric(column, label):
    return {
        "expressionType": "SIMPLE",
        "column": {"column_name": column},
        "aggregate": "MAX",
        "label": label,
    }


def avg_metric(column, label):
    return {
        "expressionType": "SIMPLE",
        "column": {"column_name": column},
        "aggregate": "AVG",
        "label": label,
    }


def ensure_database(session, Database):
    db = session.query(Database).filter_by(database_name="DG20 eGov Warehouse").one_or_none()
    if db:
        return db
    db = Database(
        database_name="DG20 eGov Warehouse",
        sqlalchemy_uri=EGOV_URI,
        expose_in_sqllab=True,
        allow_run_async=True,
        allow_ctas=False,
        allow_cvas=False,
        allow_dml=False,
    )
    session.add(db)
    session.commit()
    print("Created warehouse database connection")
    return db


def ensure_dataset(session, SqlaTable, database, table_name, schema="analytics"):
    full_name = f"{schema}.{table_name}"
    ds = (
        session.query(SqlaTable)
        .filter_by(database_id=database.id, schema=schema, table_name=table_name)
        .one_or_none()
    )
    if ds:
        try:
            ds.fetch_metadata()
            session.commit()
        except Exception as exc:  # noqa: BLE001
            print(f"Warning: metadata refresh for {full_name}: {exc}")
        return ds
    ds = SqlaTable(
        table_name=table_name,
        schema=schema,
        database_id=database.id,
        owners=[],
    )
    session.add(ds)
    session.commit()
    try:
        ds.fetch_metadata()
        session.commit()
    except Exception as exc:  # noqa: BLE001
        print(f"Warning: metadata fetch for {full_name}: {exc}")
    print(f"Registered dataset {full_name}")
    return ds


def chart_params_viz(viz_type, datasource_id, datasource_type, **extra):
    params = {"viz_type": viz_type, "datasource": f"{datasource_id}__{datasource_type}", **extra}
    return json.dumps(params)


def kpi_dist_bar(datasource_id, kpi_name):
    return chart_params_viz(
        "dist_bar",
        datasource_id,
        "table",
        groupby=["kpi_name"],
        metrics=[sum_metric("kpi_value", "Value")],
        adhoc_filters=[
            {
                "clause": "WHERE",
                "expressionType": "SIMPLE",
                "subject": "kpi_name",
                "operator": "==",
                "comparator": kpi_name,
            }
        ],
        row_limit=5,
        order_desc=False,
    )


def kpi_big_number(datasource_id, kpi_name, unit=None):
    extra = {"subheader": unit} if unit else {}
    return chart_params_viz(
        "big_number_total",
        datasource_id,
        "table",
        metric=sum_metric("kpi_value", "Value"),
        adhoc_filters=[
            {
                "clause": "WHERE",
                "expressionType": "SIMPLE",
                "subject": "kpi_name",
                "operator": "==",
                "comparator": kpi_name,
            }
        ],
        header_font_size=0.4,
        subheader_font_size=0.15,
        y_axis_format="SMART_NUMBER",
        **extra,
    )


def ensure_chart(session, Slice, dataset, viz_type, slice_name, params_json, *, update=False):
    chart = session.query(Slice).filter_by(slice_name=slice_name).one_or_none()
    if chart:
        if update:
            chart.viz_type = viz_type
            chart.datasource_type = "table"
            chart.datasource_id = dataset.id
            chart.params = params_json
            session.commit()
            print(f"Updated chart: {slice_name}")
        return chart
    chart = Slice(
        slice_name=slice_name,
        viz_type=viz_type,
        datasource_type="table",
        datasource_id=dataset.id,
        params=params_json,
        query_context=None,
    )
    session.add(chart)
    session.commit()
    print(f"Created chart: {slice_name}")
    return chart


def build_position_json(title, rows):
    position = {
        "DASHBOARD_VERSION_KEY": "v2",
        "ROOT_ID": {"type": "ROOT", "id": "ROOT_ID", "children": ["GRID_ID"]},
        "GRID_ID": {"type": "GRID", "id": "GRID_ID", "children": [], "parents": ["ROOT_ID"]},
        "HEADER_ID": {"type": "HEADER", "id": "HEADER_ID", "meta": {"text": title}},
    }
    row_ids = []
    for row_idx, row in enumerate(rows):
        row_id = f"ROW-{row_idx}"
        col_ids = []
        for col_idx, (chart, width, height) in enumerate(row):
            col_id = f"CHART-{chart.id}-{row_idx}-{col_idx}"
            col_ids.append(col_id)
            position[col_id] = {
                "type": "CHART",
                "id": col_id,
                "children": [],
                "parents": [row_id],
                "meta": {
                    "width": width,
                    "height": height,
                    "chartId": chart.id,
                    "sliceName": chart.slice_name,
                },
            }
        position[row_id] = {
            "type": "ROW",
            "id": row_id,
            "children": col_ids,
            "parents": ["GRID_ID"],
            "meta": {"background": "BACKGROUND_TRANSPARENT"},
        }
        row_ids.append(row_id)
    position["GRID_ID"]["children"] = row_ids
    return json.dumps(position)


def dashboard_metadata():
    return json.dumps(
        {
            "timed_refresh_immune_slices": [],
            "expanded_slices": {},
            "refresh_frequency": 0,
            "color_scheme": "supersetColors",
            "label_colors": {},
        }
    )


def ensure_dashboard(session, Dashboard, *, title, slug, charts, layout_rows):
    position_json = build_position_json(title, layout_rows)
    metadata = dashboard_metadata()
    dash = session.query(Dashboard).filter_by(slug=slug).one_or_none()
    if dash:
        dash.dashboard_title = title
        dash.published = True
        dash.slices = charts
        dash.position_json = position_json
        dash.json_metadata = metadata
        session.commit()
        print(f"Updated dashboard: {title}")
        return dash
    dash = Dashboard(
        dashboard_title=title,
        slug=slug,
        published=True,
        position_json=position_json,
        json_metadata=metadata,
        slices=charts,
    )
    session.add(dash)
    session.commit()
    print(f"Created dashboard: {title}")
    return dash


def grant_public_data_access(session, database, datasets):
    from flask_appbuilder.security.sqla.models import Role
    from superset.extensions import appbuilder

    public = session.query(Role).filter_by(name="Public").one_or_none()
    if not public:
        print("Warning: Public role not found for data access grants")
        return

    sm = appbuilder.sm
    added = 0
    sm.merge_perm("database_access", database.perm)
    db_pv = sm.find_permission_view_menu("database_access", database.perm)
    if db_pv and db_pv not in public.permissions:
        public.permissions.append(db_pv)
        added += 1

    for ds in datasets.values():
        sm.merge_perm("datasource_access", ds.perm)
        ds_pv = sm.find_permission_view_menu("datasource_access", ds.perm)
        if ds_pv and ds_pv not in public.permissions:
            public.permissions.append(ds_pv)
            added += 1

    session.commit()
    print(f"Public role: granted warehouse database + {len(datasets)} dataset permissions ({added} newly added)")


def ensure_public_role_permissions(session):
    from flask_appbuilder.security.sqla.models import Permission, PermissionView, Role, ViewMenu

    role = session.query(Role).filter_by(name="Public").one_or_none()
    if not role:
        print("Warning: Public role not found")
        return

    added = 0
    for view_name, perm_name in PUBLIC_PERMISSIONS:
        pv = (
            session.query(PermissionView)
            .join(ViewMenu, PermissionView.view_menu_id == ViewMenu.id)
            .join(Permission, PermissionView.permission_id == Permission.id)
            .filter(ViewMenu.name == view_name, Permission.name == perm_name)
            .one_or_none()
        )
        if pv and pv not in role.permissions:
            role.permissions.append(pv)
            added += 1
    session.commit()
    print(f"Public role: ensured {len(PUBLIC_PERMISSIONS)} permissions ({added} newly added)")


def grant_public_dashboard_access(session, Dashboard, slug):
    from flask_appbuilder.security.sqla.models import Role

    dash = session.query(Dashboard).filter_by(slug=slug).one_or_none()
    if not dash:
        return
    dash.published = True
    public = session.query(Role).filter_by(name="Public").one_or_none()
    if public:
        existing = {r.id for r in (dash.roles or [])}
        if public.id not in existing:
            dash.roles = list(dash.roles or []) + [public]
    session.commit()
    print(f"Granted Public role access to {slug}")


def ensure_embedded_dashboard(session, Dashboard, slug, allow_domains=None):
    from superset.models.embedded_dashboard import EmbeddedDashboard

    if allow_domains is None:
        origins = os.environ.get(
            "OFFICER_PORTAL_ORIGINS",
            "http://localhost:31173,http://127.0.0.1:31173",
        )
        allow_domains = origins

    dash = session.query(Dashboard).filter_by(slug=slug).one_or_none()
    if not dash:
        return None
    emb = (
        session.query(EmbeddedDashboard)
        .filter_by(dashboard_id=dash.id)
        .one_or_none()
    )
    if not emb:
        emb = EmbeddedDashboard(
            dashboard_id=dash.id,
            uuid=uuid.uuid4(),
            allow_domain_list=allow_domains,
        )
        session.add(emb)
        session.commit()
        print(f"Created embedded dashboard for {slug}: {emb.uuid}")
    else:
        emb.allow_domain_list = allow_domains
        session.commit()
        print(f"Updated embedded dashboard domains for {slug}: {allow_domains}")
    return emb


def build_welfare_pulse_charts(session, Slice, ds):
    kpis = ds["platform_kpis"]
    proc_kpi = ds["processing_kpi"]
    growth = ds["beneficiary_growth_weekly"]
    proc = ds["processing_time_weekly"]
    district = ds["beneficiary_by_district"]
    enroll = ds["scheme_enrollment"]
    status = ds["beneficiary_by_status"]
    caste = ds["scheme_caste_breakdown"]
    fraud = ds["fraud_signal_summary"]
    income = ds["beneficiary_income_bands"]

    charts = [
        ensure_chart(
            session,
            Slice,
            kpis,
            "big_number_total",
            "Active Beneficiaries",
            kpi_big_number(kpis.id, "Active Beneficiaries"),
            update=True,
        ),
        ensure_chart(
            session,
            Slice,
            kpis,
            "big_number_total",
            "Families Registered",
            kpi_big_number(kpis.id, "Families Registered"),
            update=True,
        ),
        ensure_chart(
            session,
            Slice,
            proc_kpi,
            "big_number_total",
            "Avg Processing Time",
            kpi_big_number(proc_kpi.id, "Avg Processing Days", unit="days"),
            update=True,
        ),
        ensure_chart(
            session,
            Slice,
            kpis,
            "big_number_total",
            "Pending Confirmation",
            kpi_big_number(kpis.id, "Pending Confirmation"),
            update=True,
        ),
        ensure_chart(
            session,
            Slice,
            district,
            "dist_bar",
            "Geographic Coverage by District",
            chart_params_viz(
                "dist_bar",
                district.id,
                "table",
                groupby=["district"],
                metrics=[sum_metric("beneficiary_count", "Beneficiaries")],
                order_desc=True,
                row_limit=40,
            ),
            update=True,
        ),
        ensure_chart(
            session,
            Slice,
            enroll,
            "dist_bar",
            "Beneficiaries by Scheme",
            chart_params_viz(
                "dist_bar",
                enroll.id,
                "table",
                groupby=["scheme_name"],
                metrics=[sum_metric("beneficiary_count", "Beneficiaries")],
                order_desc=True,
                row_limit=25,
            ),
            update=True,
        ),
        ensure_chart(
            session,
            Slice,
            status,
            "dist_bar",
            "Beneficiary Pipeline",
            chart_params_viz(
                "dist_bar",
                status.id,
                "table",
                groupby=["status"],
                metrics=[sum_metric("beneficiary_count", "Count")],
                order_by_cols=["pipeline_order"],
                order_desc=False,
                row_limit=10,
            ),
            update=True,
        ),
        ensure_chart(
            session,
            Slice,
            caste,
            "dist_bar",
            "Caste Representation Across Schemes",
            chart_params_viz(
                "dist_bar",
                caste.id,
                "table",
                groupby=["scheme_name"],
                metrics=[sum_metric("beneficiary_count", "Beneficiaries")],
                columns=["caste_category"],
                row_limit=50,
            ),
            update=True,
        ),
        ensure_chart(
            session,
            Slice,
            proc,
            "dist_bar",
            "Processing Speed by Scheme",
            chart_params_viz(
                "dist_bar",
                proc.id,
                "table",
                groupby=["week_start"],
                metrics=[avg_metric("avg_days_to_confirm", "Days to Confirm")],
                columns=["scheme_name"],
                row_limit=100,
            ),
            update=True,
        ),
        ensure_chart(
            session,
            Slice,
            fraud,
            "dist_bar",
            "Integrity Signal Summary",
            chart_params_viz(
                "dist_bar",
                fraud.id,
                "table",
                groupby=["signal_type"],
                metrics=[sum_metric("signal_count", "Signals")],
                order_by_cols=["sort_order"],
                order_desc=False,
                row_limit=10,
            ),
            update=True,
        ),
        ensure_chart(
            session,
            Slice,
            income,
            "dist_bar",
            "Family Income Distribution",
            chart_params_viz(
                "dist_bar",
                income.id,
                "table",
                groupby=["income_band"],
                metrics=[sum_metric("beneficiary_count", "Beneficiaries")],
                order_by_cols=["band_order"],
                order_desc=False,
                row_limit=20,
            ),
            update=True,
        ),
    ]
    return charts


def build_scheme_performance_charts(session, Slice, ds):
    kpis = ds["platform_kpis"]
    proc_kpi = ds["processing_kpi"]
    enroll = ds["scheme_enrollment"]
    proc = ds["processing_time_weekly"]
    penetration = ds["scheme_district_penetration"]
    growth = ds["beneficiary_growth_weekly"]
    age = ds["beneficiary_age_bands"]
    gender = ds["beneficiary_gender_marital"]
    taluka = ds["scheme_taluka_top"]
    income = ds["beneficiary_income_bands"]

    charts = [
        ensure_chart(
            session,
            Slice,
            kpis,
            "big_number_total",
            "Total Identified",
            kpi_big_number(kpis.id, "Total Identified"),
            update=True,
        ),
        ensure_chart(
            session,
            Slice,
            kpis,
            "big_number_total",
            "Total Active",
            kpi_big_number(kpis.id, "Total Active"),
            update=True,
        ),
        ensure_chart(
            session,
            Slice,
            proc_kpi,
            "big_number_total",
            "Avg Confirmation Time",
            kpi_big_number(proc_kpi.id, "Avg Processing Days", unit="days"),
            update=True,
        ),
        ensure_chart(
            session,
            Slice,
            penetration,
            "dist_bar",
            "Scheme Penetration by District",
            chart_params_viz(
                "dist_bar",
                penetration.id,
                "table",
                groupby=["district"],
                metrics=[sum_metric("beneficiary_count", "Beneficiaries")],
                order_desc=True,
                row_limit=40,
            ),
            update=True,
        ),
        ensure_chart(
            session,
            Slice,
            growth,
            "dist_bar",
            "Weekly Identification Trend",
            chart_params_viz(
                "dist_bar",
                growth.id,
                "table",
                groupby=["week_start"],
                metrics=[sum_metric("newly_identified", "Newly Identified")],
                row_limit=20,
            ),
            update=True,
        ),
        ensure_chart(
            session,
            Slice,
            proc,
            "dist_bar",
            "Avg Days to Confirm by Scheme",
            chart_params_viz(
                "dist_bar",
                proc.id,
                "table",
                groupby=["scheme_name"],
                metrics=[avg_metric("avg_days_to_confirm", "Avg Days")],
                order_desc=True,
                row_limit=25,
            ),
            update=True,
        ),
        ensure_chart(
            session,
            Slice,
            age,
            "dist_bar",
            "Age Distribution",
            chart_params_viz(
                "dist_bar",
                age.id,
                "table",
                groupby=["age_band"],
                metrics=[sum_metric("beneficiary_count", "Beneficiaries")],
                columns=["scheme_name"],
                order_by_cols=["band_order"],
                order_desc=False,
                row_limit=100,
            ),
            update=True,
        ),
        ensure_chart(
            session,
            Slice,
            gender,
            "dist_bar",
            "Gender Distribution",
            chart_params_viz(
                "dist_bar",
                gender.id,
                "table",
                groupby=["gender"],
                metrics=[sum_metric("beneficiary_count", "Beneficiaries")],
                row_limit=10,
            ),
            update=True,
        ),
        ensure_chart(
            session,
            Slice,
            gender,
            "dist_bar",
            "Marital Status Split",
            chart_params_viz(
                "dist_bar",
                gender.id,
                "table",
                groupby=["marital_status"],
                metrics=[sum_metric("beneficiary_count", "Beneficiaries")],
                row_limit=10,
            ),
            update=True,
        ),
        ensure_chart(
            session,
            Slice,
            taluka,
            "dist_bar",
            "Top 10 Talukas",
            chart_params_viz(
                "dist_bar",
                taluka.id,
                "table",
                groupby=["taluka"],
                metrics=[sum_metric("beneficiary_count", "Beneficiaries")],
                order_desc=True,
                row_limit=10,
            ),
            update=True,
        ),
        ensure_chart(
            session,
            Slice,
            income,
            "dist_bar",
            "Income Band Distribution",
            chart_params_viz(
                "dist_bar",
                income.id,
                "table",
                groupby=["income_band"],
                metrics=[sum_metric("beneficiary_count", "Beneficiaries")],
                order_by_cols=["band_order"],
                order_desc=False,
                row_limit=20,
            ),
            update=True,
        ),
    ]
    return charts


def main():
    app = create_app()
    with app.app_context():
        from superset import db
        from superset.connectors.sqla.models import SqlaTable
        from superset.models.core import Database
        from superset.models.dashboard import Dashboard
        from superset.models.slice import Slice

        session = db.session
        ensure_public_role_permissions(session)

        warehouse = ensure_database(session, Database)
        datasets = {name: ensure_dataset(session, SqlaTable, warehouse, name) for name in VIEWS}
        grant_public_data_access(session, warehouse, datasets)

        welfare_charts = build_welfare_pulse_charts(session, Slice, datasets)
        ensure_dashboard(
            session,
            Dashboard,
            title=WELFARE_TITLE,
            slug=WELFARE_SLUG,
            charts=welfare_charts,
            layout_rows=[
                [(welfare_charts[0], 3, 22), (welfare_charts[1], 3, 22), (welfare_charts[2], 3, 22), (welfare_charts[3], 3, 22)],
                [(welfare_charts[4], 12, 55)],
                [(welfare_charts[5], 6, 50), (welfare_charts[6], 6, 50)],
                [(welfare_charts[7], 6, 50), (welfare_charts[8], 6, 50)],
                [(welfare_charts[9], 5, 50), (welfare_charts[10], 7, 50)],
            ],
        )
        grant_public_dashboard_access(session, Dashboard, WELFARE_SLUG)
        ensure_embedded_dashboard(session, Dashboard, WELFARE_SLUG)

        scheme_charts = build_scheme_performance_charts(session, Slice, datasets)
        ensure_dashboard(
            session,
            Dashboard,
            title=SCHEME_TITLE,
            slug=SCHEME_SLUG,
            charts=scheme_charts,
            layout_rows=[
                [(scheme_charts[0], 4, 22), (scheme_charts[1], 4, 22), (scheme_charts[2], 4, 22)],
                [(scheme_charts[3], 12, 55)],
                [(scheme_charts[4], 6, 50), (scheme_charts[5], 6, 50)],
                [(scheme_charts[6], 6, 50), (scheme_charts[7], 3, 45), (scheme_charts[8], 3, 45)],
                [(scheme_charts[9], 5, 50), (scheme_charts[10], 7, 50)],
            ],
        )
        grant_public_dashboard_access(session, Dashboard, SCHEME_SLUG)
        ensure_embedded_dashboard(session, Dashboard, SCHEME_SLUG)

        from superset.extensions import cache_manager

        cache_manager.cache.clear()
        print("Cleared Superset chart cache after bootstrap.")

        print("DG20 executive dashboard bootstrap complete.")


if __name__ == "__main__":
    main()
