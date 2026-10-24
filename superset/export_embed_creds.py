#!/usr/bin/env python3
"""Print officer-portal embed credentials for executive dashboards (run via kubectl exec)."""
import json
import uuid

from superset.app import create_app

DASHBOARD_SLUGS = [
    "gujarat-welfare-pulse",
    "scheme-performance",
]


def main():
    app = create_app()
    with app.app_context():
        from superset import db
        from superset.extensions import appbuilder
        from superset.models.dashboard import Dashboard
        from superset.models.embedded_dashboard import EmbeddedDashboard
        from superset.security.guest_token import GuestTokenUser

        result = {}
        for slug in DASHBOARD_SLUGS:
            dash = db.session.query(Dashboard).filter_by(slug=slug).one_or_none()
            if not dash:
                raise SystemExit(f"Dashboard not found: {slug}")

            emb = (
                db.session.query(EmbeddedDashboard)
                .filter_by(dashboard_id=dash.id)
                .one_or_none()
            )
            if not emb:
                emb = EmbeddedDashboard(
                    dashboard_id=dash.id,
                    uuid=uuid.uuid4(),
                    allow_domain_list="",
                )
                db.session.add(emb)
                db.session.commit()

            user = GuestTokenUser(
                username="dg20_embed",
                first_name="Officer",
                last_name="Portal",
            )
            resources = [{"type": "dashboard", "id": str(emb.uuid)}]
            token = appbuilder.sm.create_guest_access_token(user, resources, [])
            token_str = token.decode("utf-8") if isinstance(token, bytes) else str(token)
            result[slug] = {
                "embed_uuid": str(emb.uuid),
                "guest_token": token_str,
            }

        print(json.dumps(result))


if __name__ == "__main__":
    main()
