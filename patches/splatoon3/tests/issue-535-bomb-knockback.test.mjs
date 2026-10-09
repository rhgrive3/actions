// Issue #535 — Splat Bomb blast knockback is separate from 180/30 damage.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { SUB_SPECIAL_FIDELITY, SPLAT_BOMB_KNOCKBACK_MODEL, splatBombKnockbackDelta,
  applySplatBombKnockback } from '../runtime/sub-special-fidelity.mjs';

const close=(a,b,e=1e-9)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);

test('#535 active profile/runtime retain the S3 Accel=700 Bias=.8 Distance=12 tuple',async()=>{
  const f=await fixture();
  assert.deepEqual(f.profile.bomb.knockback,{accel:700,bias:0.8,distance:12});
  assert.deepEqual(SUB_SPECIAL_FIDELITY.bomb.knockback,{accel:700,bias:0.8,distance:12});
  assert.deepEqual(SPLAT_BOMB_KNOCKBACK_MODEL,{referenceHz:60,duPerWorldUnit:10});
});

test('#535 calibrated response is deterministic, attenuates independently of damage radius, and ends at 12',()=>{
  const near=splatBombKnockbackDelta(2),outerDamage=splatBombKnockbackDelta(6.5),knockOnly=splatBombKnockbackDelta(9);
  assert.ok(near>outerDamage && outerDamage>knockOnly && knockOnly>0);
  assert.equal(splatBombKnockbackDelta(12),0);
  assert.equal(splatBombKnockbackDelta(13),0);
  close(splatBombKnockbackDelta(0),700/10/60);
});

test('#535 direct helper applies one recipient-authoritative radial impulse and rejects remote/stale recipients',async()=>{
  const f=await fixture(),V=f.THREE.Vector3;
  const center=new V(0,0,0),target=new V(0,.7,5),distance=target.length();
  const local={alive:true,remote:false,vel:new V(1,0,2),_netLifeStartedAt:1000};
  const bomb={ghost:true,_netBornLocal:999.5,age:1};
  const before=local.vel.clone();
  assert.equal(applySplatBombKnockback(bomb,local,center,target,distance),true);
  assert.ok(local.vel.distanceTo(before)>0);
  const once=local.vel.clone();
  const remote={...local,remote:true,vel:new V(1,0,2)};
  assert.equal(applySplatBombKnockback(bomb,remote,center,target,distance),false);
  assert.deepEqual(Array.from(remote.vel.toArray()),[1,0,2]);
  const stale={alive:true,remote:false,vel:new V(1,0,2),_netLifeStartedAt:1001};
  assert.equal(applySplatBombKnockback({_netBornLocal:999.5,age:1,ghost:true},stale,center,target,distance),false);
  assert.deepEqual(Array.from(stale.vel.toArray()),[1,0,2]);
  assert.ok(once.distanceTo(before)>0);
});

async function world(){
  const f=await fixture();f.installSubSpecialFidelity(f,f.profile);
  const {G,THREE}=f;
  G.netm=null;G.local=null;G.boss=null;G.actors=[];G.time=0;
  G.teamColors=[new THREE.Color('#f60'),new THREE.Color('#36f')];
  G.camera={position:new THREE.Vector3(100,100,100)};
  G.audio={play(){}};G.fx={explosion(){}};G.paint={sample:()=>1,splat:()=>0};
  let los=true;G.physics={los:()=>los,raycast:(_a,_b,_c,h)=>{h.hit=false;return h;},segment:(_a,_b,h)=>{h.hit=false;return h;}};
  const ps=new f.Projectiles(new THREE.Scene());G.projectiles=ps;
  const owner=f.make();owner.team=0;owner.addTurf=()=>{};owner.remote=false;
  const victim=f.make();victim.team=1;victim.remote=false;victim.alive=true;victim.hp=100;victim.invuln=0;victim.vel.set(1,0,2);
  victim.damage=function(amount){this.hp-=amount;return false;};
  G.actors=[owner,victim];
  const b={kind:'bomb',ghost:false,owner,team:0,pos:new THREE.Vector3(),spin:new THREE.Vector3(),age:1};
  return {f,G,ps,b,victim,setLos:v=>{los=v;}};
}

test('#535 composed explosion: d=5 keeps 30 damage but adds knockback; d=9 is knockback-only; d=13 is neither',async()=>{
  const w=await world();
  w.victim.pos.set(0,0,5);w.victim.hp=100;w.victim.vel.set(1,0,2);const v5=w.victim.vel.clone();
  w.ps._explodeBomb(w.b);assert.equal(w.victim.hp,70);assert.ok(w.victim.vel.distanceTo(v5)>0,'outer damage band has impulse');

  w.victim.pos.set(0,0,9);w.victim.hp=100;w.victim.vel.set(1,0,2);const v9=w.victim.vel.clone();
  w.ps._explodeBomb(w.b);assert.equal(w.victim.hp,100,'7..12 m annulus is independent of damage');assert.ok(w.victim.vel.distanceTo(v9)>0,'knockback remains inside 12');

  w.victim.pos.set(0,0,13);w.victim.hp=100;w.victim.vel.set(1,0,2);const v13=w.victim.vel.clone();
  w.ps._explodeBomb(w.b);assert.equal(w.victim.hp,100);assert.deepEqual(w.victim.vel.toArray(),v13.toArray());
});

test('#535 composed explosion preserves LOS and remote-authority guards for knockback',async()=>{
  const w=await world();w.victim.pos.set(0,0,5);w.victim.vel.set(1,0,2);
  w.setLos(false);const blocked=w.victim.vel.clone();w.ps._explodeBomb(w.b);assert.deepEqual(Array.from(w.victim.vel.toArray()),Array.from(blocked.toArray()));
  w.setLos(true);w.victim.hp=100;w.victim.remote=true;w.victim.vel.set(1,0,2);const remote=w.victim.vel.clone();
  w.ps._explodeBomb(w.b);assert.deepEqual(Array.from(w.victim.vel.toArray()),Array.from(remote.toArray()),'attacker-side remote representation does not apply the impulse');
});
