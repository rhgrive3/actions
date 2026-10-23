import {adaptSceneryStorageCandidate} from './fixtures/geometry-storage/scenery-owned-adapter.mjs';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
const ROOT=fileURLToPath(new URL('../../../',import.meta.url)),SRC=path.join(ROOT,'inkwave-public');
export function withoutGeometryStorage(rel,code){
 code=code.replace(/^import \{ (?:createLevelGeometryStorage|mergeOwnedSceneryGeometries) \} from '[^']+geometry-build-storage.mjs';\n/gm,'');
 if(rel==='src/world/level.js'){
  code=code.replace('const B = createLevelGeometryStorage();','const B = { pos: [], nor: [], col: [], puv: [], luv: [], fuv: [], fdat: [], fflag: [], ftan: [], idx: [] };');
  code=code.replace(`      const p0=pp.chunks[Math.floor(i0/1024)],p1=pp.chunks[Math.floor(i1/1024)],p2=pp.chunks[Math.floor(i2/1024)];
      const o0=(i0%1024)*3,o1=(i1%1024)*3,o2=(i2%1024)*3;
      _a.set(p1[o1]-p0[o0],p1[o1+1]-p0[o0+1],p1[o1+2]-p0[o0+2]);
      _b.set(p2[o2]-p0[o0],p2[o2+1]-p0[o0+1],p2[o2+2]-p0[o0+2]);`,
      `      _a.set(pp[i1 * 3] - pp[i0 * 3], pp[i1 * 3 + 1] - pp[i0 * 3 + 1], pp[i1 * 3 + 2] - pp[i0 * 3 + 2]);
      _b.set(pp[i2 * 3] - pp[i0 * 3], pp[i2 * 3 + 1] - pp[i0 * 3 + 1], pp[i2 * 3 + 2] - pp[i0 * 3 + 2]);`);
  code=code.replace(/B\.(\w+)\.push[234]\(/g,'B.$1.push(');
  code=code.replace(/new THREE.Float32BufferAttribute\(B\.(\w+)\.finish\(Float32Array\)\.buffer, (\d)\)/g,'new THREE.Float32BufferAttribute(B.$1, $2)');
  code=code.replace(/new THREE.BufferAttribute\(B\.(\w+)\.finish\(Float32Array\), (\d)\)/g,'new THREE.Float32BufferAttribute(B.$1, $2)');
  code=code.replace(`g.setIndex(B.idx.maximum >= 65535
      ? new THREE.Uint32BufferAttribute(B.idx.finish(Uint32Array).buffer, 1)
      : new THREE.Uint16BufferAttribute(B.idx.finish(Uint16Array).buffer, 1));`,'g.setIndex(B.idx);');
 }
 return code.replaceAll('mergeOwnedSceneryGeometries(all, THREE, mergeGeometries)','mergeGeometries(all)')
  .replaceAll('mergeOwnedSceneryGeometries(staticParts, THREE, mergeGeometries)','mergeGeometries(staticParts)')
  .replaceAll('mergeOwnedSceneryGeometries(treeParts, THREE, mergeGeometries)','mergeGeometries(treeParts)');
}
export async function geometryFixture({baseline=false,candidateScenery=false,transform=(rel,s)=>s,globals={}}={}){
 const context=vm.createContext({console,performance,URL,TextEncoder,TextDecoder,...globals}),cache=new Map();
 function resolve(s,from){
  if(s==='three')return path.join(SRC,'vendor/three/build/three.module.js');
  if(s.startsWith('three/addons/'))return path.join(SRC,'vendor/three/jsm',s.slice('three/addons/'.length));
  const file=path.resolve(path.dirname(from),s).replace('/inkwave-public/patches/','/patches/');
  return file.startsWith(path.join(ROOT,'src/'))?path.join(SRC,path.relative(ROOT,file)):file;
 }
 function load(file){
  if(cache.has(file))return cache.get(file);
  const relative=path.relative(SRC,file),raw=fs.readFileSync(file,'utf8');
  let source=relative.startsWith('..')?raw:adaptBuildSource(relative,raw);
  if(baseline)source=withoutGeometryStorage(relative,source);
  if(candidateScenery&&!baseline)source=adaptSceneryStorageCandidate(relative,source,(code,a,b,label)=>{
    if(code.split(a).length!==2)throw Error('Candidate source anchor: '+label);return code.replace(a,b);
  });
  source=transform(relative,source);
  const mod=new vm.SourceTextModule(source,{context,identifier:file,initializeImportMeta(m){m.url=pathToFileURL(file).href;}});cache.set(file,mod);return mod;
 }
 const root=new vm.SourceTextModule(`export {Level} from './inkwave-public/src/world/level.js';
 export {MAP_LAYOUTS} from './inkwave-public/src/world/maps.js';
 export {Environment} from './inkwave-public/src/world/environment.js';
 export * as THREE from 'three';
 export {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
 export {NativeLevel} from './patches/native-stages/runtime/native-level.mjs';
 export {mergeOwnedSceneryGeometries} from './patches/local-quality/tests/fixtures/geometry-storage/scenery-owned-merge.mjs';
 export const F32=Float32Array;`,{context,identifier:path.join(ROOT,'geometry-fixture-entry.mjs')});
 await root.link((s,from)=>load(resolve(s,from.identifier)));await root.evaluate();return {...root.namespace,context};
}
