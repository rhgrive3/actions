#!/usr/bin/env python3
"""Measure current MAP3 Level + art collision with the existing common method.

Run from repository root (Node VM modules and NumPy required):
  python docs/stage-redesign/map3/measure_current_runtime.py

Only ordinary MAP3 geometry is extracted. Native binary assets are not read.
The saved native reference is checked against current Git LFS pointer records.
"""
import hashlib
import json
from pathlib import Path
import statistics
import subprocess

import numpy as np
from measure_baseline import dimensions, geometry_metrics

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]

EXTRACT = r'''
import fs from 'node:fs'; import path from 'node:path'; import vm from 'node:vm';
import {createHash} from 'node:crypto';
const root=process.argv[1], src=path.join(root,'inkwave-public');
const context=vm.createContext({console,performance}), modules=new Map();
function resolve(spec,from){
 if(spec==='three')return path.join(src,'vendor/three/build/three.module.js');
 if(spec.startsWith('three/addons/'))return path.join(src,'vendor/three/jsm',spec.slice(13));
 let file=path.resolve(path.dirname(from),spec);
 if(file.startsWith(path.join(src,'patches')+path.sep))file=path.join(root,path.relative(src,file));
 if(file.startsWith(path.join(root,'src')+path.sep))file=path.join(src,path.relative(root,file));
 return file;
}
function load(file){if(!modules.has(file))modules.set(file,new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file}));return modules.get(file);}
const entry=new vm.SourceTextModule(`
 export {Level} from './inkwave-public/src/world/level.js';
 export {PaintSystem} from './inkwave-public/src/world/paint.js';
 export {MAP_LAYOUTS} from './inkwave-public/src/world/maps.js';
 export {map3ArtColliders} from './inkwave-public/src/world/stages/map3-art.js';
`,{context,identifier:path.join(root,'map3-common-metrics-entry.mjs')});
await entry.link((spec,from)=>load(resolve(spec,from.identifier)));await entry.evaluate();
const {Level,PaintSystem,MAP_LAYOUTS,map3ArtColliders}=entry.namespace;
function triangles(level){
 const triangles=[],normals=[];
 for(const b of level.blocks){if(!b.solid)continue;
  for(let k=0;k<3;k++)for(const sign of [1,-1]){
   const n=b.axes[k].clone().multiplyScalar(sign),h=[b.half.x,b.half.y,b.half.z],ij=[0,1,2].filter(j=>j!==k);
   const center=b.center.clone().addScaledVector(n,h[k]);
   const p=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,c])=>center.clone().addScaledVector(b.axes[ij[0]],a*h[ij[0]]).addScaledVector(b.axes[ij[1]],c*h[ij[1]]).toArray());
   for(const ids of [[0,1,2],[0,2,3]]){triangles.push(ids.map(i=>p[i]));normals.push(n.toArray());}
  }
 }
 return {triangles,normals};
}
const stages=['tidewater','kelpline'].map(id=>{
 const layout=MAP_LAYOUTS[id],extras=map3ArtColliders(layout),level=new Level(layout,extras),bare=new Level(layout);
 const paint=Object.create(PaintSystem.prototype);
 Object.assign(paint,{level,cell:.25,paintFaces:level.faces.filter(f=>f.paintable)});paint._initGrid();
 let clippedArea=0,clippedCells=0,scoringProjectedArea=0;const b=layout.bounds;
 for(const f of paint.paintFaces){if(!f.turf)continue;for(let j=0;j<f.nv;j++)for(let i=0;i<f.nu;i++){
  if(paint.dead[f.grid+j*f.nu+i])continue;
  scoringProjectedArea+=f.cu*f.cv*Math.max(0,f.n.y);
  const p=f.origin.clone().addScaledVector(f.u,(i+.5)*f.cu).addScaledVector(f.v,(j+.5)*f.cv);
  if(p.x>=b.minX&&p.x<=b.maxX&&p.z>=b.minZ&&p.z<=b.maxZ){clippedArea+=f.cu*f.cv;clippedCells++;}
 }}
 return {id,bounds:layout.bounds,spawnPads:layout.spawnPads,blockCount:level.blocks.length,
  authoredBlockCount:bare.blocks.length,artColliderCount:extras.length,actual:triangles(level),withoutArt:triangles(bare),
  cpuPaint:{cellWU:.25,runtimeTurfAreaWU2:paint.turfArea,runtimeTurfCells:paint.turfTotal,
   clippedRuntimeTurfAreaWU2:clippedArea,clippedRuntimeTurfCells:clippedCells,scoringProjectedPaintCellAreaWU2:scoringProjectedArea}};
});
const sourceEntries=[...modules.keys()].sort().map(file=>[path.relative(root,file),createHash('sha256').update(fs.readFileSync(file)).digest('hex')]);
console.log(JSON.stringify({stages,loadedSourceModuleCount:sourceEntries.length,
 loadedSourceDigestSha256:createHash('sha256').update(JSON.stringify(sourceEntries)).digest('hex')}));
'''


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def git(*args, **kwargs):
    return subprocess.check_output(['git', '-C', str(ROOT), *args], **kwargs)


