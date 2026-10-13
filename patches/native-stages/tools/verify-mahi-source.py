#!/usr/bin/env python3
"""Independent raw text-stream audit of revised Mahi render buffers and placement gaps.

Only numeric evidence is suitable for committing. Source models, textures and
buffer derivatives must remain in ignored local directories.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import numpy as np


def audit(source, buffers):
    obj = source / "Vss_Hiagari04.obj"
    positions, normals, uvs, expected_uvs, indices, objects = [], [], [], [], [], []
    current = None
    offset = 0

    def flush():
        nonlocal offset
        if current is None:
            return
        values = positions[offset:]
        if not values:
            return
        count = len(values)
        count_uv = len(uvs) - current["uvOffset"]
        if count_uv not in (0, count):
            raise ValueError("Unsupported independent UV stream")
        expected_uvs.extend(uvs[current["uvOffset"]:] if count_uv else [(0., 0.)] * count)
        arr = np.asarray(values)
        objects.append(dict(name=current["name"], material=current.get("material"),
                            vertices=count, triangles=current["triangles"],
                            bounds=[arr.min(axis=0).tolist(), arr.max(axis=0).tolist()]))
        offset += count

    for line in obj.open():
        if line.startswith("o "):
            flush()
            current = dict(name=line[2:].strip(), uvOffset=len(uvs), normalOffset=len(normals), triangles=0)
        elif line.startswith("v "):
            positions.append(tuple(map(float, line.split()[1:4])))
        elif line.startswith("vn "):
            normals.append(tuple(map(float, line.split()[1:4])))
        elif line.startswith("vt "):
            uvs.append(tuple(map(float, line.split()[1:3])))
        elif line.startswith("usemtl "):
            current["material"] = line[7:].strip()
        elif line.startswith("f "):
            face = []
            for token in line.split()[1:]:
                vi, ui, ni = token.split("/")
                local = int(vi) - 1 - offset
                if int(ni) - 1 - current["normalOffset"] != local:
                    raise ValueError("Independent normal index mismatch")
                if ui and int(ui) - 1 - current["uvOffset"] != local:
                    raise ValueError("Independent texture index mismatch")
                face.append(local)
            for k in range(1, len(face) - 1):
                indices.extend((face[0], face[k], face[k + 1]))
                current["triangles"] += 1
    flush()
    vertices = np.fromfile(buffers / "vertices.bin", dtype="<f4").reshape(-1, 8)
    actual_indices = np.fromfile(buffers / "indices.bin", dtype="<u4")
    checks = dict(positionsFloat32Identical=np.array_equal(vertices[:, :3], np.asarray(positions, dtype="<f4")),
                  normalsFloat32Identical=np.array_equal(vertices[:, 3:6], np.asarray(normals, dtype="<f4")),
                  uvFloat32Identical=np.array_equal(vertices[:, 6:8], np.asarray(expected_uvs, dtype="<f4")),
                  indicesUint32Identical=np.array_equal(actual_indices, np.asarray(indices, dtype="<u4")))
    if not all(checks.values()):
        raise ValueError("Revised Mahi original render buffer mismatch: " + json.dumps(checks))
    identity = json.loads((source.parent / "mahi-source-identity.json").read_text())
    for file in identity["files"]:
        raw = (source / file["file"]).read_bytes()
        if len(raw) != file["bytes"] or hashlib.sha256(raw).hexdigest() != file["sha256"]:
            raise ValueError("Acquired raw source mismatch: " + file["file"])
        if "gitBlob" in file and hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest() != file["gitBlob"]:
            raise ValueError("Raw pinned MTL/PNG Git blob mismatch")
    floats = [o for o in objects if o["name"].startswith("FldObj_Hiagari04Float")]
    waters = [o for o in objects if "water" in (o["name"] + " " + str(o["material"])).lower()]
    layer_names = [o["name"] for o in objects if re.search(r"Pack(Pnt|Var|Vlf|Vgl|Vcl|Tcl)", o["name"])]
    return dict(id="mahi", internal="Vss_Hiagari04", sourceCommit=identity["sourceCommit"],
                sourceTree=identity["sourceTree"], objSha256=hashlib.sha256(obj.read_bytes()).hexdigest(),
                objBytes=obj.stat().st_size, vertices=len(positions), triangles=len(indices) // 3,
                objects=len(objects), **checks, maxPositionDifference=0., rawMtlAndPngGitBlobsVerified=len(identity["files"]) - 1,
                pngFilesVerified=sum(f["file"].endswith(".png") for f in identity["files"]),
                floatPrototypeObjects=floats, waterNamedObjects=waters, explicitRuleLayerObjects=len(layer_names),
                placementTransformsAvailable=False, waterStateAvailable=False, version1130Verified=False)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--buffers", required=True, type=Path)
    parser.add_argument("--report", required=True, type=Path)
    args = parser.parse_args()
    report = audit(args.source, args.buffers)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({k: v for k, v in report.items() if k not in ("floatPrototypeObjects", "waterNamedObjects")}))
