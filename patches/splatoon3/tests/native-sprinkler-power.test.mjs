import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {emptyLoadout,gearCurve} from '../runtime/gear.mjs';
function equip(a,ap){a.s3.loadout=emptyLoadout();for(const p of a.s3.loadout){if(ap>=10){p.main='subPower';ap-=10;}}for(const p of a.s3.loadout)for(let i=0;i<3&&ap>=3;i++){p.subs[i]='subPower';ap-=3;}a.s3RefreshGear();}
for(const ap of [0,10,57])test(`native Sprinkler release freezes sourced power periods at ${ap}AP`,async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:"export {resolveSubForThrow} from './patches/splatoon3/runtime/kit-subs.mjs';"});
 const id=Object.keys(f.WEAPONS).find(k=>f.WEAPONS[k].sub==='sprinkler');assert.ok(id);const a=f.make(id);equip(a,ap);a.weaponRunner.reset();const resolved=f.resolveSubForThrow(a,0,f.SUB);
 assert.equal(resolved.spec.periodFirstFrames,gearCurve(ap,480,630,780));
 assert.equal(resolved.spec.periodSecondFrames,gearCurve(ap,900,960,1020));
 assert.equal(resolved.spec.throwSpeed,1.12*60);
});
import fs from 'node:fs';import crypto from 'node:crypto';
import {SPRINKLER,resolveSprinklerPower,sprinklerPhase} from '../runtime/kit-sprinkler.mjs';
test('Sprinkler power fields agree with pinned raw source and preserve constant throw speed',()=>{
 const bytes=fs.readFileSync(new URL('../reference/sprinkler-1130.json',import.meta.url)),r=JSON.parse(bytes).GameParameters.MoveParam;
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),'d3b945ddf9691b93cfc5c236d456462637fa36ba5eab3b1761e995e8f74e49f8');
 for(const ap of [0,3,6,10,20,30,57]){const s=resolveSprinklerPower(SPRINKLER,ap);assert.equal(s.periodFirstFrames,gearCurve(ap,r.PeriodFirst.Low,r.PeriodFirst.Mid,r.PeriodFirst.High));assert.equal(s.periodSecondFrames,gearCurve(ap,r.PeriodSecond.Low,r.PeriodSecond.Mid,r.PeriodSecond.High));assert.equal(s.throwSpeed,gearCurve(ap,r.SpawnSpeedZSpecUp.Low,r.SpawnSpeedZSpecUp.Mid,r.SpawnSpeedZSpecUp.High)*60);}
});
test('native simultaneous Sprinkler throws retain per-owner frozen power and constant velocity',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});const id=Object.keys(f.WEAPONS).find(k=>f.WEAPONS[k].sub==='sprinkler');const a=f.make(id),b=f.make(id);equip(a,0);equip(b,57);for(const o of [a,b]){o.pos.set(0,0,0);o.aimDir.set(0,0,1);o.vel.set(0,0,0);o.weaponRunner.reset();f.G.projectiles.throwBomb(o);}const [lo,hi]=f.G.projectiles.bombs;
 assert.equal(lo.s3Resolved.spec.periodFirstFrames,480);assert.equal(hi.s3Resolved.spec.periodFirstFrames,780);assert.equal(hi.vel.x,lo.vel.x);assert.equal(hi.vel.z,lo.vel.z);assert.equal(SPRINKLER.periodFirstFrames,480);
 equip(b,0);assert.equal(hi.s3Resolved.spec.periodFirstFrames,780,'equipment changes do not rewrite an existing device');assert.equal(sprinklerPhase(600,lo.s3Resolved.spec),1);assert.equal(sprinklerPhase(600,hi.s3Resolved.spec),0);
});
for(const ap of [0,10,57])test(`native Sprinkler phase progression is render-rate invariant at ${ap}AP`,async()=>{
 const outcomes=[];
 for(const fps of [30,60,120]){
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:"export {kitBombContact} from './patches/splatoon3/runtime/kit-subs.mjs';"});const id=Object.keys(f.WEAPONS).find(k=>f.WEAPONS[k].sub==='sprinkler'),o=f.make(id);equip(o,ap);o.weaponRunner.reset();
  f.G.level={...f.G.level,blocks:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,out)=>{out.length=0;return out;}};f.G.physics=new f.installedRuntime.Physics(f.G.level);f.G.projectiles.throwBomb(o);const b=f.G.projectiles.bombs.at(-1);f.kitBombContact(f.SUB,b,{hit:true,point:new f.THREE.Vector3(),normal:new f.THREE.Vector3(0,1,0)});
  let count=0;f.G.paint.splat=()=>{count++;return 0;};for(let i=0;i<32*fps;i++){f.G.time+=1/fps;f.G.projectiles.update(1/fps);}
  outcomes.push({phase:b.s3Sprinkler.phase,shots:b.s3Sprinkler.spraySequence,next:b.s3Sprinkler.nextFrame,paint:count});assert.equal(b.s3Sprinkler.phase,2);
 }
 assert.deepEqual(outcomes[0],outcomes[1]);assert.deepEqual(outcomes[1],outcomes[2]);
});
