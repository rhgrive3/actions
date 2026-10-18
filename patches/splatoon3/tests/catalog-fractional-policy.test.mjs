// INKWAVE scheduling contracts, not retail timing or missing-physics defaults.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,emitMainShot} from './source-fixture.mjs';
import {makePaintWorld} from './paint-authority-fixture.mjs';
import {MAIN_WEAPON_CATALOG} from '../runtime/main-weapon-catalog-data.mjs';
import {catalogSplashDropSpec,catalogFractionalSplashCount} from '../runtime/catalog-splash-paint.mjs';
const selected=MAIN_WEAPON_CATALOG.records.filter(r=>!r.legacy&&r.family==='shooter'&&Number.isFinite(r.parameters.SplashSpawnParam?.SpawnNum)&&!Number.isInteger(r.parameters.SplashSpawnParam.SpawnNum));
const expectedSupported=['first','flash','gravity','heavy','precision','quicklong','quickmiddle','short','triplequick'].map(x=>'s3-shooter-'+x).sort();
test('all nine fractional Shooter rows have explicit or typed default falling physics',()=>{
 assert.deepEqual(selected.filter(r=>catalogSplashDropSpec(r.parameters,r.sourceActor)).map(r=>r.id).sort(),expectedSupported);
 assert.deepEqual(selected.filter(r=>!catalogSplashDropSpec(r.parameters,r.sourceActor)).map(r=>r.id),[]);
 const r=selected.find(r=>r.id==='s3-shooter-triplequick');
 assert.equal(r.parameters.SplashSpawnParam.SpawnNum,1.5);
 assert.equal(r.sourceActor,'WeaponShooterTripleQuick');
 assert.equal(r.parameters.MoveParam.$type,undefined,'packed catalogue strips type metadata');
 assert.equal(Object.hasOwn(r.parameters.MoveParam,'FreeGravity'),false);
 assert.equal(catalogSplashDropSpec(r.parameters,r.sourceActor).gravity,.016*3600,'documented Shooter type default, not a fabricated per-weapon value');
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
test('descriptor budgets and independently falling droplets include TripleQuick',async()=>{
 for(const id of ['s3-shooter-short','s3-shooter-triplequick']){
  const {f,a}=await setup(id);const p=emit(f,a);
  assert.equal(f.G.projectiles._s3SplashDrops?.length||0,0);
  assert.ok(p.catalog.descriptor.splashCount>0);
  assert.ok(p.catalog.descriptor.splashDropSpec,'sourced gravity or typed Shooter default');
  for(let i=0;i<30;i++){f.G.time+=1/60;f.G.projectiles.update(1/60);}
  assert.ok((f.G.projectiles._s3SplashDrops?.length||0)>0);
  assert.equal(a.weaponRunner.catalogState.paintShotOrdinal,1);
 }
});

test('TripleQuick force-nearest emits one budgeted physical splash, not an extra instant floor stamp',async()=>{
 const {f,a}=await setup('s3-shooter-triplequick');
 const stamps=[];a.addTurf=amount=>stamps.push(amount);
 f.G.paint.splat=()=>{stamps.push('paint');return 1;};
 const r=a.weapon.catalogRecord,spawn=r.parameters.SplashSpawnParam;
 for(const [ordinal,expected] of [[2,1],[5,2]]){
  a.weaponRunner.update(0,{fire:false,firePressed:false,sub:false});
  a.weaponRunner.catalogState.paintShotOrdinal=ordinal;
  const before=stamps.length,p=emit(f,a);
  assert.equal(p.catalog.descriptor.splashNearest,true,'source force slot');
  assert.equal(p.catalog.descriptor.splashFirst,spawn.SpawnNearestLength);
  assert.equal(p.catalog.descriptor.splashCount,expected);
  assert.equal(stamps.length,before,'no independently projected extra paint on shot birth');
  for(let i=0;i<30;i++){f.G.time+=1/60;f.G.projectiles.update(1/60);}
  assert.equal(p.catalog.dropCount,expected);
  assert.equal(f.G.projectiles._s3SplashDrops.length,expected);
  assert.equal(stamps.length,before,'unlanded physical drops cannot claim turf');
  f.G.projectiles.clear();
 }
});

test('zero and tiny fractional candidate budgets stay arithmetic-only',()=>{
 for(let ordinal=0;ordinal<8;ordinal++)assert.equal(catalogFractionalSplashCount(0,ordinal),0);
 assert.equal(catalogFractionalSplashCount(1e-6,0),0);
 assert.equal(catalogFractionalSplashCount(1e-6,999999),1);
 for(const value of [-1,NaN,Infinity])assert.throws(()=>catalogFractionalSplashCount(value,0),RangeError);
});

for(const dt of [1/30,1/60,1/144])test('TripleQuick source-default gravity creates delayed, credited floor paint at dt='+dt,async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:"export {installMainWeaponCatalogRuntime} from './patches/splatoon3/runtime/main-weapon-catalog.mjs';"});
 f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);
 const {paint,face}=makePaintWorld(f);f.G.settings={};f.setRandom(()=>.37);
 const a=f.make('s3-shooter-triplequick');a.form='kid';a.ink=100;a.pos.set(0,8,0);a.aimDir.set(0,0,1);a.aimPoint.set(0,8,60);
 a.weaponRunner.update(0,{fire:false});a.weaponRunner.catalogState.paintShotOrdinal=2; // forced nearest slot 3
 const stamps=[];const splat=paint.splat;
 paint.splat=function(...args){const value=splat.apply(this,args);stamps.push({time:f.G.time,value,owner:args[3]?.claimOwner,kind:args[3]?.kind});return value;};
 emitMainShot(f,a);const p=f.G.projectiles.list.at(-1);
 assert.equal(p.catalog.descriptor.splashCount,1);
 assert.ok(p.catalog.descriptor.splashDropSpec);
 assert.equal(stamps.length,0,'no eager nearest paint');
 for(let i=0;i<Math.ceil(3/dt);i++){f.G.time+=dt;f.G.projectiles.update(dt);paint.advanceSimulation(dt);}
 assert.equal(p.catalog.dropCount,1);
 assert.ok(stamps.some(x=>x.kind==='source-splash'&&x.time>.01),'one physical droplet lands after flight');
 assert.ok(stamps.every(x=>x.owner===a));
 assert.ok(paint.counts[0]>0);
 assert.ok(Math.abs(a.stats.turf-paint.counts[0]*face.cu*face.cv)<1e-7);
});

for(const name of ['first','flash','gravity','heavy','precision','quicklong','quickmiddle','short','triplequick'])test(name+' detached release budgets',async()=>{
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
