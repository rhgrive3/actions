import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from './source-fixture.mjs';
import { makePaintWorld } from './paint-authority-fixture.mjs';
import { ALL_SUB_SPECS } from '../runtime/all-subs.mjs';
const STEP=1/60;
// S3 11.3.0 GP0: PlacePaintRadius and the separate Area/Blast Y offsets are
// explicit pinned raw values. Boundary checks use real floor/LOS geometry;
// the enemy-ink trigger is supplied independently of those vertical checks.
test('Ink Mine placement, sensor and blast offsets match their distinct pinned fields',()=>{
  const raw=JSON.parse(fs.readFileSync(new URL('./fixtures/source-1130/weapon/WeaponTrap.game__GameParameterTable.json',import.meta.url))).GameParameters;
  const spec=ALL_SUB_SPECS.inkMine;
  assert.equal(spec.placePaintRadius,raw.MoveParam.PlacePaintRadius);
  assert.equal(spec.markOffsetY,raw.AreaParam.AreaOffsetY);
  assert.equal(spec.damageOffsetY,raw.BlastParam.DamageOffsetY);
  assert.equal(spec.paintOffsetY,raw.BlastParam.PaintOffsetY);
});

test('Ink Mine actual input paints its placement footprint once without inventing an early blast',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});const {paint}=makePaintWorld(f);
  const a=f.make();a.pos.set(0,0,30);a.weapon={...a.weapon,sub:'inkMine'};a.weaponRunner.reset();a.ink=100;
  const stamps=[],splat=paint.splat.bind(paint);paint.splat=(p,r,t,o)=>{stamps.push({pos:p.clone(),radius:r});return splat(p,r,t,o);};
  for(let i=0;i<8;i++)a.weaponRunner.update(STEP,{sub:true});
  a.weaponRunner.update(STEP,{sub:false,subReleased:true});a.weaponRunner.update(STEP,{sub:false});
  const mine=f.G.projectiles._s3SubObjects.find(o=>o.subId==='inkMine');assert.ok(mine);
  assert.equal(a.ink,40);assert.equal(mine.phase,'deployed');assert.equal(mine.dead,false);
  assert.deepEqual(stamps.map(s=>s.radius),[1]);assert.equal(stamps[0].pos.y,0);
});

test('Ink Mine rejects a native grate support before payment while the same solid floor admits feet placement',async()=>{
  // https://wikiwiki.jp/splatoon3mix/バンカラマッチ指南/ガチヤグラ指南
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});const {level}=makePaintWorld(f);
  const a=f.make();a.pos.set(0,0,30);a.weapon={...a.weapon,sub:'inkMine'};a.weaponRunner.reset();a.ink=100;
  level.blocks[0].grate=true;
  const ground=f.G.physics.groundProbe(a.pos.x,a.pos.y,a.pos.z,.3,.3,f.PLAYER.footRadius,a.ground,false);
  assert.equal(ground.hit,true);assert.equal(ground.block,0);a.grounded=true;
  const release=()=>{for(let i=0;i<8;i++)a.weaponRunner.update(STEP,{sub:true});a.weaponRunner.update(STEP,{sub:false,subReleased:true});a.weaponRunner.update(STEP,{sub:false});};
  release();assert.equal(a.ink,100);assert.equal(f.G.projectiles._s3SubObjects?.length||0,0);
  assert.equal(f.G.projectiles.throwBomb(a),undefined,'direct call cannot bypass the support restriction');
  level.blocks[0].grate=false;release();const mine=f.G.projectiles._s3SubObjects[0];assert.ok(mine);assert.equal(a.ink,40);
  assert.deepEqual(mine.pos.toArray(),a.pos.toArray());f.G.projectiles.clear();
});

test('Ink Mine damage and marking use their raised source centers rather than the floor origin',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});const {paint}=makePaintWorld(f);
  const a=f.make();a.pos.set(0,0,30);a.weapon={...a.weapon,sub:'inkMine'};
  const mine=f.G.projectiles.throwBomb(a);mine.activeAt=0;
  const centre=mine.pos.y+ALL_SUB_SPECS.inkMine.damageOffsetY;
  const victims=[7.99,8.01,3.59].map((distance,i)=>{
    const v=f.make();Object.assign(v,{nid:i+2,team:1,invuln:0});v.pos.set(0,centre+distance-.7,30);return v;
  });
  paint.regionStats=(_x,_y,_z,_r,_team,out)=>{out.enemy=1;return out;};
  const stamps=[],splat=paint.splat.bind(paint);paint.splat=(p,r,t,o)=>{stamps.push({pos:p.clone(),radius:r});return splat(p,r,t,o);};
  f.G.time=1;f.G.projectiles.update(STEP);
  assert.equal(mine.dead,true);assert.deepEqual(victims.map(v=>v.hp),[65,100,55]);
  assert.deepEqual(victims.map(v=>v.s3.revealedUntil?.[0]),[6,undefined,6]);
  const core=stamps.find(s=>s.radius===5);assert.ok(core);assert.ok(Math.abs(core.pos.y-centre)<1e-9);
});
