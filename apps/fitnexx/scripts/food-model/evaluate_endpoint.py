#!/usr/bin/env python3
"""Evaluate an OpenAI-compatible food VLM endpoint on the held-out users."""

import argparse
import base64
import json
import time
import urllib.request
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("dataset", type=Path)
    parser.add_argument("--url", required=True)
    parser.add_argument("--key", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    rows = [
        json.loads(line)
        for line in (args.dataset / "manifest.jsonl").read_text().splitlines()
        if json.loads(line)["split"] == "eval"
    ]
    if not rows:
        raise SystemExit("Dataset has no eval users.")
    tp = fp = fn = valid = 0
    latencies = []
    for row in rows:
        image = base64.b64encode((args.dataset / row["image"]).read_bytes()).decode()
        payload = json.dumps(
            {
                "model": args.model,
                "temperature": 0,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image}"}},
                            {"type": "text", "text": "List each distinct visible food or drink as JSON with an items array."},
                        ],
                    }
                ],
            }
        ).encode()
        request = urllib.request.Request(
            args.url,
            data=payload,
            headers={"Authorization": f"Bearer {args.key}", "Content-Type": "application/json"},
        )
        started = time.monotonic()
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                result = json.load(response)
            content = result["choices"][0]["message"]["content"]
            parsed = json.loads(content[content.index("{") : content.rindex("}") + 1])
            predicted = {item["name"].strip().lower() for item in parsed["items"]}
            valid += 1
        except (KeyError, ValueError, TypeError, json.JSONDecodeError):
            predicted = set()
        latencies.append((time.monotonic() - started) * 1000)
        expected = {item["name"].strip().lower() for item in row["target"]}
        tp += len(predicted & expected)
        fp += len(predicted - expected)
        fn += len(expected - predicted)
    latencies.sort()
    precision = tp / (tp + fp) if tp + fp else 0
    recall = tp / (tp + fn) if tp + fn else 0
    metrics = {
        "schema_valid_rate": valid / len(rows),
        "item_f1": 2 * precision * recall / (precision + recall) if precision + recall else 0,
        "hallucination_rate": fp / (tp + fp) if tp + fp else 0,
        "p95_latency_ms": latencies[min(len(latencies) - 1, int(len(latencies) * 0.95))],
        "examples": len(rows),
    }
    args.output.write_text(json.dumps(metrics, indent=2) + "\n")
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
