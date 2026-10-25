import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { oldOrbit, candidateOrbit, oldDelta, candidateDelta, calibration, oldCalibration, provenance, mathCounts, THREE } from './special-kits-orbit-fixture.mjs';

const velocity = (x, y, z) => new THREE.Vector3(x, y, z);
function publicCompare(p, dt) { const old = oldOrbit(p, dt), actual = candidateOrbit(p, dt); assert.deepEqual(actual, old); return actual; }
function projectile(data = {}) {
  return { wid: 'trizooka', age: .4, s3VolleyIndex: 1, s3Yaw: .73, pos: new THREE.Vector3(1, 2, 3),
    vel: velocity(2, -3, 67.5), ghost: false, damageOwner: true, ...data };
}
const snapshot = p => ({ pos: p.pos?.toArray(), age: p.age, index: p.s3VolleyIndex, yaw: p.s3Yaw, velocity: p.vel?.toArray(),
  applied: p.s3OrbitApplied, ghost: p.ghost, damageOwner: p.damageOwner });
function deltaCompare(data, dt) {
  const a = projectile(data), b = projectile(data);
  a.pos = a.pos.clone(); b.pos = b.pos.clone();
  a.vel = a.vel?.clone(); b.vel = b.vel?.clone();
  assert.equal(candidateDelta(null, b, dt), oldDelta(null, a, dt));
  assert.deepEqual(snapshot(b), snapshot(a)); return b;
}
test('unchanged public selector preserves exact outputs and fresh escaped handles', () => {
  let seed = 0x77d51a23;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 10_000; i++) publicCompare({ age: random() * 4, s3VolleyIndex: i % 3, s3Yaw: random() * 6 - 3,
    vel: velocity(random() * 200 - 100, random() * 200 - 100, random() * 200 - 100) }, 1 / 60);
  for (const p of [null, undefined, {}, { age: .4, s3Yaw: -0 }, { age: .4, s3Yaw: NaN }]) publicCompare(p, 0);
  const p = projectile(), old = candidateOrbit(p, 1 / 60); old.x = 999; old.axis.x = 999;
  const next = candidateOrbit(p, 1 / 60);
  assert.notEqual(next, old); assert.notEqual(next.axis, old.axis); assert.deepEqual(next, oldOrbit(p, 1 / 60));
});
test('actual native orbit delta retains every position bit at 30/60/120 Hz through changing axes and ghosts', () => {
  for (const hz of [30, 60, 120]) for (const index of [0, 1, 2]) for (const ghost of [false, true]) {
    const a = projectile({ s3VolleyIndex: index, ghost }), b = projectile({ s3VolleyIndex: index, ghost });
    for (let frame = 0; frame < hz * 3; frame++) {
      a.age = b.age = frame / hz;
      a.vel.set(Math.sin(frame / hz) * 2, -(frame - hz / 4) * .013, 67.5); b.vel.copy(a.vel);
      assert.equal(candidateDelta(null, b, 1 / hz), oldDelta(null, a, 1 / hz));
      assert.deepEqual(snapshot(b), snapshot(a));
    }
  }
});
test('native zero-time/identity gates, axis thresholds, signed zero, non-finite values and live tuning stay exact', () => {
  for (const value of [0, -0, 1e-6, -1e-6, 1, -1, Infinity, -Infinity, NaN]) for (const axis of [0, 1, 2]) {
    const xyz = [0, -0, 0]; xyz[axis] = value;
    for (const age of [undefined, 0, -0, 1 / 60, 10 / 60, -1, Infinity, NaN]) {
      deltaCompare({ age, s3Yaw: value, vel: velocity(...xyz), s3VolleyIndex: axis }, 1 / 60);
    }
  }
  for (const dt of [0, -0, -1, NaN, undefined, Infinity, 1 / 30, 1 / 120]) {
    deltaCompare({}, dt); deltaCompare({ wid: 'shooter' }, dt);
    assert.equal(candidateDelta(null, null, dt), oldDelta(null, null, dt));
  }
  const configs = [...new Set([calibration.orbit, oldCalibration.orbit])], saved = configs.map(o => ({ ...o }));
  try {
    for (const config of configs) Object.assign(config, { transitionFrames: 0, startRadius: .2, endRadius: 2.3, turnRate: -1.7, lobePhase: .3 });
    deltaCompare({ age: .6, vel: velocity(3, -4, 5), s3VolleyIndex: 2 }, 1 / 120);
  } finally { configs.forEach((o, i) => Object.assign(o, saved[i])); }
});
test('native stable-axis step uses two normalizations instead of four; trig and velocity observations are unchanged', () => {
  const a = projectile(), b = projectile(); let oldLength = 0, newLength = 0;
  const oldSq = a.vel.lengthSq, newSq = b.vel.lengthSq;
  a.vel.lengthSq = function () { oldLength++; return oldSq.call(this); };
  b.vel.lengthSq = function () { newLength++; return newSq.call(this); };
  const before = mathCounts(() => oldDelta(null, a, 1 / 60)), after = mathCounts(() => candidateDelta(null, b, 1 / 60));
  assert.deepEqual(snapshot(b), snapshot(a)); assert.equal(after.value, before.value);
  assert.equal(oldLength, 2); assert.equal(newLength, 2);
  assert.deepEqual(before.count, { hypot: 4, sin: 2, cos: 2 }); assert.deepEqual(after.count, { hypot: 2, sin: 2, cos: 2 });
  console.log(JSON.stringify({ kind: 'trizooka-native-orbit-work', before: before.count, after: after.count, velocityReads: [oldLength, newLength], provenance }));
});
test('reentrant custom velocity observation uses a separate basis when its axis changes between samples', () => {
  const prepare = () => {
    const p = projectile(), sq = p.vel.lengthSq; let samples = 0;
    p.vel.lengthSq = function () { if (++samples === 2) this.x = 9; return sq.call(this); };
    return p;
  };
  const a = prepare(), b = prepare();
  const before = mathCounts(() => oldDelta(null, a, 1 / 60)), after = mathCounts(() => candidateDelta(null, b, 1 / 60));
  assert.deepEqual(snapshot(b), snapshot(a)); assert.deepEqual(after.count, before.count);
});
test('native property observation order and returned control values match the original delta', () => {
  const prepare = () => {
    const p = projectile(), events = [];
    return { events, p: new Proxy(p, { get(target, key, receiver) { events.push(String(key)); return Reflect.get(target, key, receiver); } }) };
  };
  const a = prepare(), b = prepare(); const before = oldDelta(null, a.p, 1 / 60), after = candidateDelta(null, b.p, 1 / 60);
  assert.equal(after, before); assert.deepEqual(b.events, a.events); assert.deepEqual(snapshot(b.p), snapshot(a.p));
});
test('custom non-numeric axis components preserve every original numeric coercion', () => {
  const prepare = () => {
    const p = projectile(); let calls = 0;
    p.vel = { x: { valueOf() { return ++calls % 2 ? 2 : 3; } }, y: -3, z: 67.5, lengthSq: () => 5000 };
    return { p, calls: () => calls };
  };
  const a = prepare(), b = prepare();
  assert.equal(candidateDelta(null, b.p, 1 / 60), oldDelta(null, a.p, 1 / 60));
  assert.deepEqual(b.p.pos.toArray(), a.p.pos.toArray()); assert.equal(b.calls(), a.calls());
});
if (process.env.BENCH_TRIZOOKA_ORBIT === '1') test('serial native orbit delta microbenchmark', () => {
  assert.equal(provenance.beforeMode, 'paired-actual-modules', 'timing requires KITS_TRIZOOKA_BEFORE_MODULE to avoid factory-vs-emitted comparisons');
  const before = projectile(), after = projectile(), samples = { before: [], after: [] }; let sink = 0;
  const run = (fn, p) => { for (let i = 0; i < 200_000; i++) {
    p.age = (i % 300) / 60; p.pos.set(1, 2, 3); p.vel.set((i % 31 - 15) / 20, -(i % 100) / 100, 67.5);
    fn(null, p, 1 / 60); sink += p.pos.x + p.pos.y + p.pos.z;
  } };
  for (let i = 0; i < 5; i++) { run(oldDelta, before); run(candidateDelta, after); }
  for (let i = 0; i < 9; i++) for (const name of (i % 2 ? ['after', 'before'] : ['before', 'after'])) {
    const start = performance.now(); run(name === 'before' ? oldDelta : candidateDelta, name === 'before' ? before : after);
    samples[name].push(performance.now() - start);
  }
  assert.ok(Number.isFinite(sink)); assert.deepEqual(snapshot(after), snapshot(before));
  const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  console.log(JSON.stringify({ kind: 'trizooka-native-orbit-serial-cpu', callsPerRun: 200_000, repeats: 9, samples,
    median: { before: median(samples.before), after: median(samples.after) }, sink, provenance,
    scope: 'Complete production native orbit-delta CPU timing with real Vector3 inputs; no GPU or device-FPS claim.' }));
});
