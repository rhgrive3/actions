import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';
import { MAIN_WEAPON_CATALOG } from '../runtime/main-weapon-catalog-data.mjs';

// Real installed catalog runner, production adapter composition, native delay
// queue and recorder. The controlled owner state and simple muzzle isolate
// birth-time source selection; this is not a rendered or Switch comparison.
const close = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-8, `${message}: ${a} != ${b}`);
let randomDraws = 0;
const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true,
  vmMathRandom: () => { randomDraws++; return .5; } });
const ps = f.G.projectiles;
f.G.physics.segment = (_from, _to, hit) => { hit.hit = false; return hit; };
ps._draw = () => {};
let stepRandomDraws;
const nativeStep = ps._step;
ps._step = function (...args) {
  stepRandomDraws = randomDraws;
  return nativeStep.apply(this, args);
};

const delayed = MAIN_WEAPON_CATALOG.records.filter(r => !r.legacy && r.family === 'slosher' &&
  r.parameters.UnitGroupParam.Unit.some(u => (u.UnitDelayFrame || 0) + (u.AfterOffsetDelayFrame || 0) * ((u.BulletNum || 1) - 1) > 0));
assert.equal(delayed.length, 4);

function launch(id, initialGrounded, hz, { changeAt = 3, pitch = 0, turnAtBirth = false } = {}) {
  ps.clear(); f.G.actors.length = 0; f.G.time = 0;
  const a = f.make(id);
  Object.assign(a, { nid: 1, owner: 'birth-speed-test', form: 'kid', ink: 100, yaw: 0, grounded: initialGrounded });
  a.pos.set(0, 20, 0); a.character.root.position.copy(a.pos); a.vel.set(0, 0, 0);
  a.aimDir.set(0, Math.sin(pitch), Math.cos(pitch));
  a.aimPoint.copy(a.pos).addScaledVector(a.aimDir, 100); a.aimPoint.y += 1.05;
  a.intent.fire = true;
  const births = [], prepared = new Map();
  let releasing = false, tick = 0;
  f.G.netm = { mute: 0, recProj(p) {
    if (p.owner !== a) return;
    let wire;
    f.NetMatch.prototype.recProj.call({ _rec: row => { wire = [0, ...row, 0, 1]; return wire; },
      cfg: { id: 'birth-speed-test' } }, p);
    births.push({ p, wire, unit: p.catalog.descriptor.unit, index: p.catalog.index,
      tick: releasing ? tick : 0, ground: a.grounded, velocity: Array.from(p.vel.toArray()),
      ownerVelocity: Array.from(a.vel.toArray()), seed: p.seed, position: Array.from(p.start.toArray()),
      drawsAtBirth: randomDraws, drawsAtStep: stepRandomDraws });
  } };
  const clock = new FixedClock();
  let admissionTicks = 0;
  while (!ps.list.length && admissionTicks < 360) clock.advance(1 / hz, dt => {
    if (ps.list.length) return;
    f.G.time += dt;
    a.weaponRunner.update(dt, { fire: true, firePressed: admissionTicks++ === 0, sub: false, subReleased: false });
  });
  assert.ok(ps.list.length > 0, id + ' actual runner admitted a volley');
  for (const p of ps.list) prepared.set(p, { delay: p.delay, velocity: Array.from(p.vel.toArray()), seed: p.seed });
  const pending = ps.list.filter(p => p.delay > 0);
  assert.equal(births.length, ps.list.length - pending.length, id + ' no queued glob was sent early');
  a.intent.fire = false; releasing = true;
  const releaseClock = new FixedClock();
  while (tick < 20) releaseClock.advance(1 / hz, dt => {
    if (tick >= 20) return;
    tick++; f.G.time += dt;
    if (tick === changeAt) {
      a.grounded = !initialGrounded;
      a.vel.set(3, -4, 5);
      a.pos.x += 2; a.character.root.position.copy(a.pos);
      if (turnAtBirth) a.aimDir.set(1, -.5, 1).normalize();
    }
    ps.update(dt);
  });
  assert.equal(births.length, prepared.size, id + ' one packet per admitted glob');
  assert.equal(new Set(births.map(b => b.p)).size, prepared.size, id + ' no duplicate birth');
  for (const b of births) {
    const pre = prepared.get(b.p);
    assert.ok(b.wire, id + ' native recorder accepts the birth');
    assert.equal(b.wire[11], 0, id + ' source delay has elapsed before recording');
    assert.equal(b.seed, pre.seed, id + ' no replacement seed at birth');
    for (let axis = 0; axis < 3; axis++)
      close(b.wire[8 + axis], b.velocity[axis], id + ' final velocity reaches the wire');
    if (pre.delay > 0) {
      assert.equal(b.tick, Math.round(pre.delay * 60) + 1, id + ' native delayed birth cadence');
      assert.equal(b.drawsAtBirth, b.drawsAtStep, id + ' birth does not reroll launch RNG');
    }
  }
  return { a, births, prepared, pending };
}

