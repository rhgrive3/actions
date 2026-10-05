import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { adaptSource } from '../adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';
import { adaptNetworkSource } from '../../network-replication/adapter.mjs';
import { adaptRange } from '../../practice-range/adapter.mjs';
import { fixture } from './weapon-edgecases-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';
import { recordSuccessfulSplattershotShot } from '../runtime/issue-507-splash-cycle.mjs';

const close = (actual, expected, epsilon = 1e-8) =>
  assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);

async function setup() {
  const f = await fixture();
  // Mirror current main's post-install bootstrap so the same focused test also
  // exercises the committed WeaponsFidelity _new/_push wrappers when available.
  let weaponsFidelityInstalled = false;
  if (existsSync(new URL('../runtime/weapons-fidelity.mjs', import.meta.url))) {
    const { installWeaponsFidelity } = await import('../runtime/weapons-fidelity.mjs');
    installWeaponsFidelity(f, f.profile);
    weaponsFidelityInstalled = true;
  }
  const a = f.make('shooter');
  const projectiles = new f.Projectiles(new f.THREE.Scene());
  const V = f.THREE.Vector3;
  const events = [];
  const paintCalls = [];
  let activeShot = 0;
  f.G.projectiles = projectiles;
  f.G.actors = [a];
  f.G.camera = { position: new V(0, 20, 0) };
  a.pos.set(0, 0, 0);
  a.grounded = true;
  a.ground.hit = true;
  a.ground.y = 0;
  a.ground.normal.set(0, 1, 0);
  a.aimYaw = 0;
  a.aimPitch = 0;
  a.aimDir.set(0, 0, 1);
  a.aimPoint.set(0, 1.05, 30);
  a.character.getMuzzle = out => out.copy(a.pos).add(new V(0, 1.05, 0.3));
  f.setRandom(() => 0.5);

  const fireShooter = projectiles.fireShooter;
  projectiles.fireShooter = function(actor, weapon, spread) {
    const before = this.list.length;
    const result = fireShooter.call(this, actor, weapon, spread);
    if (this.list.length === before + 1) {
      activeShot = this.list.length;
      events.push({ kind: 'emission', shot: activeShot, round: this.list.at(-1) });
    }
    return result;
  };
  f.G.paint.splat = (center, radius, team, options = {}) => {
    const call = { kind: 'paint', shot: activeShot, center: Array.from(center.toArray()), radius, team, options };
    paintCalls.push(call);
    events.push(call);
    return 1;
  };
  return { ...f, a, projectiles, events, paintCalls, V, weaponsFidelityInstalled };
}

function fireUntil(f, successfulShots, step = () => {}) {
  let frame = 0;
  while (f.projectiles.list.length < successfulShots && frame < 240) {
    frame++;
    step(frame);
    f.a.weaponRunner.update(1 / 60, { fire: true });
  }
  assert.equal(f.projectiles.list.length, successfulShots, 'native WeaponRunner emitted requested round count');
  return frame;
}

function addCoverWall(f) {
  const V = f.V;
  const block = {
    id: 0, solid: true,
    center: new V(0, 1, 1.7),
    half: new V(10, 4, 0.1),
    axes: [new V(1, 0, 0), new V(0, 1, 0), new V(0, 0, 1)],
    faces: [-1, -1, -1, -1, -1, -1],
  };
  const level = {
    blocks: [block],
    queryBlocks: (_x, _z, _xx, _zz, out) => { out.length = 0; out.push(0); return out; },
  };
  f.G.level = level;
  f.G.physics = new f.Physics(level);
}

