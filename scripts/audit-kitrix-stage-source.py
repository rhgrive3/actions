#!/usr/bin/env python3
"""Audit third-party Splatoon 3 stage OBJ meshes as *references*, not validated collision.
Read-only; no original copyrighted geometry is copied into the report or Git history.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path

p=argparse.ArgumentParser()
p.add_argument("--root",type=Path,required=True)
p.add_argument("--stage",required=True)
p.add_argument("--internal",required=True)
p.add_argument("--revision",required=True)
p.add_argument("--out",type=Path,required=True)
a=p.parse_args()
root=a.root.resolve()
stage=root/"stages"/a.internal
if not stage.is_dir(): raise SystemExit(f"Missing source stage directory: {stage}")
files=sorted(stage.rglob("*.obj"))
if not files: raise SystemExit(f"No OBJ models in {stage}")
records=[]
for file in files:
    if file.is_symlink(): continue
    with file.open("rb") as f: head=f.read(170)
    if head.startswith(b"version https://git-lfs.github.com/spec/v1"):
        raise SystemExit(f"Git LFS object was NOT fetched: {file}")
    boxmin=[math.inf]*3
    boxmax=[-math.inf]*3
    vertices=faces=groups=objects=0
    materials=set()
    examples=[]
    with file.open("rt",encoding="utf8",errors="replace") as src:
        for line in src:
            if line.startswith("v "):
                try:
                    xyz=[float(c) for c in line.split()[1:4]]
                    if len(xyz)!=3 or not all(math.isfinite(v) for v in xyz):
                        continue
                    for i,c in enumerate(xyz):
                        boxmin[i]=min(boxmin[i],c);boxmax[i]=max(boxmax[i],c)
                    vertices+=1
                except ValueError:continue
            elif line.startswith("f "): faces+=1
            elif line.startswith("g "):
                groups+=1
                if len(examples)<30: examples.append(line.strip()[:110])
            elif line.startswith("o "):
                objects+=1
                if len(examples)<30: examples.append(line.strip()[:110])
            elif line.startswith("usemtl "): materials.add(line.strip()[7:][:140])
    sha=hashlib.sha256()
    with file.open("rb") as f:
        for chunk in iter(lambda:f.read(1024*1024),b""):sha.update(chunk)
    if not vertices or not faces: raise SystemExit(f"No parseable mesh in {file}")
    records.append({
        "path":str(file.relative_to(root)), "bytes":file.stat().st_size,
        "sha256":sha.hexdigest(), "vertices":vertices,"faces":faces,
        "objects":objects,"groups":groups,"materials":sorted(materials)[:150],
        "materialCount":len(materials),"sampleObjectNames":examples,
        "bounds":{"min":boxmin,"max":boxmax,
                  "extent":[boxmax[i]-boxmin[i] for i in range(3)]}
    })
textures=list(stage.rglob("*.png"))
report={
 "stageId":a.stage,"internalId":a.internal,
 "sourceRepository":"kirakira-dev/KiTrix",
 "sourceCommit":a.revision,
 "sourceUrl":f"https://github.com/kirakira-dev/KiTrix/tree/{a.revision}/stages/{a.internal}",
 "sourceType":"public, third-party extracted OBJ stage models; historical variant/date not established",
 "fidelityStatus":"REFERENCE ONLY. Original collision, paintable-face ownership, stage rule variants and Splatoon 3 11.3.0 parity are not established.",
 "redistribution":"Original OBJ and textures intentionally excluded from artifact; independently check source author's rights and Nintendo rights before redistribution.",
 "meshFiles":records,"totalVertices":sum(z["vertices"] for z in records),
 "totalFaces":sum(z["faces"] for z in records),"textureFileCount":len(textures),
}
a.out.parent.mkdir(parents=True,exist_ok=True)
a.out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
print(json.dumps({k:report[k] for k in ("stageId","internalId","totalVertices","totalFaces","textureFileCount")}))
