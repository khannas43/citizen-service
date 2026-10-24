"""
Generate ~2,000 synthetic rows for LightGBM recommendation ranker training.
Output: data/rec_training_data.csv
Columns: caste_code, income_ratio, age_ratio, reason_count, benefit_ratio, label (0/1)
"""
import os

import numpy as np
import pandas as pd

CASTE_MAP = {"SC": 1, "ST": 2, "OBC": 3, "NT": 4, "GENERAL": 5}
CASTES = list(CASTE_MAP.values())

OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "../data/rec_training_data.csv")


def generate(n: int = 2000, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    rows = []

    for _ in range(n):
        caste_code = int(rng.choice(CASTES))
        income_ratio = float(rng.uniform(0, 1))
        age_ratio = float(rng.uniform(0.2, 1))
        reason_count = int(rng.integers(1, 6))
        benefit_ratio = float(rng.uniform(0, 1))

        # Higher relevance when lower income, more reasons, higher benefit
        score = (
            (1 - income_ratio) * 0.35
            + (reason_count / 5) * 0.25
            + benefit_ratio * 0.25
            + (1 if caste_code <= 3 else 0.3) * 0.15
        )
        label = 1 if score + rng.normal(0, 0.08) > 0.55 else 0

        rows.append(
            {
                "caste_code": caste_code,
                "income_ratio": round(income_ratio, 4),
                "age_ratio": round(age_ratio, 4),
                "reason_count": reason_count,
                "benefit_ratio": round(benefit_ratio, 4),
                "label": label,
            }
        )

    return pd.DataFrame(rows)


def main():
    df = generate()
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    df.to_csv(OUTPUT_PATH, index=False)
    print(f"Wrote {len(df)} rows to {OUTPUT_PATH}")
    print(f"  positive rate: {df['label'].mean():.2%}")


if __name__ == "__main__":
    main()
