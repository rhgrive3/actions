#!/usr/bin/env python3
"""Normalize privately decoded Splatoon 3 Banc JSON without inventing placements.

The format is grounded in OctoSquiddy/Splatoon-3-Map-Editor, commit
0e3c66d28b58f7b43df7cdfb6c34514e0ebc1fd4 (StageDefinition, MuObj,
SpatialObject, MuRail, MuRailPoint). This tool does not decode RomFS/BYML,
infer missing actors, certify a game version, or recover movement logic.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path

SAFE_INTEGER = 2**53 - 1
UINT64_MAX = 2**64 - 1
RULE_LAYERS = dict(turf="Pnt", zones="Var", tower="Vlf", rainmaker="Vgl", clams="Vcl")


def identifier(value, where):
    if isinstance(value, bool) or not isinstance(value, (int, str)):
        raise ValueError(f"{where}: expected a lossless uint64 identifier")
    text = str(value)
    if not text.isascii() or not text.isdecimal() or int(text) > UINT64_MAX:
        raise ValueError(f"{where}: invalid uint64 identifier")
    return str(int(text))


def vector(value, where):
    if not isinstance(value, dict) or set(value) != {"X", "Y", "Z"}:
        raise ValueError(f"{where}: explicit X/Y/Z vector required")
    result = [value[k] for k in ("X", "Y", "Z")]
    if any(isinstance(x, bool) or not isinstance(x, (float, int)) or not math.isfinite(x) for x in result):
        raise ValueError(f"{where}: non-finite vector")
    return result


def safe_json(value):
    # JSON.parse cannot represent uint64 references exactly. Preserve all large
    # integers in parameter banks, AI groups and links as decimal strings too.
    if isinstance(value, int) and not isinstance(value, bool) and abs(value) > SAFE_INTEGER:
        return str(value)
    if isinstance(value, list):
        return [safe_json(v) for v in value]
    if isinstance(value, dict):
        return {k: safe_json(v) for k, v in value.items()}
    return value


def normalize(document, raw, stage_id, reference_version):
    if not isinstance(document, dict) or not isinstance(document.get("Actors"), list) or not isinstance(document.get("Rails"), list):
        raise ValueError("Decoded Banc must contain explicit Actors and Rails arrays")
    if not stage_id or not reference_version:
        raise ValueError("Stage id and reference version must be supplied explicitly")
    seen = set()

    def unique(value, where):
        result = identifier(value, where)
        if result in seen:
            raise ValueError(f"{where}: duplicate Hash {result}")
        seen.add(result)
        return result

    def layer(row, where):
        result = row.get("Layer")
        if not isinstance(result, str) or not result:
            raise ValueError(f"{where}: explicit Layer required")
        return result

    actors = []
    for i, row in enumerate(document["Actors"]):
        at = f"Actors[{i}]"
        if not isinstance(row, dict) or not isinstance(row.get("Gyaml"), str) or not row["Gyaml"]:
            raise ValueError(f"{at}: explicit Gyaml required")
        scale = vector(row.get("Scale"), at + ".Scale")
        if any(x == 0 for x in scale):
            raise ValueError(f"{at}: singular Scale")
        actors.append(dict(id=unique(row.get("Hash"), at + ".Hash"), gyaml=row["Gyaml"], layer=layer(row, at),
                           translate=vector(row.get("Translate"), at + ".Translate"),
                           rotate=vector(row.get("Rotate"), at + ".Rotate"), scale=scale,
                           source=safe_json(row)))

    rails = []
    point_ids = set()
    for i, row in enumerate(document["Rails"]):
        at = f"Rails[{i}]"
        if not isinstance(row, dict) or not isinstance(row.get("Points"), list) or not isinstance(row.get("IsClosed"), bool):
            raise ValueError(f"{at}: explicit Points and IsClosed required")
        rail_id = unique(row.get("Hash"), at + ".Hash")
        points = []
        for j, point in enumerate(row["Points"]):
            name = f"{at}.Points[{j}]"
            if not isinstance(point, dict):
                raise ValueError(f"{name}: object required")
            pid = unique(point.get("Hash"), name + ".Hash")
            point_ids.add(pid)
            points.append(dict(id=pid, translate=vector(point.get("Translate"), name + ".Translate"), source=safe_json(point)))
        rails.append(dict(id=rail_id, layer=layer(row, at), closed=row["IsClosed"], points=points, source=safe_json(row)))

    # ToRailPoint links must remain resolvable. Do not replace a missing link
    # with a guessed route, or confuse a rail id with a rail-point id.
    unresolved = []
    def references(value, path):
        if isinstance(value, dict):
            for key, child in value.items():
                if key == "ToRailPoint":
                    target = identifier(child, path + ".ToRailPoint")
                    if target != "0" and target not in point_ids:
                        unresolved.append(dict(path=path + ".ToRailPoint", target=target))
                else:
                    references(child, path + "." + key)
        elif isinstance(value, list):
            for i, child in enumerate(value):
                references(child, f"{path}[{i}]")
    references(document, "Banc")
    return dict(schema=1, stageId=stage_id, referenceVersion=reference_version,
                versionVerified=False, diagnosticOnly=True,
                sourceDocument=dict(format="decoded-banc-json", sha256=hashlib.sha256(raw).hexdigest()),
                ruleLayers=RULE_LAYERS, actors=actors, rails=rails,
                aiGroups=safe_json(document.get("AiGroups")), unresolvedRailPoints=unresolved,
                limits=["Only explicitly supplied transforms; no inferred actor placements",
                        "Rotate values retained as radians; Euler convention must be declared by the binding plan",
                        "Rail controls, parameter banks and AI groups preserved, not simulated",
                        "Does not enable a stage or certify retail collision/paint/version"])


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--input", required=True, type=Path)
    p.add_argument("--out", required=True, type=Path)
    p.add_argument("--stage", required=True)
    p.add_argument("--reference-version", required=True)
    args = p.parse_args()
    raw = args.input.read_bytes()
    def invalid_constant(value):
        raise ValueError("Non-finite JSON constant: " + value)
    def unique_keys(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("Duplicate JSON key: " + key)
            result[key] = value
        return result
    document = json.loads(raw, parse_constant=invalid_constant, object_pairs_hook=unique_keys)
    result = normalize(document, raw, args.stage, args.reference_version)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n")
    print(json.dumps(dict(actors=len(result["actors"]), rails=len(result["rails"]), unresolvedRailPoints=len(result["unresolvedRailPoints"]), diagnosticOnly=True)))


if __name__ == "__main__":
    main()
