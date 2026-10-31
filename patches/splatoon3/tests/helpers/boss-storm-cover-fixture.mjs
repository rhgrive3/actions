import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import crypto from 'node:crypto';import {fileURLToPath,pathToFileURL} from 'node:url';
export const root=fileURLToPath(new URL('../../../../',import.meta.url));
const THREE=await import(pathToFileURL(path.join(root,'inkwave-public/vendor/three/build/three.module.js')).href);
const {adaptBuildSource}=await import(pathToFileURL(path.join(root,'scripts/inkwave-source-composition.mjs')).href);
const {compactModuleStrings}=await import(pathToFileURL(path.join(root,'scripts/lib/inkwave-source-compaction.mjs')).href);
const selective=new Set(['patches/splatoon3/runtime/boss-storm-cover.mjs','src/game/physics.js','src/world/level.js']);
export async function coverHarness({emitted=false,oldParallelOrigin=false}={}){
 if(!vm.SourceTextModule)throw Error('Boss cover contracts require the existing --experimental-vm-modules source-test runner');
 const esbuild=emitted?await import(process.env.INKWAVE_TEST_ESBUILD||'esbuild'):null,files=new Map(),modules=new Map(),emissions=[];
 const context=vm.createContext({console,URL,URLSearchParams,performance,setTimeout,clearTimeout});
 const three=new vm.SyntheticModule(Object.keys(THREE),function(){for(const[k,v]of Object.entries(THREE))this.setExport(k,v);},{context,identifier:'three'});
 const resolve=(s,from)=>s==='three'?s:s.startsWith('.')?path.posix.normalize(path.posix.join(path.posix.dirname(from),s)):(()=>{throw Error('Unexpected cover dependency '+s);})();
 const get=rel=>{
  if(rel==='three')return three;if(modules.has(rel))return modules.get(rel);
  const file=path.join(root,rel.startsWith('patches/')?rel:'inkwave-public/'+rel),raw=fs.readFileSync(file,'utf8');let code=adaptBuildSource(rel,raw);
  if(oldParallelOrigin&&rel==='patches/splatoon3/runtime/boss-storm-cover.mjs'){
   const next='const origin = offset + shape.pos.y * a.y;\n      if (Math.abs(origin) + shape.r * Math.hypot(a.x, a.y, a.z) > half) return false;';
   if(code.split(next).length!==2)throw Error('exact near-parallel mutation-control anchor missing');
   code=code.replace(next,'if (Math.abs(offset + bodyTop * a.y) + shape.r * horizontal > half) return false;');
  }
  files.set(rel,{raw,composed:code});
  if(emitted&&selective.has(rel)){
   const result=esbuild.transformSync(code,{loader:'js',format:'esm',minify:true,charset:'utf8',legalComments:'inline',sourcefile:rel});if(result.warnings.length)throw Error('cover emission warning');
   code=compactModuleStrings(result.code).code;emissions.push({rel,sha256:crypto.createHash('sha256').update(code).digest('hex')});
  }
  const module=new vm.SourceTextModule(code,{context,identifier:rel});modules.set(rel,module);return module;
 };
 const load=async rel=>{const module=get(rel);if(module.status==='unlinked')await module.link((s,from)=>get(resolve(s,from.identifier)));if(module.status==='linked')await module.evaluate();return module.namespace;};
 const {bossRainFullyCovered:covered}=await load('patches/splatoon3/runtime/boss-storm-cover.mjs'),{Physics}=await load('src/game/physics.js'),{Level}=await load('src/world/level.js');
 const world=blocks=>{const level=new Level({bounds:{minX:-25,maxX:25,minZ:-25,maxZ:25},spawnPads:[[0,0,-20],[0,0,20]],half:[],single:blocks});return {level,physics:new Physics(level)};};
 return {covered,Physics,Level,V:THREE.Vector3,world,files,emissions,load};
}
