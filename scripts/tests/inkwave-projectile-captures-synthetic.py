#!/usr/bin/env python3
"""Run isolated physical-gate mutations for the capture comparison helper."""

from __future__ import annotations

import copy
import argparse
import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Callable


ROOT = Path(__file__).resolve().parent.parent.parent
DELIVERABLES = Path(__file__).resolve().parent
HELPER = ROOT / "scripts" / "compare-inkwave-projectile-captures.py"
DEFAULT_BEFORE_PATH = ROOT / "projectile-evidence/ci-sixth/before/projectile-visuals-result.json"
DEFAULT_AFTER_PATH = ROOT / "projectile-evidence/ci-sixth/after/projectile-visuals-result.json"
DEFAULT_RECEIPT_PATH = DELIVERABLES / "comparator-synthetic-gates.json"


def scenario(document: dict[str, Any], name: str) -> dict[str, Any]:
    return next(row for row in document["visualScenarios"] if row["name"] == name)


def first_receipt(document: dict[str, Any]) -> dict[str, Any]:
    return document["screenshots"][0]


def cases() -> list[tuple[str, str, Callable[[dict[str, Any]], None] | None, dict[str, Any]]]:
    def caller_stack(doc: dict[str, Any]) -> None:
        item = scenario(doc, "wall-shooter")["rng"]["afterNativeFire"]["callers"][0]
        item["stack"][0] += "?diagnostic-only"

    def camera(doc: dict[str, Any]) -> None:
        first_receipt(doc)["camera"]["pose"]["pos"][0] += 0.01

    def capture_seed(doc: dict[str, Any]) -> None:
        first_receipt(doc)["seed"] += 1

    def rng_state(doc: dict[str, Any]) -> None:
        scenario(doc, "wall-shooter")["rng"]["afterNativeFire"]["state"] += 1

    def draw_radius(doc: dict[str, Any]) -> None:
        first_receipt(doc)["runtime"]["projectiles"][0]["drawRadius"] = 0.3

    def prior_spawn(doc: dict[str, Any]) -> None:
        scenario(doc, "wall-shooter")["lifecycleReset"]["priorSquidSpawn"] = {
            "pos": [100, 100, 100], "clock": 999,
        }

    def lifecycle(doc: dict[str, Any]) -> None:
        scenario(doc, "wall-shooter")["lifecycleReset"]["neutralIntent"]["fire"] = True

    def controller_faces(doc: dict[str, Any]) -> None:
        scenario(doc, "wall-shooter")["controllerProbe"]["selectedWall"]["face"] += 1
        scenario(doc, "floor-slosher9")["impactEvidence"]["face"] += 1

    def cosmetic_fx(doc: dict[str, Any]) -> None:
        scenario(doc, "floor-slosher9")["impactState"]["fx"]["checks"] += 1

    def contact(doc: dict[str, Any]) -> None:
        scenario(doc, "floor-slosher9")["impactState"]["surfaceHits"][0]["nativeStageContact"] = False

    def retirement(doc: dict[str, Any]) -> None:
        scenario(doc, "floor-slosher9")["impactState"]["retired"] = []

    def impact_face(doc: dict[str, Any]) -> None:
        scenario(doc, "wall-shooter")["impactState"]["attempts"][0]["face"] += 1

    def paint_coverage(doc: dict[str, Any]) -> None:
        scenario(doc, "floor-slosher9")["impactState"]["paintCoverage"][0] += 0.01

    return [
        ("caller stack URL only", "pass", caller_stack, {"mutation": "RNG caller stack URL changed only"}),
        ("identical control", "pass", None, {}),
        ("camera position difference", "fail", camera, {"mutation": "camera pose position +0.01"}),
        ("capture seed difference", "fail", capture_seed, {"mutation": "capture receipt seed incremented"}),
        ("post-fire RNG state difference", "fail", rng_state, {"mutation": "postNativeFire RNG numeric state incremented"}),
        ("drawRadius difference", "fail", draw_radius, {"mutation": "candidate native drawRadius added as 0.3"}),
        ("priorSquidSpawn history only", "pass", prior_spawn, {"mutation": "priorSquidSpawn provenance changed; all post-reset values fixed"}),
        ("post-reset lifecycle difference", "fail", lifecycle, {"mutation": "post-reset neutralIntent.fire changed to true"}),
        ("controller and contact face proofs", "fail", controller_faces, {"mutation": "wall controller selected face and scoped floor-impact face changed"}),
        ("impactState cosmetic FX counters only", "pass", cosmetic_fx, {"mutation": "floor impactState.fx.checks incremented only"}),
        ("native contact proof difference", "fail", contact, {"mutation": "floor impactState.surfaceHits.nativeStageContact changed"}),
        ("impact retirement difference", "fail", retirement, {"mutation": "floor impactState.retired projectile removed"}),
        ("impact face difference", "fail", impact_face, {"mutation": "wall impactState.attempts.face changed"}),
        ("paint coverage difference", "fail", paint_coverage, {"mutation": "floor impactState.paintCoverage changed"}),
    ]


