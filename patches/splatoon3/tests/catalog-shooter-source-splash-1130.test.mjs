// Splatoon 3 Ver.11.3.0 source-backed Shooter splash birth / paint ownership.
// Original row: Leanny/splat3@7280ff9cde8bb1c5dcef46c700c326471584d2e6
// data/parameter/1130/weapon/WeaponShooterNormal.game__GameParameterTable.json
// Interpreted SplitNum phase spacing remains an INKWAVE model, not Nintendo code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { INK_PROFILES, splashPlan } from '../../../inkwave-public/src/game/inkFlight.js';
import { MAIN_WEAPON_CATALOG } from '../runtime/main-weapon-catalog-data.mjs';
import { catalogSplashFirst, catalogSplashNearestSlot, catalogSplashRadius,
  catalogFractionalSplashCount, catalogSplashDropSpec } from '../runtime/catalog-splash-paint.mjs';
import { fixture, emitMainShot } from './source-fixture.mjs';

const splattershot1130 = Object.freeze({
  SpawnNum:1.5, SplitNum:8, SpawnNearestLength:1.2, SpawnBetweenLength:9.2,
  ForceSpawnNearestAddNumArray:[4]
});

test('11.3.0 Splattershot: fractional schedule, 8-cycle nearest slots and two distinct radii',()=>{
 const s=INK_PROFILES.shooter.splash;
 assert.equal(s.count,splattershot1130.SpawnNum);
 assert.equal(s.splits,splattershot1130.SplitNum);
 assert.equal(s.spacing,splattershot1130.SpawnBetweenLength);
 assert.equal(s.nearest,splattershot1130.SpawnNearestLength);
 assert.deepEqual(s.forceNearest,splattershot1130.ForceSpawnNearestAddNumArray);
 assert.equal(s.radius,1.472);
 assert.equal(s.feetRadius,2.0608);
 const budgets=Array.from({length:16},(_,i)=>catalogFractionalSplashCount(s.count,i));
 assert.deepEqual(budgets,[1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2]);
 for(let i=0;i<16;i++){
   const feet=(i%8===3||i%8===7);
   const plan=splashPlan(INK_PROFILES.shooter,i);
   assert.equal(plan.feet,feet);
   assert.equal(catalogSplashNearestSlot(splattershot1130,i),feet);
   assert.equal(plan.first,catalogSplashFirst(splattershot1130,i));
   const descriptor={splashRadius:s.radius,splashNearestRadius:s.feetRadius,splashNearest:feet};
   assert.equal(catalogSplashRadius(descriptor,0),feet?2.0608:1.472);
   assert.equal(catalogSplashRadius(descriptor,1),1.472,'only nearest first drop gets feet width');
 }
});

test('11.3.0 two Triple Shooter rows use the typed SimpleMove FreeGravity=0.016 default only when allowed',()=>{
 for(const [id,actor,count,split,force] of [
  ['s3-shooter-triplequick','WeaponShooterTripleQuick',1.5,12,[3,6,9]],
  ['s3-shooter-triplemiddle','WeaponShooterTripleMiddle',3,5,[3]]
 ]){
  const r=MAIN_WEAPON_CATALOG.records.find(r=>r.id===id);
  assert.ok(r);
  assert.equal(r.sourceActor,actor);
  assert.equal(r.parameters.MoveParam.$type,undefined,'packed catalogue retains numbers, not type strings');
  assert.equal(Object.hasOwn(r.parameters.MoveParam,'FreeGravity'),false);
  assert.equal(r.parameters.SplashSpawnParam.SpawnNum,count);
  assert.equal(r.parameters.SplashSpawnParam.SplitNum,split);
  assert.deepEqual(Array.from(r.parameters.SplashSpawnParam.ForceSpawnNearestAddNumArray),force);
  assert.equal(catalogSplashDropSpec(r.parameters,r.sourceActor).gravity,0.016*3600);
  assert.equal(catalogSplashDropSpec(r.parameters,'Unknown'),null,'no actor-agnostic invented default');
  assert.equal(catalogSplashDropSpec({MoveParam:{$type:'Unknown'},SplashSpawnParam:r.parameters.SplashSpawnParam,
    SplashPaintParam:r.parameters.SplashPaintParam}),null);
  assert.equal(catalogSplashDropSpec({MoveParam:{$type:'spl__BulletSimpleMoveParam',FreeGravity:0},
    SplashSpawnParam:r.parameters.SplashSpawnParam,SplashPaintParam:r.parameters.SplashPaintParam}),null);
 }
});

test('catalog Shooter: source feet radius is attached to the ONE queued first drop, not an instant second paint',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
   extraExports:"export {installMainWeaponCatalogRuntime} from './patches/splatoon3/runtime/main-weapon-catalog.mjs';"});
 f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);
 f.G.settings={}; f.G.physics.segment=(a,b,h)=>{h.hit=false;return h;};
 const a=f.make('s3-shooter-short');
 a.form='kid';a.ink=100;a.pos.set(0,8,0);a.aimDir.set(0,0,1);a.aimPoint.set(0,8,60);
 const source=a.weapon.catalogRecord.parameters;
 const splash=source.SplashSpawnParam;
 a.weaponRunner.update(0,{fire:false,firePressed:false,sub:false});
 a.weaponRunner.catalogState.paintShotOrdinal=splash.SplitNum-1;
 let instant=0;const oldPaint=f.G.paint.splat;
 f.G.paint.splat=function(...args){instant++;return oldPaint.apply(this,args);};
 emitMainShot(f,a);
 const p=f.G.projectiles.list.find(p=>p.catalog);
 assert.ok(p);
 assert.equal(p.catalog.descriptor.splashNearest,true);
 assert.equal(p.catalog.descriptor.splashFirst,splash.SpawnNearestLength);
 assert.equal(instant,0,'no extra paint at the muzzle');
 for(let i=0;i<12;i++){f.G.time+=1/60;f.G.projectiles.update(1/60);}
 assert.equal(instant,0,'unlanded drops never claim paint');
 assert.ok(p.catalog.dropCount>0);
 assert.ok(f.G.projectiles._s3SplashDrops.length>0);
 assert.equal(f.G.projectiles._s3SplashDrops[0].radius,source.SplashPaintParam.WidthHalfNearest);
 for(let i=1;i<f.G.projectiles._s3SplashDrops.length;i++)
  assert.equal(f.G.projectiles._s3SplashDrops[i].radius,source.SplashPaintParam.WidthHalf);
});
