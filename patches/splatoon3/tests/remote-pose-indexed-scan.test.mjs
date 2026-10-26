// Semantic oracle: the exact fe98b0a validRemoteActorPose, with only its name
// changed below. No browser, fixture, caching or trusted-sample shortcut.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validRemoteActorPose } from '../../network-replication/snapshot-guard.mjs';
const SNAPSHOT_FIELDS_5 = Object.freeze(['x', 'y', 'z', 'vx', 'vy', 'vz', 'yaw', 'aimYaw', 'aimPitch', 'hp', 'ink', 'sp', 'ch', 'turf', 'lock']);
const SNAPSHOT_FIELDS_6 = Object.freeze(['x', 'y', 'z']);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const bounded = (value, min, max) => finite(value) && value >= min && value <= max;
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
function frozenValidRemoteActorPose(sample, correction) {
  if (!sample || !correction) return false;
  for (const key of SNAPSHOT_FIELDS_5)
    if (!finite(sample[key])) return false;
  if (!integer(sample.f, 0, 0x7fffffff)) return false;
  if (!bounded(sample.x + correction.x, -1e6, 1e6)
      || !bounded(sample.y + correction.y, -1e6, 1e6)
      || !bounded(sample.z + correction.z, -1e6, 1e6)) return false;
  for (const key of SNAPSHOT_FIELDS_6) if (!finite(correction[key])) return false;
  return true;
}
const pose = () => Object.assign(Object.fromEntries(SNAPSHOT_FIELDS_5.map(key => [key, 0])), { f: 1 });
const offset = () => ({ x: 0, y: 0, z: 0 });
function same(sample, correction, expected, label) {
  assert.equal(frozenValidRemoteActorPose(sample, correction), expected, 'frozen oracle: ' + label);
  assert.equal(validRemoteActorPose(sample, correction), expected, label);
}
function observe(fn, create) {
  const trace = [], [sample, correction] = create(trace);
  try { return { result: fn(sample, correction), trace }; }
  catch (error) { return { error: [error.name, error.message], trace }; }
}
function sameObserved(create, label) {
  const expected = observe(frozenValidRemoteActorPose, create);
  assert.deepEqual(observe(validRemoteActorPose, create), expected, label);
  return expected;
}
function traced({ sample = {}, correction = {}, throwAt = -1 } = {}) {
  return trace => {
    let count = 0;
    const wrap = (value, prefix) => new Proxy(value, { get(target, key) {
      trace.push(prefix + '.' + String(key));
      if (count++ === throwAt) throw new RangeError('read ' + throwAt);
      return Reflect.get(target, key);
    } });
    return [wrap({ ...pose(), ...sample }, 's'), wrap({ ...offset(), ...correction }, 'c')];
  };
}

test('remote pose preserves valid finite scalars without adding non-position bounds', () => {
  same(pose(), offset(), true, 'zero pose');
  for (const key of SNAPSHOT_FIELDS_5) {
    for (const value of [0, -0, Number.MIN_VALUE, -Number.MIN_VALUE, 1, -1]) {
      same({ ...pose(), [key]: value }, offset(), true, key + '=' + value);
    }
  }
  for (const key of SNAPSHOT_FIELDS_5.slice(3)) {
    for (const value of [Number.MAX_VALUE, -Number.MAX_VALUE, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER]) {
      same({ ...pose(), [key]: value }, offset(), true, 'unbounded finite ' + key);
    }
  }
});

test('remote pose preserves nullish, falsy and truthy primitive input rejection', () => {
  for (const value of [undefined, null, false, 0, -0, NaN, '', true, 1, 'pose', 1n, Symbol('pose'), [], {}]) {
    same(value, offset(), false, 'sample input');
    same(pose(), value, false, 'correction input');
  }
});

test('remote pose rejects every invalid or missing sample field in frozen order', () => {
  const invalid = [undefined, null, NaN, Infinity, -Infinity, '0', '', true, false, 0n, Symbol('x'), {}, [], new Number(0)];
  for (const key of SNAPSHOT_FIELDS_5) {
    for (const value of invalid) same({ ...pose(), [key]: value }, offset(), false, 'invalid ' + key);
    const missing = pose(); delete missing[key]; same(missing, offset(), false, 'missing ' + key);
  }
});

test('remote pose preserves exact signed31 safe-integer flag limits', () => {
  for (const f of [0, -0, 1, 1 << 27, 1 << 28, 0x7ffffffe, 0x7fffffff]) {
    same({ ...pose(), f }, offset(), true, 'accepted flags ' + f);
  }
  for (const f of [-1, -Number.MIN_VALUE, .5, 0x7fffffff + .5, 0x80000000, 0xffffffff,
    Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, -Infinity, '1', null, undefined, true, 1n]) {
    same({ ...pose(), f }, offset(), false, 'rejected flags ' + String(f));
  }
});

test('remote pose retains final correction finite checks including coercible values', () => {
  for (const key of SNAPSHOT_FIELDS_6) {
    for (const value of [undefined, null, NaN, Infinity, -Infinity, '0', '', true, false, {}, [], new Number(0)]) {
      same(pose(), { ...offset(), [key]: value }, false, 'invalid correction ' + key);
    }
    const missing = offset(); delete missing[key]; same(pose(), missing, false, 'missing correction ' + key);
    same({ ...pose(), [key]: Number.MAX_VALUE }, { ...offset(), [key]: -Number.MAX_VALUE }, true, 'large finite cancellation ' + key);
    same({ ...pose(), [key]: Number.MAX_VALUE }, { ...offset(), [key]: Number.MAX_VALUE }, false, 'overflow ' + key);
  }
});

