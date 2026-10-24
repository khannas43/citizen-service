"""
Train LightGBM SLA breach model on synthetic data.
Usage: python scripts/train_sla.py
Output: models_trained/sla_model.txt
"""
import os
import sys

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

DATA_PATH = os.path.join(os.path.dirname(__file__), "../data/sla_training_data.csv")
MODEL_PATH = os.path.join(os.path.dirname(__file__), "../models_trained/sla_model.txt")

FEATURE_COLS = [
    "elapsed_ratio",
    "queue_depth",
    "service_encoded",
    "hour_of_day",
    "day_of_week",
    "officer_load",
]


def main():
    if not os.path.exists(DATA_PATH):
        print(f"Missing {DATA_PATH}. Run: python scripts/gen_sla_data.py")
        sys.exit(1)

    df = pd.read_csv(DATA_PATH)
    X = df[FEATURE_COLS].values.astype(np.float32)
    y = df["label"].values.astype(np.float32)

    X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.2, random_state=42)

    train_set = lgb.Dataset(X_train, label=y_train)
    val_set = lgb.Dataset(X_val, label=y_val, reference=train_set)

    params = {
        "objective": "binary",
        "metric": "auc",
        "learning_rate": 0.05,
        "num_leaves": 31,
        "verbose": -1,
    }

    model = lgb.train(
        params,
        train_set,
        num_boost_round=300,
        valid_sets=[val_set],
        callbacks=[lgb.early_stopping(25, verbose=False)],
    )

    preds = model.predict(X_val)
    auc = roc_auc_score(y_val, preds)
    print(f"Validation AUC: {auc:.4f}")

    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    model.save_model(MODEL_PATH)
    print(f"Saved model to {MODEL_PATH}")


if __name__ == "__main__":
    main()
