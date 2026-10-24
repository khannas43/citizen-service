"""
Generate ~5,000 synthetic rows for LightGBM SLA breach prediction training.
Output: data/sla_training_data.csv
Columns: elapsed_ratio, queue_depth, service_encoded, hour_of_day, day_of_week, officer_load, label
"""
import os

import numpy as np
import pandas as pd

OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "../data/sla_training_data.csv")
SERVICE_COUNT = 5


def generate(n: int = 5000, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    rows = []

    for _ in range(n):
        queue_depth = float(rng.beta(1.5, 4))
        service_encoded = float(rng.integers(0, SERVICE_COUNT) / max(SERVICE_COUNT - 1, 1))
        hour_of_day = float(rng.uniform(0, 1))
        day_of_week = float(rng.integers(0, 7) / 6)
        officer_load = float(rng.beta(2, 3))

        # ~25% past SLA (capped at 1.0 to match live inference features)
        if rng.uniform() < 0.25:
            elapsed_ratio = 1.0
            label = 1
        else:
            elapsed_ratio = float(rng.beta(2, 3))
            breach_prob = (
                elapsed_ratio * 0.25
                + queue_depth * 0.08
                + officer_load * 0.05
            )
            label = 1 if rng.uniform() < breach_prob else 0

        rows.append(
            {
                "elapsed_ratio": round(elapsed_ratio, 4),
                "queue_depth": round(queue_depth, 4),
                "service_encoded": round(service_encoded, 4),
                "hour_of_day": round(hour_of_day, 4),
                "day_of_week": round(day_of_week, 4),
                "officer_load": round(officer_load, 4),
                "label": label,
            }
        )

    return pd.DataFrame(rows)


def main():
    df = generate()
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    df.to_csv(OUTPUT_PATH, index=False)
    print(f"Wrote {len(df)} rows to {OUTPUT_PATH}")
    print(f"  breach rate: {df['label'].mean():.2%}")


if __name__ == "__main__":
    main()
