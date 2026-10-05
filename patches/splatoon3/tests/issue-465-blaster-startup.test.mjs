import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture as sourceFixture } from './source-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';
import {
  blasterStartupWindup,
  S3_BLASTER_HUMANOID_STARTUP_S,
  S3_BLASTER_SWIM_STARTUP_S,
} from '../runtime/issue-465-blaster-startup.mjs';

import { adaptSource } from '../adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';
const fixture = () => sourceFixture({
  adaptNative: (rel, code) => adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code)))),
  adaptRuntime: adaptQualitySource,
});

// Issue #465: Splatoon 3 Ver. 11.3.0 Blaster form-specific first-shot startup.
//   humanoid -> first shot 14f | swim form -> first shot 24f | repeat 50f.
// Startup (this issue) and the 22f post-shot swim/sub lock (#214) are separate
// timers; PLAYER.emergeDelay (generic swim gate, #311) is left untouched.

const FRAME = 1 / 60;
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const shootEvents = a => a.character.events.filter(e => e[0] === 'shoot').length;
const blasterShots = f => f.shots.filter(s => s.kind === 'blaster').length;

async function humanoidRelease(limit = 90) {
  const f = await fixture();
  const a = f.make('blaster');
  a.ink = 100; a.form = 'kid'; a.kidT = 99;
  for (let t = 0; t < limit; t++) {
    a.intent.fire = true;
    f.tick(a, 1);
    if (blasterShots(f) >= 1) return { tick: t, f, a };
  }
  return { tick: -1, f, a };
}

async function swimRelease(limit = 120) {
  const f = await fixture();
  const a = f.make('blaster');
  a.ink = 100; a.form = 'squid'; a.submerged = true;
  a.intent.squid = true; a._squidPressT = 0;
  for (let t = 0; t < limit; t++) {
    if (t === 0) { a.intent.fire = true; a._firePressT = 0; }
    f.tick(a, 1);
    if (blasterShots(f) >= 1) return { tick: t, f, a };
  }
  return { tick: -1, f, a };
}

test('issue-465 helper: form-specific wind-up (14f/24f), repeat falls back to preDelay', () => {
  const swimWindup = blasterStartupWindup({ kidT: 5 / 60, weaponRunner: { s3BlasterFromSwim: true } }, true, FRAME, 0.07, 10 / 60);
  assert.ok(Math.abs(swimWindup - (S3_BLASTER_SWIM_STARTUP_S - 5 / 60)) < 1e-9);
  assert.ok(Math.abs(swimWindup - 19 / 60) < 1e-9, 'swim waits 24f minus the 5f already elapsed');
  const kidWindup = blasterStartupWindup({ kidT: 99 }, true, FRAME, 0.07, 10 / 60);
  assert.ok(Math.abs(kidWindup - S3_BLASTER_HUMANOID_STARTUP_S) < 1e-9);
  assert.ok(Math.abs(kidWindup - 14 / 60) < 1e-9);
  const repeat = blasterStartupWindup({ kidT: 99 }, false, FRAME, 0.07, 10 / 60);
  assert.ok(Math.abs(repeat - 10 / 60) < 1e-9);
  assert.ok(blasterStartupWindup({ kidT: 0.09 }, false, FRAME, 0.07, 10 / 60) > 0);
});

test('issue-465 helper is wired into the blaster runtime exactly once (exact anchor)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'patches/splatoon3/runtime/weapons.mjs'), 'utf8');
  assert.equal(src.split('import { blasterStartupWindup }').length - 1, 1, 'single import');
  assert.equal(src.split('blasterStartupWindup(').length - 1, 1, 'single call site');
  assert.ok(src.includes('PLAYER.emergeDelay'), 'reads the untouched generic swim gate');
});

test('humanoid Blaster fresh ZR edge releases on the 14f boundary, not before', async () => {
  const { tick, f, a } = await humanoidRelease();
  assert.equal(tick, 14, 'humanoid first-shot startup is 14 fixed steps');
  assert.equal(blasterShots(f), 1, 'exactly one projectile');
  assert.equal(shootEvents(a), 1, 'exactly one recoil/shoot event (no double trigger)');
  assert.ok(tick >= 14, 'no release before 14f');
});

test('swim-form Blaster fresh ZR edge releases on the 24f boundary, not before', async () => {
  const { tick, f, a } = await swimRelease();
  assert.equal(tick, 24, 'swim first-shot startup is 24 fixed steps from the ZR edge');
  assert.equal(blasterShots(f), 1, 'exactly one projectile');
  assert.equal(shootEvents(a), 1, 'exactly one recoil/shoot event');
});

test('hold-fire repeat interval stays 50f after the first shot', async () => {
  const f = await fixture();
  const a = f.make('blaster');
  a.ink = 100; a.form = 'kid'; a.kidT = 99;
  const ticks = [];
  for (let t = 0; t < 220; t++) {
    a.intent.fire = true;
    f.tick(a, 1);
    if (blasterShots(f) > ticks.length) ticks.push(t);
    if (ticks.length >= 4) break;
  }
  assert.ok(ticks.length >= 3, `expected >=3 shots, got ${ticks.length}`);
  assert.equal(ticks[0], 14, 'first shot at 14f');
  assert.equal(ticks[1] - ticks[0], 50, 'first -> second interval is 50f');
  assert.equal(ticks[2] - ticks[1], 50, 'sustained repeat interval is 50f');
});