test('issue hook survives the current production source-adapter order', () => {
  const rel = 'src/game/weapons.js';
  const source = readFileSync(new URL('../../../inkwave-public/src/game/weapons.js', import.meta.url), 'utf8');
  const composed = adaptRange(rel, adaptNetworkSource(rel, adaptQualitySource(rel,
    adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, source))))));
  const emission = composed.indexOf('projectiles.fireShooter(a, w, this.spread);');
  const nearest = composed.indexOf('recordSuccessfulSplattershotShot(a, w, projectiles.list.at(-1), G.paint);');
  assert.ok(emission >= 0 && nearest > emission);
  if (existsSync(new URL('../weapons-adapter.mjs', import.meta.url))) {
    assert.match(composed, /advanceFidelityProjectile\(p, (?:dt|elapsed)\)/);
    assert.match(composed, /if \(p\.ghost\) break;/);
  }
});

test('pinned Splattershot parameters describe a 4/8 modulo-eight nearest-paint loop', async () => {
  const f = await setup();
  const params = f.profile.weapons.shooter.nearestPaintCycle;
  assert.equal(params.sourceCommit, '7280ff9cde8bb1c5dcef46c700c326471584d2e6');
  assert.deepEqual(params.SplashSpawnParam, { SplitNum: 8, ForceSpawnNearestAddNumArray: [4] });
  assert.equal(params.SplashPaintParam.WidthHalfNearest, 2.0608);
  assert.equal(params.SplashPaintParam.parameterUnitMultiplier, 0.2);
  assert.equal(params.SplashPaintParam.worldUnitScale, 1);
  close(params.SplashPaintParam.WidthHalfNearest * params.SplashPaintParam.parameterUnitMultiplier, 0.41216);
  assert.equal(f.projectiles.list.length, 0);
});

test('native ShooterRunner and Projectiles paint only successful Splattershot shots 4, 8, 12 and 16', async () => {
  const f = await setup();
  fireUntil(f, 16);

  assert.deepEqual(f.paintCalls.map(call => call.shot), [4, 8, 12, 16]);
  for (const call of f.paintCalls) {
    close(call.radius, 0.41216);
    assert.deepEqual(call.center, [0, 0, 0]);
    assert.equal(call.team, f.a.team);
  }
  for (const shot of [4, 8, 12, 16]) {
    const emission = f.events.findIndex(event => event.kind === 'emission' && event.shot === shot);
    const paint = f.events.findIndex(event => event.kind === 'paint' && event.shot === shot);
    assert.ok(emission >= 0 && paint > emission, `shot ${shot} paint follows its native projectile emission`);
  }
  assert.equal(f.a.s3.splattershotNearestCycle.successfulShots, 16);
  assert.equal(f.a.s3.splattershotNearestCycle.phase, 0);
  assert.equal(f.projectiles.list.length, 16);
  for (const round of f.projectiles.list) {
    assert.equal(round.type, 'shot');
    if (f.weaponsFidelityInstalled) assert.equal(round.s3Weapon.id, 'shooter');
    assert.equal(round.trailEvery, f.a.weapon.trailEvery);
    assert.equal(round.trailRadius, f.a.weapon.trailRadius);
    close(round.radius, f.a.weapon.impactRadius);
  }
});

test('empty-trigger dry fire does not advance the successful-shot phase', async () => {
  const f = await setup();
  f.a.ink = 0;
  f.a.weaponRunner.update(1 / 60, { fire: true });
  assert.equal(f.projectiles.list.length, 0);
  assert.equal(f.a.s3?.splattershotNearestCycle, undefined);
  assert.equal(f.paintCalls.length, 0);

  f.a.ink = 100;
  fireUntil(f, 4);
  assert.deepEqual(f.paintCalls.map(call => call.shot), [4]);
  assert.equal(f.a.s3.splattershotNearestCycle.successfulShots, 4);
});

