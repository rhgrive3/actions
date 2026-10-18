import assert from 'node:assert/strict';
import test from 'node:test';
import {fixture} from './source-fixture.mjs';
import {makePaintWorld} from './paint-authority-fixture.mjs';
async function emit({wall=false,ghost=false,range=100,life=2,contactDistance=2.5}={}){
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:"export { installMainWeaponCatalogRuntime } from './patches/splatoon3/runtime/main-weapon-catalog.mjs';"});
 f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);makePaintWorld(f);f.G.settings={};f.setRandom(()=>.37);
 const a=f.make('s3-shooter-short');a.pos.set(0,8,0);a.aimDir.set(0,0,1);a.weaponRunner.update(1/60,{fire:true,firePressed:true});
 const p=f.G.projectiles.list.find(p=>p.catalog);assert.ok(p);
 p.pos.set(0,8,0);p.prev.copy(p.pos);p.start.copy(p.pos);p.vel.set(0,0,600);p.ghost=ghost;
 p.catalog.descriptor.m={};p.catalog.descriptor.splashCount=8;p.catalog.descriptor.splashSpacing=1;
 p.catalog.nextSplash=1;p.catalog.range=range;p.life=life;
 f.G.physics.level=null; // Isolate a deterministic contact distance, not the mesh sweep algorithm.
 f.G.physics.segment=(from,to,out)=>{out.hit=wall;out.dist=contactDistance;if(wall){out.point.set(0,8,contactDistance);out.normal.set(0,0,-1);out.face=0;}return out;};
 f.G.projectiles._step(p,1/60);
 return {drops:f.G.projectiles._s3SplashDrops||[],p};
}
test('multiple splash thresholds in one fixed step emit at their distance rather than at the endpoint',async()=>{
 const {drops,p}=await emit();assert.equal(p.catalog.dropCount,8);assert.equal(drops.length,8);
 assert.deepEqual(Array.from(drops,d=>d.releaseZ),[1,2,3,4,5,6,7,8]);
});
test('a collision retains earlier splash releases but emits no splash beyond the obstruction',async()=>{
 const {drops}=await emit({wall:true});assert.ok(drops.length>0);assert.ok(drops.every(d=>d.releaseZ<=2.5));
 assert.deepEqual(Array.from(drops,d=>d.releaseZ),[1,2]);
});
test('splash exactly at head-impact distance is suppressed (no double stamp)',async()=>{
 const {drops}=await emit({wall:true,contactDistance:2});
 assert.deepEqual(Array.from(drops,d=>d.releaseZ),[1]);
});
test('remote ghost contact emits no authoritative splash',async()=>{assert.equal((await emit({wall:true,ghost:true})).drops.length,0);});

test('falling catalog projectiles release from the explicit source distance for their SplitNum slot',async()=>{
 const {MAIN_WEAPON_CATALOG}=await import('../runtime/main-weapon-catalog-data.mjs');
 const {catalogSplashDropSpec,catalogSplashFirst}=await import('../runtime/catalog-splash-paint.mjs');
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:"export { installMainWeaponCatalogRuntime } from './patches/splatoon3/runtime/main-weapon-catalog.mjs';"});
 f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);makePaintWorld(f);f.G.settings={};
 const records=MAIN_WEAPON_CATALOG.records.filter(r=>!r.legacy&&catalogSplashDropSpec(r.parameters,r.sourceActor));assert.ok(records.length>=23,'typed Shooter default adds at least TripleQuick to the falling queue');
 assert.ok(records.some(r=>r.id==='s3-shooter-triplequick'));
 for(const r of records){
  f.G.projectiles.clear();const a=f.make(r.id);a.aimDir.set(0,0,1);
  for(let i=0;i<60&&!f.G.projectiles.list.length;i++)a.weaponRunner.update(1/60,{fire:true,firePressed:i===0});
  const p=f.G.projectiles.list.find(p=>p.catalog);assert.ok(p,r.id);
  // Shooter-family first shot = slot 1: SpawnNearestLength + SpawnBetweenLength*(SplitNum-1)/SplitNum
  // (native splashPlan rule); other families keep the explicit nearest distance.
  const spawn=r.parameters.SplashSpawnParam,staggered=['shooter','splatling','dualies'].includes(r.family);
  assert.equal(p.catalog.nextSplash,staggered?catalogSplashFirst(spawn,0):spawn.SpawnNearestLength,r.id);
  if(staggered&&Number.isInteger(spawn.SplitNum))assert.equal(catalogSplashFirst(spawn,spawn.SplitNum-1),spawn.SpawnNearestLength,r.id+' nearest slot');
 }
});

for(const limits of [{range:2.5},{life:1/240},{range:2.5,life:1/240}])test('release distances stop at range/lifetime '+JSON.stringify(limits),async()=>{
 const {drops}=await emit(limits);assert.deepEqual(Array.from(drops,d=>d.releaseZ),[1,2]);
});
