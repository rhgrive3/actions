import assert from 'node:assert/strict';
import test from 'node:test';
import {fixture} from './source-fixture.mjs';
import {makePaintWorld} from './paint-authority-fixture.mjs';
import {catalogSplashDropSpec} from '../runtime/catalog-splash-paint.mjs';
import {MAIN_WEAPON_CATALOG} from '../runtime/main-weapon-catalog-data.mjs';

test('catalog falling splash derives gravity and height law from retained 11.3.0 fields',()=>{
 const source=MAIN_WEAPON_CATALOG.records.find(r=>r.id==='s3-shooter-short').parameters;
 const spec=catalogSplashDropSpec(source);assert.equal(spec.gravity,source.MoveParam.FreeGravity*3600);
 assert.equal(spec.dropHeightMax,source.SplashPaintParam.DepthMaxDropHeight);
 assert.equal(spec.dropHeightMin,source.SplashPaintParam.DepthMinDropHeight);
 assert.equal(catalogSplashDropSpec({}),null,'missing source physics is not silently invented');
});

async function shot(rate,height=8,{wall=false,dead=false,ghost=false}={}){
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:"export { installMainWeaponCatalogRuntime } from './patches/splatoon3/runtime/main-weapon-catalog.mjs';"});
 f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);const {paint,level}=makePaintWorld(f,{wall});
 if(wall){level.faces[1].origin.z=1.65;level.blocks[1].center.z=2.15;level.blocks[1].aabbMin.z=1.65;level.blocks[1].aabbMax.z=2.65;}f.G.settings={};f.setRandom(()=>.37);
 const a=f.make('s3-shooter-short');a.form='kid';a.pos.set(0,height,0);a.aimDir.set(0,0,1);a.aimPoint.set(0,height,60);a.grounded=true;
 const stamps=[],original=paint.splat;paint.splat=function(at,r,team,opts){stamps.push({time:f.G.time,at:at.clone(),r,opts:{...opts}});return original.call(this,at,r,team,opts);};
 // Fire from the SplitNum cycle's nearest slot so the first splash releases at SpawnNearestLength
 // (other slots stagger it one SpawnBetweenLength fraction farther, like the native splash planner).
 a.weaponRunner.update(0,{fire:false});a.weaponRunner.catalogState.paintShotOrdinal=a.weapon.catalogRecord.parameters.SplashSpawnParam.SplitNum-1;
 a.intent.fire=true;a.weaponRunner.update(1/60,{fire:true,firePressed:true,sub:false});a.intent.fire=false;if(dead)a.alive=false;if(ghost){a.remote=true;for(const p of f.G.projectiles.list)p.ghost=true;}
 let queued=false;
 for(let i=0;i<rate*3;i++){f.G.time+=1/rate;f.G.projectiles.update(1/rate);paint.advanceSimulation(1/rate);if(f.G.projectiles._s3SplashDrops?.length)queued=true;}
 return{queued,stamps,grid:Array.from(paint.grid),turf:a.stats.turf,cells:paint.counts[0],landings:f.G.projectiles._s3SplashLandings||[]};
}

test('airborne catalog splash lands before acquiring floor ownership, with deterministic 30/60/120Hz final paint',async()=>{
 const baseline=await shot(60);assert.ok(baseline.queued);assert.ok(baseline.landings.length>0);
 const drops=baseline.stamps.filter(s=>s.opts.kind==='drop');assert.ok(drops.length>0);
 assert.ok(drops.every(s=>s.time>.2),'high airborne splash cannot immediately ray-project onto floor');
 assert.ok(baseline.landings.every(l=>l.frames>0&&l.height>1));
 assert.equal(baseline.turf,baseline.cells*.0625);
 for(const rate of [30,120]){const next=await shot(rate);assert.deepEqual(next.grid,baseline.grid);assert.equal(next.turf,baseline.turf);}
});

test('falling splash collides with an earlier wall and keeps floor turf separate after owner death',async()=>{
 const alive=await shot(60,8,{wall:true}),dead=await shot(60,8,{wall:true,dead:true});
 assert.ok(alive.landings.some(l=>l.normalY<.45),'wall collision happens before floor landing');
 assert.ok(alive.landings.every(l=>l.face>=0),'landings carry an authoritative surface');
 assert.equal(alive.turf,alive.cells*.0625,'wall paint never counts as floor turf');
 assert.deepEqual(dead.grid,alive.grid);assert.equal(dead.turf,alive.turf);
});

test('remote ghost simulation never releases a second authoritative falling splash',async()=>{
 const ghost=await shot(60,8,{ghost:true});
 assert.equal(ghost.queued,false);assert.equal(ghost.landings.length,0);assert.equal(ghost.stamps.length,0);assert.equal(ghost.turf,0);
});
