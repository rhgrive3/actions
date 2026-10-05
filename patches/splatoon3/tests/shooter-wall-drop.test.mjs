// #385 Splattershot wall impacts must persist into the pinned S3 post-impact
// wall-drop state (WallDropMoveParam / WallDropCollisionPaintParam) instead of
// ending all paint on the collision frame. Behavior runs the real build adapter
// over the real public modules with production collision/paint (no renderer).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptSource } from '../adapter.mjs';
import { fixture } from './shooter-wall-drop-fixture.mjs';

const root = new URL('../../../', import.meta.url);
const weaponsSource = fs.readFileSync(new URL('inkwave-public/src/game/weapons.js', root), 'utf8');
const profile = JSON.parse(fs.readFileSync(new URL('patches/splatoon3/profile.json', root), 'utf8'));
const near = (a, b, label) => assert.ok(Math.abs(a - b) < 1e-9, `${label}: ${a} != ${b}`);
const radiusCount = (f, r) => f.paints.filter(x => Math.abs(x.radius - r) < 1e-9).length;

async function fireShot(f, aim) {
  const a = f.make();
  a.aimPoint.set(aim[0], aim[1], aim[2]);
  f.G.actors = [a];
  for (let i = 0; i < 240 && f.projectiles.list.length === 0; i++) f.tick(a, { fire: true });
  assert.equal(f.projectiles.list.length, 1, 'exactly one shot in flight');
  return f.projectiles.list[0];
}

function runWallDrop(f, p, limit = 400) {
  let state = null, aliveAtBegin = null, frames = 0;
  for (; frames < limit && f.projectiles.list.includes(p); frames++) {
    f.G.time += 1 / 60;
    f.projectiles.update(1 / 60);
    if (!state && p.shooterWallDrop) { state = p.shooterWallDrop; aliveAtBegin = f.projectiles.list.includes(p); }
  }
  if (!state && p.shooterWallDrop) { state = p.shooterWallDrop; aliveAtBegin = true; }
  return { state, aliveAtBegin, frames };
}

test('#385 installed adapter wires the shooter wall-drop into weapons.js', () => {
  const out = adaptSource('src/game/weapons.js', weaponsSource);
  assert.match(out, /beginShooterWallDrop\(this, p, hit\)/);
  assert.match(out, /advanceShooterWallDrop\(this, p, dt\)/);
  assert.match(out, /shooterWallDropDone === false/);
  assert.match(out, /shooterWallDropDone === true/);
  assert.match(out, /advanceFidelityProjectile, advanceShooterWallDrop, beginShooterWallDrop, configureFidelityFlick/);
  // The generic impact path remains for non-qualifying contacts.
  assert.match(out, /beginShooterWallDrop\(this, p, hit\)\) return false;\n          this\._impact\(p, hit\);/);
});

test('#385 profile retains the pinned S3 11.3.0 Splattershot wall-drop record', () => {
  const w = profile.weaponsFidelityCompletion.weapons.shooter;
  const m = w.WallDropMoveParam, p = w.WallDropCollisionPaintParam;
  assert.equal(profile.referenceVersion, '11.3.0');
  assert.equal(m.FallPeriodFirstFrameMin, 20);
  assert.equal(m.FallPeriodFirstFrameMax, 40);
  assert.equal(m.FallPeriodSecondFrame, 10);
  assert.equal(m.FallPeriodLastFrameMin, 15);
  assert.equal(m.FallPeriodLastFrameMax, 35);
  near(m.FallPeriodFirstTargetSpeed, .06, 'first target speed');
  near(m.FallPeriodSecondTargetSpeed, .06, 'second target speed');
  near(p.PaintRadiusShock, 1.56, 'shock radius');
  near(p.PaintRadiusFall, .65, 'fall radius');
  near(p.PaintRadiusGround, .6, 'ground radius');
});

