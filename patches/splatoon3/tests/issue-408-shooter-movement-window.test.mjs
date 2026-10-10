// #408: Splattershot human movement is owned by the emitted-shot 4F window, not the
// 0.35s visual pose timer. Fixed 60 Hz steps; each sample is the movement read that
// Actor._horizontal makes before WeaponRunner.update, in the same order as the actor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';
const DT = 1 / 60;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} ${a} != ${b}`);

async function shooter() {
  const f = await fixture(), a = f.make('shooter');
  a.ink = 100; a.grounded = true;
  const projectiles = new f.Projectiles(new f.THREE.Scene());
  f.G.projectiles = projectiles;
  const r = a.weaponRunner;
  const tick = (fire, pressed = false) => {
    const speed = r.moveSpeed(), before = projectiles.list.length;
    r.update(DT, { fire, firePressed: pressed });
    return { speed, shot: projectiles.list.length > before };
  };
  return { f, a, r, tick, projectiles };
}

// Holds Fire until the first shot is admitted and returns the samples plus the shot tick.
function holdUntilShots(t, count) {
  const samples = [];
  let shots = 0;
  for (let i = 0; shots < count && i < 400; i++) {
    const s = t(true, i === 0);
    samples.push(s);
    if (s.shot) shots++;
  }
  assert.equal(shots, count, 'shots admitted while Fire is held');
  return samples;
}

// Sustained held Fire (the 6F-gap walking model between rounds) is pinned by #731
// in issue-731-sub-ready-enemy-ink.test.mjs and is not changed here: no source
// measures human speed during continuous Splattershot fire, so it remains 未確認.

test('#408 one tap: release keeps the 4F post-shot window, then returns to run speed', async () => {
  const { f, a, tick } = await shooter();
  const samples = holdUntilShots(tick, 1);
  // Fire is released on the tick after the admitted shot.
  const released = [];
  for (let i = 0; i < 6; i++) released.push(tick(false));
  for (let i = 0; i < 4; i++) near(released[i].speed, a.weapon.moveSpeedFiring, `post-shot sample ${i + 1}`);
  for (let i = 4; i < 6; i++) near(released[i].speed, f.PLAYER.runSpeed, `after window sample ${i + 1}`);
  assert.equal(samples.at(-1).shot, true);
});

test('#408 burst: release after three held shots gives the same 4F window, not 21F', async () => {
  const { f, a, tick } = await shooter();
  holdUntilShots(tick, 3);
  const released = [];
  for (let i = 0; i < 8; i++) released.push(tick(false));
  const firingSamples = released.findIndex(s => Math.abs(s.speed - f.PLAYER.runSpeed) < 1e-9);
  assert.equal(firingSamples, 4, 'exactly four firing-cap samples after release');
  for (let i = 0; i < 4; i++) near(released[i].speed, a.weapon.moveSpeedFiring, `burst post-shot ${i + 1}`);
  for (let i = 4; i < 8; i++) near(released[i].speed, f.PLAYER.runSpeed, `burst after window ${i + 1}`);
});

test('#408 visual pose timer alone does not select the firing movement cap', async () => {
  const { f, a, r, tick } = await shooter();
  r.firingT = 0.35;
  for (let i = 0; i < 25; i++) near(r.moveSpeed(), f.PLAYER.runSpeed, `pose-only tick ${i}`);
  // Empty ink: Fire held but no admitted shot, so no movement window is armed.
  a.ink = 0;
  for (let i = 0; i < 25; i++) {
    const s = tick(true, i === 0);
    assert.equal(s.shot, false);
    near(s.speed, f.PLAYER.runSpeed, `no-shot tick ${i}`);
  }
});

test('#408 gear Run Speed Up follows the firing branch during the held and 4F windows only', async () => {
  const { f, a, tick } = await shooter();
  a.s3.modifiers.runSpeedFiring = 1.25;
  a.s3.modifiers.runSpeed = 1.1;
  holdUntilShots(tick, 2);
  const released = [];
  for (let i = 0; i < 6; i++) released.push(tick(false));
  for (let i = 0; i < 4; i++) near(released[i].speed, a.weapon.moveSpeedFiring * 1.25, `gear post-shot ${i + 1}`);
  for (let i = 4; i < 6; i++) near(released[i].speed, f.PLAYER.runSpeed * 1.1, `gear after window ${i + 1}`);
});
