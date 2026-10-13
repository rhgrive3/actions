#!/usr/bin/env python3
"""Build private triangle-support evidence, never a playable stage catalog.

Trial bounds and pad samples test the two visible opposing banks. They are not
Nintendo placement data and deliberately do not appear in the stage definition.
"""
import argparse
import json
from pathlib import Path
import numpy as np
from obj_import import parse_obj, bvh, sha


def build(source, out, definition):
    spec = json.loads(definition.read_text())
    obj = source / spec["internal"] / (spec["internal"] + ".obj")
    if sha(obj) != spec["sourceSha256"]:
        raise ValueError("Mahi diagnostic requires pinned revised04 OBJ")
    vertices, indices, objects = parse_obj(obj, spec.get("sourceSemantics"))
    triangles, normals, flags, ids = [], [], [], []
    for oi, obj in enumerate(objects):
        if not obj["collidable"]:
            continue
        face = indices[obj["io"]:obj["io"] + obj["ic"]].reshape(-1, 3) + obj["vo"]
        t = vertices[face, :3]
        n = np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0])
        length = np.linalg.norm(n, axis=1)
        good = length > 1e-9
        t, face, n = t[good], face[good], n[good] / length[good, None]
        n[np.einsum("ij,ij->i", n, vertices[face, 3:6].mean(axis=1)) < 0] *= -1
        triangles.append(t)
        normals.append(n)
        flags.extend([1 | (2 if obj["paintable"] else 0) | (4 if obj["grate"] else 0) | (8 if obj["glass"] else 0)] * len(t))
        ids.extend([oi] * len(t))
    triangles = np.concatenate(triangles).astype("<f4")
    normals = np.concatenate(normals).astype("<f4")
    nodes, order = bvh(triangles)
    out.mkdir(parents=True, exist_ok=True)
    arrays = dict(vertices=vertices, indices=indices, collision=triangles, normals=normals,
                  flags=np.asarray(flags, dtype="<u4"), objects=np.asarray(ids, dtype="<u4"),
                  bvh=nodes, order=order, triangleFace=np.full(len(triangles), -1, dtype="<i4"),
                  mask=np.zeros(0, dtype="u1"))
    for name, array in arrays.items():
        array.tofile(out / (name + ".bin"))
    manifest = dict(id="mahi", diagnosticOnly=True, availability="placement-unavailable",
                    bounds=dict(minX=-76.5, minZ=-36., maxX=76.5, maxZ=36.),
                    spawnPads=[[-68., 19.58, -26.], [68., 19.58, 26.]], spawnBarrier=2.5,
                    spawnStatus="Trial support samples on disconnected banks, never retail placements",
                    sourceSemantics=spec.get("sourceSemantics"), objects=objects, faces=[])
    (out / "manifest.json").write_text(json.dumps(manifest))
    print(json.dumps(dict(id="mahi", diagnosticOnly=True, collisionTriangles=len(triangles), bvhNodes=len(nodes))))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--definition", default=Path(__file__).resolve().parents[1] / "definitions/mahi.json", type=Path)
    args = parser.parse_args()
    build(args.source, args.out, args.definition)
