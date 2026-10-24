from datetime import datetime, timezone

import numpy as np
from fastapi import APIRouter
from pydantic import BaseModel

from models.sla_model import load_sla_model, predict_risk

router = APIRouter(prefix="/v1/sla", tags=["AI-4 SLA Prediction"])

SLA_HOURS = {
    "Caste Certificate": 24,
    "Pension": 48,
    "Family Member Change": 24,
    "Scheme Application": 48,
    "Marriage Certificate": 72,
}
SERVICE_CODES = {s: i for i, s in enumerate(SLA_HOURS.keys())}

SHAP_LABELS = {
    "elapsed_ratio": "time elapsed",
    "queue_depth": "queue backlog",
    "service_encoded": "service type",
    "hour_of_day": "time of day",
    "day_of_week": "day of week",
    "officer_load": "officer workload",
}


class TaskRiskRequest(BaseModel):
    tasks: list[dict]


class TaskRisk(BaseModel):
    engine_ref: str
    risk_score: float
    at_risk: bool
    predicted_breach_hours: int | None
    top_shap_factor: str | None
    shap_explanation: str | None


@router.post("/predict", response_model=list[TaskRisk])
async def predict_sla_risks(req: TaskRiskRequest):
    pending = [t for t in req.tasks if (t.get("status") or "PENDING") == "PENDING"]
    if not pending:
        return []

    now = datetime.now(timezone.utc)

    rows = []
    for t in pending:
        sla_hours = SLA_HOURS.get(t.get("service", ""), 48)
        try:
            created = datetime.fromisoformat(t["createdAt"].replace("Z", "+00:00"))
        except Exception:
            created = now
        elapsed_hours = (now - created).total_seconds() / 3600
        elapsed_ratio = min(1.0, elapsed_hours / sla_hours)
        queue_depth = min(1.0, (t.get("queueDepth") or len(pending)) / 20)
        service_enc = SERVICE_CODES.get(t.get("service", ""), 0) / max(len(SERVICE_CODES), 1)
        hour_of_day = now.hour / 23
        dow = now.weekday() / 6
        officer_load = min(1.0, (t.get("officerLoad") or len(pending)) / 15)
        rows.append([elapsed_ratio, queue_depth, service_enc, hour_of_day, dow, officer_load])

    features = np.array(rows, dtype=np.float32)
    model = load_sla_model()

    if model:
        risk_scores, shap_explanations = predict_risk(features)
    else:
        risk_scores = features[:, 0] * 0.6 + features[:, 1] * 0.4
        shap_explanations = []

    results = []
    for i, task in enumerate(pending):
        sla_hours = SLA_HOURS.get(task.get("service", ""), 48)
        try:
            created = datetime.fromisoformat(task["createdAt"].replace("Z", "+00:00"))
            remaining_h = max(
                0, int((created.timestamp() + sla_hours * 3600 - now.timestamp()) / 3600)
            )
        except Exception:
            remaining_h = None

        score = float(risk_scores[i])
        elapsed_ratio = features[i][0]
        # Deterministic overrides so the model never under-calls obvious cases
        if elapsed_ratio >= 1.0:
            score = max(score, 0.95)          # already breached
        elif elapsed_ratio >= 0.85:
            score = max(score, 0.78)          # within 15% of deadline → near-breach

        top_factor = None
        shap_txt = None
        if shap_explanations and i < len(shap_explanations):
            top_key = max(shap_explanations[i], key=lambda k: abs(shap_explanations[i][k]))
            top_factor = top_key
            top_val = shap_explanations[i][top_key]
            shap_txt = f"Primary driver: {SHAP_LABELS.get(top_key, top_key)} (impact {top_val:+.2f})"

        # Fallback explanation for override-flagged tasks when SHAP is unavailable
        if score >= 0.78 and not shap_txt:
            pct = int(elapsed_ratio * 100)
            if elapsed_ratio >= 1.0:
                shap_txt = "Primary driver: time elapsed (SLA deadline exceeded)"
            else:
                shap_txt = f"Primary driver: time elapsed ({pct}% of SLA consumed)"
            top_factor = "elapsed_ratio"

        results.append(
            TaskRisk(
                engine_ref=task.get("engineRef", ""),
                risk_score=score,
                at_risk=score > 0.75,
                predicted_breach_hours=remaining_h if score > 0.75 else None,
                top_shap_factor=top_factor,
                shap_explanation=shap_txt,
            )
        )

    return results
