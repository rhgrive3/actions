#!/usr/bin/env python3
"""Verify Mincemeat buffers against independent OBJ streams and pinned Git blobs.

Source models, pixels, and derivatives remain in caller-selected private paths.
Only the numeric JSON report is suitable for committing.
"""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

import numpy as np


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', required=True, type=Path)
    parser.add_argument('--assets', required=True, type=Path)
    parser.add_argument('--repository', required=True, type=Path)
    parser.add_argument('--report', required=True, type=Path)
    args = parser.parse_args()
    definition = json.loads((Path(__file__).resolve().parents[1] /
                             'patches/native-stages/definitions/mincemeat.json').read_text())
    commit = '0611f51b35c9736ee986fb2218461e2585b7875e'
    internal = definition['internal']
    stage = args.assets / definition['id']
    manifest = json.loads((stage / 'manifest.json').read_text())
    assert manifest['sourceSha256'] == definition['sourceSha256']
    assert digest((args.source / (internal + '.obj')).read_bytes()) == definition['sourceSha256']
    tree = subprocess.check_output(['git', 'ls-tree', commit + ':stages', internal],
                                   cwd=args.repository, text=True).split()[2]
    assert tree == definition['tree'], 'Pinned stage tree changed'
    rows = subprocess.check_output(['git', 'ls-tree', '-r', commit, 'stages/' + internal],
                                   cwd=args.repository, text=True).splitlines()
    blobs = {row.split('\t')[1]: row.split('\t')[0].split()[2] for row in rows}
    source_files = [args.source / (internal + '.mtl'), *sorted((args.source / 'textures').glob('*.png'))]
    for file in source_files:
        raw = file.read_bytes()
        blob = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
        assert blob == blobs['stages/' + internal + '/' + file.relative_to(args.source).as_posix()], file
    positions, normals, uv, indices = [], [], [], []
    for line in (args.source / (internal + '.obj')).open():
        fields = line.split()
        if not fields:
            continue
        if fields[0] == 'v':
            positions.append(tuple(map(float, fields[1:4])))
        elif fields[0] == 'vn':
            normals.append(tuple(map(float, fields[1:4])))
        elif fields[0] == 'vt':
            uv.append(tuple(map(float, fields[1:3])))
        elif fields[0] == 'f':
            polygon = [int(field.split('/')[0]) - 1 for field in fields[1:]]
            for j in range(1, len(polygon) - 1):
                indices.extend([polygon[0], polygon[j], polygon[j + 1]])
    vertices = np.fromfile(stage / 'vertices.bin', dtype='<f4').reshape(-1, 8)
    local_indices = np.fromfile(stage / 'indices.bin', dtype='<u4')
    global_indices = np.empty_like(local_indices)
    source_uv = []
    for obj in manifest['objects']:
        start, count = obj['io'], obj['ic']
        global_indices[start:start + count] = local_indices[start:start + count] + obj['vo']
        attribute = vertices[obj['vo']:obj['vo'] + obj['vc'], 6:8]
        if obj['sourceHasUV']:
            source_uv.append(attribute)
        else:
            assert not np.any(attribute), 'Absent source UV must remain zero'
    assert np.array_equal(vertices[:, :3], np.asarray(positions, dtype='<f4'))
    assert np.array_equal(vertices[:, 3:6], np.asarray(normals, dtype='<f4'))
    assert np.array_equal(np.concatenate(source_uv), np.asarray(uv, dtype='<f4'))
    assert np.array_equal(global_indices, np.asarray(indices, dtype='<u4'))
    for relative, expected in manifest['textureIntegrity'].items():
        raw = (args.source / relative).read_bytes()
        assert raw == (stage / relative).read_bytes()
        assert digest(raw) == expected['sha256']
    result = dict(id=definition['id'], internal=internal, sourceCommit=commit,
                  stageTree=tree, objSha256=definition['sourceSha256'],
                  objBytes=(args.source / (internal + '.obj')).stat().st_size,
                  sourceGitBlobsVerified=len(source_files),
                  sourceTextureBytesIdentical=len(manifest['textureIntegrity']),
                  vertices=len(vertices), triangles=len(indices) // 3,
                  positionsFloat32Identical=True, normalsFloat32Identical=True,
                  uvFloat32Identical=True, indicesIdentical=True,
                  missingUVRemainZero=True, maxPositionDifference=0,
                  version1130Verified=False)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
