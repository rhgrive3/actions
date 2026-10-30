// Private QA runner: actual Actor/WeaponRunner/Projectiles admission in the repository fixture.
// Synthetic collision stages, no device/FPS claim. Observer-on/off must match the explicitly recorded projection; this is not whole-game equivalence.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {instrumentNativeSweep,createSweepCounters,captureObservedValue} from './native-sweep-counters.mjs';
const root=path.resolve(process.env.PROFILE_ROOT||process.cwd());
const expected=process.env.PROFILE_SOURCE_SHA;
assert.match(expected||'',/^[a-f0-9]{40}$/);
assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),expected);
assert.equal(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:root,encoding:'utf8'}).trim(),'','tracked checkout must stay clean');
const mode=process.env.INKWAVE_BUILT_SITE?'emitted':'source';
const site=path.resolve(process.env.PROFILE_BUILT_SITE||process.env.INKWAVE_BUILT_SITE||'');
assert.ok(process.env.PROFILE_BUILT_SITE,'paired built-site binding required for both modes');
assert.equal(process.env.INKWAVE_UPSTREAM_SOURCE,undefined,'no alternate upstream source');
if(mode==='emitted')assert.equal(path.resolve(process.env.INKWAVE_BUILT_SITE),site,'validated and executed site must be identical');
const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8'));
const esbuild=createRequire(path.join(root,'package.json'))('esbuild');
assert.equal(esbuild.version,'0.28.2');
const normalizeQueryBox=source=>esbuild.transformSync('globalThis.__qa={'+source+'};',{loader:'js',minify:true,target:'es2022'}).code;
if(manifest){
 assert.match(manifest.build?.revision||'',/^[a-f0-9]{64}$/);assert.match(manifest.contentHash||'',/^[a-f0-9]{64}$/);
 assert.equal(crypto.createHash('sha256').update(JSON.stringify(manifest.artifacts)).digest('hex'),manifest.contentHash);
 const prefixes={'upstream':'inkwave-public','patch':'patches/splatoon3','touch-layout':'patches/touch-layout','reliability':'patches/reliability','local-quality':'patches/local-quality','network-replication':'patches/network-replication','practice-range':'patches/practice-range','loading-cache':'patches/loading-cache','native-stages':'patches/native-stages','build-script':'scripts'};
 assert.equal(crypto.createHash('sha256').update(JSON.stringify(manifest.files)).digest('hex'),manifest.inputHash);
 for(const [key,hash] of Object.entries(manifest.files)){const at=key.indexOf('/'),prefix=prefixes[key.slice(0,at)];assert.ok(prefix,'unknown input namespace '+key);const file=path.resolve(root,prefix,key.slice(at+1));assert.ok(file.startsWith(root+path.sep));assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),hash,key);}
 for(const [relative,hash] of Object.entries(manifest.artifacts)){
  const file=path.resolve(site,relative);assert.ok(file.startsWith(site+path.sep),'artifact path must remain within site');
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),hash,relative);
 }
}
const {fixture,emitMainShot}=await import(pathToFileURL(path.join(root,'patches/splatoon3/tests/source-fixture.mjs')));
const {adaptBuildSource}=await import(pathToFileURL(path.join(root,'scripts/inkwave-source-composition.mjs')));
const target='patches/native-stages/runtime/native-projectile-sweep.mjs',hookHashes=new Set(),expectedHookHashes=new Set();
function hook(rel,source){
 if(rel!==target)return source;
 const hash=crypto.createHash('sha256').update(source).digest('hex');
 const expectedHash=mode==='emitted'?manifest.artifacts[target]:crypto.createHash('sha256').update(adaptBuildSource(target,fs.readFileSync(path.join(root,target),'utf8'))).digest('hex');
 assert.equal(hash,expectedHash,'runtime text must bind exact selected source/artifact');hookHashes.add(hash);expectedHookHashes.add(expectedHash);
 return instrumentNativeSweep(source);
}
const dt=1/60,steps=120,seeds=[0x17571671,0x32501],rows=[];
function random(seed){let calls=0;const fn=()=>{calls++;seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};fn.snapshot=()=>({calls,state:seed});return fn;}
for(const scenario of ['flat','wall','moving'])for(const weapon of ['shooter','s3-blaster-short'])for(const seed of seeds){
 const pair=[];
 for(const enabled of [false,true]){
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,includeCharacter:false,
   adaptNative:adaptBuildSource,adaptRuntime:(rel,s)=>hook(rel,adaptBuildSource(rel,s)),adaptEmittedRuntime:hook,
   extraExports:"export {NativeLevel,NativePhysics} from './patches/native-stages/runtime/engine.mjs';"});
  const qa=createSweepCounters({enabled,normalizeQueryBox}),rng=random(seed);assert.equal(Object.hasOwn(f.context,'__nativeSweepQA'),false,'fresh fixture observer slot');f.context.__nativeSweepQA=qa;
  try{f.setRandom(rng);
  const {G}=f,V=(x=0,y=0,z=0)=>new f.THREE.Vector3(x,y,z);
  // Match the established actual-projectile synthetic wall fixture. Flat uses a distant floor.
  const wall=scenario!=='flat';
  const vertices=wall?[0,0,-4,0,5,-4,0,0,4]:[-50,-20,-50,50,-20,-50,0,-20,50];
  const normal=wall?[1,0,0]:[0,1,0],bounds=wall?[0,0,-4,0,5,4]:[-50,-20,-50,50,-20,50];
  const origin=wall?[0,0,-4]:[-50,-20,-50],u=wall?[0,1,0]:[1,0,0],v=[0,0,1];
  const level=new f.NativeLevel({manifest:{id:'qa-sweep-'+scenario,bounds:{minX:-60,minZ:-60,maxX:60,maxZ:60},spawnPads:[[-5,0,0],[5,0,0]],spawnBarrier:0,
   faces:[{n:normal,u,v,origin,su:100,sv:100,bounds:[bounds.slice(0,3),bounds.slice(3)],triangles:[0]}],
   objects:[{collidable:true,grate:false,bounds:[bounds.slice(0,3),bounds.slice(3)]}]},
   triangles:new Float32Array(vertices),normals:new Float32Array(normal),flags:new Uint32Array([3]),objectIds:new Uint32Array([0]),
   nodes:new Float32Array([...bounds,-1,1]),order:new Uint32Array([0]),triangleFace:new Int32Array([0]),mask:new Uint8Array([1])});
  if(scenario==='moving'){const id=level.blocks.length;level.blocks.push({id,solid:true,grate:false,center:V(-2,1,0),half:V(.5,.5,.5),axes:[V(1,0,0),V(0,1,0),V(0,0,1)],aabbMin:V(-2.5,.5,-.5),aabbMax:V(-1.5,1.5,.5),faces:[-1,-1,-1,-1,-1,-1]});}
  G.actors.length=0;G.projectiles.clear();G.time=0;G.netm=null;G.boss=null;G.local=null;G.level=level;G.physics=new f.NativePhysics(level);
  const paint=[],splat=G.paint.splat;
  G.paint.splat=function(...args){paint.push(captureObservedValue(args));return Reflect.apply(splat,this,args);};
  const a=f.make(weapon);a.pos.set(-5,0,0);a.character.root.position.copy(a.pos);a.aimYaw=a.intent.aimYaw=Math.PI/2;a.aimPoint.set(5,1.05,0);
  const admittedFrames=emitMainShot(f,a);
  assert.ok(G.projectiles.list.length>0,'real Actor admission required');
  const samples=[];
  for(let tick=0;tick<steps;tick++){G.time+=dt;G.projectiles.update(dt);samples.push(G.projectiles.list.map(p=>({wid:p.wid,life:p.life,pos:p.pos?.toArray(),vel:p.vel?.toArray()})));}
  const result={admittedFrames,samples,paint,actorHP:a.hp,rng:rng.snapshot()};
  pair.push({result,counters:qa.snapshot()});
  }finally{delete f.context.__nativeSweepQA;f.restoreRandom();}
 }
 assert.deepEqual(pair[1].result,pair[0].result,'observer changes gameplay fixture output');
 const counters=pair[1].counters,calls=counters.level+counters.catalogue;
 assert.ok(calls>0,'native wrappers must be exercised');
 assert.equal(counters.totalHits+counters.misses,calls);
 assert.equal(counters.errors,0);
 rows.push({scenario,weapon,seed,observerParity:true,admittedFrames:pair[1].result.admittedFrames,
  behaviorSHA256:crypto.createHash('sha256').update(JSON.stringify(captureObservedValue(pair[1].result))).digest('hex'),counters,hitRate:counters.totalHits/calls});
}
assert.equal(hookHashes.size,1,'exactly one runtime identity per mode');
const report={schema:1,sourceHead:expected,mode,manifestContentHash:manifest.contentHash,buildRevision:manifest.build.revision,sourceInputHash:manifest.inputHash,runtimeBoundToSelectedBytes:true,
 runtimeOriginalSHA256:[...hookHashes][0],runtimeExpectedSHA256:[...expectedHookHashes][0],dt,steps,seeds,rows,
 observationScope:'projectile wid/life/position/velocity history; paint argument own-data graph; actorHP; RNG calls/state',
 scope:'Synthetic-stage actual Actor->WeaponRunner->Projectiles fixture, observer count only. Character rendering is stubbed. Not device, FPS or native-map acceptance. The moving scenario uses a stationary OBB in the dynamic-block list; it is not moving-platform acceptance.',
 cacheMeaning:'sourceOptionsReused/sourceOutputReused/bvhStackReused are storage reuse, not collision-result cache hits',
 instrumentation:'QA-only compile wrapper and temporary read-only node observer; original files unchanged; restored on success/error'};
assert.equal(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:root,encoding:'utf8'}).trim(),'');
assert.ok(process.argv[2]&&path.isAbsolute(process.argv[2]),'explicit absolute new receipt path required');
fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({mode,cases:rows.length,observerParity:true}));
