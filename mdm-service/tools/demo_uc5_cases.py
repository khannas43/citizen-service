#!/usr/bin/env python3
"""Demo only: plant or remove the UC5 housing cases. The logic now lives in app/demo_uc5_story.py so the Scenario runner can use it too
(Demo > Scenario runner > UC5 > step 5.7). This wrapper keeps the old command line working.

  python3 mdm-service/tools/demo_uc5_cases.py [--apply | --remove]
"""
import os, sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.demo_uc5_story import main

if __name__ == "__main__":
    sys.exit(main())
