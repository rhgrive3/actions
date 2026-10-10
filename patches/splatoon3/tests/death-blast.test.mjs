import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture } from './source-fixture.mjs';
import { deathBlastPlan, validateDeathBlast, NATIVE_DEATH_BURST_RADIUS } from '../runtime/death-blast.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PATCH = path.join(ROOT, 'patches/splatoon3');
const SOURCE = 'data/parameter/1130/misc/SplPlayer.game__GameParameterTable.json#/GameParameters/DieBlastParam/';
const read = rel => JSON.parse(fs.readFileSync(path.join(PATCH, rel), 'utf8'));
const near = (a, b, label, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${label}: ${a} != ${b}`);

async function world() {
  const f = await fixture({ fullRuntime: true, productionComposition: true });
  const calls = [];
  let area = 0.25;
  f.G.paint = { sample: () => 1, splat(pos, radius, team, opts) {
    calls.push({ pos: pos.clone(), radius, team, opts: opts && { ...opts }, nextOwner: this._paintNextOwner ?? null });
    this._paintNextOwner = null;
    area += 0.25;
    return area;
  } };
  f.G.match = { playing: () => true, canRespawn: () => false, actors: f.G.actors };
  const attacker = f.make('shooter'), victim = f.make('shooter');
  attacker.team = 0; victim.team = 1;
  attacker.isLocal = victim.isLocal = false;
  victim.pos.set(3, 2, -4);
  return { f, calls, attacker, victim };
}

test('death blast values are the pinned SplPlayer DieBlastParam fields', () => {
  const numbers = read('reference/curated-numbers.json').parameters;
  const profile = read('profile.json');
  const expected = { PaintRadius: 5, PaintOffsetY: 0.1, CollisionRadiusForPaint: 5, 'KnockBackParam/Accel': 0,
    'SplashAroundParam/Num': 10, 'SplashAroundParam/PaintRadius': 1, 'SplashAroundParam/PitchMax': 45,
    'SplashAroundParam/VelocityMin': 0.54, 'SplashAroundParam/VelocityMax': 0.72 };
  for (const [field, value] of Object.entries(expected)) {
    const entry = numbers[SOURCE + field];
    assert.ok(entry, `curated ${field}`);
    assert.equal(entry.status, 'extracted');
    assert.equal(entry.value, value, field);
  }
  const bindings = { paintRadius: 'PaintRadius', paintOffsetY: 'PaintOffsetY', splashAroundCount: 'SplashAroundParam/Num',
    splashAroundPaintRadius: 'SplashAroundParam/PaintRadius' };
  for (const [key, field] of Object.entries(bindings)) {
    const binding = profile.bindings[`deathBlast.${key}`];
    assert.equal(binding?.parameter, SOURCE + field, key);
    assert.equal(binding.factor, 1);
    assert.equal(profile.deathBlast[key], expected[field], key);
  }
  assert.doesNotThrow(() => validateDeathBlast(profile.deathBlast));
  assert.throws(() => validateDeathBlast({ ...profile.deathBlast, splashAroundCount: 1.5 }));
});

test('upstream death burst is still the single radius-1.7 call this patch replaces', () => {
  const actor = fs.readFileSync(path.join(ROOT, 'inkwave-public/src/game/actor.js'), 'utf8');
  const call = `G.paint.splat(_v, ${NATIVE_DEATH_BURST_RADIUS}, attacker.team, { seed: Math.random() })`;
  assert.equal(actor.split(call).length - 1, 1);
});

test('production splat paints the 5.0 source blast plus ten 1.0 around droplets in the attacker colour', async () => {
  const { f, calls, attacker, victim } = await world();
  f.setRandom(() => 0.375);
  try { victim.splat(attacker, 'shooter'); } finally { f.restoreRandom(); }
  const spec = f.profile.deathBlast;
  assert.equal(calls.length, 1 + spec.splashAroundCount);
  const [main, ...drops] = calls;
  assert.equal(main.radius, spec.paintRadius);
  assert.equal(main.team, attacker.team);
  near(main.pos.x, 3, 'main x'); near(main.pos.y, 2 + spec.paintOffsetY, 'main y'); near(main.pos.z, -4, 'main z');
  assert.equal(main.nextOwner, attacker, 'native ownership slot is consumed by the main blast');
  assert.equal(main.opts.seed, 0.375, 'main blast keeps the native seed');
  const plan = deathBlastPlan({ x: 3, y: 2, z: -4 }, 0.375, spec);
  for (const [i, drop] of drops.entries()) {
    assert.equal(drop.radius, spec.splashAroundPaintRadius);
    assert.equal(drop.team, attacker.team);
    assert.equal(drop.opts.claimOwner, attacker, `drop ${i} ownership`);
    assert.ok(Number.isFinite(drop.opts.seed), `drop ${i} replay seed`);
    const reach = Math.hypot(drop.pos.x - 3, drop.pos.z + 4);
    assert.ok(reach >= spec.paintRadius * 0.6 - 1e-9 && reach <= spec.paintRadius + 1e-9, `drop ${i} reach ${reach}`);
    near(drop.pos.y, 2 + spec.paintOffsetY, `drop ${i} y`);
    near(drop.pos.x, plan[i + 1].x, `drop ${i} plan x`); near(drop.pos.z, plan[i + 1].z, `drop ${i} plan z`);
  }
});

test('combat credit receives the whole blast area exactly once', async () => {
  const { f, calls, attacker, victim } = await world();
  const events = [];
  const off = f.on('splatted', e => events.push(e));
  const before = attacker.stats.turf;
  victim.splat(attacker, 'shooter');
  off?.();
  const area = 0.5 + 0.75 + 1 + 1.25 + 1.5 + 1.75 + 2 + 2.25 + 2.5 + 2.75 + 3;
  assert.equal(calls.length, 11);
  near(attacker.stats.turf - before, area, 'attacker turf');
  assert.equal(events.length, 1);
  near(Number(events[0].burstArea), area, 'replicated burstArea');
});

test('environmental splats, repeated splats and paint failures leave the paint system untouched', async () => {
  const { f, calls, attacker, victim } = await world();
  victim.splat(null, 'water');
  assert.equal(calls.length, 0, 'no attacker: no death blast, as upstream');
  assert.equal(Object.hasOwn(f.G.paint, 'splat'), true, 'own paint method restored');
  const original = f.G.paint.splat;
  victim.splat(attacker, 'shooter');
  assert.equal(calls.length, 0, 'already dead');
  const second = f.make('shooter'); second.team = 1;
  f.G.paint.splat = () => { throw new Error('paint failure'); };
  const failing = f.G.paint.splat;
  assert.throws(() => second.splat(attacker, 'shooter'), /paint failure/);
  assert.equal(f.G.paint.splat, failing, 'interceptor removed after an exception');
  f.G.paint.splat = original;
  const proto = { splat(...args) { calls.push({ radius: args[1] }); return 1; } };
  f.G.paint = Object.create(proto);
  const third = f.make('shooter'); third.team = 1;
  third.splat(attacker, 'shooter');
  assert.equal(Object.hasOwn(f.G.paint, 'splat'), false, 'inherited paint method is not shadowed afterwards');
  assert.deepEqual(calls.map(c => c.radius), [5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
});

test('the blast draws no extra global random numbers and is deterministic for a seed', async () => {
  const count = async patched => {
    const { f, attacker, victim } = await world();
    let n = 0;
    f.setRandom(() => { n++; return 0.5; });
    try {
      if (patched) victim.splat(attacker, 'shooter');
      else f.Actor.prototype[Symbol.for('inkwave.s3.death-blast.v1')].splat.call(victim, attacker, 'shooter');
    } finally { f.restoreRandom(); }
    return n;
  };
  assert.equal(await count(true), await count(false));
  const spec = read('profile.json').deathBlast;
  assert.deepEqual(deathBlastPlan({ x: 1, y: 0, z: 2 }, 0.123, spec), deathBlastPlan({ x: 1, y: 0, z: 2 }, 0.123, spec));
  assert.notDeepEqual(deathBlastPlan({ x: 1, y: 0, z: 2 }, 0.123, spec), deathBlastPlan({ x: 1, y: 0, z: 2 }, 0.124, spec));
});
