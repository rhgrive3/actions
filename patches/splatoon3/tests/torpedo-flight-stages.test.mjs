import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { makePaintWorld } from './paint-authority-fixture.mjs';
import { ALL_SUB_SPECS } from '../runtime/all-subs.mjs';

// S3 11.3.0 GP0, standing targets. Wiki reports stop/transform then straight
// travel (not continuous homing), and loss of search after terrain contact.
// Its 45F? transform total is provisional. Runtime rotation25F is explicitly
// calibrated from that total minus the extracted post-rotation wait20F.
// https://wikiwiki.jp/splatoon3mix/ブキ/サブウェポン/トーピード#r2c63076
const STEP=1/60;
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
async function world(){
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
  makePaintWorld(f);
  const owner=f.make(),target=f.make(),other=f.make();
  Object.assign(owner,{nid:1,team:0,netLife:0});owner.pos.set(50,0,50);
  Object.assign(target,{nid:2,team:1,netLife:0,invuln:0});target.pos.set(0,0,38);
  Object.assign(other,{nid:3,team:1,netLife:0,invuln:0});other.pos.set(30,0,60);
  owner.weapon={...owner.weapon,sub:'torpedo'};owner.weaponRunner.reset();owner.ink=100;
  function fire(){
    for(let i=0;i<8;i++)owner.weaponRunner.update(STEP,{sub:true});
    owner.weaponRunner.update(STEP,{sub:false,subReleased:true});owner.weaponRunner.update(STEP,{sub:false});
    const bomb=f.G.projectiles._s3SubObjects.find(o=>o.subId==='torpedo');
    assert.ok(bomb,'actual paid input release emits the source Torpedo');assert.equal(owner.ink,35);
    bomb.pos.set(0,2,30);bomb.prev.copy(bomb.pos);bomb.vel.set(0,0,0);return bomb;
  }
  function step(dt=STEP){f.G.time+=dt;f.G.projectiles.update(dt);}
  return {f,owner,target,other,fire,step};
}

for(const hz of [30,60,120])test(`Torpedo stops, waits after rotation and flies straight at ${hz} Hz`,async()=>{
  const w=await world(),bomb=w.fire(),events=[];
  w.f.on('all:sub',e=>{if(e.seq===bomb.seq)events.push({...e,sourceAge:bomb.age});});
  for(let i=0;i<hz*1.1;i++)w.step(1/hz);
  const lock=events.find(e=>e.phase==='torpedoLock'),launch=events.find(e=>e.phase==='torpedoLaunch');
  assert.ok(lock&&launch);assert.equal(bomb.phase,'chase');
  near(launch.sourceAge-lock.sourceAge,(ALL_SUB_SPECS.torpedo.rotationFrames+ALL_SUB_SPECS.torpedo.chaseStartFrames)/60);
  near(lock.x,launch.x);near(lock.y,launch.y);near(lock.z,launch.z);
  assert.match(ALL_SUB_SPECS.torpedo.rotationStatus,/calibrated.*provisional/);
  const velocity=bomb.vel.clone(),aim=bomb.torpedoAim.clone();
  w.target.pos.set(60,40,60);w.other.pos.set(0,0,34);
  for(let i=0;i<hz/5;i++)w.step(1/hz);
  assert.ok(bomb.vel.distanceTo(velocity)<1e-9,'target movement cannot bend the launched path');
  assert.ok(bomb.torpedoAim.equals(aim));assert.equal(bomb.torpedoTarget,w.target);
});

test('Torpedo keeps the captured life through transform and cannot redirect to a respawn',async()=>{
  const w=await world(),bomb=w.fire();for(let i=0;i<6;i++)w.step();
  assert.equal(bomb.phase,'torpedoRotate');
  const aim=bomb.torpedoAim.clone();w.target.alive=false;w.target.pos.set(60,0,60);w.other.pos.set(0,0,32);
  for(let i=0;i<10;i++)w.step();
  w.target.alive=true;w.target.netLife++;w.target.pos.set(100,0,100);
  for(let i=0;i<35;i++)w.step();
  assert.equal(bomb.phase,'chase');assert.ok(bomb.torpedoAim.equals(aim));
  assert.equal(bomb.torpedoTarget,w.target);assert.equal(bomb.torpedoTargetLife,0);
});

test('Torpedo search is bounded horizontally and asymmetrically above/below',async()=>{
  const w=await world();w.f.G.physics.segment=()=>null;w.f.G.physics.los=()=>true;
  const spec=ALL_SUB_SPECS.torpedo;
  const cases=[[spec.chaseRadius-.01,0,true],[spec.chaseRadius+.01,0,false],
    [0,spec.findHeightAbove-.01,true],[0,spec.findHeightAbove+.01,false],
    [0,-spec.findHeightBelow+.01,true],[0,-spec.findHeightBelow-.01,false]];
  for(const [x,dy,expected] of cases){
    w.f.G.projectiles.clear();w.owner.ink=100;w.owner.weaponRunner.reset();
    const b=w.fire();b.age=spec.findStartFrames/60;
    w.target.pos.set(x,b.pos.y+dy-.7,b.pos.z);w.step();
    assert.equal(b.phase==='torpedoRotate',expected,`${x}, ${dy}`);
  }
});

test('rolling Torpedo cannot reacquire a target and its fuse pauses after leaving a ledge',async()=>{
  const w=await world(),b=w.fire();w.target.pos.set(30,0,60);
  b.pos.set(39.8,.01,30);b.prev.copy(b.pos);b.vel.set(0,-1,0);w.step();
  assert.equal(b.grounded,true);assert.equal(b.torpedoSearchDisabled,true);
  const initial=b.fuse;b.vel.set(120,0,0);w.step();
  near(initial-b.fuse,STEP);const remaining=b.fuse;
  w.target.pos.copy(b.pos);w.step();
  assert.equal(b.grounded,false);assert.equal(b.chasedTarget,undefined);
  for(let i=0;i<5;i++)w.step();near(b.fuse,remaining);
  w.f.G.projectiles.clear();assert.equal(b.dead,true);
});
