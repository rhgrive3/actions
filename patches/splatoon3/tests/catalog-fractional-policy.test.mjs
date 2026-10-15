// INKWAVE scheduling contracts, not retail timing or missing-physics defaults.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,emitMainShot} from './source-fixture.mjs';
import {makePaintWorld} from './paint-authority-fixture.mjs';
import {MAIN_WEAPON_CATALOG} from '../runtime/main-weapon-catalog-data.mjs';
import {catalogSplashDropSpec,catalogFractionalSplashCount} from '../runtime/catalog-splash-paint.mjs';
const selected=MAIN_WEAPON_CATALOG.records.filter(r=>!r.legacy&&r.family==='shooter'&&Number.isFinite(r.parameters.SplashSpawnParam?.SpawnNum)&&!Number.isInteger(r.parameters.SplashSpawnParam.SpawnNum));
const expectedSupported=['first','flash','gravity','heavy','precision','quicklong','quickmiddle','short'].map(x=>'s3-shooter-'+x).sort();
test('eligibility: eight explicit specs plus unresolved TripleQuick',()=>{
 assert.deepEqual(selected.filter(r=>catalogSplashDropSpec(r.parameters)).map(r=>r.id).sort(),expectedSupported);
 assert.deepEqual(selected.filter(r=>!catalogSplashDropSpec(r.parameters)).map(r=>r.id),['s3-shooter-triplequick']);
 const r=selected.find(r=>r.id==='s3-shooter-triplequick');
 assert.equal(r.parameters.SplashSpawnParam.SpawnNum,1.5);
 assert.equal(Object.hasOwn(r.parameters.MoveParam,'FreeGravity'),false);
 assert.equal(catalogSplashDropSpec(r.parameters),null);
});
test('cumulative-floor arithmetic is local policy, not retail evidence',()=>{
 for(const value of [1.4,1.5,2.4,3.4])assert.equal(Array.from({length:80},(_,i)=>catalogFractionalSplashCount(value,i)).reduce((a,b)=>a+b,0),Math.floor(80*value+1e-9));
 assert.deepEqual(Array.from({length:6},(_,i)=>catalogFractionalSplashCount(1.5,i)),[1,2,1,2,1,2]);
});
async function setup(id='s3-shooter-short'){
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:"export {installMainWeaponCatalogRuntime} from './patches/splatoon3/runtime/main-weapon-catalog.mjs';"});
 f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);
 f.G.settings={};f.G.physics.segment=(a,b,h)=>{h.hit=false;return h;};
 const a=f.make(id);a.form='kid';a.ink=100;a.pos.set(0,8,0);a.aimDir.set(0,0,1);a.aimPoint.set(0,8,60);
 return {f,a};
}
function emit(f,a){emitMainShot(f,a);return f.G.projectiles.list.at(-1);}
test('local ordinal cancellation, runner reset and weapon-ID switch contracts',async()=>{
 const {f,a}=await setup();const runner=a.weaponRunner;
 emit(f,a);assert.equal(runner.catalogState.paintShotOrdinal,1);
 a.alive=false;runner.update(1/60,{fire:false,firePressed:false,sub:false});
 assert.equal(runner.catalogState.paintShotOrdinal,1,'dead-actor cancellation retains ordinal');
 a.alive=true;runner.reset();assert.equal(runner.catalogState,null);
 emit(f,a);assert.equal(runner.catalogState.paintShotOrdinal,1);
 const previous=runner.catalogState;
 a.weapon=f.WEAPONS['s3-shooter-first'];runner.update(0,{fire:false,firePressed:false,sub:false});
 assert.notEqual(runner.catalogState,previous);assert.equal(runner.catalogState.id,'s3-shooter-first');
 assert.equal(runner.catalogState.paintShotOrdinal,undefined);
});
test('descriptor budget differs from detached queue observation',async()=>{
 for(const id of ['s3-shooter-short','s3-shooter-triplequick']){
  const {f,a}=await setup(id);const p=emit(f,a);
  assert.equal(f.G.projectiles._s3SplashDrops?.length||0,0);
  assert.ok(p.catalog.descriptor.splashCount>0);
  for(let i=0;i<30;i++){f.G.time+=1/60;f.G.projectiles.update(1/60);}
  if(id==='s3-shooter-short'){
   assert.ok(p.catalog.descriptor.splashDropSpec);assert.ok((f.G.projectiles._s3SplashDrops?.length||0)>0);
  }else{
   assert.equal(p.catalog.descriptor.splashCount,1,'private local policy starts with one candidate');
   assert.equal(p.catalog.descriptor.splashDropSpec,null);
   assert.equal(f.G.projectiles._s3SplashDrops?.length||0,0);
   assert.equal(a.weaponRunner.catalogState.paintShotOrdinal,1);
  }
 }
});

