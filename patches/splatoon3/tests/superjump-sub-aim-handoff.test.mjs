import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture, ROOT} from '../../../scripts/weapons-fixture.mjs';
import {FixedClock, STEP} from '../runtime/clock.mjs';
import {canStageSuperJumpSub, SUPERJUMP_MAIN_PROGRESS} from '../runtime/weapon-gates.mjs';

async function setup(weapon = 'shooter') {
  const f=await fixture({site:`${ROOT}.superjump-sub-handoff`,fidelity:true});
  f.G.match.canRespawn = () => false;
  const a=f.make(weapon);f.G.actors=[a];
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

for (const weapon of ['shooter', 'blaster']) test(`${weapon} descent retains native sub-over-main priority without granting bomb or special authority`, async () => {
  const h = await setup(weapon), { a, tick } = h;
  a.intent.fire = a.intent.sub = a.intent.special = true;
  a.special = a.specialCost();
  const ink = a.ink;
  while (a.superJumpState.t / a.superJumpState.dur < .95) tick();
  assert.equal(a.weaponRunner.aimingSub, true, 'R owns the admitted trajectory hold');
  assert.equal(h.fires.length, 0, 'native sub priority withholds ZR shots');
  assert.equal(h.projectiles.bombs.length, 0); assert.equal(a.specialActive, null);
  assert.equal(a.ink, ink, 'flight hold has no action debit');
});

test('sub descent admission rejects early, malformed, dead and non-humanoid states', () => {
  const actor = { alive: true, form: 'kid', superJumpState: { phase: 'flight', t: .9, dur: 1 } };
  assert.equal(canStageSuperJumpSub(actor), true);
  for (const t of [0, SUPERJUMP_MAIN_PROGRESS, 1, NaN, Infinity]) {
    assert.equal(canStageSuperJumpSub({ ...actor, superJumpState: { phase: 'flight', t, dur: 1 } }), false);
  }
  for (const change of [{ alive: false }, { form: 'squid' }, { specialActive: {} },
    { superJumpState: null }, { superJumpState: { phase: 'charge', t: .9, dur: 1 } },
    { superJumpState: { phase: 'flight', t: .9, dur: 0 } }]) {
    assert.equal(canStageSuperJumpSub({ ...actor, ...change }), false);
  }
});

for (const hz of [30, 60, 120]) test(`landing release retains the independent 1F startup and one ink debit at ${hz}Hz`, async () => {
  const h = await setup(), { a, tick } = h, r = a.weaponRunner;
  const ink = a.ink, clock = new FixedClock();
  let fixed = 0, landed = null, emitted = null;
  for (let frame = 0; frame < hz * 3 && (landed === null || fixed < landed + 5); frame++) {
    clock.advance(1 / hz, () => {
      const s = a.superJumpState;
      const landing = s && s.t + STEP + 1e-10 >= s.dur;
      a.intent.sub = !!s && !landing;
      tick(); fixed++;
      if (s && !a.superJumpState) {
        landed = fixed;
        assert.equal(r.s3SubReady?.pending, true, 'landing release is admitted once');
        assert.equal(r.s3SubReady?.minimum, 5 / 60, 'descent is humanoid preparation');
        assert.equal(r.s3SubReady?.useStartup, STEP, 'landing does not bypass use startup');
      }
      if (h.projectiles.bombs.length && emitted === null) emitted = fixed;
      if (landed === null || fixed === landed) {
        assert.equal(h.projectiles.bombs.length, 0, 'neither flight nor landing admission throws');
        assert.equal(a.ink, ink, 'preparation never debits or refills ink');
      }
    });
  }
  assert.ok(landed !== null); assert.equal(emitted, landed + 1);
  assert.equal(h.projectiles.bombs.length, 1);
  assert.equal(a.ink, ink - h.SUB.bomb.inkCost);
  assert.equal(r.s3SubReady, null);
});

test('a short pre-landing hold still completes 5F preparation before its separate 1F startup', async () => {
  const h = await setup(), { a, tick } = h, r = a.weaponRunner;
  while (a.superJumpState.dur - a.superJumpState.t > 2 * STEP + 1e-10) tick();
  a.intent.sub = true; tick();
  assert.equal(r.s3SubReady.age, 0);
  a.intent.sub = false; tick();
  assert.equal(a.superJumpState, null);
  assert.equal(r.s3SubReady.pending, true);
  assert.equal(r.s3SubReady.useStartup, null, 'one hold frame cannot bypass preparation');
  const ink = a.ink;
  for (let age = 2; age <= 5; age++) {
    tick();
    assert.ok(Math.abs(r.s3SubReady.age - age * STEP) < 1e-10);
    assert.equal(h.projectiles.bombs.length, 0); assert.equal(a.ink, ink);
  }
  assert.equal(r.s3SubReady.useStartup, STEP);
  tick();
  assert.equal(h.projectiles.bombs.length, 1); assert.equal(r.s3SubReady, null);
});

test('a midair release cancels staging and cannot be replayed at landing', async () => {
  const h = await setup(), { a, tick } = h, r = a.weaponRunner;
  a.intent.sub = true;
  while (a.superJumpState.t / a.superJumpState.dur < .9) tick();
  assert.equal(r.aimingSub, true); assert.ok(r.s3SubReady.age >= 5 * STEP);
  const ink = a.ink;
  a.intent.sub = false; tick();
  assert.equal(r.aimingSub, false); assert.equal(r.s3SubReady, null);
  for (let i = 0; i < 30; i++) tick();
  assert.equal(a.superJumpState, null); assert.equal(h.projectiles.bombs.length, 0); assert.equal(a.ink, ink);
});

test('squid cancellation on the landing release cannot become a queued bomb', async () => {
  const h = await setup(), { a, tick } = h, r = a.weaponRunner;
  a.intent.sub = true;
  while (a.superJumpState.t + STEP + 1e-10 < a.superJumpState.dur) tick();
  assert.equal(r.aimingSub, true);
  const ink = a.ink;
  a.intent.sub = false; a.intent.squid = true; tick();
  assert.equal(a.superJumpState, null); assert.equal(r.aimingSub, false); assert.equal(r.s3SubReady, null);
  for (let i = 0; i < 8; i++) tick();
  assert.equal(h.projectiles.bombs.length, 0); assert.equal(a.ink, ink);
});

test('death, reset and explicit input cancellation retire staged descent state', async () => {
  for (const kind of ['death', 'reset', 'input']) {
    const h = await setup(), { a, tick } = h, r = a.weaponRunner;
    a.intent.sub = true;
    while (a.superJumpState.t / a.superJumpState.dur < .9) tick();
    assert.equal(r.aimingSub, true); assert.ok(r.s3SubReady);
    if (kind === 'death') { a.alive = false; tick(); }
    else if (kind === 'reset') r.reset();
    else r.cancelPendingInput();
    assert.equal(r.aimingSub, false, kind); assert.equal(r.s3SubReady, null, kind);
    assert.equal(h.projectiles.bombs.length, 0, kind);
  }
});
