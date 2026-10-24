import os

import lightgbm as lgb
import numpy as np
import shap

MODEL_PATH = os.path.join(os.path.dirname(__file__), "../models_trained/sla_model.txt")

_model = None
_explainer = None


def load_sla_model():
    global _model, _explainer
    if _model is None and os.path.exists(MODEL_PATH):
        _model = lgb.Booster(model_file=MODEL_PATH)
        _explainer = shap.TreeExplainer(_model)
    return _model


def predict_risk(features: np.ndarray) -> tuple[np.ndarray, list[dict]]:
    """
    features: (n_tasks, n_features)
    Returns: (risk_scores, shap_explanations)
    risk_scores: float 0-1 (probability of SLA breach)
    shap_explanations: list of {feature_name: shap_value}
    """
    model = load_sla_model()
    if model is None:
        return np.zeros(len(features)), []

    scores = model.predict(features)
    shap_vals = _explainer.shap_values(features)

    feature_names = [
        "elapsed_ratio",
        "queue_depth",
        "service_encoded",
        "hour_of_day",
        "day_of_week",
        "officer_load",
    ]
    explanations = []
    for row_shap in shap_vals:
        explanations.append({name: float(val) for name, val in zip(feature_names, row_shap)})
    return scores, explanations
