"""Best-effort notices to the citizen when a consent is raised or a reminder is sent (D5).

Off unless NOTIFY_ENABLED=true. A failure is logged and never blocks the consent or the reminder.
scripts/mdm_setup.sh re-applies the k8s manifest, which keeps NOTIFY_ENABLED=false until an operator
turns it on for a demo or a live environment.
"""
from __future__ import annotations
import json
import logging
import os
import urllib.error
import urllib.request

log = logging.getLogger("notify")

NOTIFICATIONS_URL = os.getenv(
    "NOTIFICATIONS_URL",
    "http://notifications-service.citizen.svc.cluster.local:8080/notifications-service/v1/notifications",
)


def enabled() -> bool:
    return os.getenv("NOTIFY_ENABLED", "false").lower() == "true"


def _aadhaar_ref(cur, person_id: int) -> str | None:
    cur.execute("SELECT aadhaar_ref FROM mdm.citizen_link WHERE person_id=%s ORDER BY created_at LIMIT 1", (person_id,))
    r = cur.fetchone()
    return r["aadhaar_ref"] if r else None


def _post(aadhaar_ref: str, title: str, message: str, tracking_id: str) -> bool:
    body = json.dumps({
        "aadhaarRef": aadhaar_ref,
        "title": title,
        "message": message,
        "serviceName": "Approvals",
        "trackingId": tracking_id,
    }).encode()
    req = urllib.request.Request(
        NOTIFICATIONS_URL, data=body,
        headers={"Content-Type": "application/json"}, method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=3) as r:
            r.read()
        return True
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError) as e:
        log.warning("notification failed for %s: %s", tracking_id, e)
        return False


def send(cur, person_id: int, title: str, message: str, tracking_id: str) -> bool:
    """Notify one person. Returns True when a post was attempted and accepted. Never raises."""
    if not enabled():
        return False
    ref = _aadhaar_ref(cur, person_id)
    if not ref:
        return False
    try:
        ok = _post(ref, title, message, tracking_id)
    except Exception as e:
        log.warning("notification failed for %s: %s", tracking_id, e)
        return False
    if ok and tracking_id.startswith("event-"):
        try:
            eid = int(tracking_id.split("-", 1)[1])
            cur.execute(
                "UPDATE mdm.consent SET notified_at=COALESCE(notified_at, now()) WHERE event_id=%s AND person_id=%s",
                (eid, person_id),
            )
        except (TypeError, ValueError):
            pass
    return ok


def mark_consent_notified(cur, cid: int) -> None:
    cur.execute("UPDATE mdm.consent SET notified_at=COALESCE(notified_at, now()) WHERE id=%s", (cid,))
