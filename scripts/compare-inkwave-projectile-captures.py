#!/usr/bin/env python3
"""Exact paired analysis for INKWAVE projectile-visuals CI capture receipts.

The script reads two ``projectile-visuals-result.json`` files (or directories
containing that filename) and writes one verification JSON. It does not edit
the inputs or their screenshots. Capture fields are compared structurally and
exactly; screenshot/image hashes are recorded as outputs, not compared, since
visual changes are expected between builds.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


RESULT_FILENAME = "projectile-visuals-result.json"
PAIR_KEY_FIELDS = ("scenario", "phase", "frame", "perspective")
RECEIPT_FIELDS = (
    "scenario",
    "phase",
    "frame",
    "perspective",
    "perspectiveMode",
    "seed",
    "camera",
    "captureConditions",
)
SCENARIO_FIELDS = ("seed", "setup", "births", "impacts")
SETUP_PHYSICAL_FIELDS = (
    "weapon", "actor", "wall", "impact", "seed", "bootSeed", "lifecycleReset",
    "aim", "inkHex", "canonicalPlacement",
)
CAMERA_PHYSICAL_FIELDS = (
    "perspective", "mode", "pose", "pos", "target", "actor", "aim", "fov",
    "liveHeadCount", "projectileFocus", "focusBounds", "bootSeed", "actorInkHex",
    "canonicalPlacement", "currentVisualSetup",
)
CAPTURE_CONDITION_FIELDS = (
    "fov", "actorInkHex", "bootSeed", "canonicalFloorHit", "actorPosition",
    "projectileFocusBounds", "actorFloorHit", "nativeWallRaycast",
)
RUNTIME_PHYSICAL_FIELDS = (
    "projectiles", "projectileScreen", "visibleCenters", "projectileCrop",
    "liveHeadCount", "liveProjectileCount", "drawingBuffer",
)
SCENARIO_EXTRA_PHYSICAL_FIELDS = (
    "lifecycleReset", "endState", "controllerProbe", "impactFrame", "captureFrame",
    "elapsedSinceImpactFrames", "impactState", "impactEvidence",
)
CANONICAL_PLACEMENT_FIELDS = (
    "pos", "team", "inkHex", "yaw", "aim", "floorHit", "bootSeed",
)
POST_NATIVE_FIRE_RNG_FIELDS = ("seed", "draws", "count", "state")
REQUIRED_POST_NATIVE_FIRE_RNG_FIELDS = ("seed", "draws", "state")


def input_file(value: str) -> Path:
    path = Path(value).expanduser().resolve()
    if path.is_dir():
        path = path / RESULT_FILENAME
    if not path.is_file():
        raise FileNotFoundError(f"input JSON not found: {path}")
    return path


def read_json(path: Path) -> tuple[dict[str, Any], str]:
    raw = path.read_bytes()
    try:
        value = json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise ValueError(f"invalid JSON in {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise ValueError(f"expected a JSON object in {path}")
    return value, hashlib.sha256(raw).hexdigest()


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")


def value_hash(value: Any) -> str:
    return hashlib.sha256(canonical_bytes(value)).hexdigest()


def strict_equal(left: Any, right: Any) -> bool:
    """JSON structural equality with numeric/bool type distinctions preserved."""
    if type(left) is not type(right):
        return False
    if isinstance(left, dict):
        return left.keys() == right.keys() and all(strict_equal(left[k], right[k]) for k in left)
    if isinstance(left, list):
        return len(left) == len(right) and all(strict_equal(a, b) for a, b in zip(left, right))
    return left == right


def differences(left: Any, right: Any, path: str = "$") -> list[dict[str, Any]]:
    """Return leaf-level, reproducible mismatch details for two JSON values."""
    out: list[dict[str, Any]] = []
    if type(left) is not type(right):
        return [{"path": path, "before": left, "after": right,
                 "reason": f"type differs ({type(left).__name__} vs {type(right).__name__})"}]
    if isinstance(left, dict):
        for key in sorted(left.keys() - right.keys()):
            out.append({"path": f"{path}.{key}", "before": left[key], "after": None,
                        "reason": "field only in before"})
        for key in sorted(right.keys() - left.keys()):
            out.append({"path": f"{path}.{key}", "before": None, "after": right[key],
                        "reason": "field only in after"})
        for key in sorted(left.keys() & right.keys()):
            out.extend(differences(left[key], right[key], f"{path}.{key}"))
        return out
    if isinstance(left, list):
        if len(left) != len(right):
            out.append({"path": f"{path}.length", "before": len(left), "after": len(right),
                        "reason": "list length differs"})
        for index, (a, b) in enumerate(zip(left, right)):
            out.extend(differences(a, b, f"{path}[{index}]"))
        for index in range(len(right), len(left)):
            out.append({"path": f"{path}[{index}]", "before": left[index], "after": None,
                        "reason": "list item only in before"})
        for index in range(len(left), len(right)):
            out.append({"path": f"{path}[{index}]", "before": None, "after": right[index],
                        "reason": "list item only in after"})
        return out
    if left != right:
        out.append({"path": path, "before": left, "after": right, "reason": "value differs"})
    return out


def receipt_key(receipt: dict[str, Any]) -> tuple[Any, ...]:
    return tuple(receipt.get(name) for name in PAIR_KEY_FIELDS)


def printable_key(key: tuple[Any, ...]) -> dict[str, Any]:
    return dict(zip(PAIR_KEY_FIELDS, key))


def known_fields(value: Any, fields: tuple[str, ...]) -> Any:
    """Project an object onto an explicit, stable field set without filling absent keys."""
    if not isinstance(value, dict):
        return value
    return {field: value[field] for field in fields if field in value}


def without_prior_squid_spawn(value: Any) -> Any:
    """Keep post-reset lifecycle evidence while separating only startup provenance."""
    if isinstance(value, dict):
        return {key: without_prior_squid_spawn(item) for key, item in value.items()
                if key != "priorSquidSpawn"}
    if isinstance(value, list):
        return [without_prior_squid_spawn(item) for item in value]
    return value


def physical_setup(value: Any) -> Any:
    return without_prior_squid_spawn(known_fields(value, SETUP_PHYSICAL_FIELDS))


def physical_camera(value: Any) -> Any:
    camera = known_fields(value, CAMERA_PHYSICAL_FIELDS)
    if isinstance(camera, dict) and "currentVisualSetup" in camera:
        camera["currentVisualSetup"] = physical_setup(camera["currentVisualSetup"])
    return without_prior_squid_spawn(camera)


def physical_capture_conditions(value: Any) -> Any:
    return without_prior_squid_spawn(known_fields(value, CAPTURE_CONDITION_FIELDS))


def physical_end_state(value: Any) -> Any:
    """Keep gameplay/paint terminal counts separate from visual FX pool counts."""
    return known_fields(value, ("projectiles", "paintQuads"))


def physical_impact_state(value: Any) -> Any:
    """Gate all native contact state while retaining cosmetic FX counters as diagnostics."""
    if not isinstance(value, dict):
        return value
    return {key: item for key, item in value.items() if key != "fx"}


def impact_fx_diagnostic(before: dict[str, Any], after: dict[str, Any], scenario: str) -> dict[str, Any]:
    left_state = before.get("impactState")
    right_state = after.get("impactState")
    left = left_state.get("fx") if isinstance(left_state, dict) else None
    right = right_state.get("fx") if isinstance(right_state, dict) else None
    raw = differences(left, right, f"scenario.{scenario}.impactState.fx")
    return {
        "status": "not-provided" if left is None and right is None else "changed" if raw else "matched",
        "before": left,
        "after": right,
        "rawDifferences": raw,
        "note": "impactState.fx is retained as cosmetic diagnostic evidence and is excluded from physical equality; every other impactState field remains gated.",
    }


def physical_scenario_projection(scenario: dict[str, Any]) -> dict[str, Any]:
    state: dict[str, Any] = {}
    for field in SCENARIO_FIELDS:
        if field not in scenario:
            continue
        state[field] = physical_setup(scenario[field]) if field == "setup" else scenario[field]
    for field in SCENARIO_EXTRA_PHYSICAL_FIELDS:
        if field in scenario:
            if field == "endState":
                state[field] = physical_end_state(scenario[field])
            elif field == "impactState":
                state[field] = physical_impact_state(scenario[field])
            else:
                state[field] = without_prior_squid_spawn(scenario[field])
    return state


def post_native_fire_rng(scenario: dict[str, Any]) -> tuple[Any, list[str]]:
    rng = scenario.get("rng")
    if not isinstance(rng, dict):
        return None, list(REQUIRED_POST_NATIVE_FIRE_RNG_FIELDS)
    snapshot = rng.get("afterNativeFire")
    if not isinstance(snapshot, dict):
        return None, list(REQUIRED_POST_NATIVE_FIRE_RNG_FIELDS)
    projected = {field: snapshot[field] for field in POST_NATIVE_FIRE_RNG_FIELDS if field in snapshot}
    missing = [field for field in REQUIRED_POST_NATIVE_FIRE_RNG_FIELDS if field not in snapshot]
    nonnumeric = [field for field in projected
                  if isinstance(projected[field], bool) or not isinstance(projected[field], (int, float))]
    return projected, missing + [f"{field} (not numeric)" for field in nonnumeric]


def rng_diagnostic_entry(name: str, before: Any, after: Any) -> dict[str, Any]:
    left = before.get("rng") if isinstance(before, dict) else None
    right = after.get("rng") if isinstance(after, dict) else None
    raw = differences(left, right, f"scenario.{name}.rng")
    stack = [item for item in raw if ".callers" in item.get("path", "") and ".stack" in item.get("path", "")]
    return {
        "scenario": name,
        "status": "not-provided" if left is None and right is None else "changed" if raw else "matched",
        "rawDifferences": raw,
        "callerStackDifferences": stack,
        "otherRngDiagnosticDifferences": [item for item in raw if item not in stack],
        "note": "RNG caller stack strings are preserved as provenance diagnostics and do not gate physical equality.",
    }


def compare_post_native_fire_rng(before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    def index(document: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
        rows = document.get("visualScenarios")
        result: dict[str, list[dict[str, Any]]] = defaultdict(list)
        if isinstance(rows, list):
            for row in rows:
                if isinstance(row, dict) and isinstance(row.get("name"), str):
                    result[row["name"]].append(row)
        return result

    left, right = index(before), index(after)
    entries = []
    for name in sorted(left.keys() | right.keys()):
        before_rows, after_rows = left.get(name, []), right.get(name, [])
        entry: dict[str, Any] = {"scenario": name, "status": "matched", "mismatches": []}
        if len(before_rows) != 1 or len(after_rows) != 1:
            entry.update({"status": "mismatch", "beforeCount": len(before_rows), "afterCount": len(after_rows),
                          "mismatches": [{"path": f"scenario.{name}.rng.afterNativeFire",
                                          "reason": "scenario missing or duplicated on one side"}]})
            entries.append(entry)
            continue
        before_value, before_missing = post_native_fire_rng(before_rows[0])
        after_value, after_missing = post_native_fire_rng(after_rows[0])
        entry.update({"before": before_value, "after": after_value,
                      "requiredFieldsMissing": {"before": before_missing, "after": after_missing}})
        if before_value is None and after_value is None and before_rows[0].get("rng") is None and after_rows[0].get("rng") is None:
            entry["status"] = "not-provided"
            entry["note"] = "Legacy capture pair has no RNG trace; no afterNativeFire claim is made."
        elif before_missing or after_missing or before_value is None or after_value is None:
            entry["status"] = "incomplete"
            entry["mismatches"] = [{"path": f"scenario.{name}.rng.afterNativeFire",
                                    "requiredFieldsMissing": entry["requiredFieldsMissing"],
                                    "reason": "numeric post-fire RNG state/count evidence is incomplete"}]
        else:
            entry["mismatches"] = differences(before_value, after_value, f"scenario.{name}.rng.afterNativeFire")
            entry["status"] = "matched" if not entry["mismatches"] else "mismatch"
        entries.append(entry)
    status = "mismatch" if any(item["status"] in ("mismatch", "incomplete") for item in entries) else (
        "matched" if any(item["status"] == "matched" for item in entries) else "not-provided"
    )
    return {
        "status": status,
        "scenarioCount": len(entries),
        "verifiedScenarioCount": sum(item["status"] == "matched" for item in entries),
        "notProvidedScenarioCount": sum(item["status"] == "not-provided" for item in entries),
        "incompleteScenarioCount": sum(item["status"] == "incomplete" for item in entries),
        "mismatchScenarioCount": sum(item["status"] == "mismatch" for item in entries),
        "comparisonFields": list(POST_NATIVE_FIRE_RNG_FIELDS),
        "entries": entries,
        "note": "Only numeric seed/draw-count/state after the atomic native fire operation gate physical equality; caller stacks and earlier setup snapshots remain visible under rngDiagnostics.",
    }


def rng_diagnostics(before: dict[str, Any], after: dict[str, Any]) -> list[dict[str, Any]]:
    def index(document: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
        result: dict[str, list[dict[str, Any]]] = defaultdict(list)
        rows = document.get("visualScenarios")
        if isinstance(rows, list):
            for row in rows:
                if isinstance(row, dict) and isinstance(row.get("name"), str):
                    result[row["name"]].append(row)
        return result
    left, right = index(before), index(after)
    entries = []
    for name in sorted(left.keys() | right.keys()):
        lrows, rrows = left.get(name, []), right.get(name, [])
        if len(lrows) == len(rrows) == 1:
            entries.append(rng_diagnostic_entry(name, lrows[0], rrows[0]))
        else:
            entries.append({"scenario": name, "status": "unpaired", "beforeCount": len(lrows),
                            "afterCount": len(rrows), "rawDifferences": [], "callerStackDifferences": [],
                            "otherRngDiagnosticDifferences": []})
    return entries


def prior_squid_spawn_values(value: Any, path: str = "$") -> dict[str, Any]:
    found: dict[str, Any] = {}
    if isinstance(value, dict):
        for key, item in value.items():
            child_path = f"{path}.{key}"
            if key == "priorSquidSpawn":
                found[child_path] = item
            else:
                found.update(prior_squid_spawn_values(item, child_path))
    elif isinstance(value, list):
        for index, item in enumerate(value):
            found.update(prior_squid_spawn_values(item, f"{path}[{index}]"))
    return found


def lifecycle_diagnostics(before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    left = prior_squid_spawn_values(before)
    right = prior_squid_spawn_values(after)
    raw = differences(left, right, "priorSquidSpawnDiagnostics")
    return {
        "status": "changed" if raw else "matched" if left or right else "not-provided",
        "before": left,
        "after": right,
        "rawDifferences": raw,
        "note": "Only priorSquidSpawn startup history is provenance-only; post-reset lifecycle fields remain in physical comparisons.",
    }


def canonical_physical_projection(document: dict[str, Any]) -> dict[str, Any]:
    provenance = document.get("provenance")
    if not isinstance(provenance, dict):
        return {}
    result: dict[str, Any] = {}
    placement = provenance.get("canonicalPlacement")
    if isinstance(placement, dict):
        result["canonicalPlacement"] = without_prior_squid_spawn(known_fields(placement, CANONICAL_PLACEMENT_FIELDS))
    lifecycle = provenance.get("canonicalLifecycleReset")
    if isinstance(lifecycle, dict):
        result["canonicalLifecycleReset"] = without_prior_squid_spawn(lifecycle)
    return result


def canonical_physical_verification(before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    left, right = canonical_physical_projection(before), canonical_physical_projection(after)
    if not left and not right:
        return {"status": "not-provided", "before": left, "after": right, "mismatches": [],
                "note": "Legacy receipts contain no canonical placement/lifecycle physical record."}
    mismatches = differences(left, right, "canonicalPhysicalSetup")
    return {"status": "matched" if not mismatches else "mismatch", "before": left, "after": right,
            "mismatches": mismatches,
            "comparisonFields": ["canonicalPlacement.pos/team/inkHex/yaw/aim/floorHit/bootSeed",
                                  "canonicalLifecycleReset except priorSquidSpawn"]}


def index_receipts(document: dict[str, Any]) -> tuple[dict[tuple[Any, ...], list[tuple[int, dict[str, Any]]]], list[dict[str, Any]]]:
    receipts = document.get("screenshots")
    if not isinstance(receipts, list):
        return {}, [{"path": "$.screenshots", "reason": "missing or not a list"}]
    indexed: dict[tuple[Any, ...], list[tuple[int, dict[str, Any]]]] = defaultdict(list)
    malformed = []
    for index, receipt in enumerate(receipts):
        if not isinstance(receipt, dict):
            malformed.append({"index": index, "reason": "receipt is not an object"})
            continue
        missing_key = [field for field in PAIR_KEY_FIELDS if field not in receipt]
        if missing_key:
            malformed.append({"index": index, "reason": "missing pairing key fields", "fields": missing_key})
        indexed[receipt_key(receipt)].append((index, receipt))
    return indexed, malformed


def missing_receipt_evidence(receipt: dict[str, Any]) -> list[str]:
    missing = [field for field in RECEIPT_FIELDS if field not in receipt]
    runtime = receipt.get("runtime")
    if not isinstance(runtime, dict):
        return missing + ["runtime.projectiles"]
    projectiles = runtime.get("projectiles")
    if not isinstance(projectiles, list):
        return missing + ["runtime.projectiles"]
    for index, projectile in enumerate(projectiles):
        if not isinstance(projectile, dict):
            missing.append(f"runtime.projectiles[{index}] (not an object)")
            continue
        for field in ("seed", "age", "pos", "vel"):
            if field not in projectile:
                missing.append(f"runtime.projectiles[{index}].{field}")
        if not any(field in projectile for field in ("unit", "sloshUnit", "rollerUnit")):
            missing.append(f"runtime.projectiles[{index}].unit (no unit field present)")
    return missing


def projection(receipt: dict[str, Any]) -> dict[str, Any]:
    runtime = receipt.get("runtime")
    runtime_physical = ({field: runtime[field] for field in RUNTIME_PHYSICAL_FIELDS if field in runtime}
                        if isinstance(runtime, dict) else None)
    return {
        "receipt": {
            "scenario": receipt.get("scenario"),
            "phase": receipt.get("phase"),
            "frame": receipt.get("frame"),
            "perspective": receipt.get("perspective"),
            "perspectiveMode": receipt.get("perspectiveMode"),
            "seed": receipt.get("seed"),
            "camera": physical_camera(receipt.get("camera")),
            "captureConditions": physical_capture_conditions(receipt.get("captureConditions")),
        },
        "runtimePhysicalState": runtime_physical,
    }


def make_pair_entry(
    key: tuple[Any, ...],
    before_rows: list[tuple[int, dict[str, Any]]],
    after_rows: list[tuple[int, dict[str, Any]]],
) -> dict[str, Any]:
    entry: dict[str, Any] = {
        "key": printable_key(key),
        "beforeReceiptIndices": [index for index, _ in before_rows],
        "afterReceiptIndices": [index for index, _ in after_rows],
        "status": "matched",
        "mismatches": [],
    }
    if not before_rows or not after_rows:
        entry["status"] = "missing-counterpart"
        entry["mismatches"].append({
            "path": "$",
            "beforeCount": len(before_rows),
            "afterCount": len(after_rows),
            "reason": "capture receipt key missing on one side",
        })
        return entry
    if len(before_rows) != 1 or len(after_rows) != 1:
        entry["status"] = "duplicate-key"
        entry["mismatches"].append({
            "path": "$",
            "beforeCount": len(before_rows),
            "afterCount": len(after_rows),
            "reason": "capture receipt key is not unique on both sides",
        })
        return entry

    _before_index, before = before_rows[0]
    _after_index, after = after_rows[0]
    before_projection, after_projection = projection(before), projection(after)
    before_runtime = before.get("runtime")
    before_projectiles = before_runtime.get("projectiles") if isinstance(before_runtime, dict) else None
    before_camera = before.get("camera")
    after_camera = after.get("camera")
    before_current_setup = before_camera.get("currentVisualSetup") if isinstance(before_camera, dict) else None
    after_current_setup = after_camera.get("currentVisualSetup") if isinstance(after_camera, dict) else None
    entry.update({
        "beforeFile": before.get("file"),
        "afterFile": after.get("file"),
        "beforeImageSha256": before.get("sha256"),
        "afterImageSha256": after.get("sha256"),
        "beforeCropSha256": before.get("cropSha256"),
        "afterCropSha256": after.get("cropSha256"),
        "beforeStateSha256": value_hash(before_projection),
        "afterStateSha256": value_hash(after_projection),
        "nativeProjectileCount": len(before_projectiles) if isinstance(before_projectiles, list) else None,
        "nativeProjectileFieldsCompared": "full native projectile records, including seed/age/position/velocity/unit and drawRadius when present",
        "rawCameraCurrentVisualSetupDifferences": differences(
            before_current_setup, after_current_setup, "rawCamera.currentVisualSetup"),
        "rawCaptureConditionDifferences": differences(
            before.get("captureConditions"), after.get("captureConditions"), "rawCaptureConditions"),
        "requiredEvidenceMissing": {
            "before": missing_receipt_evidence(before),
            "after": missing_receipt_evidence(after),
        },
    })
    entry["mismatches"] = differences(before_projection, after_projection, "capture")
    for side, receipt in (("before", before), ("after", after)):
        missing = entry["requiredEvidenceMissing"][side]
        if missing:
            entry["mismatches"].append({
                "path": f"capture.requiredEvidenceMissing.{side}",
                "fields": missing,
                "reason": "required receipt/projectile state evidence is absent",
            })
    entry["status"] = "matched" if not entry["mismatches"] else "mismatch"
    return entry


def scenario_pairs(before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    def make_index(document: dict[str, Any]) -> tuple[dict[str, list[dict[str, Any]]], list[dict[str, Any]]]:
        rows = document.get("visualScenarios")
        if not isinstance(rows, list):
            return {}, [{"path": "$.visualScenarios", "reason": "missing or not a list"}]
        result: dict[str, list[dict[str, Any]]] = defaultdict(list)
        malformed = []
        for index, row in enumerate(rows):
            if not isinstance(row, dict) or not isinstance(row.get("name"), str):
                malformed.append({"index": index, "reason": "scenario has no string name"})
            else:
                result[row["name"]].append(row)
        return result, malformed

    before_index, before_malformed = make_index(before)
    after_index, after_malformed = make_index(after)
    entries = []
    contact_requirements = {
        "wall-shooter": ("setup.wall", "controllerProbe", "impactFrame", "captureFrame", "impactState", "impactEvidence"),
        "floor-slosher9": ("setup", "impactFrame", "captureFrame", "impactState", "impactEvidence"),
    }

    def has_path(value: dict[str, Any], path: str) -> bool:
        current: Any = value
        for part in path.split("."):
            if not isinstance(current, dict) or part not in current:
                return False
            current = current[part]
        if path in ("setup", "setup.wall", "controllerProbe"):
            return isinstance(current, dict)
        return current is not None

    for name in sorted(before_index.keys() | after_index.keys()):
        left, right = before_index.get(name, []), after_index.get(name, [])
        entry: dict[str, Any] = {
            "scenario": name,
            "beforeCount": len(left),
            "afterCount": len(right),
            "status": "matched",
            "birthCount": None,
            "impactCount": None,
            "beforeBirthsSha256": None,
            "afterBirthsSha256": None,
            "beforePhysicalStateSha256": None,
            "afterPhysicalStateSha256": None,
            "requiredPhysicalEvidenceMissing": {"before": [], "after": []},
            "mismatches": [],
        }
        if len(left) != 1 or len(right) != 1:
            entry["status"] = "missing-or-duplicate"
            entry["mismatches"].append({"path": "$", "reason": "scenario name missing or duplicated"})
        else:
            left_state = physical_scenario_projection(left[0])
            right_state = physical_scenario_projection(right[0])
            entry["mismatches"] = differences(left_state, right_state, "scenarioState")
            entry["rawSetupDifferences"] = differences(
                left[0].get("setup"), right[0].get("setup"), f"scenario.{name}.rawSetup")
            left_lifecycle = left[0].get("lifecycleReset")
            right_lifecycle = right[0].get("lifecycleReset")
            entry["rawLifecycleResetDifferences"] = differences(
                left_lifecycle, right_lifecycle, f"scenario.{name}.rawLifecycleReset")
            entry["rawEndStateDifferences"] = differences(
                left[0].get("endState"), right[0].get("endState"), f"scenario.{name}.rawEndState")
            entry["rawImpactStateDifferences"] = differences(
                left[0].get("impactState"), right[0].get("impactState"),
                f"scenario.{name}.rawImpactState")
            entry["impactFxDiagnostics"] = impact_fx_diagnostic(left[0], right[0], name)
            births = left[0].get("births")
            impacts = left[0].get("impacts")
            entry["birthCount"] = len(births) if isinstance(births, list) else None
            entry["impactCount"] = len(impacts) if isinstance(impacts, list) else None
            entry["beforeBirthsSha256"] = value_hash(births)
            entry["afterBirthsSha256"] = value_hash(right[0].get("births"))
            entry["beforePhysicalStateSha256"] = value_hash(left_state)
            entry["afterPhysicalStateSha256"] = value_hash(right_state)
            required = contact_requirements.get(name, ())
            entry["requiredPhysicalEvidenceMissing"] = {
                side: [field for field in required if not has_path(row, field)]
                for side, row in (("before", left[0]), ("after", right[0]))
            }
            for side, missing in entry["requiredPhysicalEvidenceMissing"].items():
                if missing:
                    entry["mismatches"].append({
                        "path": f"scenario.{name}.requiredPhysicalEvidenceMissing.{side}",
                        "fields": missing,
                        "reason": "scoped native contact/controller evidence is absent",
                    })
            entry["status"] = "matched" if not entry["mismatches"] else "mismatch"
        entries.append(entry)
    return {
        "status": "pass" if entries and all(row["status"] == "matched" for row in entries)
        and not before_malformed and not after_malformed else "fail",
        "scenarioCountBefore": sum(len(rows) for rows in before_index.values()),
        "scenarioCountAfter": sum(len(rows) for rows in after_index.values()),
        "comparisonFields": [
            "seed, setup physical fields, lifecycleReset post-reset fields, births, impacts",
            "endState.projectiles and endState.paintQuads",
            "controllerProbe, impactFrame, captureFrame, elapsedSinceImpactFrames, impactState except cosmetic impactState.fx, impactEvidence when present",
        ],
        "scopedContactProofRequirements": {
            "wall-shooter": list(contact_requirements["wall-shooter"]),
            "floor-slosher9": list(contact_requirements["floor-slosher9"]),
        },
        "note": "Controller and collision proof is compared exactly for the named wall/floor scenarios. Cosmetic impactState.fx pool counters remain raw diagnostics only; every other impactState field and startup lifecycle state except priorSquidSpawn is gated.",
        "scenarios": entries,
        "malformedBefore": before_malformed,
        "malformedAfter": after_malformed,
    }


def gl_summary(document: dict[str, Any]) -> dict[str, Any]:
    receipts = document.get("screenshots") if isinstance(document.get("screenshots"), list) else []
    samples = 0
    missing = 0
    nonzero = 0
    listed_errors = 0
    stale_errors = 0
    details = []
    missing_details = []
    for receipt in receipts:
        if not isinstance(receipt, dict):
            missing += 1
            continue
        runtime = receipt.get("runtime")
        render = runtime.get("render") if isinstance(runtime, dict) else None
        if not isinstance(render, dict):
            missing += 1
            continue
        samples += 1
        code = render.get("glError")
        errors = render.get("glErrors")
        stale = render.get("staleGlErrors")
        code_is_valid = isinstance(code, (int, float)) and not isinstance(code, bool)
        missing_fields = []
        if not code_is_valid:
            missing_fields.append("glError (missing or nonnumeric)")
        if not isinstance(errors, list):
            missing_fields.append("glErrors (missing or not a list)")
        if not isinstance(stale, list):
            missing_fields.append("staleGlErrors (missing or not a list)")
        if missing_fields:
            missing += 1
            missing_details.append({"key": printable_key(receipt_key(receipt)), "fields": missing_fields})
        errors = errors if isinstance(errors, list) else []
        stale = stale if isinstance(stale, list) else []
        listed_errors += len(errors)
        stale_errors += len(stale)
        if (code_is_valid and code != 0) or errors or stale:
            nonzero += 1
            details.append({
                "key": printable_key(receipt_key(receipt)),
                "glError": code,
                "glErrors": errors,
                "staleGlErrors": stale,
            })
    complete = samples == len(receipts) and missing == 0 and len(receipts) > 0
    error_free = complete and nonzero == 0 and listed_errors == 0 and stale_errors == 0
    return {
        "status": "error-free" if error_free else "incomplete" if not complete else "errors-observed",
        "screenshotCount": len(receipts),
        "renderDiagnosticSamples": samples,
        "missingRenderDiagnostics": missing,
        "screenshotsWithGlErrors": nonzero,
        "glErrorsArrayEntries": listed_errors,
        "staleGlErrorsArrayEntries": stale_errors,
        "errorDetails": details,
        "missingDiagnosticDetails": missing_details,
    }


def run_summary(document: dict[str, Any]) -> dict[str, Any]:
    return {
        "mode": document.get("mode"),
        "status": document.get("status"),
        "comparisonStatus": document.get("comparisonStatus"),
        "comparisonNote": document.get("comparisonNote"),
        "errors": document.get("errors"),
        "error": document.get("error"),
        "browserDiagnostics": document.get("browserDiagnostics"),
        "browserTrace": document.get("browserTrace"),
        "build": document.get("build"),
    }


def performance_summary(document: dict[str, Any]) -> dict[str, Any]:
    value = document.get("performance")
    rows = value if isinstance(value, list) else None
    present = value is not None and value != [] and value != {}
    return {
        "status": "present" if present else "absent",
        "recordCount": len(rows) if rows is not None else len(value) if isinstance(value, dict) else 1 if present else 0,
        "records": value,
    }


def verify_media(document: dict[str, Any], directory: Path) -> dict[str, Any]:
    checked, errors = 0, []
    for receipt in document.get("screenshots", []):
        for filename_key, hash_key in (("file", "sha256"), ("cropFile", "cropSha256")):
            filename = receipt.get(filename_key)
            if filename_key == "cropFile" and filename is None:
                continue
            if not isinstance(filename, str) or not filename:
                errors.append({"file": filename, "error": "missing filename"})
                continue
            target = (directory / filename).resolve()
            if not target.is_relative_to(directory.resolve()):
                errors.append({"file": filename, "error": "path outside capture directory"})
                continue
            try:
                actual = hashlib.sha256(target.read_bytes()).hexdigest()
                if actual != receipt.get(hash_key):
                    errors.append({"file": filename, "error": "SHA-256 mismatch"})
                else:
                    checked += 1
            except OSError as exc:
                errors.append({"file": filename, "error": str(exc)})
    return {"status": "pass" if checked and not errors else "fail", "verifiedFiles": checked, "errors": errors}


def verify_complete(document: dict[str, Any]) -> dict[str, Any]:
    errors = []
    if document.get("status") != "passed" or document.get("errors"):
        errors.append("capture invocation did not pass")
    if len(document.get("screenshots", [])) != 48 or len(document.get("visualScenarios", [])) != 6:
        errors.append("expected 48 captures and six native scenarios")
    for scenario in document.get("visualScenarios", []):
        rng = scenario.get("rng", {}).get("afterNativeFire", {})
        if not all(type(rng.get(field)) is int for field in REQUIRED_POST_NATIVE_FIRE_RNG_FIELDS):
            errors.append(f"missing native firing RNG proof: {scenario.get('name')}")
    rows = document.get("performance", [])
    expected = {"desktop-long-fire", "mobile-emulated-long-fire"}
    if len(rows) != 2 or {row.get("scenario") for row in rows} != expected:
        errors.append("expected one desktop and one mobile performance row")
    for row in rows:
        if (row.get("nativeFrames", 0) < 12 or row.get("renderSamples", 0) < 12
                or row.get("rafSamples", 0) < 11 or row.get("durationMs", 0) < 6000
                or row.get("fireCalls", 0) <= 0 or row.get("nonemptyProjectileUpdates", 0) <= 0
                or row.get("maxProjectiles", 0) <= 0 or row.get("fps", 0) <= 0
                or not row.get("warmup", {}).get("admitted")):
            errors.append(f"invalid measured workload: {row.get('scenario')}")
        if row.get("scenario") == "mobile-emulated-long-fire":
            viewport = row.get("viewport")
            if not isinstance(viewport, list) or len(viewport) != 2 or viewport[0] <= viewport[1]:
                errors.append("mobile performance requires landscape gameplay")
    if gl_summary(document)["screenshotsWithGlErrors"]:
        errors.append("capture contains WebGL errors")
    return {"status": "pass" if not errors else "fail", "errors": errors}


def compare(before_path: Path, after_path: Path, output_path: Path) -> dict[str, Any]:
    before, before_file_hash = read_json(before_path)
    after, after_file_hash = read_json(after_path)
    before_receipts, malformed_before = index_receipts(before)
    after_receipts, malformed_after = index_receipts(after)

    pairs = [make_pair_entry(key, before_receipts.get(key, []), after_receipts.get(key, []))
             for key in sorted(before_receipts.keys() | after_receipts.keys(), key=lambda value: repr(value))]
    pair_status_counts = Counter(pair["status"] for pair in pairs)
    unique_pair_count = sum(1 for pair in pairs if pair["status"] == "matched")
    before_screenshot_count = len(before.get("screenshots")) if isinstance(before.get("screenshots"), list) else 0
    after_screenshot_count = len(after.get("screenshots")) if isinstance(after.get("screenshots"), list) else 0
    all_pairs_match = (
        bool(pairs)
        and unique_pair_count == before_screenshot_count == after_screenshot_count
        and all(pair["status"] == "matched" for pair in pairs)
        and not malformed_before
        and not malformed_after
    )
    provenance_diff = differences(before.get("provenance"), after.get("provenance"), "provenance")
    scenarios = scenario_pairs(before, after)
    rng_diagnostic_rows = rng_diagnostics(before, after)
    post_native_rng = compare_post_native_fire_rng(before, after)
    lifecycle_diagnostic = lifecycle_diagnostics(before, after)
    canonical_physical = canonical_physical_verification(before, after)
    overall_before, overall_after = run_summary(before), run_summary(after)
    statuses = (overall_before["status"], overall_after["status"])
    overall_ci_passed = statuses == ("passed", "passed")
    overall_ci_status = "passed" if overall_ci_passed else (
        "failed" if any(status in ("failed", "error") for status in statuses) else "incomplete"
    )
    physical_checks = {
        "pairedCaptures": "pass" if all_pairs_match else "fail",
        "nativeScenarioState": scenarios["status"],
        "postNativeFireRng": post_native_rng["status"],
        "canonicalPhysicalSetup": canonical_physical["status"],
    }
    physical_status = "pass" if (
        physical_checks["pairedCaptures"] == "pass"
        and physical_checks["nativeScenarioState"] == "pass"
        and physical_checks["postNativeFireRng"] in ("matched", "not-provided")
        and physical_checks["canonicalPhysicalSetup"] in ("matched", "not-provided")
    ) else "fail"

    result = {
        "schema": 1,
        "analysis": "exact paired screenshot receipt comparison; visual output hashes are recorded but not required to match",
        "inputs": {
            "before": {"path": str(before_path), "sha256": before_file_hash,
                       "mode": before.get("mode"), "build": before.get("build")},
            "after": {"path": str(after_path), "sha256": after_file_hash,
                      "mode": after.get("mode"), "build": after.get("build")},
        },
        "overallCiRuns": {
            "before": overall_before,
            "after": overall_after,
            "bothPassed": overall_ci_passed,
            "status": overall_ci_status,
            "note": "This run status is independent of the paired screenshot receipt verification below.",
        },
        "captureProvenance": {
            "status": "matched" if not provenance_diff else "mismatch",
            "beforeSha256": value_hash(before.get("provenance")),
            "afterSha256": value_hash(after.get("provenance")),
            "mismatches": provenance_diff,
        },
        "physicalVerification": {
            "status": physical_status,
            "checks": physical_checks,
            "note": "Physical equality gates screenshot receipts, native scenario state, explicit canonical setup/camera fields, and numeric RNG seed/draw-count/state after atomic native fire. Only impactState.fx cosmetic counters, prior Squid Spawn history, and RNG caller stack URLs remain raw diagnostics only.",
        },
        "canonicalPhysicalSetupVerification": canonical_physical,
        "nativeScenarioStateVerification": scenarios,
        "postNativeFireRngVerification": post_native_rng,
        "rngDiagnostics": rng_diagnostic_rows,
        "lifecycleDiagnostics": lifecycle_diagnostic,
        "pairedCaptureVerification": {
            "status": "pass" if all_pairs_match else "fail",
            "expectedPairs": before_screenshot_count,
            "pairCount": len(pairs),
            "matchedPairCount": pair_status_counts.get("matched", 0),
            "mismatchPairCount": pair_status_counts.get("mismatch", 0),
            "missingCounterpartPairCount": pair_status_counts.get("missing-counterpart", 0),
            "duplicateKeyPairCount": pair_status_counts.get("duplicate-key", 0),
            "receiptCountBefore": before_screenshot_count if isinstance(before.get("screenshots"), list) else None,
            "receiptCountAfter": after_screenshot_count if isinstance(after.get("screenshots"), list) else None,
            "malformedReceiptsBefore": malformed_before,
            "malformedReceiptsAfter": malformed_after,
            "comparisonFields": list(RECEIPT_FIELDS) + [
                "camera physical fields (explicit known-field projection)",
                "captureConditions physical fields (including native wall/floor face proof)",
                "runtime.projectiles (full native state records, including drawRadius when present)",
                *RUNTIME_PHYSICAL_FIELDS,
            ],
            "projectileEvidenceFieldsRequired": ["seed", "age", "pos", "vel", "unit/sloshUnit/rollerUnit"],
            "pairs": pairs,
        },
        "glErrors": {
            "before": gl_summary(before),
            "after": gl_summary(after),
        },
        "performance": {
            "before": performance_summary(before),
            "after": performance_summary(after),
        },
    }
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--before", required=True, help="baseline JSON file or directory containing it")
    parser.add_argument("--after", required=True, help="candidate JSON file or directory containing it")
    parser.add_argument("--output", required=True, help="paired verification JSON output path")
    parser.add_argument("--require-complete", action="store_true",
                        help="also require both full capture runs, live workloads and exact image hashes")
    args = parser.parse_args()

    before_path, after_path = input_file(args.before), input_file(args.after)
    output_path = Path(args.output).expanduser().resolve()
    if output_path in (before_path, after_path) or output_path.suffix.lower() == ".png":
        parser.error("--output must be a separate JSON path; input files and previews are read-only")
    if output_path.suffix.lower() != ".json":
        parser.error("--output must end in .json")

    try:
        result = compare(before_path, after_path, output_path)
        if args.require_complete:
            before, _ = read_json(before_path)
            after, _ = read_json(after_path)
            result["completeVerification"] = {
                "before": verify_complete(before), "after": verify_complete(after),
                "mediaBefore": verify_media(before, before_path.parent),
                "mediaAfter": verify_media(after, after_path.parent),
            }
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    except (OSError, ValueError, TypeError) as exc:
        print(f"compare-captures: {exc}", file=sys.stderr)
        return 2

    pairs = result["pairedCaptureVerification"]
    print(json.dumps({
        "output": str(output_path),
        "pairedCaptureStatus": pairs["status"],
        "physicalVerificationStatus": result["physicalVerification"]["status"],
        "postNativeFireRngStatus": result["postNativeFireRngVerification"]["status"],
        "matchedPairCount": pairs["matchedPairCount"],
        "expectedPairs": pairs["expectedPairs"],
        "overallCiStatus": result["overallCiRuns"]["status"],
        "glErrorsBefore": result["glErrors"]["before"]["screenshotsWithGlErrors"],
        "glErrorsAfter": result["glErrors"]["after"]["screenshotsWithGlErrors"],
        "performanceBefore": result["performance"]["before"]["status"],
        "performanceAfter": result["performance"]["after"]["status"],
    }, indent=2))
    complete = all(row["status"] == "pass" for row in result.get("completeVerification", {}).values())
    return 0 if result["physicalVerification"]["status"] == "pass" and complete else 1


if __name__ == "__main__":
    raise SystemExit(main())
