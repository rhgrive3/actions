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

async function slam({ startY = 0, floorY = 0, ground = true, weapon = 'shooter' } = {}) {
  const f = await fixture({ adapt: adaptProduction, adaptRuntime: adaptProduction });
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

test('full composed Actor drains at a steady rate to one of 23 segments at early, normal, and late contact', async () => {
  for (const startY of [-0.8, 0, 3]) {
    const { f, a, impacts } = await slam({ startY, floorY: 0 });
    const cost = a.specialCost(), segment = cost / SPECIAL_GAUGE_SEGMENTS;
    assert.equal(a.special, cost, 'activation retains a nonzero meter');
    assert.equal(a.specialReady(), false, 'the live action cannot be activated again');
    const { drops } = runToImpact(f, a);
    assert.equal(impacts.length, 1);
    assert.equal(impacts[0].active?.id, 'slam', 'impact callback runs before the native action closes');
    assert.ok(Math.abs(impacts[0].value - segment) < 1e-7, 'impact observes one segment without a large clamp');
    const positive = drops.filter(drop => drop > 1e-10);
    assert.ok(positive.length > 10, 'meter drains throughout the action');
    assert.ok(Math.max(...positive) - Math.min(...positive) < 1e-7, 'each fixed simulation step drains at a constant rate');
    assert.ok(Math.abs(a.special - segment) < 1e-7, 'impact frame retains the final segment');
    assert.ok(Math.abs(a.specialFrac() - 1 / SPECIAL_GAUGE_SEGMENTS) < 1e-8, 'the actor HUD fraction sees that segment');
    assert.equal(a.s3TidalSlamGaugeFinish != null, true, 'the completed action owns the pending segment');
    assert.ok(a.hardLand > 0, 'the impact landing charged the existing hard-landing recovery');
    f.tick(a);
    assert.ok(Math.abs(a.special - segment) < 1e-7, 'the final segment is held through the landing recovery, not a one-frame boundary');
    let held = 0;
    while (a.s3TidalSlamGaugeFinish && held++ < 60) f.tick(a);
    assert.ok(held > 1, 'the existing landing completion, not the next update, consumes the segment');
    assert.equal(a.special, 0, 'the existing landing completion consumes the final segment');
    assert.equal(a.specialFrac(), 0);
  }
});

test('a fall with no ground probe uses the native timeout trajectory and holds the segment until a real landing', async () => {
  const { f, a, impacts } = await slam({ ground: false });
  const segment = a.specialCost() / SPECIAL_GAUGE_SEGMENTS;
  const { ticks } = runToImpact(f, a);
  assert.equal(impacts.length, 1);
  assert.ok(Math.abs(impacts[0].value - segment) < 1e-7);
  assert.ok(Math.abs(a.special - segment) < 1e-7);
  assert.ok(ticks > 60, 'timeout path includes rise, hang and the native fall safety interval');
  assert.ok(a.s3TidalSlamGaugeFinish, 'the pending finish waits for the body landing');
  f.tick(a);
  assert.ok(Math.abs(a.special - segment) < 1e-7, 'an airborne timeout impact never invents a one-frame zero');
  assert.ok(a.s3TidalSlamGaugeFinish, 'still pending while the body has not landed');
  a.splat(null);
  assert.equal(a.special, segment * 0.5, 'death between impact and finish hands the real remainder to Special Saver');
  assert.equal(a.s3TidalSlamGaugeFinish, null, 'the existing death path clears the pending finish');
  f.tick(a);
  assert.equal(a.special, segment * 0.5, 'a dead actor update does not consume the interrupted remainder');
  a.reset();
  assert.equal(a.special, 0, 'the existing reset state boundary owns the final zero');
  assert.equal(a.s3TidalSlamGaugeFinish, null);
});

test('the landing forecast follows the actor across a step in its swept floor surface', async () => {
  const { f, a, impacts } = await slam({ floorY: x => x >= 0.3 ? 0.4 : 0 });
  a.intent.move.x = 1;
  const segment = a.specialCost() / SPECIAL_GAUGE_SEGMENTS;
  const { drops } = runToImpact(f, a);
  assert.ok(a.pos.x >= 0.3, 'Slam movement reaches the higher landing surface');
  assert.equal(impacts.length, 1);
  assert.ok(Math.abs(impacts[0].value - segment) < 1e-7);
  const positive = drops.filter(drop => drop > 1e-10);
  assert.ok(Math.max(...positive) - Math.min(...positive) < 1e-7, 'surface projection keeps the step drain steady');
});

test('interruption applies existing Special Saver to the actual remaining gauge', async () => {
  const { f, a } = await slam({ ground: false });
  for (let i = 0; i < 36; i++) f.tick(a);
  const before = a.special;
  assert.ok(before > 0 && before < a.specialCost());
  a.splat(null);
  assert.equal(a.special, before * 0.5, 'the existing gear wrapper reduces the actual remainder');
  assert.equal(a.specialActive, null);
  assert.equal(a.s3TidalSlamGaugeFinish, null);
});

test('a splat in the impact frame sends the held final segment through Special Saver', async () => {
  const { f, a } = await slam();
  runToImpact(f, a);
  const segment = a.specialCost() / SPECIAL_GAUGE_SEGMENTS;
  assert.ok(Math.abs(a.special - segment) < 1e-7);
  a.splat(null);
  assert.equal(a.special, segment * 0.5);
  assert.equal(a.s3TidalSlamGaugeFinish, null);
  f.tick(a);
  assert.equal(a.special, segment * 0.5, 'dead actor update does not consume an interrupted remainder');
});

test('the composed action and HUD trace is identical at 30/60/120 Hz render cadence', async () => {
  const histories = [];
  for (const hz of [30, 60, 120]) {
    const { f, a } = await slam({ startY: 1.25 });
    const clock = new FixedClock(), trace = [];
    for (let frame = 0; frame < hz * 3 && (a.specialActive || a.s3TidalSlamGaugeFinish); frame++) {
      clock.advance(1 / hz, dt => {
        f.G.time += dt;
        a.update(dt);
        trace.push([a.specialActive?.phase ?? 'complete', a.special, a.specialFrac()]);
      });
    }
    assert.equal(a.special, 0);
    histories.push(trace);
  }
  assert.deepEqual(histories[1], histories[0]);
  assert.deepEqual(histories[2], histories[0]);
});

test('actor ownership is separate across remote actors; reset and replacement actors clear pending finish', async () => {
  const { f, a } = await slam();
  const b = f.make('shooter');
  b.special = b.specialCost();
  assert.notEqual(a.character, b.character, 'each actor owns its own character presentation');
  for (let i = 0; i < 12; i++) f.tick(a);
  assert.equal(b.special, b.specialCost(), 'a remote actor gauge is not touched by the local action');
  runToImpact(f, a);
  assert.ok(a.special > 0 && b.special > 0);
  a.reset();
  assert.equal(a.special, 0);
  assert.equal(a.s3TidalSlamGaugeFinish, null);
  const replacement = f.make('shooter');
  assert.equal(replacement.special, 0, 'a replacement/reconnected actor begins without stale action state');
  assert.equal(replacement.s3TidalSlamGaugeFinish, null);
});

test('the composed Character visual observer and a remote proxy do not duplicate gauge transitions', async () => {
  const f = await fixture({ adapt: adaptProduction, adaptRuntime: adaptProduction, includeCharacter: true });
  // Keep the public rig instance, ownership lookup and production special
  // motion wrapper; stub only its renderer-side pose update, which needs the
  // full browser scene/install stack that this focused Actor fixture omits.
  f.Character.prototype.update = function () { this.visualSamples = (this.visualSamples || 0) + 1; };
  f.installSpecialMotion({ Character: f.Character, Actor: f.Actor, THREE: f.THREE,
    CHARACTER_CHANNELS: f.CHARACTER_CHANNELS, CHARACTER_TIMERS: f.CHARACTER_TIMERS,
    CHARACTER_BOMB_POSE: f.CHARACTER_BOMB_POSE }, f.profile);
  const makeActor = (team, name) => {
    const actor = new f.Actor({ team, name, weapon: 'shooter', CharacterClass: f.Character });
    actor.character.actor = actor;
    return actor;
  };
  const owner = makeActor(0, 'owner'), remote = makeActor(1, 'remote');
  owner.special = owner.specialCost(); owner._startSpecial();
  remote.special = remote.specialCost(); remote.specialActive = { id: 'slam', net: true };
  const ownerGauge = owner.special, remoteGauge = remote.special;
  const view = { form: 'kid', hp: 100, grounded: false };
  for (let i = 0; i < 4; i++) {
    owner.character.update(STEP, view);
    remote.character.update(STEP, view);
    assert.equal(owner.special, ownerGauge, 'render-side pose updates do not drain the authoritative actor gauge');
    assert.equal(remote.special, remoteGauge, 'remote visual replay does not consume or mirror the owner gauge');
  }
  assert.equal(f.specialMotionSnapshot(owner.character).phase, 'rise');
  assert.equal(f.specialMotionSnapshot(remote.character).phase, 'native-unmapped');
});

test('Storm retains its existing immediate-consume behavior', async () => {
  const { f, a } = await slam({ weapon: 'charger' });
  assert.equal(a.weapon.special, 'storm');
  assert.equal(a.special, 0, 'the non-Slam helper created only a fixture actor');
  a._updateSpecial(STEP);
  assert.equal(a.special, 0);
  assert.equal(a.specialActive.id, 'storm');
});

test('gauge authority is owner-local: a replicated net Slam state never runs local forecast math', async () => {
  const { f, a: owner } = await slam();
  const proxy = f.make('shooter');
  // The shape NetMatch pack/apply actually produces for a proxy: the owner's
  // packed rounded gauge plus the replicated special flag (netmatch packActor
  // / applyRemote; the full pack round trip is covered against the real
  // NetMatch in issue-648-native-physics-gauge.test.mjs).
  proxy.special = Math.round(owner.specialCost() * 0.62);
  proxy.specialActive = { id: 'slam', net: true };
  const packed = proxy.special;
  const ownerCost = owner.specialCost();
  for (let i = 0; i < 24; i++) { f.tick(owner); f.tick(proxy); }
  assert.ok(owner.special > 0 && owner.special < ownerCost, 'the owner keeps draining its local action gauge');
  assert.ok(Math.abs(owner.special - packed) > 1, 'the owner and the proxy are independent actors');
  assert.equal(proxy.special, packed, 'the remote proxy gauge is packet-authoritative, never locally forecast');
  assert.ok(Number.isFinite(proxy.special), 'no NaN leaks into a replicated gauge');
  proxy.specialActive = null;
  f.tick(proxy);
  assert.equal(proxy.special, packed, 'clearing the replicated flag does not consume the packed gauge');
});