test('remote owners and replicated ghost rounds do not create a second cycle or paint event', async () => {
  const f = await setup();
  f.a.remote = true;
  fireUntil(f, 4);
  assert.equal(f.paintCalls.length, 0);
  assert.equal(f.a.s3?.splattershotNearestCycle, undefined);

  f.a.remote = false;
  const ghost = f.projectiles.ghostProjectile(f.a, [0, 0, 0, 'shot', 'shooter', 0, 1, 0, 0, 0, 10, 0, 1, 1 / 60, 0.2, 0.15, 28, 0.8, 1.05, 0, 0.8, 1.3, 0.035, 26, 0.3, 3]);
  const replicated = f.projectiles.list.at(-1);
  assert.equal(ghost, undefined);
  assert.equal(replicated.ghost, true);
  assert.equal(recordSuccessfulSplattershotShot(f.a, f.a.weapon, replicated, f.G.paint), null);
  assert.equal(f.paintCalls.length, 0);
  assert.equal(f.a.s3?.splattershotNearestCycle, undefined);
});

test('nearest floor paint precedes a real covered projectile wall impact', async () => {
  const f = await setup();
  addCoverWall(f);
  fireUntil(f, 4);
  assert.deepEqual(f.paintCalls.map(call => call.shot), [4]);

  const round = f.projectiles.list.at(-1);
  assert.equal(round.owner, f.a);
  const dead = f.projectiles._step(round, 1 / 60);
  assert.equal(dead, true, 'the actual projectile segment reaches the cover wall');
  assert.equal(f.paintCalls.length, 2);
  close(f.paintCalls[0].radius, 0.41216);
  assert.ok(f.paintCalls[1].radius > 0.6, 'native wall impact keeps its distinct final-impact footprint');
  assert.ok(f.paintCalls[1].options.stretch);
  assert.equal(f.paintCalls[1].options.stretchAmt, 0.7);
  assert.ok(f.events.findIndex(event => event.kind === 'paint' && event.radius === 0.41216) <
    f.events.findIndex(event => event.kind === 'paint' && event.options.stretchAmt === 0.7));
});

test('ordinary flight droplets and final wall splats still use the native paint paths', async () => {
  const f = await setup();
  fireUntil(f, 1);
  const round = f.projectiles.list[0];
  assert.equal(f.paintCalls.length, 0, 'shot one has no nearest-foot event');

  f.G.physics.segment = (_from, _to, hit) => { hit.hit = false; return hit; };
  f.G.physics.raycast = (from, _direction, _distance, hit) => {
    hit.hit = true;
    hit.point.copy(from).setY(0);
    hit.normal.set(0, 1, 0);
    return hit;
  };
  f.projectiles._step(round, 1 / 60);
  f.projectiles._step(round, 1 / 60);
  assert.equal(f.paintCalls.length, 1, 'the original per-projectile flight trail still paints');
  close(f.paintCalls[0].radius, f.a.weapon.trailRadius);

  f.projectiles._impact(round, { hit: true, point: new f.V(0, 0, 2), normal: new f.V(0, 0, -1) });
  assert.equal(f.paintCalls.length, 2, 'the final wall impact still paints separately');
  assert.equal(f.paintCalls[1].options.seed, round.seed);
  assert.ok(f.paintCalls[1].options.stretch);
  assert.equal(f.paintCalls[1].options.stretchAmt, 0.7);
});

test('30/60/120 Hz rendering produces identical fixed-step emissions and paint phases', async () => {
  const results = [];
  for (const hz of [30, 60, 120]) {
    const f = await setup();
    const clock = new FixedClock();
    const emissionTicks = [];
    let tick = 0;
    for (let frame = 0; frame < hz * 3 && f.projectiles.list.length < 16; frame++) {
      clock.advance(1 / hz, () => {
        tick++;
        const before = f.projectiles.list.length;
        f.a.weaponRunner.update(1 / 60, { fire: true });
        for (let i = before; i < f.projectiles.list.length; i++) emissionTicks.push(tick);
      });
    }
    assert.equal(f.projectiles.list.length, 16);
    results.push({
      emissionTicks,
      paintShots: f.paintCalls.map(call => call.shot),
      radii: f.paintCalls.map(call => call.radius),
      phases: f.a.s3.splattershotNearestCycle.phase,
    });
  }
  assert.deepEqual(results[1], results[0]);
  assert.deepEqual(results[2], results[1]);
  assert.deepEqual(results[0].paintShots, [4, 8, 12, 16]);
});
