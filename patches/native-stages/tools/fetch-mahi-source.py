#!/usr/bin/env python3
"""Acquire the pinned revised Mahi display export into an ignored local directory.

The source checkout is only read with git show/ls-tree. Preserve proxy and TLS
defaults, verify LFS SHA-256 and every raw MTL/PNG Git blob, never commit assets.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

COMMIT = "0611f51b35c9736ee986fb2218461e2585b7875e"
TREE = "0aa56643280cbb4271142de95ecc1d95839f5839"
INTERNAL = "Vss_Hiagari04"


def acquire(repo, out):
    def git(*args):
        return subprocess.check_output(["git", "-C", str(repo), *args])

    actual_tree = git("ls-tree", COMMIT, "stages/" + INTERNAL).decode().split()[2]
    if actual_tree != TREE:
        raise ValueError("Pinned revised Mahi source tree mismatch")
    out.mkdir(parents=True, exist_ok=True)
    records = []
    rows = git("ls-tree", "-rz", TREE).split(b"\0")
    for row in rows:
        if not row:
            continue
        meta, encoded_name = row.split(b"\t", 1)
        name = encoded_name.decode()
        if name != INTERNAL + ".obj" and name != INTERNAL + ".mtl" and not name.startswith("textures/"):
            continue
        mode, kind, blob = meta.decode().split()
        if mode != "100644" or kind != "blob" or ".." in Path(name).parts:
            raise ValueError("Unexpected source file: " + name)
        raw = git("show", blob)
        if hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest() != blob:
            raise ValueError("Pinned Git blob mismatch: " + name)
        target = out / name
        target.parent.mkdir(parents=True, exist_ok=True)
        if name.endswith(".obj"):
            pointer = dict(line.split(" ", 1) for line in raw.decode().splitlines())
            expected = pointer["oid"].removeprefix("sha256:")
            size = int(pointer["size"])
            if not target.is_file() or target.stat().st_size != size or hashlib.sha256(target.read_bytes()).hexdigest() != expected:
                temporary = target.with_suffix(".download")
                subprocess.run(["curl", "--fail", "--location", "--silent", "--show-error",
                                "https://media.githubusercontent.com/media/kirakira-dev/KiTrix/" + COMMIT + "/stages/" + INTERNAL + "/" + name,
                                "--output", str(temporary)], check=True)
                if temporary.stat().st_size != size or hashlib.sha256(temporary.read_bytes()).hexdigest() != expected:
                    raise ValueError("LFS OID/size mismatch: " + name)
                temporary.replace(target)
            records.append(dict(file=name, gitPointerBlob=blob, bytes=size, sha256=expected, lfsVerified=True))
        else:
            target.write_bytes(raw)
            records.append(dict(file=name, gitBlob=blob, bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest(), gitBlobVerified=True))
    if not any(r.get("lfsVerified") for r in records):
        raise ValueError("Missing revised Mahi LFS OBJ")
    report = dict(sourceCommit=COMMIT, sourceTree=TREE, internal=INTERNAL, files=records)
    (out.parent / "mahi-source-identity.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(dict(sourceCommit=COMMIT, sourceTree=TREE, internal=INTERNAL,
                          objSha256=next(r["sha256"] for r in records if r.get("lfsVerified")),
                          rawFilesVerified=len(records) - 1)))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    acquire(args.repo, args.out)
