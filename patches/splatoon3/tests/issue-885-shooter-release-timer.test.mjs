import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

// #885: releasing ZR must not clear the Splattershot 6F repeat timer.
// Native `WeaponRunner._auto` preserves a positive cooldown through release
// ticks (`if (this.cooldown < 0) this.cooldown = 0`), so tap fire can never
// over-rate held fire. Full production adapter composition.
const STEP = 1 / 60;

async function rig() {
  const f = await fixture({ productionComposition: true });
  const a = f.make('shooter');
  a.ink = 100;
  a.grounded = true;
  return { f, r: a.weaponRunner };
}

test('#885 ZR release preserves 6F Splattershot repeat timer (production composition)', async () => {
  const { f, r } = await rig();
  assert.equal(r.a.weapon.fireInterval, 0.1, 'S3 profile Splattershot interval is 0.1s (6F)');

  // Hold fire 60 ticks: 10 shots at exactly 6F spacing.
  let frames = [];
  let base = f.shots.length;
  for (let i = 0; i < 60; i++) {
    r.update(STEP, { fire: true });
    if (f.shots.length > base) { frames.push(i); base = f.shots.length; }
  }
  assert.equal(f.shots.length, 10, `held fire 60 ticks emits 10 shots, got ${f.shots.length}`);
  assert.ok(frames.slice(1).every((v, i) => v - frames[i] === 6), `held gaps all 6F, got ${frames}`);

  // Alternating tap every tick: cannot exceed held rate, gaps never below 6F.
  const t2 = await rig();
  let frames2 = [];
  let base2 = t2.f.shots.length;
  for (let i = 0; i < 60; i++) {
    t2.r.update(STEP, { fire: i % 2 === 0 });
    if (t2.f.shots.length > base2) { frames2.push(i); base2 = t2.f.shots.length; }
  }
  assert.ok(t2.f.shots.length <= 10, `alternating tap (${t2.f.shots.length}) cannot exceed held rate (10)`);
  assert.ok(frames2.slice(1).every((v, i) => v - frames2[i] >= 6), `tap gaps all >= 6F, got ${frames2}`);

  // Exact repro: after a shot is admitted, a 1-tick release keeps a positive
  // remainder, so the re-press tick cannot emit (no 2F spacing).
  // Hold first until shot A is admitted: per-pull first-shot startup (#270)
  // gates the very first round, the repeat timer applies after that.
  const t3 = await rig();
  let admitted = -1;
  for (let i = 0; i < 12 && admitted < 0; i++) {
    t3.r.update(STEP, { fire: true });
    if (t3.f.shots.length === 1) admitted = i;
  }
  assert.ok(admitted >= 0, 'shot A admitted while holding');
  assert.ok(t3.r.cooldown > 0, `positive remainder preserved, got ${t3.r.cooldown}`);
  t3.r.update(STEP, { fire: false });
  assert.ok(t3.r.cooldown > 0, `release preserves positive remainder, got ${t3.r.cooldown}`);
  t3.r.update(STEP, { fire: true });
  assert.equal(t3.f.shots.length, 1, 're-press tick after 1-tick release must not emit shot B');

  // Long release drains the timer, so a later pull re-admits normally.
  let readmitted = -1;
  for (let i = 0; i < 30; i++) t3.r.update(STEP, { fire: false });
  for (let i = 0; i < 12 && readmitted < 0; i++) {
    t3.r.update(STEP, { fire: true });
    if (t3.f.shots.length === 2) readmitted = i;
  }
  assert.ok(readmitted >= 0, 're-press after full interval re-admits a shot');
});