def run(before_path: Path, after_path: Path, receipt_path: Path) -> dict[str, Any]:
    before = json.loads(before_path.read_text())
    baseline_after = json.loads(after_path.read_text())
    records = []
    for name, expected, mutate, evidence in cases():
        after = copy.deepcopy(baseline_after)
        if mutate:
            mutate(after)
        with tempfile.TemporaryDirectory(prefix="capture-gate-") as tmp:
            temp = Path(tmp)
            before_file, after_file, output = temp / "before.json", temp / "after.json", temp / "result.json"
            before_file.write_text(json.dumps(before, separators=(",", ":")))
            after_file.write_text(json.dumps(after, separators=(",", ":")))
            completed = subprocess.run(
                [sys.executable, str(HELPER), "--before", str(before_file), "--after", str(after_file), "--output", str(output)],
                check=False, capture_output=True, text=True, timeout=60,
            )
            if not output.is_file():
                raise RuntimeError(f"comparator produced no receipt (exit {completed.returncode}): {completed.stderr}")
            result = json.loads(output.read_text())
        actual = "pass" if result["physicalVerification"]["status"] == "pass" else "fail"
        case_evidence = dict(evidence)
        if name == "caller stack URL only":
            diagnostic = next(row for row in result["rngDiagnostics"] if row["scenario"] == "wall-shooter")
            case_evidence.update({
                "postNativeFireNumericRngMatched": result["postNativeFireRngVerification"]["status"] == "matched",
                "callerStackDifferenceRetained": bool(diagnostic["callerStackDifferences"]),
                "rawRngDifferenceRetained": bool(diagnostic["rawDifferences"]),
            })
        elif name == "priorSquidSpawn history only":
            case_evidence.update({
                "rawLifecycleChangeRetained": bool(next(row for row in result["nativeScenarioStateVerification"]["scenarios"] if row["scenario"] == "wall-shooter")["rawLifecycleResetDifferences"]),
                "priorSpawnDiagnosticChangeRetained": result["lifecycleDiagnostics"]["status"] == "changed",
            })
        elif name == "impactState cosmetic FX counters only":
            item = next(row for row in result["nativeScenarioStateVerification"]["scenarios"] if row["scenario"] == "floor-slosher9")
            case_evidence.update({
                "fxDifferenceRetainedAsRawDiagnostic": item["impactFxDiagnostics"]["status"] == "changed" and bool(item["impactFxDiagnostics"]["rawDifferences"]),
                "fxDifferenceExcludedFromPhysicalMismatches": not any("impactState.fx" in mismatch["path"] for mismatch in item["mismatches"]),
            })
        records.append({
            "case": name,
            "expected": expected,
            "actual": actual,
            "pass": actual == expected,
            "evidence": case_evidence,
        })

    helper_hash = hashlib.sha256(HELPER.read_bytes()).hexdigest()
    passed = sum(row["pass"] for row in records)
    receipt = {
        "schema": 1,
        "artifact": "synthetic capture comparator gate receipt",
        "helper": str(HELPER),
        "helperSha256": helper_hash,
        "method": "Fourteen isolated mutations against copied before/after receipt JSON; comparator inputs are temporary copies and original capture receipts remain unchanged. The original nine gates are retained and rerun, with five impactState FX/contact/retirement/face/paint-coverage gates added.",
        "inputs": {"before": str(before_path), "after": str(after_path)},
        "caseCount": len(records),
        "passedCases": passed,
        "failedCases": len(records) - passed,
        "status": "pass" if passed == len(records) else "fail",
        "cases": records,
    }
    receipt_path.parent.mkdir(parents=True, exist_ok=True)
    receipt_path.write_text(json.dumps(receipt, indent=2) + "\n")
    return receipt


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--before", type=Path, default=DEFAULT_BEFORE_PATH,
                        help=f"baseline capture JSON (default: {DEFAULT_BEFORE_PATH})")
    parser.add_argument("--after", type=Path, default=DEFAULT_AFTER_PATH,
                        help=f"candidate capture JSON (default: {DEFAULT_AFTER_PATH})")
    parser.add_argument("--out", type=Path, default=DEFAULT_RECEIPT_PATH,
                        help=f"synthetic gate receipt destination (default: {DEFAULT_RECEIPT_PATH})")
    args = parser.parse_args()
    result = run(args.before, args.after, args.out)
    print(json.dumps({"status": result["status"], "caseCount": result["caseCount"],
                      "passedCases": result["passedCases"], "failedCases": result["failedCases"],
                      "helperSha256": result["helperSha256"]}, indent=2))
    raise SystemExit(0 if result["status"] == "pass" else 1)
