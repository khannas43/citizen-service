"""UC1 citizen demo setup from the command line (the scenario page does the same on "Run the UC1 group"; see app/demo_uc1.py).

    python /tmp/demo_uc1_cases.py            show who would be used (changes nothing)
    python /tmp/demo_uc1_cases.py --apply    clear earlier cards, tie the sign-ins to people, plant the disagreements, raise the cards
    python /tmp/demo_uc1_cases.py --remove   take the synthetic records, cards and the corrections the demo citizens sent away

Run in the service pod:  cd /opt/app && PYTHONPATH=/opt/app python /tmp/demo_uc1_cases.py [--apply | --remove]
"""
import sys

from app import demo_uc1
from app.db import connect


def main(mode: str):
    with connect() as conn:
        cur = conn.cursor()
        if mode == "remove":
            print(demo_uc1.clear_all(cur))
        else:
            out = demo_uc1.plant_all(cur, dry=(mode == "dry"))
            for line in out["notes"].values():
                print(line)
            print(out["scan"] if out["scan"] else "Read only. Add --apply to do it.")
        conn.commit()


if __name__ == "__main__":
    main("apply" if "--apply" in sys.argv else "remove" if "--remove" in sys.argv else "dry")
