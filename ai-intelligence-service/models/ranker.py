import os

import lightgbm as lgb
import numpy as np

MODEL_PATH = os.path.join(os.path.dirname(__file__), "../models_trained/recommend_model.txt")

_model = None


def load_ranker():
    global _model
    if _model is None and os.path.exists(MODEL_PATH):
        _model = lgb.Booster(model_file=MODEL_PATH)
    return _model


def predict_scores(features: np.ndarray) -> np.ndarray:
    """features: (n_schemes, n_features) → (n_schemes,) relevance scores."""
    model = load_ranker()
    if model is None:
        return np.zeros(len(features))
    return model.predict(features)