test('remote pose preserves inclusive corrected-coordinate bounds and adjacent doubles', () => {
  const ulp = 2 ** -33;
  for (const key of SNAPSHOT_FIELDS_6) {
    for (const [value, accepted] of [[-1e6 - ulp, false], [-1e6, true], [-1e6 + ulp, true],
      [1e6 - ulp, true], [1e6, true], [1e6 + ulp, false]]) {
      same({ ...pose(), [key]: value }, offset(), accepted, 'sample bound ' + key + '=' + value);
      same(pose(), { ...offset(), [key]: value }, accepted, 'correction bound ' + key + '=' + value);
    }
    same({ ...pose(), [key]: 1e6 + 1 }, { ...offset(), [key]: -1 }, true, 'corrected upper boundary ' + key);
    same({ ...pose(), [key]: -1e6 - 1 }, { ...offset(), [key]: 1 }, true, 'corrected lower boundary ' + key);
  }
});

test('remote pose preserves successful Proxy field access order and repeated coordinate reads', () => {
  const observed = sameObserved(traced(), 'all successful reads');
  assert.equal(observed.result, true);
  assert.deepEqual(observed.trace, [
    ...SNAPSHOT_FIELDS_5.map(key => 's.' + key), 's.f',
    's.x', 'c.x', 's.y', 'c.y', 's.z', 'c.z', 'c.x', 'c.y', 'c.z',
  ]);
});

test('remote pose preserves early return and every getter exception position', () => {
  for (const key of SNAPSHOT_FIELDS_5) {
    const result = sameObserved(traced({ sample: { [key]: NaN } }), 'sample early return ' + key);
    assert.equal(result.result, false);
    assert.equal(result.trace.at(-1), 's.' + key);
  }
  const flags = sameObserved(traced({ sample: { f: -1 } }), 'flag early return');
  assert.equal(flags.trace.at(-1), 's.f');
  for (const key of SNAPSHOT_FIELDS_6) {
    const result = sameObserved(traced({ correction: { [key]: 1e6 + 1 } }), 'bound early return ' + key);
    assert.equal(result.result, false);
    assert.equal(result.trace.at(-1), 'c.' + key);
  }
  const totalReads = observe(frozenValidRemoteActorPose, traced()).trace.length;
  for (let throwAt = 0; throwAt < totalReads; throwAt++) {
    const result = sameObserved(traced({ throwAt }), 'getter throw at ' + throwAt);
    assert.deepEqual(result.error, ['RangeError', 'read ' + throwAt]);
    assert.equal(result.trace.length, throwAt + 1);
  }
});

test('remote pose keeps correction coercion and stateful getters after original bounds order', () => {
  for (const key of SNAPSHOT_FIELDS_6) {
    sameObserved(trace => {
      const correction = offset();
      correction[key] = { valueOf() { trace.push('valueOf.' + key); return 0; } };
      return [pose(), correction];
    }, 'coercion before finite ' + key);
    sameObserved(trace => [pose(), { ...offset(), [key]: Symbol('correction') }], 'arithmetic throw ' + key);
    sameObserved(trace => {
      let reads = 0;
      const correction = offset();
      Object.defineProperty(correction, key, { get() { trace.push(key + ':' + reads); return reads++ ? NaN : 0; } });
      return [pose(), correction];
    }, 'second correction read rejected ' + key);
    sameObserved(trace => {
      let reads = 0;
      const sample = pose();
      Object.defineProperty(sample, key, { get() { trace.push(key + ':' + reads); return reads++ ? 1e6 + 1 : 0; } });
      return [sample, offset()];
    }, 'second position read rejected ' + key);
  }
  const result = sameObserved(trace => {
    const correction = offset();
    Object.defineProperty(correction, 'y', { get() { trace.push('y getter'); throw new Error('must remain unread'); } });
    return [{ ...pose(), x: 1e6 + 1 }, correction];
  }, 'x bounds return before later correction scan');
  assert.deepEqual(result, { result: false, trace: [] });
});

test('remote pose matches frozen oracle over a deterministic mixed-scalar corpus', t => {
  let seed = 0x1872fe98;
  const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
  const values = [-1e6 - 2 ** -33, -1e6, -0, 0, Number.MIN_VALUE, .5, 1e6, 1e6 + 2 ** -33,
    Number.MAX_VALUE, -Number.MAX_VALUE, NaN, Infinity, undefined, null, '0', true];
  for (let index = 0; index < 4096; index++) {
    const sample = pose(), correction = offset();
    for (let change = 0; change < 1 + index % 4; change++) {
      const choose = next() % 19, value = values[(next() >>> 8) % values.length];
      if (choose < 15) sample[SNAPSHOT_FIELDS_5[choose]] = value;
      else if (choose === 15) sample.f = value;
      else correction[SNAPSHOT_FIELDS_6[choose - 16]] = value;
    }
    assert.equal(validRemoteActorPose(sample, correction), frozenValidRemoteActorPose(sample, correction), 'corpus ' + index);
  }
  t.diagnostic('4096 deterministic mixed-scalar cases matched the exact frozen oracle');
});
