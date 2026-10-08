// Regression coverage for the four non-Ink-Vac additions that entered PR #1077
// before it was merged into the consolidated integration branch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fixture } from './source-fixture.mjs';
import { advanceFidelityProjectile } from '../runtime/weapons-fidelity.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const DT = 1 / 60;
const near = (a, b, eps = 1e-8) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

test('#1037 admitted sub release waits one independent fixed frame before bomb creation', async () => {
  const f = await fixture();
  let bombs = 0;
  f.G.projectiles.throwBomb = () => { bombs++; return {}; };
  const a = f.make('shooter');
  a.ink = 100;
  a.intent.sub = true;
  f.tick(a, 8); // safely beyond the 5F humanoid readiness minimum
  assert.equal(a.weaponRunner.aimingSub, true, 'precondition: sub aim is live');

  a.intent.sub = false;
  f.tick(a); // physical release / admitted release tick
  assert.equal(bombs, 0, 'release tick itself cannot create the bomb');
  assert.equal(a.weaponRunner.s3SubReady?.pending, true, 'the admitted release is retained');
  assert.ok((a.weaponRunner.s3SubReady?.useStartup ?? 0) > 0, '1F use-startup is armed');

  f.tick(a); // +1F use boundary
  assert.equal(bombs, 1, 'bomb is created exactly on the following fixed tick');
  assert.equal(a.weaponRunner.s3SubReady, null, 'startup state is consumed once');
});

test('#1020 empty ink retires Dualies turret, but an exactly-funded final shot remains legal', async () => {
  const f = await fixture();

  {
    const a = f.make('dualies'), r = a.weaponRunner;
    a.intent.move.set(0, 0, 0);
    a.ink = a.weapon.inkPerShot - 1e-4;
    r.lockT = 0;
    r.s3Turret = true;
    r.update(DT, { fire: true, sub: false });
    assert.equal(r.s3Turret, false, 'an unaffordable held-ZR attempt exits turret immediately');
  }

  {
    const a = f.make('dualies'), r = a.weaponRunner;
    a.intent.move.set(0, 0, 0);
    a.ink = a.weapon.inkPerShot;
    r.cooldown = 0;
    r.lockT = 0;
    r.s3Turret = true;
    const before = f.shots.length;
    r.update(DT, { fire: true, sub: false });
    assert.equal(f.shots.length, before + 1, 'exactly enough ink still emits the final turret shot');
    assert.equal(r.s3Turret, true, 'the valid final shot is still a turret shot');
    r.update(DT, { fire: true, sub: false });
    assert.equal(r.s3Turret, false, 'the following dry attempt retires turret state');
  }
});

test('#1008 live gameplay owns one full aim collision query per rendered frame', () => {
  const player = fs.readFileSync(new URL('../../../inkwave-public/src/game/player.js', import.meta.url), 'utf8');
  const main = fs.readFileSync(new URL('../../../inkwave-public/src/main.js', import.meta.url), 'utf8');
  const updateStart = player.indexOf('  update(dt) {');
  const updateEnd = player.indexOf('  // Best enemy near the crosshair', updateStart);
  assert.ok(updateStart >= 0 && updateEnd > updateStart);
  const update = player.slice(updateStart, updateEnd);
  assert.match(update, /if \(!G\.rig\?\.gameCam\) this\.computeAim\(\);/,
    'controller keeps computeAim only as a standalone/no-gameCam fallback');
  assert.equal((update.match(/this\.computeAim\(\)/g) || []).length, 1);

  const frameStart = main.indexOf('  _frame(dt) {');
  const frameEnd = main.indexOf('\n  // keep weaker GPUs playable', frameStart);
  const frame = main.slice(frameStart, frameEnd > frameStart ? frameEnd : main.length);
  assert.equal((frame.match(/m\.controller\.computeAim\?\.\(\)/g) || []).length, 1,
    'the live frame performs exactly one full post-camera aim query');
});

test('#1053 Shooter brake-to-free transition waits for both XZ and Y lower thresholds', async () => {
  const f = await fixture();
  const move = {
    hz: 60,
    endSpeed: null,
    brakeDrag: 0.36,
    brakeGravity: 252,
    freeDrag: 0.02,
    freeGravity: 57.6,
    freeVelocityXZ: 0.2355 * 60,
    freeVelocityY: -0.15 * 60,
  };
  const p = {
    pos: new f.THREE.Vector3(),
    prev: new f.THREE.Vector3(),
    vel: new f.THREE.Vector3(0, -0.143472 * 60, 0.391381 * 60),
    age: 0,
    life: 2,
    straight: 0,
    fidelityMove: move,
    fidelityPhase: 1,
    fidelityPrevAge: 0,
    s3Weapon: { kind: 'shooter' },
  };

  advanceFidelityProjectile(p, DT);
  assert.equal(p.fidelityPhase, 1, 'Y crossing alone cannot enter free fall');
  assert.ok(Math.hypot(p.vel.x, p.vel.z) > move.freeVelocityXZ, 'XZ is still above its lower threshold');
  near(p.vel.y, move.freeVelocityY, 1e-8);

  advanceFidelityProjectile(p, DT);
  assert.equal(p.fidelityPhase, 2, 'free fall begins once both component thresholds are satisfied');
  near(Math.hypot(p.vel.x, p.vel.z), move.freeVelocityXZ, 1e-8);
  near(p.vel.y, move.freeVelocityY, 1e-8);
});
