import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fixture } from './weapon-edgecases-fixture.mjs';
import { fixture as resourceFixture } from './source-fixture.mjs';
import { adaptSource } from '../adapter.mjs';
import { FixedClock } from '../runtime/clock.mjs';

async function roller(vertical = false) {
  const f = await fixture(), { G, THREE } = f;
  G.scene = new THREE.Scene(); G.camera=new THREE.PerspectiveCamera(); G.actors = []; G.boss = null; G.netm = null;
  G.level.queryBlocks = (_a,_b,_c,_d,out) => { out.length=0; return out; };
  G.physics=new f.Physics(G.level);
  const p = G.projectiles = new f.Projectiles(G.scene), a=f.make('roller');
  a.weaponRunner.s3FlickVertical=vertical; a.aimDir.set(0,0,1); a.aimPoint.set(0,1,50);
  p.fireFlick(a,a.weapon); return {f,p,a};
}

test('#682 horizontal flight has no recurring trail, while impacts and vertical trails remain', async () => {
  for (const vertical of [false,true]) {
    const {f,p,a}=await roller(vertical), {G,THREE}=f;
    assert.equal(p.list.length, vertical ? 5 : 13);
    const paints=[];G.paint.splat=(...args)=>{paints.push(args);return 0;};
    G.physics.raycast=(origin,dir,len,hit)=>{hit.hit=dir.y===-1;hit.point.copy(origin).setY(0);hit.normal.set(0,1,0);hit.dist=origin.y;return hit;};
    for(const q of p.list){q.trail=10;assert.equal(q.trailEvery,vertical?1.8:0);}
    for(const q of p.list) p._step(q,1/60);
    assert.equal(paints.length>0,vertical,'only the existing vertical path may generate generic flight drips');
    if(!vertical){
      const q=p.list[0];
      // Restore only the old cadence to demonstrate the extra mid-flight paint.
      q.trailEvery=1.8;q.trail=10;p._step(q,1/60);assert.ok(paints.length>0,'old cadence paints under a flying glob');
      q.trailEvery=0;paints.length=0;
      const hit=new f.Hit();hit.hit=true;hit.point.copy(q.pos);hit.normal.set(0,1,0);
      p._impact(q,hit);assert.ok(paints.length>0,'horizontal impact paint remains active');
    }
  }
});

test('#682 raw horizontal group has no intermediate splash cadence; vertical ownership remains separate', async () => {
  const {f}=await roller(), raw=f.profile.weaponsFidelityCompletion.weapons.roller;
  for(const key of ['SpawnSplashFirstLength','SpawnSplashBetweenLength','SpawnSplashNum','SplashPaintParam']) {
    assert.equal(Object.hasOwn(raw.WideSwingUnitGroupParam,key),false,key);
    assert.equal(Object.hasOwn(raw.VerticalSwingUnitGroupParam,key),true,key);
  }
});

async function storm(t, ghost=false) {
  const f=process.env.INKWAVE_EDGECASE_SITE?await fixture():await resourceFixture();
  if(f.installSubSpecialFidelity)f.installSubSpecialFidelity(f,f.profile);
  else {
    const runtime=await import(pathToFileURL(path.join(process.env.INKWAVE_EDGECASE_SITE,'patches/splatoon3/runtime/sub-special-fidelity.mjs')));
    runtime.installSubSpecialFidelity(f,f.profile);
  }
  const {G,THREE}=f;G.scene=new THREE.Scene();G.netm=null;G.actors=[];
  const p=G.projectiles=new f.Projectiles(G.scene), owner=f.make();owner.team=0;
  const visual=[],boss=[];G.fx={rain:(_pos,r)=>visual.push(r)};G.boss={rain:(_a,_x,_z,r)=>boss.push(r)};
  const c={t,dur:8,team:0,ghost,owner,dir:new THREE.Vector3(),rainT:100,group:new THREE.Group()};c.group.position.set(0,5,0);p.clouds.push(c);
  return {f,p,c,visual,boss};
}