def main():
    native = json.loads((HERE / 'baseline-metrics.json').read_text())
    quarter = json.loads((HERE / 'baseline-resolution-check.json').read_text())
    nominal = {r['id']: r for r in json.loads((HERE / 'proposal-common-metrics.json').read_text())['proposals']}
    frozen = json.loads((HERE / 'validation.json').read_text())
    # Validate existing native extraction receipts against current tracked
    # pointers, not their binary payloads. Reuse all recorded pointer receipts.
    receipts = [r for stage in native['native'] for r in stage['verifiedHeadArrayFiles']]
    data = git('cat-file', '--batch', input=''.join(f'HEAD:{r["file"]}\n' for r in receipts).encode())
    cursor = 0
    for r in receipts:
        end = data.index(b'\n', cursor)
        _, kind, length = data[cursor:end].split()
        assert kind == b'blob'
        cursor = end + 1
        pointer = data[cursor:cursor + int(length)].decode()
        cursor += int(length) + 1
        assert f'oid sha256:{r["sha256"]}\n' in pointer and f'size {r["bytes"]}\n' in pointer, r['file']
    paths = ['patches/native-stages', 'native-prebuilt']
    changed = git('diff', '--name-only', 'HEAD', '--', *paths).decode().splitlines()
    untracked = git('ls-files', '--others', '--exclude-standard', '--', *paths).decode().splitlines()
    assert not changed and not untracked, 'native source/asset paths changed'
    native_trees = {p: git('rev-parse', 'HEAD:' + p).decode().strip() for p in paths}
    baseline_trees = {p: git('rev-parse', native['headParent'] + ':' + p).decode().strip() for p in paths}
    assert native_trees == baseline_trees, 'native trees differ from the recorded extraction commit'
    ids = {r['id'] for r in native['native']}
    reference = [r['unionQuarterWU2'] for r in quarter['rows'] if r['id'] in ids]
    assert len(reference) == 23
    median = statistics.median(reference)
    assert median == quarter['nativeMedianQuarterWU2']
    extracted = json.loads(subprocess.check_output(['node', '--experimental-vm-modules', '--input-type=module', '-e', EXTRACT, str(ROOT)]))
    rows = []
    for s in extracted.pop('stages'):
        geometry = {}
        for key in ('actual', 'withoutArt'):
            raw = s.pop(key)
            geometry[key] = geometry_metrics(np.asarray(raw['triangles']), np.asarray(raw['normals']), s['bounds'], .25)
        common = geometry['actual']
        old = nominal[s['id']]['bySampleStepWU']['.25']
        f = frozen[s['id']]['metrics']
        rows.append({**s, **dimensions(s), 'currentRuntimeCommon': common, 'currentLevelWithoutArtCommon': geometry['withoutArt'],
            'frozenNominalCommon': old,
            'frozenNominalTerrain': {k: f[k] for k in ['grossLayeredProjectedArea', 'netLayeredProjectedArea', 'netProjectedUnionArea']},
            'runtimeUnionMinusNominalCommonWU2': common['projectedUnionSampleWU2'] - old['projectedUnionSampleWU2'],
            'runtimeUnionRatioToNativeQuarterMedian': common['projectedUnionSampleWU2'] / median})
    files = ['measure_baseline.py', 'measure_current_runtime.py', 'baseline-metrics.json', 'baseline-resolution-check.json',
             'proposal-common-metrics.json', 'validation.json', 'design.json']
    sources = ['src/world/level.js', 'src/world/paint.js', 'src/world/maps.js', 'src/world/mapkit.js',
               'src/world/stages/map3-data.js', 'src/world/stages/map3-layout.js', 'src/world/stages/map3-art.js']
    out = {'schema': 1, 'units': 'WU and WU²; no calibrated SI conversion',
        'method': 'Imports unchanged measure_baseline.geometry_metrics: solid collision faces, normal.y >= .68, exact triangle XZ clipping, .25-WU cell-center union and overlap with weighted boundary cells.',
        'geometryScope': 'Actual Level(MAP_LAYOUTS[id], map3ArtColliders(layout)) OBB faces, including low toes, grates, hidden support/roof/rail collider tops and buried/overlapping surfaces. Render-only meshes excluded. Neither common union nor height span establishes traversability or headroom.',
        'paintScope': 'Real PaintSystem._initGrid, cell .25, on the same Level with all extras; paintable/turf face rules and dead mask apply. runtimeTurfArea sums exposed surface-cell area; scoringProjectedPaintCellArea weights by normal.y. Stacked paint faces remain separate, unlike common XZ union.',
        'headParent': git('rev-parse', 'HEAD').decode().strip(), **extracted,
        'inputSha256': {**{str((HERE / f).relative_to(ROOT)): digest(HERE / f) for f in files},
                        **{'inkwave-public/' + f: digest(ROOT / 'inkwave-public' / f) for f in sources}},
        'nativeReference': {'sampleStepWU': .25, 'count': 23, 'projectedUnionMedianWU2': median,
            'binaryPayloadsRead': 0, 'verifiedCurrentHeadLfsPointerReceipts': len(receipts),
            'trackedNativePathsChanged': changed, 'untrackedNativePaths': untracked,
            'baselineHead': native['headParent'], 'gitTrees': native_trees, 'baselineGitTrees': baseline_trees,
            'limit': 'Reuses recorded native-quarter extraction, with matching current LFS hashes/sizes and unchanged native paths. Does not rerun native arrays or establish unchanged behavior of all shared code.'},
        'stages': rows}
    target = HERE / 'current-runtime-common-metrics.json'
    target.write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n')
    for row in rows:
        print(row['id'], 'actual union', row['currentRuntimeCommon']['projectedUnionSampleWU2'],
              'nominal common union', row['frozenNominalCommon']['projectedUnionSampleWU2'],
              'CPU turf', row['cpuPaint']['runtimeTurfAreaWU2'])


if __name__ == '__main__':
    main()