test('empty-ink attempts never start a startup/recoil release', async () => {
  const f = await fixture();
  const a = f.make('blaster');
  a.ink = 0; a.form = 'kid'; a.kidT = 99;
  a.intent.fire = true;
  f.tick(a, 40);
  assert.equal(blasterShots(f), 0, 'no projectile without ink');
  assert.equal(shootEvents(a), 0, 'no recoil without ink');
  assert.equal(a.weaponRunner.s3BlasterWindup, 0, 'no startup timer was ever armed');
});

test('releasing ZR before a valid startup arms nothing and synthesises no projectile', async () => {
  const f = await fixture();
  const a = f.make('blaster');
  a.ink = 100; a.form = 'kid'; a.kidT = 99;
  // Fire one committed shot so the weapon sits on its post-shot cooldown.
  a.intent.fire = true;
  f.tick(a, 15); // edge on update #1, release 14 fixed steps later (update #15)
  assert.equal(blasterShots(f), 1, 'first committed shot fired at 14f');
  // Release, then press + release again while still on cooldown: no startup can
  // arm (cooldown > 0), so releasing synthesises no new projectile or recoil.
  a.intent.fire = false;
  f.tick(a, 2);
  const baselineShots = blasterShots(f), baselineRecoil = shootEvents(a);
  a.intent.fire = true;
  f.tick(a, 1);   // press while the weapon is still cooling down
  a.intent.fire = false;
  f.tick(a, 60);  // release and stay released well past the cooldown window
  assert.equal(blasterShots(f), baselineShots, 'release on cooldown synthesises no projectile');
  assert.equal(shootEvents(a), baselineRecoil, 'release on cooldown synthesises no recoil');
  assert.equal(a.weaponRunner.s3BlasterWindup, 0, 'no startup was armed by the released press');
});

test('30/60/120 Hz rendering over the fixed 60 Hz clock yields the same release tick', async () => {
  const releaseAt = async hz => {
    const f = await fixture();
    const a = f.make('blaster');
    a.ink = 100; a.form = 'kid'; a.kidT = 99;
    const clock = new FixedClock();
    let step = 0, edge = -1, released = -1;
    for (let i = 0; i < 60 && released < 0; i++) {
      clock.advance(1 / hz, dt => {
        step++;
        if (edge < 0) { a.intent.fire = true; edge = step; } // fresh ZR edge on the first fixed step
        f.G.time += dt;
        a.update(dt);
        if (released < 0 && blasterShots(f) >= 1) released = step;
      });
    }
    return released - edge; // fixed gameplay steps from the edge to the release
  };
  assert.equal(await releaseAt(30), 14, 'release offset at 30 Hz render');
  assert.equal(await releaseAt(60), 14, 'release offset at 60 Hz render');
  assert.equal(await releaseAt(120), 14, 'release offset at 120 Hz render');
});

test('Blaster-only correction: shooter startup is unchanged (still immediate)', async () => {
  const f = await fixture();
  const a = f.make('shooter');
  a.ink = 100; a.form = 'kid'; a.kidT = 99;
  a.intent.fire = true;
  f.tick(a, 3);
  const shooterShots = f.shots.filter(s => s.kind === 'shooter').length;
  assert.ok(shooterShots >= 1, 'shooter fires without the Blaster 14f raise');
  assert.ok(!f.shots.some(s => s.kind === 'blaster'), 'no blaster projectile from a shooter');
  assert.equal(a.weaponRunner.s3BlasterWindup, 0, 'blaster wind-up never armed for shooter');
});

test('startup and post-shot recovery remain independent timers; emergeDelay untouched', async () => {
  const f = await fixture();
  const a = f.make('blaster');
  a.ink = 100; a.form = 'kid'; a.kidT = 99;
  a.intent.fire = true;
  f.tick(a, 1);
  assert.ok(a.weaponRunner.s3BlasterWindup > 0, 'startup uses s3BlasterWindup');
  assert.equal(f.PLAYER.emergeDelay, 0.07, 'PLAYER.emergeDelay is unchanged');
  f.tick(a, 20);
  assert.equal(blasterShots(f), 1);
  assert.ok(a.weaponRunner.s3BlasterWindup === 0, 'startup timer is done');
  assert.ok(a.weaponRunner.cooldown > 0, 'post-shot cooldown runs independently');
});

test('recently emerged humanoid press uses actual kid origin, not small kidT heuristic', async () => {
  const f = await fixture(), a = f.make('blaster');
  a.form = 'kid'; a.kidT = f.PLAYER.emergeDelay; a.intent.fire = true;
  f.tick(a); assert.equal(a.weaponRunner.s3BlasterWindup, 14 / 60);
  f.tick(a, 13); assert.equal(blasterShots(f), 0);
  f.tick(a); assert.equal(blasterShots(f), 1);
});