test('#683 actual cloud uses the same growing/fading radius for Player, Boss and rain FX', async () => {
  for(const age of [0,5/60,10/60,29/60,1,7.5])for(const ghost of [false,true]) {
    const {f,p,c,visual,boss}=await storm(age,ghost), {G}=f;
    const actors=[3,4,8,9.5,10.01].map(x=>{const a=f.make();a.team=1;a.pos.set(x,0,0);a.invuln=0;a.hp=100;return a;});G.actors=actors;
    p._updateClouds(1/60);const r=10*c.group.scale.x;
    assert.equal(visual[0],r);assert.deepEqual(boss,ghost?[]:[r]);
    actors.forEach(a=>assert.ok(Math.abs(a.hp-(a.pos.x<=r?99.6:100))<1e-9,`age=${age} ghost=${ghost} x=${a.pos.x} radius=${r} hp=${a.hp}`));
  }
});

test('#683 ownership, LOS and cloud-height rejections remain active', async () => {
  const {f,p}=await storm(1,true), {G}=f;
  const a=f.make(),ally=f.make(),remote=f.make(),high=f.make(),covered=f.make();
  for(const e of [a,ally,remote,high,covered]){e.team=1;e.pos.set(0,0,0);e.invuln=0;e.hp=100;}
  ally.team=0;remote.remote=true;high.pos.y=6;covered.pos.x=1;G.actors=[a,ally,remote,high,covered];
  G.physics.los=(origin)=>origin.x!==1;p._updateClouds(1/60);
  assert.ok(Math.abs(a.hp-99.6)<1e-9);for(const e of [ally,remote,high,covered])assert.equal(e.hp,100);
});

test('#683 missing or duplicate player-radius anchor fails closed',()=>{
  const raw=fs.readFileSync(new URL('../../../inkwave-public/src/game/weapons.js',import.meta.url),'utf8');
  const anchor='dx * dx + dz * dz > sp.radius * sp.radius || e.pos.y > c.group.position.y';
  for(const source of [raw.replace(anchor,''),raw+'\n'+anchor])assert.throws(()=>adaptSource('src/game/weapons.js',source),/conflict/);
});


test('#683 30/60/120Hz rendering has identical fixed-step growth and damage onset', async()=>{
  const traces=[];
  for(const hz of [30,60,120]){
    const {f,p,c}=await storm(0), a=f.make();a.team=1;a.invuln=0;a.hp=100;a.pos.set(8,0,0);f.G.actors=[a];
    const clock=new FixedClock(), rows=[];
    for(let n=0;n<hz/2;n++)clock.advance(1/hz,dt=>{p._updateClouds(dt);rows.push([c.t,c.group.scale.x,a.hp]);});
    assert.equal(clock.ticks,30);assert.equal(rows[0][2],100);assert.ok(rows.at(-1)[2]<100);traces.push(rows);
  }
  assert.deepEqual(traces[0],traces[1]);assert.deepEqual(traces[1],traces[2]);
});

test('#682 remote Roller packets cannot restore horizontal recurring trail; vertical path remains independent',async()=>{
  for(const vertical of [false,true]){
    const {f,p,a}=await roller(vertical),q=p.list[0];
    const e=[0,0,0,q.type,q.wid,...q.pos.toArray(),...q.vel.toArray(),q.delay,q.life,q.straight,q.radius,q.size,q.grav,q.drag,1.8,q.head,q.vis,q.tail0,q.tailK,q.wob,q.wobF,q.nose,q.sats];
    p.ghostProjectile(a,e);const ghost=p.list.at(-1);
    assert.equal(ghost.ghost,true);assert.equal(ghost.fidelityMode,vertical?'vertical':'horizontal');
    assert.equal(ghost.trailEvery,vertical?1.8:0);
    let painted=0;f.G.paint.splat=()=>{painted++;return 0;};
    p._step(ghost,1/60);assert.equal(painted,0,'ghost remains cosmetic');
  }
});
