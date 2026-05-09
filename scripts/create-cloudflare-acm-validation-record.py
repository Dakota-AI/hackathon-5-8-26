#!/usr/bin/env python3
"""Create the Cloudflare DNS CNAME needed to validate the Agents Cloud preview ACM cert.

Requires an API token with Zone:DNS:Edit for solo-ceo.ai:

  export CLOUDFLARE_API_TOKEN=...
  python3 scripts/create-cloudflare-acm-validation-record.py
"""
from __future__ import annotations

import json
import os
import sys
import urllib.parse
import urllib.request
import urllib.error

ZONE_NAME = "solo-ceo.ai"
ZONE_ID = "8977bfe332b3b5627a2b6172a11c5180"
RECORD_TYPE = "CNAME"
RECORD_NAME = "_0afc44d369ad2327e61fde6b37cda3ec.preview.solo-ceo.ai"
RECORD_CONTENT = "_66ec516291c729371700b200bb0ce52a.jkddzztszm.acm-validations.aws"


def request(method: str, path: str, token: str, body: dict | None = None) -> dict:
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(
        f"https://api.cloudflare.com/client/v4{path}",
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return json.loads(res.read().decode())
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")
        raise SystemExit(f"Cloudflare API HTTP {exc.code}: {detail}") from exc


def main() -> int:
    token = os.environ.get("CLOUDFLARE_API_TOKEN") or os.environ.get("CF_API_TOKEN")
    if not token:
        print("Missing CLOUDFLARE_API_TOKEN or CF_API_TOKEN.", file=sys.stderr)
        return 2

    query = urllib.parse.urlencode({"type": RECORD_TYPE, "name": RECORD_NAME})
    existing = request("GET", f"/zones/{ZONE_ID}/dns_records?{query}", token)
    if not existing.get("success"):
        print(json.dumps(existing, indent=2), file=sys.stderr)
        return 1

    payload = {
        "type": RECORD_TYPE,
        "name": RECORD_NAME,
        "content": RECORD_CONTENT,
        "ttl": 1,
        "proxied": False,
        "comment": "ACM DNS validation for Agents Cloud preview.solo-ceo.ai wildcard certificate",
    }

    records = existing.get("result", [])
    if records:
        record_id = records[0]["id"]
        result = request("PATCH", f"/zones/{ZONE_ID}/dns_records/{record_id}", token, payload)
        action = "updated"
    else:
        result = request("POST", f"/zones/{ZONE_ID}/dns_records", token, payload)
        action = "created"

    if not result.get("success"):
        print(json.dumps(result, indent=2), file=sys.stderr)
        return 1

    record = result["result"]
    print(json.dumps({
        "action": action,
        "zone": ZONE_NAME,
        "id": record.get("id"),
        "type": record.get("type"),
        "name": record.get("name"),
        "content": record.get("content"),
        "proxied": record.get("proxied"),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
