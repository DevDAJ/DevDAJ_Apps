#!/usr/bin/env python3
"""Export consented scans into an immutable, normalized JSONL dataset."""

import hashlib
import io
import json
import os
import shutil
import sys
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageOps

BUCKET = "food-scan-images"


def request(url: str, key: str, method: str = "GET", body: bytes | None = None):
    req = urllib.request.Request(
        url,
        data=body,
        method=method,
        headers={
            "Authorization": f"Bearer {key}",
            "apikey": key,
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as response:
        return response.read()


def main() -> None:
    url = os.environ["SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    output = Path(sys.argv[1] if len(sys.argv) > 1 else "food-datasets")
    query = urllib.parse.urlencode(
        {
            "select": "id,user_id,storage_path,reviewed_label,created_at",
            "status": "eq.eligible",
            "withdrawn_at": "is.null",
            "order": "created_at.asc",
        }
    )
    rows = json.loads(request(f"{url}/rest/v1/food_scan?{query}", key))
    staging = output / ".staging"
    shutil.rmtree(staging, ignore_errors=True)
    (staging / "images").mkdir(parents=True)
    records, seen = [], set()
    for row in rows:
        path = urllib.parse.quote(row["storage_path"], safe="/")
        raw = request(f"{url}/storage/v1/object/authenticated/{BUCKET}/{path}", key)
        image = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGB")
        image.thumbnail((1536, 1536))
        encoded = io.BytesIO()
        image.save(encoded, "JPEG", quality=90, optimize=True)
        normalized = encoded.getvalue()
        digest = hashlib.sha256(normalized).hexdigest()
        if digest in seen:
            continue
        seen.add(digest)
        image_name = f"{digest}.jpg"
        (staging / "images" / image_name).write_bytes(normalized)
        user_hash = hashlib.sha256(row["user_id"].encode()).hexdigest()
        records.append(
            {
                "id": row["id"],
                "image": f"images/{image_name}",
                "target": row["reviewed_label"],
                "split": "eval" if int(user_hash[:8], 16) % 10 == 0 else "train",
                "user_hash": user_hash,
                "sha256": digest,
            }
        )
    if not records:
        raise SystemExit("No eligible training scans.")
    manifest = "".join(json.dumps(row, sort_keys=True) + "\n" for row in records)
    dataset_hash = hashlib.sha256(manifest.encode()).hexdigest()
    (staging / "manifest.jsonl").write_text(manifest)
    destination = output / dataset_hash
    if destination.exists():
        shutil.rmtree(staging)
    else:
        staging.rename(destination)
    for row in records:
        record_query = urllib.parse.urlencode({"id": f"eq.{row['id']}"})
        request(
            f"{url}/rest/v1/food_scan?{record_query}",
            key,
            "PATCH",
            json.dumps(
                {"normalized_hash": row["sha256"], "dataset_version": dataset_hash}
            ).encode(),
        )
    print(destination)


if __name__ == "__main__":
    main()
