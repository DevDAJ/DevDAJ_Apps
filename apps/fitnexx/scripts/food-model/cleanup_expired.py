#!/usr/bin/env python3
"""Delete expired, non-contributed food uploads and their scan rows."""

import json
import os
import urllib.parse
import urllib.request

BUCKET = "food-scan-images"


def call(url: str, key: str, method="GET", body=None):
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={
            "Authorization": f"Bearer {key}",
            "apikey": key,
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def main():
    url = os.environ["SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    query = urllib.parse.urlencode(
        {
            "select": "id,storage_path",
            "expires_at": "lt.now()",
            "contributed_at": "is.null",
        }
    )
    rows = json.loads(call(f"{url}/rest/v1/food_scan?{query}", key))
    if not rows:
        print("0 expired scans")
        return
    call(
        f"{url}/storage/v1/object/{BUCKET}",
        key,
        "DELETE",
        {"prefixes": [row["storage_path"] for row in rows]},
    )
    ids = ",".join(row["id"] for row in rows)
    call(
        f"{url}/rest/v1/food_scan?" + urllib.parse.urlencode({"id": f"in.({ids})"}),
        key,
        "DELETE",
    )
    print(f"{len(rows)} expired scans")


if __name__ == "__main__":
    main()
