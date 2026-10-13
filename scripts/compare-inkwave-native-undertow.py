#!/usr/bin/env python3
"""Independent pinned OBJ/binary comparison; inputs and derived arrays stay local."""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import subprocess

PIN = "a32cff26b1a142d31e7658ebc48f213059b3ea42e86d32ed12cb80de5b03d046"
TREE = "4f42953ce879e1e65a44342239eccfa728f8fa8f"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def compare(source, prepared, repository=None):
    raw = source.read_bytes()
    assert digest(raw) == PIN, "Undertow source is not the pinned revised-stage OBJ"
    positions, normals, uvs, references = [], [], [], []
    objects, offset, uv_offset, normal_offset, vertex_count = [], 0, 0, 0, 0
    vertex_bytes, index_bytes = bytearray(), bytearray()
    name = None

    def finish():
        nonlocal offset, uv_offset, normal_offset, vertex_count
        if name is None or not positions:
            return
        assert len(positions) == len(normals)
        assert len(uvs) in (0, len(positions))
        for j, (position, normal) in enumerate(zip(positions, normals)):
            vertex_bytes.extend(struct.pack("<8f", *position, *normal, *(uvs[j] if uvs else (0, 0))))
        for polygon in references:
            for j in range(1, len(polygon) - 1):
                index_bytes.extend(struct.pack("<3I", polygon[0], polygon[j], polygon[j + 1]))
        objects.append({"name": name, "vertices": len(positions), "triangles": sum(len(p) - 2 for p in references)})
        vertex_count += len(positions)
        offset += len(positions)
        uv_offset += len(uvs)
        normal_offset += len(normals)
        positions.clear()
        normals.clear()
        uvs.clear()
        references.clear()

    for line in raw.decode().splitlines():
        fields = line.split()
        if not fields:
            continue
        if fields[0] == "o":
            finish()
            name = line[2:].strip()
        elif fields[0] == "v":
            positions.append(tuple(map(float, fields[1:4])))
        elif fields[0] == "vn":
            normals.append(tuple(map(float, fields[1:4])))
        elif fields[0] == "vt":
            uvs.append(tuple(map(float, fields[1:3])))
        elif fields[0] == "f":
            polygon = []
            for token in fields[1:]:
                parts = token.split("/")
                index = int(parts[0]) - 1 - offset
                assert 0 <= index < len(positions)
                # The export aligns attributes. Reject changes to this contract.
                assert int(parts[2]) - 1 - normal_offset == index
                if parts[1]:
                    assert int(parts[1]) - 1 - uv_offset == index
                polygon.append(index)
            references.append(polygon)
    finish()
    vertices, indices = (prepared / "vertices.bin").read_bytes(), (prepared / "indices.bin").read_bytes()
    assert vertices == vertex_bytes, "Positions, normals or UVs changed during import"
    assert indices == index_bytes, "Source triangle indices changed during import"
    manifest = json.loads((prepared / "manifest.json").read_text())
    assert len(manifest["objects"]) == len(objects)
    for original, converted in zip(objects, manifest["objects"]):
        assert (original["name"], original["vertices"], original["triangles"]) == (converted["name"], converted["vc"], converted["ic"] // 3)
    result = {
        "id": "undertow", "internal": "Vss_Temple01", "sourceSha256": PIN,
        "sourceBytes": len(raw), "objects": len(objects), "vertices": vertex_count,
        "triangles": len(index_bytes) // 12, "vertexBytes": len(vertices), "indexBytes": len(indices),
        "verticesSha256": digest(vertices), "indicesSha256": digest(indices),
        "positionsNormalsUVsExact": True, "indicesExact": True, "objectRangesExact": True,
        "version1130ExtractionVerified": False,
    }
    if repository:
        entries = subprocess.check_output(["git", "-C", str(repository), "ls-tree", "-rz", TREE]).split(b"\0")
        count, byte_count = 0, 0
        for entry in entries:
            if not entry:
                continue
            metadata, name_bytes = entry.split(b"\t", 1)
            name = name_bytes.decode()
            if name != "Vss_Temple01.mtl" and not name.startswith("textures/"):
                continue
            mode, kind, oid = metadata.split()
            assert mode == b"100644" and kind == b"blob"
            data = (source.parent / name).read_bytes()
            actual = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
            assert actual == oid.decode(), "MTL/PNG differs from pinned Git tree: " + name
            count += 1
            byte_count += len(data)
        for name, integrity in manifest["textureIntegrity"].items():
            data = (prepared / name).read_bytes()
            assert data == (source.parent / name).read_bytes(), "Copied source texture changed: " + name
            assert digest(data) == integrity["sha256"] and len(data) == integrity["bytes"]
        result.update({"tree": TREE, "mtlAndPngGitBlobsVerified": count, "mtlAndPngBytes": byte_count,
                       "copiedSourceTexturesExact": len(manifest["textureIntegrity"]),
                       "mtlSha256": digest((source.parent / "Vss_Temple01.mtl").read_bytes())})
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("prepared", type=Path)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--repository", type=Path, help="Read-only KiTrix clone for pinned MTL/PNG Git-blob validation")
    args = parser.parse_args()
    result = compare(args.source, args.prepared, args.repository)
    text = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(text)
    print(text, end="")