function inertia(record, velocity) {
  const p = record.parameters.spl__SpawnBulletAdditionMovePlayerParam;
  // Tests keep body yaw zero. These are explicit pinned source axes, not a
  // second call to the runtime velocity helper under review.
  return [velocity[0] * (p.XRate || 0), velocity[1] * ((velocity[1] < 0 ? p.YMinusRate : p.YPlusRate) || 0),
    velocity[2] * (p.ZRate || 0)];
}
function sourceSpeed(unit, index, grounded) {
  return ((grounded ? unit.SpawnSpeedGround : unit.SpawnSpeedAir) + (unit.AfterOffsetSpawnSpeed || 0) * index) * 60;
}

for (const r of delayed) test(r.id + ' delayed globs select ground/air base speed at birth across 30/60/120 Hz', () => {
  for (const initialGrounded of [true, false]) {
    let reference;
    for (const hz of [30, 60, 120]) {
      const result = launch(r.id, initialGrounded, hz);
      let changedBirths = 0;
      for (const b of result.births) {
        const u = r.parameters.UnitGroupParam.Unit[b.unit], delta = inertia(r, b.ownerVelocity);
        const speed = sourceSpeed(u, b.index, b.ground);
        const v = b.velocity.map((x, axis) => x - delta[axis]);
        close(Math.hypot(v[0], v[2]), speed, `${r.id} ${hz} Hz unit ${b.unit}/${b.index} birth speed`);
        close(v[1], speed * (u.AddSpawnSpeedYRateByXZ || 0), r.id + ' vertical lift follows selected speed');
        if (b.tick >= 3) { changedBirths++; assert.equal(b.ground, !initialGrounded); }
        else assert.equal(b.ground, initialGrounded);
      }
      assert.ok(changedBirths > 0, r.id + ' queue spans landing/falling transition');
      const signature = result.births.map(({ unit, index, tick, ground, velocity, position }) =>
        ({ unit, index, tick, ground, velocity, position }));
      if (reference) assert.deepEqual(signature, reference, hz + ' Hz fixed-clock equivalence');
      else reference = signature;
    }
  }
});

test('stationary delayed globs preserve the admitted velocity exactly when grounded state stays the same', () => {
  for (const r of delayed) for (const grounded of [true, false]) {
    const result = launch(r.id, grounded, 60, { changeAt: Infinity });
    for (const b of result.births) {
      assert.deepEqual(b.velocity, result.prepared.get(b.p).velocity, r.id + ' no unnecessary velocity change');
      assert.equal(b.ground, grounded);
    }
  }
});

test('Bloblobber delayed bubbles use aim from their own 5F birth tick and transmit it exactly', () => {
  const r = delayed.find(r => r.id === 's3-slosher-bathtub');
  const result = launch(r.id, true, 60, { pitch: .3, turnAtBirth: true });
  const aim=[1,-.5,1].map(v=>v/1.5);
  const originalAim=[0,Math.sin(.3),Math.cos(.3)];
  assert.ok(result.births.some(b=>b.tick===0),'the large first bubble keeps its initial aim');
  for (const b of result.births.filter(b => b.tick >= 3)) {
    const u = r.parameters.UnitGroupParam.Unit[b.unit];
    const speed = sourceSpeed(u,b.index,false);
    const delta = inertia(r, b.ownerVelocity);
    const expected=[
      speed*aim[0] + delta[0],
      speed*(aim[1] + (u.AddSpawnSpeedYRateByXZ||0)*Math.hypot(aim[0],aim[2])) + delta[1],
      speed*aim[2] + delta[2],
    ];
    for(let axis=0;axis<3;axis++)
      close(b.velocity[axis],expected[axis],'live birth aims at current camera and source XZ lift');
    assert.ok(Math.abs(b.velocity[0]-originalAim[0]*speed)>1,
      'changing view between bubbles must visibly fan their trajectories');
    const remote = f.make(r.id);
    Object.assign(remote, { remote: true, grounded: true }); remote.vel.set(60,80,100);
    const sent = result.births.length;
    ps.ghostProjectile(remote, b.wire);
    const ghost = ps.list.at(-1);
    assert.ok(ghost.ghost && ghost.catalog, 'actual catalog replay');
    assert.deepEqual(Array.from(ghost.vel.toArray()), b.wire.slice(8,11), 'remote uses transmitted birth velocity');
    assert.equal(ghost.catalog.birthPending, undefined, 'remote does not reroll or re-aim');
    assert.equal(result.births.length, sent, 'replay never publishes a second owner packet');
  }
});
