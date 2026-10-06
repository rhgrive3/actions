import { resolveSubForThrow } from '../runtime/kit-subs.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {fileURLToPath,pathToFileURL} from 'node:url';import {adaptSource} from '../adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';
import { adaptNetworkSource } from '../../network-replication/adapter.mjs';
import { adaptRange } from '../../practice-range/adapter.mjs';
import { adaptGearSub } from '../gear-sub-adapter.mjs';
const adaptBuildSource=(rel,code)=>adaptRange(rel,adaptNetworkSource(rel,adaptQualitySource(rel,adaptReliability(rel,adaptTouchLayout(rel,adaptSource(rel,code))))));
const ROOT=fileURLToPath(new URL('../../../',import.meta.url)),SRC=path.join(ROOT,'inkwave-public'),DT=1/60;
async function rig(){
 const context=vm.createContext({console,performance,URL}),mods=new Map();
 function load(file){if(mods.has(file))return mods.get(file);const raw=fs.readFileSync(file,'utf8'),s=adaptBuildSource(file.startsWith(SRC+'/')?path.relative(SRC,file):path.relative(ROOT,file),raw);const m=new vm.SourceTextModule(s,{context,identifier:file,initializeImportMeta(meta){meta.url=pathToFileURL(file).href;}});mods.set(file,m);return m;}
 const e=new vm.SourceTextModule("export {install} from './patches/splatoon3/runtime/install.mjs';",{context,identifier:ROOT+'entry.mjs'});
 await e.link((spec,from)=>{let f=spec==='three'?path.join(SRC,'vendor/three/build/three.module.js'):spec.startsWith('three/addons/')?path.join(SRC,'vendor/three/jsm',spec.slice(13)):path.resolve(path.dirname(from.identifier),spec);if(f.startsWith(SRC+'/patches/'))f=path.join(ROOT,path.relative(SRC,f));if(f.startsWith(ROOT+'src/'))f=path.join(SRC,path.relative(ROOT,f));return load(f);});await e.evaluate();
 const profile=JSON.parse(fs.readFileSync(ROOT+'patches/splatoon3/profile.json','utf8')),f=e.namespace.install(profile),{G,THREE}=f;
 Object.assign(G,{time:0,teamColors:[new THREE.Color('orange'),new THREE.Color('blue')],level:{blocks:[],groundHeight:()=>0},physics:{los:()=>true,segment:(_a,_b,h)=>{h.hit=false;return h;},raycast:(_a,_b,_d,h)=>{h.hit=false;return h;}},paint:{sample:()=>1,splat:()=>0},match:{playing:()=>true},actors:[],camera:{position:new THREE.Vector3()},audio:null,fx:null,boss:null,netm:null});
 G.projectiles=new f.Projectiles(new THREE.Scene());
 function make(kind,ability,ap){const a=new f.Actor({team:0,name:'sub',weapon:kind,CharacterClass:f.Character});a.s3.loadout=Array.from({length:3},()=>({main:ap?ability:'none',subs:Array(3).fill(ap?ability:'none')}));a.setWeapon(kind);a.grounded=true;a._nearCamera=()=>false;return a;}
 return {...f,profile,make,step(a,input,n=1){for(let i=0;i<n;i++)a.weaponRunner.update(DT,input);}};
}
test('full installed Kit releases keep nested same-sub cost actor-local',async()=>{
 for(const kind of ['charger','shooter','roller']){
  const f=await rig(),a=f.make(kind,'inkSaverSub',57),b=f.make(kind,'inkSaverSub',0),base=f.SUB[a.weapon.sub],before=JSON.stringify(base);let nested=false;
  f.G.netm={recBomb(){if(nested)return;nested=true;f.step(b,{sub:true},8);f.step(b,{subReleased:true});}};
  f.step(a,{sub:true},8);f.step(a,{subReleased:true});assert.equal(f.G.projectiles.bombs.length,2);
  const cost=base.inkCost??base.inkCostFallback;assert.ok(Math.abs((100-a.ink)-cost*a.s3.modifiers.inkSaverSub)<1e-8);assert.ok(Math.abs((100-b.ink)-cost)<1e-8);assert.equal(JSON.stringify(base),before);
 }
});
test('full installed Kit preview and nested throw share actor-local power and restore preview context on error',async()=>{
 const f=await rig(),a=f.make('charger','subPower',57),b=f.make('charger','subPower',0),ps=f.G.projectiles,base=f.SUB.bomb.throwSpeed;let nested=false,preview;
 f.G.netm={recBomb(){if(nested)return;nested=true;ps.updateArc(b,true);preview=new f.THREE.Vector3(ps._arcCache.vx,ps._arcCache.vy,ps._arcCache.vz);f.step(b,{sub:true},8);f.step(b,{subReleased:true});}};
 f.step(a,{sub:true},8);f.step(a,{subReleased:true});assert.equal(ps.bombs.length,2);assert.ok(ps.bombs[1].vel.distanceTo(preview)<1e-8);
 const inherited=ps.throwVelocity(a,0,new f.THREE.Vector3());const ratio=ps.bombs[0].vel.clone().sub(inherited).length()/ps.bombs[1].vel.clone().sub(ps.throwVelocity(b,0,new f.THREE.Vector3())).length();assert.ok(Math.abs(ratio-a.s3.modifiers.subPower)<1e-8,JSON.stringify({ratio,wanted:a.s3.modifiers.subPower,a:ps.bombs[0].vel.toArray(),b:ps.bombs[1].vel.toArray(),inherited:inherited.toArray()}));assert.equal(f.SUB.bomb.throwSpeed,base);
 ps.updateArc(a,false);f.G.physics.segment=()=>{throw Error('arc collision failed');};assert.throws(()=>ps.updateArc(a,true),/arc collision failed/);assert.equal(ps.s3PreviewSubSpeed,undefined);assert.equal(f.SUB.bomb.throwSpeed,base);
});

