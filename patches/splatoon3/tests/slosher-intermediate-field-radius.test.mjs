import test from 'node:test';import assert from 'node:assert/strict';
const root=new URL('../runtime/',import.meta.url).href;
const {MAIN_WEAPON_CATALOG}=await import(root+'main-weapon-catalog-data.mjs');
const {slosherIntermediateSpec}=await import(root+'slosher-intermediate-paint.mjs');
function projectile(actor){const r=MAIN_WEAPON_CATALOG.records.find(r=>r.sourceActor===actor);return {fidelitySloshUnit:structuredClone(r.parameters.UnitGroupParam.Unit[1]),fidelitySloshIndex:actor==='WeaponSlosherDiffusion'?2:3,seed:.5};}
for(const actor of ['WeaponSlosherDiffusion','WeaponSlosherDouble'])test(actor+' explicit field radius preserved independently from draw and paint',()=>{
 const p=projectile(actor);for(const scale of [1,.5]){const s=slosherIntermediateSpec(p,scale);assert.equal(s.drop.fieldRadius,.15*scale);assert.notEqual(s.drop.fieldRadius,s.drawRadius);assert.notEqual(s.drop.fieldRadius,s.widthHalf);}
});
test('cached plan invalidates field envelope while keeping prior immutable plan',()=>{const p=projectile('WeaponSlosherDouble'),cache=new WeakMap(),first=slosherIntermediateSpec(p,1,cache);p.fidelitySloshUnit.SplashAndSplashWallHitSpawnPrm.SplashParam[0].DrawSizeCollisionPaintParam.CollisionParam.EndRadiusForField=.2;const next=slosherIntermediateSpec(p,1,cache);assert.equal(first.drop.fieldRadius,.15);assert.equal(next.drop.fieldRadius,.2);assert.notEqual(first.drop,next.drop);});
test('absent or time-varying field radius does not invent a constant envelope',()=>{const p=projectile('WeaponSlosherDouble'),c=p.fidelitySloshUnit.SplashAndSplashWallHitSpawnPrm.SplashParam[0].DrawSizeCollisionPaintParam.CollisionParam;delete c.EndRadiusForField;assert.equal(slosherIntermediateSpec(p).drop.fieldRadius,undefined);c.EndRadiusForField=.15;c.ChangeFrameForField=3;assert.equal(slosherIntermediateSpec(p).drop.fieldRadius,undefined);});
const {Vector3}=await import(root+'../../../inkwave-public/vendor/three/build/three.module.js');
const {spawnSplashDrop,advanceSplashDrops}=await import(root+'blaster-flight-paint.mjs');
const {sweptWorldHit}=await import(root+'weapons-collision.mjs');
for(const actor of ['WeaponSlosherDiffusion','WeaponSlosherDouble'])test(actor+' actual falling drop contacts edge inside its explicit source envelope',()=>{
 const s=slosherIntermediateSpec(projectile(actor)),b={solid:true,center:new Vector3(0,-.5,0),half:new Vector3(1,.5,1),axes:[new Vector3(1,0,0),new Vector3(0,1,0),new Vector3(0,0,1)],faces:[0,0,0,0,0,0]};
 const level={blocks:[b],faces:[],queryBlocks(_a,_b,_c,_d,out){out.length=0;out.push(0);return out;}},physics={level,segment(from,to,hit,skip){return sweptWorldHit(this,from,to,0,0,hit,skip);}};let paints=0;const G={projectiles:{},physics,paint:{splat(){paints++;return 1;}}};
 spawnSplashDrop(G,{owner:{addTurf(){}},team:0,from:new Vector3(1.1,2,0),direction:new Vector3(0,0,1),radius:s.widthHalf,spec:s.drop});for(let i=0;i<30;i++)advanceSplashDrops(G.projectiles,1/60,G,-20);assert.equal(paints,1);assert.equal(G.projectiles._s3SplashLandings[0].x,1);assert.equal(G.projectiles._s3SplashLandings[0].y,0);
});
