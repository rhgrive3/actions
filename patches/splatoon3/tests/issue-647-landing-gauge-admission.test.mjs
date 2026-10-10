import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { FixedClock, STEP } from '../runtime/clock.mjs';
import { SPECIAL_GAUGE_SEGMENTS } from '../runtime/tidal-slam-gauge.mjs';
import { adaptSource } from '../adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';
import { adaptNetworkSource } from '../../network-replication/adapter.mjs';
import { adaptRange } from '../../practice-range/adapter.mjs';

// Keep the fixture on the same complete build transform order as
// scripts/build-inkwave.mjs: gameplay, touch, reliability, quality, network,
// then Practice Range. The Actor itself is the public source Actor.
const adaptProduction = (rel, source) => adaptRange(rel, adaptNetworkSource(rel,
  adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, source))))));

async function slam({ startY = 0, floorY = 0, ground = true, weapon = 'shooter', negativeControl = false } = {}) {
  const adapt = (rel, code) => {
    const composed = adaptProduction(rel, code);
    return negativeControl && rel === 'src/game/actor.js'
      ? composed.replaceAll(' && !this.s3TidalSlamGaugeFinish', '') : composed;
  };
  const f = await fixture({ adapt, adaptRuntime: adapt });
  const a = f.make(weapon);
  a.pos.y = startY;
  a.grounded = false;
  f.G.physics.collideBody = (_pos, _radius, _lift, _height, contacts) => {
    contacts.ground = false; contacts.wall = false; contacts.ceiling = false;
    return contacts;
  };
  f.G.physics.groundProbe = (x, y, z, up, down, _foot, out) => {
    out.hit = false;
    const target = typeof floorY === 'function' ? floorY(x, z) : floorY;
    if (ground && target <= y + up && target >= y - down) {
      out.hit = true; out.y = target; out.normal.set(0, 1, 0); out.block = -1;
      out.face = -1; out.u = out.v = 0; out.center = true; out.grate = false;
    }
    return out;
  };
  f.G.match.canRespawn = () => false;
  f.G.projectiles.throwStorm = () => {};
  const impacts = [];
  a._slamImpact = () => impacts.push({ value: a.special, active: a.specialActive });
  a.special = a.specialCost();
  a._startSpecial();
  return { f, a, impacts };
}

function runToImpact(f, a, maxTicks = 180) {
  const drops = [];
  let previous = a.special, ticks = 0;
  while (a.specialActive && ticks++ < maxTicks) {
    f.tick(a);
    drops.push(previous - a.special);
    assert.ok(a.special <= previous + 1e-10, 'the action-owned gauge never rises');
    previous = a.special;
  }
  assert.ok(ticks < maxTicks, 'native Slam reaches ground contact or its existing timeout');
  return { drops, ticks };
}

test('#647 negative control allows pending landing gauge refill and a second native Special', async () => {
  const { f, a } = await slam({ negativeControl: true });
  runToImpact(f, a);
  assert.ok(a.s3TidalSlamGaugeFinish && a.hardLand > 0);
  const held = a.special, priorUses = a.stats.specials;
  a.addTurf(10);
  assert.equal(a.special, held + 10, 'existing landing-owned gauge incorrectly rises');
  a.addTurf(a.specialCost());
  assert.equal(a.specialReady(), true, 'the pending action can incorrectly be activated again');
  a.intent.special = true; f.tick(a);
  assert.equal(a.specialActive?.id, 'slam');
  assert.equal(a.stats.specials, priorUses + 1);
});

test('#647 pending landing earns turf but cannot refill, emit ready, or restart Special', async () => {
  const { f, a } = await slam();
  runToImpact(f, a);
  const held = a.special, turf = a.stats.turf, priorUses = a.stats.specials;
  const events = []; f.on('special:ready', e => events.push(e));
  a.addTurf(10); a.addTurf(a.specialCost());
  assert.equal(a.stats.turf, turf + 10 + a.specialCost());
  assert.equal(a.special, held, 'landing owns the used remainder until its existing finish');
  assert.equal(a.specialReady(), false); assert.equal(events.length, 0);
  a.intent.special = true; f.tick(a);
  assert.equal(a.specialActive, null); assert.equal(a.stats.specials, priorUses);
  assert.ok(a.s3TidalSlamGaugeFinish, 'the original finish remains owner');
  // Readiness also defends the explicit pending token when a caller presents
  // a full numeric gauge, rather than relying only on addTurf's gate.
  a.special = a.specialCost(); assert.equal(a.specialReady(), false);
  a.special = held;
  let count = 0; while (a.s3TidalSlamGaugeFinish && count++ < 60) f.tick(a);
  assert.ok(count < 60); assert.equal(a.special, 0);
  a.addTurf(a.specialCost()); assert.equal(a.specialReady(), true);
  assert.equal(events.length, 1, 'the next real ready transition is emitted normally');
});

test('#647 timeout landing and Special Saver keep the same recharge boundary', async () => {
  const { f, a } = await slam({ ground: false });
  runToImpact(f, a);
  const held = a.special;
  assert.ok(a.s3TidalSlamGaugeFinish && !a.grounded);
  a.addTurf(10); assert.equal(a.special, held);
  a.splat(null);
  assert.equal(a.s3TidalSlamGaugeFinish, null);
  assert.equal(a.special, held * .5, 'Saver receives only the original action remainder');
  f.tick(a); assert.equal(a.special, held * .5);
  a.reset(); a.addTurf(10); assert.equal(a.special, 10, 'reset clears the old lock');
});

test('#647 fixed-tick refill admission is identical at 30/60/120Hz', async () => {
  const histories = [];
  for (const hz of [30, 60, 120]) {
    const { f, a } = await slam(); const clock = new FixedClock(), trace = [];
    let ticks = 0;
    for (let frame = 0; frame < hz * 3 && ticks < 150; frame++) clock.advance(1 / hz, dt => {
      if (ticks++ >= 150) return;
      a.addTurf(1); f.G.time += dt; a.update(dt);
      trace.push([a.special, a.specialReady(), !!a.s3TidalSlamGaugeFinish, a.stats.turf]);
    });
    histories.push(trace);
  }
  assert.deepEqual(histories[1], histories[0]); assert.deepEqual(histories[2], histories[0]);
});