test('actor-local gear resolution preserves unknown cost instead of inventing a free sub',()=>{const a={weapon:{sub:'unknown'},s3:{modifiers:{inkSaverSub:.65,subPower:1.5}}},SUB={unknown:{id:'unknown',inkCost:null,inkCostFallback:null,throwSpeed:1}};const resolved=resolveSubForThrow(a,0,SUB);assert.equal(resolved.inkCost,null);assert.equal(resolved.throwSpeed,1.5);assert.equal(SUB.unknown.throwSpeed,1);});

test('full dispatcher preserves explicit Kit power once and implicit Storm snapshot with existing vertical inheritance',async()=>{
 const rel='patches/splatoon3/runtime/sub-special-fidelity.mjs', raw=fs.readFileSync(ROOT+rel,'utf8');
 const compiled=adaptBuildSource(rel,raw), f=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
 const a={aimYaw:.3,aimPitch:.2,vel:{x:2,y:7,z:-3},s3:{modifiers:{subPower:1.5},stormPowerSnapshot:{throwScale:1.25}}};
 const vector=()=>({set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}});
 for(const kind of ['bomb','storm'])for(const explicit of [undefined,0,42,100.8]){
  const p=f.SUB_SPECIAL_FIDELITY[kind], scale=kind==='storm'?1.25:1.5,z=explicit??p.spawnSpeedZ*scale,cp=Math.cos(.2),sp=Math.sin(.2);
  const v=f.fidelityThrowVelocity(a,kind,vector(),explicit), h=z*cp-p.spawnSpeedY*sp;
  assert.ok(Math.abs(v.x-(Math.sin(.3)*h+2*p.inheritX))<1e-10);
  assert.ok(Math.abs(v.z-(Math.cos(.3)*h-3*p.inheritX))<1e-10);
  assert.ok(Math.abs(v.y-Math.max(p.spawnSpeedYWorldMin,z*sp+p.spawnSpeedY*cp+Math.min(7*p.inheritYPlus,p.inheritYMax)))<1e-10);
 }
 const replace=(s,a,b)=>{assert.equal(s.split(a).length-1,1);return s.replace(a,b);};
 const oldZ='  const horizontal = p.spawnSpeedZ * cp - p.spawnSpeedY * sp;';
 assert.throws(()=>replace(raw,oldZ,'unused'),/0 !== 1/,'old dispatcher anchor cannot transform the explicit-speed module');
 const legacy=raw.replace('  const speed = Number.isFinite(forwardSpeed) ? forwardSpeed : p.spawnSpeedZ;\n','').replace('speed * cp','p.spawnSpeedZ * cp').replace('speed * sp','p.spawnSpeedZ * sp');
 const legacyCompiled=adaptGearSub(rel,legacy,replace), old=await import('data:text/javascript;base64,'+Buffer.from(legacyCompiled).toString('base64'));
 for(const kind of ['bomb','storm']){const x=old.fidelityThrowVelocity(a,kind,vector()),y=f.fidelityThrowVelocity(a,kind,vector());assert.deepEqual([x.x,x.y,x.z],[y.x,y.y,y.z]);}
 assert.throws(()=>adaptGearSub(rel,compiled,replace),/expected one fidelity launch-speed owner/);
 assert.throws(()=>adaptGearSub(rel,raw+raw,replace),/expected one fidelity launch-speed owner/);
 assert.throws(()=>adaptGearSub(rel,raw.replace('Number.isFinite(forwardSpeed)','forwardSpeed !== undefined'),replace),/expected one fidelity launch-speed owner/);
});
