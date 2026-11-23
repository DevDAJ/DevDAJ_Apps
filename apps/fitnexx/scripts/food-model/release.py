#!/usr/bin/env python3
"""Register, promote, or roll back a food-model release in Supabase."""

import argparse
import json
import os
import urllib.parse
import urllib.request


def call(path: str, method: str, body=None):
    url = os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1/" + path
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={
            "Authorization": f"Bearer {key}",
            "apikey": key,
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
    )
    with urllib.request.urlopen(request, timeout=30):
        pass


def passes(baseline, candidate):
    return (
        candidate["schema_valid_rate"] >= 0.98
        and candidate["item_f1"] >= baseline["item_f1"] + 0.02
        and candidate["hallucination_rate"] <= baseline["hallucination_rate"]
        and candidate["p95_latency_ms"] <= baseline["p95_latency_ms"] * 1.2
    )


def update_status(status: str, new_status: str):
    call(
        "food_model_release?" + urllib.parse.urlencode({"status": f"eq.{status}"}),
        "PATCH",
        {"status": new_status},
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["canary", "promote", "rollback"])
    parser.add_argument("version")
    parser.add_argument("--adapter-uri")
    parser.add_argument("--dataset-hash")
    parser.add_argument("--baseline", type=argparse.FileType("r"))
    parser.add_argument("--metrics", type=argparse.FileType("r"))
    args = parser.parse_args()
    metrics = json.load(args.metrics) if args.metrics else None
    baseline = json.load(args.baseline) if args.baseline else None
    if args.action in {"canary", "promote"} and (
        not metrics or not baseline or not passes(baseline, metrics)
    ):
        raise SystemExit("release blocked by evaluation gates")
    if args.action == "canary":
        if not args.adapter_uri or not args.dataset_hash:
            raise SystemExit("canary requires --adapter-uri and --dataset-hash")
        update_status("canary", "failed")
        call(
            "food_model_release",
            "POST",
            {
                "version": args.version,
                "base_model": "Qwen/Qwen3.5-4B",
                "adapter_uri": args.adapter_uri,
                "dataset_hash": args.dataset_hash,
                "metrics": metrics,
                "status": "canary",
            },
        )
    else:
        if args.action == "rollback":
            update_status("canary", "failed")
        update_status("active", "retired")
        call(
            "food_model_release?" + urllib.parse.urlencode({"version": f"eq.{args.version}"}),
            "PATCH",
            {"status": "active"},
        )


if __name__ == "__main__":
    main()
