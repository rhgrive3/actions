import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fixture} from './source-fixture.mjs';
import {makePaintWorld} from './paint-authority-fixture.mjs';
import {spawnSplashDrop,advanceSplashDrops} from '../runtime/blaster-flight-paint.mjs';
import {INK_PROFILE_BYTES,INK_PROFILE_SECTIONS} from '../runtime/main-ink-footprints.mjs';

const options={fullRuntime:true,productionComposition:true,realProjectiles:true};
const digest=b=>createHash('sha256').update(b).digest('hex');
const reference=JSON.parse(fs.readFileSync(new URL('../reference/rectified-blast-contour-20261018.json',import.meta.url)));

test('floor guides reproduce the photograph within 0.26px; all legacy profile bytes remain stable',()=>{
  const r=reference.profiles['ink-blast-rectified'],c=r.floorCalibration;
  assert.deepEqual(INK_PROFILE_SECTIONS[9],r.sections);
  for(let i=0;i<c.guideY.length;i++)assert.ok(Math.abs((c.a*i+c.b)/(c.c*i+1)-c.guideY[i])<.26);
  assert.equal(digest(INK_PROFILE_BYTES.subarray(0,9*512)),'4d570bc95ba89e8b459f8200a19432eaaeeb571ff2d17d7f87ce9ad393d0cd94');
  assert.notEqual(digest(INK_PROFILE_BYTES.subarray(8*512,9*512)),digest(INK_PROFILE_BYTES.subarray(9*512,10*512)));
});

test('floor calibration changes floor ownership, while a wall retains the legacy contour',async()=>{
  const f=await fixture(options);
  for(const wall of [false,true]){
    const grids=[];
    for(const footprint of ['ink-blast','ink-blast-rectified']){
      const {paint,V}=makePaintWorld(f,{cell:.125,wall:true});
      paint.splat(wall?V(0,8,8):V(0,0,12),1.7,0,{seed:.37,kind:'source-shot',footprint,face:wall?1:0,stretch:V(.6,0,.8),stretchAmt:0});
      grids.push(digest(paint.grid));
    }
    if(wall)assert.equal(...grids);else assert.notEqual(...grids);
  }
});

test('falling profiles preserve captured direction at depth one, on both sides of it, and without depth scaling',async()=>{
  const f=await fixture(options),{paint,V}=makePaintWorld(f),owner=f.make('blaster');
  const stamps=[];paint.splat=(at,r,team,o)=>{stamps.push({at:at.clone(),r,o:{...o,stretch:o.stretch?.clone()}});return 0;};
  for(const depth of [false,1,1+1e-8])for(const [dx,dz] of [[1,0],[0,1],[.6,.8],[-.8,.6]]){
    const direction=V(dx,0,dz),from=V(0,2,12);
    const d=spawnSplashDrop(f.G,{owner,team:0,seed:.37,from,direction,radius:1.7,footprint:'ink-blast-rectified',
      depth:depth!==false,kind:'source-splash',spec:{gravity:60,depthScaleMax:depth||1,depthScaleMin:depth||1,dropHeightMax:0,dropHeightMin:10}});
    direction.set(-dz,0,dx);owner.aimDir.copy(direction); // Later aim cannot turn released ink.
    for(let i=0;i<120&&f.G.projectiles._s3SplashDrops.length;i++)advanceSplashDrops(f.G.projectiles,1/60,f.G);
    const s=stamps.at(-1);assert.ok(s?.o.stretch,'no direction discontinuity at unit depth');
    assert.ok(Math.abs(s.o.stretch.x-dx)<1e-12&&Math.abs(s.o.stretch.z-dz)<1e-12);
    assert.equal(s.r,1.7);assert.ok(Math.abs(s.at.x)<1e-6&&Math.abs(s.at.z-12)<1e-6);
    assert.ok((s.o.stretchAmt||0)<1e-6);assert.ok(d.frames>0,'landing still uses the fall integrator');
  }
  assert.equal(stamps.length,12,'direction must not add stamps');
});

test('delayed terrain burst snapshots its direction before the projectile is pooled',async()=>{
  const f=await fixture(options),{paint,V}=makePaintWorld(f),owner=f.make('blaster');
  f.G.projectiles.fireBlaster(owner,owner.weapon,0);
  const p=f.G.projectiles.list.at(-1);p.vel.set(17,0,-23);p.s3TerrainBurst=true;
  const direction=p.vel.clone().normalize(),stamps=[];
  paint.splat=(at,r,team,o)=>{stamps.push({...o,stretch:o.stretch?.clone()});return 0;};
  f.G.projectiles._blastBurst(p,V(0,0,12),null);
  assert.ok(f.G.projectiles.s3BlastQueue?.length);
  p.vel.set(-23,99,17);owner.aimDir.set(1,0,0);
  f.G.projectiles.flushBlastImpacts();
  const blast=stamps.find(s=>s.footprint==='ink-blast-rectified');assert.ok(blast);
  assert.ok(blast.stretch.distanceTo(direction)<1e-12);assert.equal(blast.stretchAmt,0);
});
