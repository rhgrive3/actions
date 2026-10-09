// Issue #297 — Bucket Slosher projectile spawn inherits the pinned S3
// spl__SpawnBulletAdditionMovePlayerParam axes: player-forward ZRate=2 and
// falling-only YMinusRate=1. No XRate or YPlusRate is present in the weapon
// override, so strafe and upward motion are intentionally not inferred.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';
import { applySlosherSpawnVelocity } from '../runtime/weapons-fidelity.mjs';

const close=(a,b,e=1e-9)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);

async function setup(){
  const f=await fixture(),a=f.make('slosher');
  f.G.camera={position:new f.THREE.Vector3(0,20,0)};
  f.G.actors=[a];f.G.match.canRespawn=()=>false;
  const ps=new f.Projectiles(new f.THREE.Scene());f.G.projectiles=ps;
  a.aimDir.set(0,0,1);a.aimPoint.set(0,1.05,100);a.yaw=0;
  f.setRandom(()=>0.5);
  return {f,a,ps};
}
function fire(a,ps,vel){
  a.vel.set(...vel);ps.clear();ps.fireSlosh(a,a.weapon);
  assert.ok(ps.list.length>=1,'Slosher emits at least one glob');
  return ps.list.map(p=>({p,v:p.vel.clone()}));
}
function source(f){
  return f.profile.weaponsFidelityCompletion.weapons.slosher.spl__SpawnBulletAdditionMovePlayerParam;
}

test('#297 pinned Slosher player-motion source exposes only ZRate=2, YMinusRate=1 and GuideYMinusZero',async()=>{
  const f=await fixture(),s=source(f);
  assert.equal(s.$type,'spl__SpawnBulletAdditionMovePlayerParam');
  assert.equal(s.ZRate,2);assert.equal(s.YMinusRate,1);assert.equal(s.GuideYMinusZero,true);
  assert.equal(Object.hasOwn(s,'XRate'),false);
  assert.equal(Object.hasOwn(s,'YPlusRate'),false);
});

test('#297 live volley inherits signed yaw-local forward velocity on every Slosher glob',async()=>{
  const {a,ps}=await setup(),speed=2.5;
  const still=fire(a,ps,[0,0,0]);
  const fwd=fire(a,ps,[0,0,speed]);
  const back=fire(a,ps,[0,0,-speed]);
  assert.equal(fwd.length,still.length);assert.equal(back.length,still.length);
  for(let i=0;i<still.length;i++){
    close(fwd[i].v.x,still[i].v.x);close(fwd[i].v.y,still[i].v.y);close(fwd[i].v.z,still[i].v.z+5);
    close(back[i].v.x,still[i].v.x);close(back[i].v.y,still[i].v.y);close(back[i].v.z,still[i].v.z-5);
  }
});

test('#297 forward inheritance follows body yaw while pure strafe does not inject an unsupported X term',async()=>{
  const {a,ps}=await setup(),speed=2;
  const still=fire(a,ps,[0,0,0]);
  const strafe=fire(a,ps,[speed,0,0]);
  for(let i=0;i<still.length;i++) assert.deepEqual(strafe[i].v.toArray(),still[i].v.toArray());
  a.yaw=Math.PI/2;
  const yawStill=fire(a,ps,[0,0,0]);
  const yawFwd=fire(a,ps,[speed,0,0]);
  for(let i=0;i<yawStill.length;i++){
    close(yawFwd[i].v.x,yawStill[i].v.x+4);close(yawFwd[i].v.y,yawStill[i].v.y);close(yawFwd[i].v.z,yawStill[i].v.z);
  }
});

test('#297 falling motion inherits YMinusRate while upward motion remains unchanged',async()=>{
  const {a,ps}=await setup(),speed=3;
  const still=fire(a,ps,[0,0,0]);
  const rise=fire(a,ps,[0,speed,0]);
  const fall=fire(a,ps,[0,-speed,0]);
  for(let i=0;i<still.length;i++){
    assert.deepEqual(rise[i].v.toArray(),still[i].v.toArray());
    close(fall[i].v.x,still[i].v.x);close(fall[i].v.y,still[i].v.y-speed);close(fall[i].v.z,still[i].v.z);
  }
});

test('#297 spawn inheritance is once-only, excludes ghosts/remotes, and is serialized after application',async()=>{
  const {f,a,ps}=await setup();
  const packets=[];f.G.netm={recProj(p){packets.push(p.vel.clone());}};
  const rows=fire(a,ps,[0,0,2]);
  assert.equal(packets.length,rows.length);
  for(let i=0;i<rows.length;i++){
    assert.equal(rows[i].p.s3SlosherMotionApplied,true);
    assert.deepEqual(packets[i].toArray(),rows[i].v.toArray());
    applySlosherSpawnVelocity(rows[i].p);assert.deepEqual(rows[i].p.vel.toArray(),rows[i].v.toArray());
  }
  delete f.G.netm;
  a.remote=true;const remote=fire(a,ps,[0,0,2]);
  for(const r of remote) assert.equal(r.p.s3SlosherMotionApplied,false);
  a.remote=false;
  const g=fire(a,ps,[0,0,0])[0].p,g0=g.vel.clone();g.ghost=true;g.s3SlosherMotionApplied=false;
  applySlosherSpawnVelocity(g);assert.deepEqual(g.vel.toArray(),g0.toArray());
});

test('#297 HUD guide keeps forward inheritance but GuideYMinusZero suppresses falling-player Y term on every sample',async()=>{
  const {a,ps}=await setup();
  const w=a.weapon;
  a.vel.set(0,-3,2);
  const first=ps.s3SlosherGuide(a,w)?.clone(),second=ps.s3SlosherGuide(a,w)?.clone();
  assert.ok(first&&second,'Slosher guide is available');
  assert.deepEqual(second.toArray(),first.toArray(),'scratch guide is reset and deterministic on repeated samples');
  a.vel.set(0,0,2);const noFall=ps.s3SlosherGuide(a,w)?.clone();
  assert.deepEqual(noFall.toArray(),first.toArray(),'GuideYMinusZero removes live falling-player Y inheritance from HUD guide');
  a.vel.set(0,0,0);const still=ps.s3SlosherGuide(a,w)?.clone();
  assert.notDeepEqual(still.toArray(),noFall.toArray(),'guide still consumes the sourced forward ZRate');
});
