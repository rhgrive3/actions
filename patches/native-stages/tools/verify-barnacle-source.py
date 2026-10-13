#!/usr/bin/env python3
"""Independent Section01 text-stream and pinned Git blob verification.

Reads one source object at a time without importing either converter. The report
contains hashes and counts only; source attributes remain in ignored storage.
"""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

import numpy as np

COMMIT = '0611f51b35c9736ee986fb2218461e2585b7875e'
TREE = 'c7d87b908c565e698fade2f7bbe4c9353f200435'
OBJ_SHA256 = '2d792394f5672734b9faa0972293792f0983977318d464848f709aaec9232ad4'
OBJ_BYTES = 38771334


def digest(file):
    h = hashlib.sha256()
    with file.open('rb') as stream:
        for block in iter(lambda: stream.read(1 << 20), b''):
            h.update(block)
    return h.hexdigest()


def verify(source, assets, repository, tree_metadata):
    src = source / 'Vss_Section01'
    dst = assets / 'barnacle'
    obj = src / 'Vss_Section01.obj'
    assert obj.stat().st_size == OBJ_BYTES and digest(obj) == OBJ_SHA256
    tree = subprocess.check_output(['git', '-C', str(repository), 'rev-parse', COMMIT + ':stages/Vss_Section01'], text=True).strip()
    assert tree == TREE
    git_tree = json.loads(tree_metadata.read_text())
    assert git_tree['sha'] == TREE and git_tree['truncated'] is False
    pinned_sizes = {entry['path']: entry for entry in git_tree['tree'] if entry['type'] == 'blob'}
    manifest = json.loads((dst / 'manifest.json').read_text())
    assert manifest['id'] == 'barnacle' and manifest['sourceCommit'] == COMMIT
    assert manifest['sourceSha256'] == OBJ_SHA256
    vertices = np.memmap(dst / 'vertices.bin', dtype='<f4', mode='r').reshape(-1, 8)
    indices = np.memmap(dst / 'indices.bin', dtype='<u4', mode='r')
    counts = dict(vertices=0, normals=0, uv=0, indices=0, objects=0)
    positions, normals, uv, faces = [], [], [], []
    name = None

    def flush():
        nonlocal positions, normals, uv, faces
        if not positions:
            return
        assert len(normals) == len(positions), name
        assert not uv or len(uv) == len(positions), name
        lo = counts['vertices']
        hi = lo + len(positions)
        actual = vertices[lo:hi]
        assert actual[:, :3].tobytes() == np.asarray(positions, dtype='<f4').tobytes(), (name, 'positions including signed zero')
        assert actual[:, 3:6].tobytes() == np.asarray(normals, dtype='<f4').tobytes(), (name, 'normals including signed zero')
        expected_uv = np.asarray(uv, dtype='<f4') if uv else np.zeros((len(positions), 2), dtype='<f4')
        assert actual[:, 6:8].tobytes() == expected_uv.tobytes(), (name, 'UV or explicit missing-UV zeros including signed zero')
        start = counts['indices']
        assert np.array_equal(indices[start:start + len(faces)], np.asarray(faces, dtype='<u4')), (name, 'every triangulated face index')
        counts['vertices'] = hi
        counts['normals'] += len(normals)
        counts['uv'] += len(uv)
        counts['indices'] += len(faces)
        counts['objects'] += 1
        positions, normals, uv, faces = [], [], [], []

    for line in obj.open():
        if line.startswith('o '):
            flush()
            name = line[2:].strip()
        elif line.startswith('v '):
            positions.append(tuple(map(float, line.split()[1:4])))
        elif line.startswith('vn '):
            normals.append(tuple(map(float, line.split()[1:4])))
        elif line.startswith('vt '):
            uv.append(tuple(map(float, line.split()[1:3])))
        elif line.startswith('f '):
            face = []
            for token in line.split()[1:]:
                fields = token.split('/')
                vi = int(fields[0]) - 1 - counts['vertices']
                ni = int(fields[2]) - 1 - counts['normals']
                ui = int(fields[1]) - 1 - counts['uv'] if fields[1] else None
                assert 0 <= vi < len(positions) and ni == vi and (ui is None or ui == vi)
                face.append(vi)
            for k in range(1, len(face) - 1):
                faces.extend((face[0], face[k], face[k + 1]))
    flush()
    assert counts['vertices'] == len(vertices) and counts['indices'] == len(indices)
    assert counts['objects'] == len(manifest['objects'])
    files = []
    rows = subprocess.check_output(['git', '-C', str(repository), 'ls-tree', '-rz', COMMIT, 'stages/Vss_Section01']).split(b'\0')
    for row in rows:
        if not row:
            continue
        meta, path = row.split(b'\t')
        path = path.decode()
        if not (path.endswith('.mtl') or '/textures/' in path):
            continue
        file = source.parent / path
        data = file.read_bytes()
        oid = meta.split()[2].decode()
        metadata = pinned_sizes[path.removeprefix('stages/Vss_Section01/')]
        assert metadata['sha'] == oid and metadata['size'] == len(data), (path, 'pinned Git blob size')
        assert hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest() == oid, path
        files.append(dict(path=path, gitBlobSha1=oid, pinnedGitBlobBytes=metadata['size'], bytes=len(data), sha256=hashlib.sha256(data).hexdigest()))
    for relative, integrity in manifest['textureIntegrity'].items():
        assert digest(src / relative) == integrity['sha256'] == digest(dst / relative)
        assert (src / relative).stat().st_size == integrity['bytes'] == (dst / relative).stat().st_size
    return dict(id='barnacle', sourceCommit=COMMIT, tree=TREE, objSha256=OBJ_SHA256, objBytes=OBJ_BYTES,
                **counts, triangles=counts['indices'] // 3, positionsFloat32Identical=True,
                normalsFloat32Identical=True, uvFloat32Identical=True, everyUint32IndexIdentical=True,
                float32BitPatternsIncludingSignedZeroIdentical=True,
                missingUVZerosVerified=True, converterIndependent=True, allPinnedMtlAndPngVerified=True,
                independentPinnedGitBlobSizesVerified=True,
                convertedTexturesVerified=len(manifest['textureIntegrity']), files=files, version1130Verified=False)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', required=True, type=Path)
    parser.add_argument('--assets', required=True, type=Path)
    parser.add_argument('--repository', required=True, type=Path)
    parser.add_argument('--git-tree-metadata', required=True, type=Path,
                        help='Public GitHub recursive Git-tree response for the exact pinned Section01 tree')
    parser.add_argument('--report', required=True, type=Path)
    args = parser.parse_args()
    result = verify(args.source, args.assets, args.repository, args.git_tree_metadata)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({key: value for key, value in result.items() if key != 'files'}))
