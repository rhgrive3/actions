import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture, ROOT} from '../../../scripts/weapons-fixture.mjs';
import {STEP} from '../runtime/clock.mjs';

async function setup() {
  const f=await fixture({site:`${ROOT}.superjump-sub-handoff`,fidelity:true});
  const a=f.make('shooter');f.G.actors=[a];
  a.s3.jumpChargeTime=STEP;a.s3.jumpStartupHumanoidF=0;a.s3.jumpFlightTime=2;
  assert.equal(a.superJump(new f.THREE.Vector3(10,0,0)),true);
  const tick=()=>{
    f.G.time+=STEP;
    a.update(STEP);
  };
  for(let i=0;i<200&&a.superJumpState?.phase!=='flight';i++)tick();
  assert.equal(a.superJumpState?.phase,'flight');
  return {...f,a,tick};
}

test('late descending sub hold stages trajectory without spawning a bomb or consuming ink',async()=>{
  const h=await setup();
  const {a,tick}=h;
  a.intent.sub=true;
  tick();
  assert.equal(a.weaponRunner.aimingSub,false,'early-flight sub is not admitted');
  for(let i=0;i<180&&a.superJumpState?.phase==='flight'&&a.superJumpState.t/a.superJumpState.dur<=.85;i++)tick();
  assert.equal(a.superJumpState?.phase,'flight');
  const ink=a.ink,bombs=h.projectiles.bombs.length;
  tick();
  assert.equal(a.weaponRunner.aimingSub,true,'late-flight sub trajectory should be live');
  assert.equal(a.ink,ink);
  assert.equal(h.projectiles.bombs.length,bombs);
  a.intent.sub=false;
  tick();
  assert.equal(a.weaponRunner.aimingSub,false);
  assert.equal(h.projectiles.bombs.length,bombs);
});

test('sub hold persists up to landing without a pre-landing throw',async()=>{
  const h=await setup(),{a,tick}=h;
  for(let i=0;i<180&&a.superJumpState?.phase==='flight'&&a.superJumpState.t/a.superJumpState.dur<=.86;i++)tick();
  a.intent.sub=true;
  const bombs=h.projectiles.bombs.length,ink=a.ink;
  for(let i=0;i<6&&a.superJumpState?.phase==='flight';i++)tick();
  assert.equal(a.weaponRunner.aimingSub,true);
  assert.equal(h.projectiles.bombs.length,bombs);
  assert.equal(a.ink,ink);
});
