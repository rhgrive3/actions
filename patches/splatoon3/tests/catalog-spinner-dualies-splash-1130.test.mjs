// Per-family S3 11.3.0 splash accounting: not a blanket Shooter assumption.
// Source: Leanny/splat3@7280ff9cde8bb1c5dcef46c700c326471584d2e6,
// data/parameter/1130/weapon/WeaponSpinner*.json and WeaponManeuver*.json.
// Exact Nintendo runtime phase permutation and Spinner splash fall physics
// are NOT reconstructed by these numerical invariants.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAIN_WEAPON_CATALOG } from '../runtime/main-weapon-catalog-data.mjs';
import { catalogFractionalSplashCount, catalogSplashFirst, catalogSplashNearestSlot,
  catalogSplashRadius, catalogSplashDropSpec } from '../runtime/catalog-splash-paint.mjs';
import { fixture, emitMainShot } from './source-fixture.mjs';

const cases = [
 // id, family, average budget, split cycle, spacing, near length, intermediate half-width, feet half-width, extra feet shots
 ['s3-spinner-quick','splatling',1.6,6,10,0,1.449,1.7388,[3]],
 ['s3-spinner-hyper','splatling',1,8,23.5,0,1.288,1.5456,[]],
 ['s3-spinner-downpour','splatling',1,6,11,0,1.472,1.7664,[]],
 ['s3-spinner-serein','splatling',1.5,8,12,0,1.449,2.10105,[4]],
 ['s3-spinner-hypershort','splatling',.6,10,24,0,1.594,1.913,[5]],
 ['s3-maneuver-short','dualies',1,5,11,1,1.5525,2.1735,[]],
 ['s3-maneuver-gallon','dualies',2,5,7,1,1.518,2.1252,[]],
 ['s3-maneuver-dual','dualies',2,8,9,1.1,1.38,1.932,[]],
 ['s3-maneuver-stepper','dualies',1.2,7,13.5,1,1.541,2.1574,[]],
 ['s3-maneuver-long','dualies',2,8,10,1.3,1.38,1.932,[4]],
];

test('all 5 source Spinner and all 5 source Maneuver rows preserve family-owned paint numbers',()=>{
 const set=MAIN_WEAPON_CATALOG.records.filter(r=>!r.legacy&&['splatling','dualies'].includes(r.family));
 assert.equal(set.length,10);
 for(const [id,family,count,split,spacing,nearest,middleWidth,feetWidth,force] of cases){
  const r=set.find(r=>r.id===id);assert.ok(r,id);
  assert.equal(r.family,family);
  const s=r.parameters.SplashSpawnParam,p=r.parameters.SplashPaintParam;
  assert.equal(s.SpawnNum,count,id);assert.equal(s.SplitNum,split,id);
  assert.equal(s.SpawnBetweenLength,spacing,id);assert.equal(s.SpawnNearestLength,nearest,id);
  assert.equal(p.WidthHalf,middleWidth,id);assert.equal(p.WidthHalfNearest,feetWidth,id);
  assert.deepEqual(Array.from(s.ForceSpawnNearestAddNumArray||[]),force,id);
  for(let i=0;i<split*2;i++){
   const n=catalogFractionalSplashCount(count,i);
   assert.ok(n>=0&&n<=Math.ceil(count),id+' count '+i);
   const expectedFeet=(i%split===split-1)||force.includes(i%split+1);
   assert.equal(catalogSplashNearestSlot(s,i),expectedFeet,id+' feet '+i);
   const first=catalogSplashFirst(s,i);
   assert.ok(first>=nearest&&first<nearest+spacing+1e-9,id+' first '+i);
   const d={splashNearest:expectedFeet,splashRadius:middleWidth,splashNearestRadius:feetWidth};
   assert.equal(catalogSplashRadius(d,0),expectedFeet?feetWidth:middleWidth,id+' first radius '+i);
   assert.equal(catalogSplashRadius(d,1),middleWidth,id+' later radius '+i);
  }
  if(family==='dualies')assert.equal(catalogSplashDropSpec(r.parameters,r.sourceActor)?.gravity,.016*3600,
   id+' sourced physical falling drops');
  else assert.equal(catalogSplashDropSpec(r.parameters,r.sourceActor),null,
   id+' SpinnerMoveParams omit gravity, so no inferred Nintendo falling law');
 }
});

