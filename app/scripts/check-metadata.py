#!/usr/bin/env python3
"""Checks the App Store texts in AppStore/metadata.md against Apple's character limits."""
import re
import sys
from pathlib import Path

LIMITS = {"Name": 30, "Subtitle": 30, "Promotional text": 170, "Description": 4000, "Keywords": 100,
          "Display name": 30, "IAP description": 45}

text = (Path(__file__).parent.parent / "AppStore" / "metadata.md").read_text()
failed = False
for match in re.finditer(r"^### (.+?)\n(.*?)(?=^#{2,3} |\Z)", text, re.S | re.M):
    title, body = match.group(1), match.group(2).strip()
    key = next((k for k in LIMITS if title.startswith(k)), None)
    if not key:
        continue
    status = "OK" if len(body) <= LIMITS[key] else "TOO LONG"
    failed |= status != "OK"
    print(f"{status:8} {len(body):5}/{LIMITS[key]:<5} {title}")
sys.exit(1 if failed else 0)
