import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {replaceOnce} from '../adapter.mjs';
const ROOT=fileURLToPath(new URL('../../../',import.meta.url)),SRC=path.join(ROOT,'inkwave-public');
// Restore only this optimization in the otherwise current production source.
export function baselineDistanceSource(rel,raw){
 let code=adaptBuildSource(rel,raw);
 if(rel==='src/world/paint.js'){
  code=replaceOnce(code,`    const outer = r * (sourced ? 1 : WOB_MAX) * (1 + 1e-12);
    const inner = r * (sourced ? 1 - 1e-12 : 0.68 - 1e-12);
    const outer2 = outer * outer, inner2 = inner * inner;`,'','baseline bounds');
  const first='          const d2 = px * px + py * py;\n          if (d2 > outer2) continue;\n          if (!(d2 < inner2)) {\n';
  code=replaceOnce(code,first,'','baseline distance branch');
  code=replaceOnce(code,'          }\n          }\n        }\n        const k = f.grid + j * f.nu + i;','          }\n        }\n        const k = f.grid + j * f.nu + i;','baseline distance closing brace');
 }

 return code;
}
export async function distanceFixture(baseline=false){
 const context=vm.createContext({console,performance,URL,URLSearchParams,TextDecoder,TextEncoder,setTimeout,clearTimeout,queueMicrotask}),modules=new Map();
 const resolve=(s,from)=>s==='three'?path.join(SRC,'vendor/three/build/three.module.js'):s.startsWith('three/addons/')?path.join(SRC,'vendor/three/jsm',s.slice(13)):path.resolve(path.dirname(from),s);
 function load(file){
  if(file.startsWith(path.join(SRC,'patches')+path.sep))file=path.join(ROOT,path.relative(SRC,file));
  if(file.startsWith(path.join(ROOT,'src')+path.sep))file=path.join(SRC,path.relative(ROOT,file));
  if(modules.has(file))return modules.get(file);
  const raw=fs.readFileSync(file,'utf8'),rel=path.relative(SRC,file),code=file.startsWith(SRC+path.sep)?(baseline?baselineDistanceSource:adaptBuildSource)(rel,raw):raw;
  const m=new vm.SourceTextModule(code,{context,identifier:file,initializeImportMeta(meta){meta.url=pathToFileURL(file).href;}});modules.set(file,m);return m;
 }
 const entry=new vm.SourceTextModule(`export * as THREE from 'three';
 export {G} from './inkwave-public/src/core/ctx.js';
 export {PLAYER,DIFFICULTY} from './inkwave-public/src/config.js';
 export {PaintSystem} from './inkwave-public/src/world/paint.js';
 export {Level} from './inkwave-public/src/world/level.js';
 export {NativeLevel} from './patches/native-stages/runtime/engine.mjs';
 export const testMath=Math;`,{context,identifier:path.join(ROOT,'distance-fixture.mjs')});
 await entry.link((s,from)=>load(resolve(s,from.identifier)));await entry.evaluate();return entry.namespace;
}
export const randomStream=seed=>()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
export function makePaint(api,nativeData=null){
 const level=nativeData?new api.NativeLevel(nativeData):new api.Level({bounds:{minX:-24,maxX:24,minZ:-24,maxZ:24},spawnPads:[[-20,0,0],[20,0,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-24,-.5,-24],max:[24,0,24]},{kind:'box',min:[-8,0,-8],max:[8,2,8]}]});
 class Cpu extends api.PaintSystem{_initGPU(){this.quads=0;} _pushQuad(){}}
 const paint=new Cpu(null,level,{atlasSize:512,maxDensity:6});assert.ok(paint.grid.length>0);return paint;
}
export function countHypot(api){
 const original=api.testMath.hypot;let calls=0;
 api.testMath.hypot=(...a)=>{calls++;return original(...a);};
 return {get:()=>calls,reset:()=>{calls=0;},restore:()=>{api.testMath.hypot=original;}};
}
