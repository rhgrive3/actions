import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogFractionalSplashCount} from '../runtime/catalog-splash-paint.mjs';
import {MAIN_WEAPON_CATALOG} from '../runtime/main-weapon-catalog-data.mjs';
import {fixture} from './source-fixture.mjs';

test('local cumulative-floor policy distributes candidate budgets rather than ceil per bullet',()=>{
 for(const value of [0,0.2,0.5,1,1.4,1.5,2.4,3,3.8]){
  const n=80,arr=Array.from({length:n},(_,i)=>catalogFractionalSplashCount(value,i));
  assert.equal(arr.reduce((sum,x)=>sum+x,0),Math.floor(value*n+1e-9));
  assert.ok(arr.every(x=>x===Math.floor(value)||x===Math.ceil(value)),value+' floor/ceil');
 }
 assert.deepEqual(Array.from({length:6},(_,i)=>catalogFractionalSplashCount(1.5,i)),[1,2,1,2,1,2]);
 assert.deepEqual(Array.from({length:5},(_,i)=>catalogFractionalSplashCount(1.4,i)),[1,1,2,1,2]);
 assert.throws(()=>catalogFractionalSplashCount(1.5,-1),RangeError);
});

// This observes descriptor budgets at _push, not detached births or landings.
// catalog-fractional-policy.test.mjs separately exercises those local paths.
test('all fractional catalog shooters receive local descriptor budgets through accepted shots',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
  extraExports:"export {installMainWeaponCatalogRuntime} from './patches/splatoon3/runtime/main-weapon-catalog.mjs';"});
 f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);
 f.G.settings={};f.G.physics.segment=(a,b,h)=>{h.hit=false;return h;};
 const selected=MAIN_WEAPON_CATALOG.records.filter(r=>!r.legacy&&r.family==='shooter'&&
  Number.isFinite(r.parameters.SplashSpawnParam?.SpawnNum)&&
  !Number.isInteger(r.parameters.SplashSpawnParam.SpawnNum));
 assert.ok(selected.length>=5,'pinned catalog contains multiple fractional SpawnNum values');
 for(const r of selected){
  f.G.actors.length=0;f.G.projectiles.clear();
  const a=f.make(r.id);a.form='kid';a.ink=100;a.intent.fire=true;
  const counts=[],push=f.G.projectiles._push;
  f.G.projectiles._push=function(p){if(p.catalog?.r.id===r.id)counts.push(p.catalog.descriptor.splashCount);return push.call(this,p);};
  try{f.tick(a,180);}finally{f.G.projectiles._push=push;}
  assert.ok(counts.length>=3,r.id+' accepted shots');
  const expected=counts.map((_,i)=>catalogFractionalSplashCount(r.parameters.SplashSpawnParam.SpawnNum,i));
  assert.deepEqual(counts,expected,r.id+' accepted-shot local descriptor budget');
  assert.ok(counts.reduce((s,x)=>s+x,0)<=Math.ceil(counts.length*r.parameters.SplashSpawnParam.SpawnNum),
   r.id+' local cumulative budget not exceeded');
 }
});
