#!/usr/bin/env python3
"""Fail unless candidate metrics meet the automatic release gates."""

import json
import sys


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: promotion_gate.py BASELINE.json CANDIDATE.json")
    baseline, candidate = (json.load(open(path)) for path in sys.argv[1:])
    failures = []
    if candidate["schema_valid_rate"] < 0.98:
        failures.append("schema_valid_rate < 0.98")
    if candidate["item_f1"] < baseline["item_f1"] + 0.02:
        failures.append("item_f1 improvement < 0.02")
    if candidate["hallucination_rate"] > baseline["hallucination_rate"]:
        failures.append("hallucination rate regressed")
    if candidate["p95_latency_ms"] > baseline["p95_latency_ms"] * 1.2:
        failures.append("p95 latency regressed > 20%")
    if failures:
        raise SystemExit("promotion blocked: " + "; ".join(failures))
    print("promotion gates passed")


if __name__ == "__main__":
    main()
