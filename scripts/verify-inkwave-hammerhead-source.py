#!/usr/bin/env python3
"""Read-only pinned-source proof. Saves numeric evidence; never embeds source assets."""
import argparse, hashlib, json, subprocess
from pathlib import Path
import numpy as np

REV = '0611f51b35c9736ee986fb2218461e2585b7875e'
TREE = '6b9bb90548f56bfb23321f849b6da64e894cbc04'
OBJ = 'acc6983d529932832fbd9c5bb54c5e96fe43ccf3c9aaf5c21d3ca653af8359de'
p = argparse.ArgumentParser()
p.add_argument('--source', type=Path, required=True, help='Local Vss_Kaisou04 folder')
p.add_argument('--assets', type=Path, required=True, help='Converted hammerhead folder')
p.add_argument('--pinned-repository', type=Path, required=True, help='Read-only KiTrix Git clone')
p.add_argument('--report', type=Path, required=True)
a = p.parse_args()
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
def git(*args):
    return subprocess.check_output(['git', '-C', str(a.pinned_repository), *args])
assert git('rev-parse', REV + ':stages/Vss_Kaisou04').decode().strip() == TREE
pointer = git('show', REV + ':stages/Vss_Kaisou04/Vss_Kaisou04.obj').decode()
assert 'oid sha256:' + OBJ in pointer and 'size 30169968' in pointer
assert sha(a.source / 'Vss_Kaisou04.obj') == OBJ
assert (a.source / 'Vss_Kaisou04.obj').stat().st_size == 30169968
m = json.loads((a.assets / 'manifest.json').read_text())
assert m['sourceCommit'] == REV and m['sourceSha256'] == OBJ
pins = {}
for row in git('ls-tree', '-rz', REV, 'stages/Vss_Kaisou04').split(b'\0'):
    if not row:
        continue
    meta, name = row.split(b'\t', 1)
    pins[name.decode()] = meta.split()[2].decode()
for name in ['Vss_Kaisou04.mtl', *m['textureIntegrity']]:
    raw = (a.source / name).read_bytes()
    blob = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
    assert blob == pins['stages/Vss_Kaisou04/' + name], name
vertices, normals, uv, indices = [], [], [], []
base, count = 0, 0
for line in (a.source / 'Vss_Kaisou04.obj').open():
    if line.startswith('o '):
        base = count
    elif line.startswith('v '):
        vertices.append(tuple(map(float, line.split()[1:4])))
        count += 1
    elif line.startswith('vn '):
        normals.append(tuple(map(float, line.split()[1:4])))
    elif line.startswith('vt '):
        uv.append(tuple(map(float, line.split()[1:3])))
    elif line.startswith('f '):
        face = [int(t.split('/')[0]) - 1 - base for t in line.split()[1:]]
        for j in range(1, len(face) - 1):
            indices.extend([face[0], face[j], face[j + 1]])
buffer = np.fromfile(a.assets / 'vertices.bin', dtype='<f4').reshape(-1, 8)
def identical_float_bits(actual, expected):
    return np.array_equal(np.ascontiguousarray(actual).view('<u4'), np.asarray(expected, dtype='<f4').view('<u4'))
assert identical_float_bits(buffer[:, :3], vertices)
assert identical_float_bits(buffer[:, 3:6], normals)
mapped = np.concatenate([buffer[o['vo']:o['vo'] + o['vc'], 6:8] for o in m['objects'] if o['sourceHasUV']])
assert identical_float_bits(mapped, uv)
assert np.array_equal(np.fromfile(a.assets / 'indices.bin', dtype='<u4'), np.asarray(indices, dtype='<u4'))
for name, info in m['textureIntegrity'].items():
    assert sha(a.source / name) == info['sha256'] == sha(a.assets / name)
report = dict(id='hammerhead', internal='Vss_Kaisou04', sourceCommit=REV, tree=TREE,
              objSha256=OBJ, objBytes=30169968, mtlGitBlob=pins['stages/Vss_Kaisou04/Vss_Kaisou04.mtl'],
              mtlSha256=sha(a.source / 'Vss_Kaisou04.mtl'), vertices=len(vertices), triangles=len(indices) // 3,
              positionsFloat32Identical=True, normalsFloat32Identical=True, uvFloat32Identical=True,
              indicesUint32Identical=True, maxPositionDifference=0.0, sourceTexturesIdentical=len(m['textureIntegrity']),
              textureAndMtlGitTreeVerified=True, version1130Verified=False)
a.report.parent.mkdir(parents=True, exist_ok=True)
a.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(report, ensure_ascii=False))