// Credit callback is observed independently; this is not a turf-grid test.
test('TripleQuick legacy projection consumes the local budget even for zero or tiny paint credit',async()=>{
 for(const credit of [0,1e-9]){
  const {f,a}=await setup('s3-shooter-triplequick');
  const credits=[];let stamps=0;
  a.addTurf=amount=>credits.push(amount);
  f.G.paint.splat=()=>{stamps++;return credit;};
  // TripleQuick SplitNum 12, ForceSpawnNearestAddNumArray [3,6,9]: ordinals 2 and 5 are nearest-release
  // slots (budgets 1 and 2), so every candidate lies within the round's reach under SplitNum staggering.
  for(const [ordinal,expected] of [[2,1],[5,2]]){
   a.weaponRunner.update(0,{fire:false,firePressed:false,sub:false});a.weaponRunner.catalogState.paintShotOrdinal=ordinal;
   const p=emit(f,a),before=stamps;
   f.G.physics.raycast=(at,d,len,h)=>{h.hit=true;h.face=0;h.point.copy(at);h.point.y=0;return h;};
   for(let i=0;i<30;i++){f.G.time+=1/60;f.G.projectiles.update(1/60);}
   assert.equal(p.catalog.descriptor.splashDropSpec,null);
   assert.equal(p.catalog.descriptor.splashCount,expected);
   assert.equal(p.catalog.dropCount,expected);
   assert.equal(stamps-before,expected,'legacy floor stamps consume one candidate each');
   assert.equal(f.G.projectiles._s3SplashDrops?.length||0,0);
   f.G.projectiles.clear();
  }
  assert.deepEqual(credits,[credit,credit,credit]);
  assert.equal(a.weaponRunner.catalogState.paintShotOrdinal,6);
 }
});
test('zero and tiny fractional candidate budgets stay arithmetic-only',()=>{
 for(let ordinal=0;ordinal<8;ordinal++)assert.equal(catalogFractionalSplashCount(0,ordinal),0);
 assert.equal(catalogFractionalSplashCount(1e-6,0),0);
 assert.equal(catalogFractionalSplashCount(1e-6,999999),1);
 for(const value of [-1,NaN,Infinity])assert.throws(()=>catalogFractionalSplashCount(value,0),RangeError);
});

for(const dt of [1/30,1/60,1/144])test('TripleQuick real projected paint and turf ledger dt='+dt,async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:"export {installMainWeaponCatalogRuntime} from './patches/splatoon3/runtime/main-weapon-catalog.mjs';"});
 f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);
 const {paint,face}=makePaintWorld(f);f.G.settings={};f.setRandom(()=>.37);
 const a=f.make('s3-shooter-triplequick');a.form='kid';a.ink=100;a.pos.set(0,0,0);a.aimDir.set(0,0,1);a.aimPoint.set(0,1.05,60);
 const stamps=[];const splat=paint.splat;paint.splat=function(...args){const value=splat.apply(this,args);stamps.push({value,owner:args[3]?.claimOwner});return value;};
 // Nearest-release SplitNum slots (see above): budgets 1 then 2.
 for(const [slot,ordinal] of [[2,0],[5,1]]){
  a.weaponRunner.update(0,{fire:false,firePressed:false,sub:false});a.weaponRunner.catalogState.paintShotOrdinal=slot;
  const before=stamps.length;emitMainShot(f,a);const p=f.G.projectiles.list.at(-1);
  assert.equal(p.catalog.descriptor.splashDropSpec,null);assert.equal(p.catalog.descriptor.splashCount,ordinal+1);
  for(let i=0;i<Math.ceil(0.15/dt) && p.catalog.dropCount<ordinal+1;i++){f.G.time+=dt;f.G.projectiles.update(dt);paint.advanceSimulation(dt);}
  assert.equal(p.catalog.dropCount,ordinal+1);assert.equal(stamps.length-before,ordinal+1);assert.equal(f.G.projectiles._s3SplashDrops?.length||0,0);
  f.G.projectiles.clear();
 }
 for(let i=0;i<300;i++)paint.advanceSimulation(1/60);
 assert.ok(stamps.some(x=>x.value>0));assert.ok(stamps.every(x=>x.owner===a));assert.ok(paint.counts[0]>0);
 const ownedArea=(paint.counts[0]*face.cu*face.cv);
 assert.ok(Math.abs(a.stats.turf-ownedArea)<1e-7,`${a.stats.turf} vs owned ${ownedArea}`);
 assert.ok(Math.abs(a.special-a.stats.turf)<1e-7);
 const turf=a.stats.turf;for(let i=0;i<60;i++)paint.advanceSimulation(1/60);assert.equal(a.stats.turf,turf);
});

for(const name of ['first','flash','gravity','heavy','precision','quicklong','quickmiddle','short'])test(name+' detached release budgets',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:"export {installMainWeaponCatalogRuntime} from './patches/splatoon3/runtime/main-weapon-catalog.mjs';"});
 f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);f.G.settings={};f.G.physics.segment=(a,b,h)=>{h.hit=false;return h;};
 const a=f.make('s3-shooter-'+name);a.form='kid';a.ink=100;a.pos.set(0,8,0);a.aimDir.set(0,0,1);a.aimPoint.set(0,8,60);
 for(let j=0;j<2;j++){
 // Nearest SplitNum slot: every budgeted release lies within this short-lived round's reach.
 a.weaponRunner.update(0,{fire:false});a.weaponRunner.catalogState.paintShotOrdinal=a.weapon.catalogRecord.parameters.SplashSpawnParam.SplitNum*(j+1)-1;
 emitMainShot(f,a);const p=f.G.projectiles.list.at(-1);assert.ok(p.catalog.descriptor.splashDropSpec);
 for(let i=0;i<30;i++){f.G.time+=1/60;f.G.projectiles.update(1/60);}
 assert.equal(p.catalog.dropCount,p.catalog.descriptor.splashCount);
 assert.equal(f.G.projectiles._s3SplashDrops.length,p.catalog.descriptor.splashCount);
 f.G.projectiles.clear();
 }
});