test('#385 elevated wall hit persists into wall-drop and paints shock/fall/ground', async () => {
  const f = await fixture();
  f.wall(4, { height: 8 });
  const p = await fireShot(f, [0, 1.05, 20]);
  const { state, aliveAtBegin, frames } = runWallDrop(f, p);
  assert.ok(state, 'retained wall-drop state instead of dying on the impact frame');
  assert.equal(aliveAtBegin, true, 'state begins while the projectile is still listed');
  assert.ok(state.firstFrames >= 20 && state.firstFrames <= 40, 'first period 20-40f');
  assert.equal(state.secondFrames, 10, 'second period 10f');
  assert.ok(state.lastFrames >= 15 && state.lastFrames <= 35, 'last period 15-35f');
  assert.ok(state.totalFrames >= 45 && state.totalFrames <= 85, 'total phase length');
  near(state.firstSpeed, .06, 'first target speed');
  near(state.secondSpeed, .06, 'second target speed');
  near(state.shockRadius, 1.56, 'shock radius');
  near(state.fallRadius, .65, 'fall radius');
  near(state.groundRadius, .6, 'ground radius');
  assert.equal(state.done, true, 'wall-drop finishes');
  assert.ok(frames < 300, 'terminates within the source phases');
  assert.ok(!f.projectiles.list.includes(p), 'wall-drop removes the projectile');
  assert.ok(p.pos.y > -0.05, 'never tunnels below the floor');
  assert.equal(radiusCount(f, 1.56), 1, 'shock paint exactly once at impact');
  const shock = f.paints.find(x => Math.abs(x.radius - 1.56) < 1e-9);
  assert.ok(Math.abs(shock.center[2] - 3.925) < 0.05, 'shock paint on the wall plane');
  assert.ok(radiusCount(f, .65) >= 1, 'fall paint while descending');
  assert.ok(radiusCount(f, .6) >= 1, 'ground paint at the base');
  const ground = f.paints.find(x => Math.abs(x.radius - .6) < 1e-9);
  assert.ok(ground.center[1] < 0.2, 'ground paint near the floor');
  assert.equal(f.impacts.filter(x => Math.abs((x.radius ?? -1) - 1.56) < 1e-9).length, 1, 'one wall-drop impact event');
});

test('#385 high wall impact keeps falling through the sourced phases and terminates', async () => {
  const f = await fixture();
  f.wall(4, { height: 8 });
  const p = await fireShot(f, [0, 8, 8]);
  const { state, aliveAtBegin } = runWallDrop(f, p, 600);
  assert.ok(state, 'retained wall-drop state');
  assert.equal(aliveAtBegin, true, 'projectile retained on the begin frame');
  assert.equal(state.done, true, 'wall-drop finishes');
  assert.ok(!f.projectiles.list.includes(p), 'wall-drop removes the projectile');
  assert.ok(p.pos.y > -0.05, 'never tunnels below the floor');
  assert.ok(radiusCount(f, 1.56) >= 1, 'shock paint at impact');
  assert.ok(radiusCount(f, .65) >= 1, 'downward wall paint after the initial hit');
});

test('#385 floor contact stays on the terminal one-frame impact path', async () => {
  const f = await fixture();
  const p = await fireShot(f, [0, 0.05, 6]);
  for (let i = 0; i < 240 && f.projectiles.list.includes(p); i++) {
    f.G.time += 1 / 60;
    f.projectiles.update(1 / 60);
  }
  assert.ok(!f.projectiles.list.includes(p), 'floor contact is still terminal');
  assert.ok(!p.shooterWallDrop, 'floor contact never enters wall-drop');
  assert.ok(f.paints.length >= 1, 'initial impact footprint preserved');
  for (const r of [1.56, .65, .6]) assert.equal(radiusCount(f, r), 0, 'no wall-drop radius on a floor hit');
});

test('#385 ghosts advance the same wall-drop chronology without authoritative paint', async () => {
  const f = await fixture();
  f.wall(4, { height: 8 });
  const p = await fireShot(f, [0, 1.05, 20]);
  p.ghost = true;
  const { state, aliveAtBegin } = runWallDrop(f, p);
  assert.ok(state, 'ghost reaches the retained wall-drop');
  assert.equal(aliveAtBegin, true, 'ghost projectile retained on the begin frame');
  assert.equal(state.done, true, 'ghost wall-drop finishes');
  assert.ok(!f.projectiles.list.includes(p), 'ghost wall-drop removes the projectile');
  assert.equal(f.impacts.length, 0, 'ghost never emits the impact event');
  for (const r of [1.56, .65, .6]) assert.equal(radiusCount(f, r), 0, 'ghost never applies authoritative wall-drop paint');
});

test('#385 non-paintable faces and grates never start a wall-drop', async () => {
  const f = await fixture();
  f.wall(4, { height: 8, paintable: false });
  const p = await fireShot(f, [0, 1.05, 20]);
  for (let i = 0; i < 240 && f.projectiles.list.includes(p); i++) {
    f.G.time += 1 / 60;
    f.projectiles.update(1 / 60);
  }
  assert.ok(!f.projectiles.list.includes(p), 'non-paintable wall contact stays terminal');
  assert.ok(!p.shooterWallDrop, 'non-paintable face never enters wall-drop');
  for (const r of [1.56, .65, .6]) assert.equal(radiusCount(f, r), 0, 'no wall-drop paint on a non-paintable face');

  const g = await fixture();
  g.wall(4, { height: 8, grate: true });
  const q = await fireShot(g, [0, 1.05, 20]);
  for (let i = 0; i < 90; i++) {
    g.G.time += 1 / 60;
    g.projectiles.update(1 / 60);
  }
  assert.ok(!q.shooterWallDrop, 'grate pass-through never enters wall-drop');
});

