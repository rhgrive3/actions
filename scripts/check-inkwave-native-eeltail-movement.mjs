#!/usr/bin/env node
// Logic-only motion verification on pinned Eeltail triangles. This does not
// measure retail hardware, visual footwork, input devices, or Nintendo units.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fixture} from '../patches/splatoon3/tests/source-fixture.mjs';
import {readStage} from '../patches/native-stages/tests/fixture.mjs';
import {adaptBuildSource} from './inkwave-source-composition.mjs';
const assets=process.env.INKWAVE_NATIVE_STAGE_ASSETS;
if(!assets)throw Error('Set INKWAVE_NATIVE_STAGE_ASSETS to the private Eeltail conversion');
const out=path.resolve(process.argv[2]||'.browser-evidence/eeltail-movement-node.json');
const f=await fixture({fullRuntime:true,realProjectiles:true,adaptNative:adaptBuildSource,adaptRuntime:adaptBuildSource,extraExports:`
 export {NativeLevel,NativePhysics} from './patches/native-stages/runtime/engine.mjs';
 export {installMainWeaponCatalogRuntime} from './patches/splatoon3/runtime/main-weapon-catalog.mjs';
`});
f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);
f.setRandom(()=>.5);
const {G,THREE}=f,data=readStage(assets,'eeltail');
assert.equal(data.manifest.sourceSha256,'5d22e97f51ed26fed86035ccff8c5d88e99798bf135b0f01b527a6f26797599f');
G.level=new f.NativeLevel(data);G.physics=new f.NativePhysics(G.level);
class CpuPaint extends f.PaintSystem{_initGPU(){this.quads=0;} _pushQuad(){}}
G.match.mode='turf';G.match.opts={};
const result={id:'eeltail',measurement:'Composed Actor, main catalog, actual source triangles and fixed clock; logic-only, not retail measurement',weapon:'s3-shooter-first',gear:'0 AP',durationSeconds:.5,schedules:[30,60,120],cases:[]};
for(const mode of ['walk','micro','stop','turn90','reverse','shoot','own-swim','enemy-swim','jump','ink-refill']){
 const traces=[],metrics=[];
 for(const hz of result.schedules){
  G.time=0;G.paint=new CpuPaint(null,G.level,{atlasSize:2048,maxDensity:4,cell:.25});
  const actor=f.make(result.weapon);actor._integrate=f.Actor.prototype._integrate;
  actor.s3.loadout=f.emptyLoadout();actor.s3RefreshGear();
  actor.spawnAt(new THREE.Vector3(5,6.08,-15),0);actor.invuln=0;
  actor._resolve(false,actor.pos.y,true);
  const hit=G.physics.raycast(actor.pos.clone().add(new THREE.Vector3(0,2,0)),new THREE.Vector3(0,-1,0),4);
  assert(hit.hit&&hit.normal.y>.68,'actual walkable source support');
  if(mode.includes('swim')||mode==='ink-refill')G.paint.splat(hit.point.clone().addScaledVector(hit.normal,.03),16,mode==='enemy-swim'?1:0,{seed:.3,instant:true});
  if(mode==='ink-refill')actor.ink=50;
  const clock=new f.FixedClock(),rows=[];
  for(let i=0;i<hz*result.durationSeconds;i++)clock.advance(1/hz,dt=>{
   actor.intent.move.set(mode==='ink-refill'?0:1,0,0);actor.intent.fire=mode==='shoot';
   actor.intent.squid=mode.includes('swim')||mode==='ink-refill';
   actor.intent.jump=mode==='jump'&&rows.length===0;
   if(mode==='micro')actor.intent.move.set(.1,0,0);
   if(['stop','turn90','reverse'].includes(mode)&&rows.length>=15)actor.intent.move.set(mode==='reverse'?-1:0,0,mode==='turn90'?1:0);
   G.time+=dt;actor.update(dt);
   rows.push([...actor.pos.toArray(),...actor.vel.toArray(),actor.grounded,actor.form,actor.ink,actor.hp]);
  });
  assert.equal(clock.ticks,30);assert(actor.alive);assert(actor.pos.toArray().every(Number.isFinite));
  if(mode==='shoot'){assert(G.projectiles.list.length>0,'real main admission emitted projectiles');assert(actor.ink<100,'real main admission consumed ink');}
  if(mode==='ink-refill')assert(actor.ink>50,'own source ink replenishes ink');
  traces.push(rows);metrics.push({hz,end:rows.at(-1),peakY:Math.max(...rows.map(r=>r[1])),emittedProjectiles:G.projectiles.list.length});
  G.actors.length=0;G.projectiles.list.length=0;
 }
 let maximumScheduleDifference=0;
 for(let s=1;s<traces.length;s++)for(let i=0;i<30;i++)for(let j=0;j<traces[0][i].length;j++){
  const a=traces[0][i][j],b=traces[s][i][j];
  if(typeof a==='number'){const difference=Math.abs(a-b);maximumScheduleDifference=Math.max(maximumScheduleDifference,difference);assert(difference<1e-6,mode+' frame-schedule drift');}else assert.equal(a,b);
 }
 result.cases.push({mode,maximumScheduleDifference,metrics});
}
result.passed=true;fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({id:result.id,passed:true,cases:result.cases.length,schedules:result.schedules,maximumScheduleDifference:Math.max(...result.cases.map(c=>c.maximumScheduleDifference))}));