test('actual added Maneuver rounds queue source-width feet droplets without double muzzle stamps',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
 f.G.settings={};f.G.physics.segment=(a,b,h)=>{h.hit=false;return h;};
 const a=f.make('s3-maneuver-dual');a.form='kid';a.ink=100;
 a.pos.set(0,8,0);a.aimDir.set(0,0,1);a.aimPoint.set(0,8,60);
 a.weaponRunner.update(0,{fire:false,firePressed:false,sub:false});
 a.weaponRunner.catalogState.paintShotOrdinal=a.weapon.catalogRecord.parameters.SplashSpawnParam.SplitNum-1;
 let stamps=0;const orig=f.G.paint.splat;
 f.G.paint.splat=function(...args){stamps++;return orig.apply(this,args);};
 emitMainShot(f,a);
 const p=f.G.projectiles.list.find(x=>x.catalog?.r.id==='s3-maneuver-dual');
 assert.ok(p?.catalog.descriptor.splashNearest);
 assert.equal(p.catalog.descriptor.splashCount,2);
 assert.equal(stamps,0,'feet must not stamp a second paint at round creation');
 for(let i=0;i<30;i++){f.G.time+=1/60;f.G.projectiles.update(1/60);}
 assert.equal(p.catalog.dropCount,2);
 const drops=f.G.projectiles._s3SplashDrops||[];
 assert.equal(drops.length,2);
 assert.equal(drops[0].radius,1.932,'first source feet splash');
 assert.equal(drops[1].radius,1.38,'second source intermediate splash');
 assert.equal(stamps,0,'unlanded droplets never credit turf');
});

test('Spinner gravity-unknown fallback paints each crossed release coordinate once, not only frame end',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
 f.G.settings={};f.G.physics.segment=(a,b,h)=>{h.hit=false;return h;};
 const a=f.make('s3-spinner-quick');a.form='kid';a.ink=100;
 a.pos.set(0,8,0);a.aimDir.set(0,0,1);a.aimPoint.set(0,8,80);
 a.intent.fire=true;f.tick(a,60);a.intent.fire=false;f.tick(a,18);
 const p=f.G.projectiles.list.find(x=>x.catalog?.r.id==='s3-spinner-quick');
 assert.ok(p,'partial-charge Spinner releases real rounds');
 assert.equal(p.catalog.descriptor.splashDropSpec,null,'missing Spinner gravity remains explicitly unresolved');
 let stamps=[];f.G.paint.splat=(at,radius)=>{stamps.push({z:at.z,radius});return 0;};
 f.G.physics.raycast=(at,dir,d,out)=>{out.hit=true;out.point.copy(at).setY(0);out.face=0;out.normal.set(0,1,0);return out;};
 const d=p.catalog.descriptor,s=p.catalog;
 p.pos.set(0,8,0);p.prev.copy(p.pos);p.start.copy(p.pos);p.age=0;p.life=2;p.vel.set(0,0,600);
 d.m={};d.splashDropSpec=null;d.sloshFall=null;d.splashCount=5;d.splashSpacing=2;
 d.splashRadius=1.449;d.splashNearestRadius=1.7388;d.splashNearest=true;
 s.travel=0;s.nextSplash=0;s.dropCount=0;s.range=100;s.phase=0;s.carry=0;
 f.G.projectiles._step(p,1/60);
 assert.equal(s.dropCount,5);
 assert.deepEqual(stamps.map(x=>Math.round(x.z*1e6)/1e6),[0,2,4,6,8],
  'even fast Spinner travel must consume all crossed release locations');
 assert.deepEqual(stamps.map(x=>x.radius),[1.7388,1.449,1.449,1.449,1.449]);
});
