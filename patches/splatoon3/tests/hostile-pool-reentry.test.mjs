import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../runtime/all-subs.mjs', import.meta.url), 'utf8');
const extract = (name) => {
  const start = source.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name + ' exists');
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error('unbalanced function: ' + name);
};
const { hostileActors, releaseHostileActors } = new Function(
  extract('hostileActors') + '\n' + extract('releaseHostileActors') +
  '\nreturn { hostileActors, releaseHostileActors };'
)();

function fixture() {
  const owner = { team: 0, alive: true, pos: { x: 0 } };
  const enemy1 = { team: 1, alive: true, pos: { x: 1 } };
  const enemy2 = { team: 1, alive: true, pos: { x: 2 } };
  const teammate = { team: 0, alive: true, pos: { x: 3 } };
  const dead = { team: 1, alive: false, pos: { x: 4 } };
  return { api: { G: { actors: [owner, enemy1, teammate, dead, enemy2] } }, owner, enemy1, enemy2, teammate };
}

test('all ten sub-weapon enemy lookups release their borrowed array even when hooks throw', () => {
  const acquired = (source.match(/\bhostileActors\(api,\s*[^)]+\)/g) || []).length - 1; // exclude declaration
  const released = (source.match(/releaseHostileActors\(api\)/g) || []).length - 1; // exclude declaration
  assert.equal(acquired, 10, 'every current sub-weapon acquisition, including drop.owner, is counted');
  assert.equal(released, acquired, 'every acquisition has its own try/finally release');
  assert.equal((source.match(/for \(const target of __iwHostiles\)/g) || []).length, 6);
  assert.match(source, /finally \{ releaseHostileActors\(api\); \}/);
});

test('Torpedo splash returns its drop-owned enemy buffer when a hit callback throws', () => {
  const burst = new Function('hostileActors', 'releaseHostileActors', 'localOwner', 'surfacePaint', 'damageSubObjectsInRadius',
    extract('burstTorpedoSplash') + '\nreturn burstTorpedoSplash;'
  )(hostileActors, releaseHostileActors, () => true, () => {}, () => assert.fail('hit must throw first'));
  const { api, owner } = fixture(), failure = new Error('Torpedo splash hit callback');
  api.THREE = { Vector3: class { copy(p) { Object.assign(this, p); return this; } distanceTo() { return 0; } } };
  let calls = 0;
  api.G.projectiles = { applyHit() { calls++; throw failure; } };
  const drop = { owner, team: 0, kind: 'burst', ghost: false, source: { spec: { splashRadius: 10, splashDamage: 12 } } };
  assert.throws(() => burst(api, drop, {}), error => error === failure);
  assert.equal(calls, 1);
  assert.equal(api._allSubHostileDepth, 0);
  assert.deepEqual(api._allSubHostilePool.map(a => a.length), [0]);
});

test('nested hit callbacks cannot corrupt the outer enemy snapshot', () => {
  const { api, owner, enemy1, enemy2, teammate } = fixture();
  const outer = hostileActors(api, owner);
  try {
    assert.deepEqual(outer, [enemy1, enemy2]);
    const nested = hostileActors(api, enemy1);
    try {
      assert.deepEqual(nested, [owner, teammate]);
      assert.notStrictEqual(nested, outer);
      assert.deepEqual(outer, [enemy1, enemy2], 'outer iterator remains unchanged during nested damage');
    } finally {
      releaseHostileActors(api);
    }
    assert.deepEqual(outer, [enemy1, enemy2], 'outer retains every originally selected target');
  } finally {
    releaseHostileActors(api);
  }
  assert.equal(api._allSubHostileDepth, 0);
  assert.equal(api._allSubHostilePool[0].length, 0);
  assert.equal(api._allSubHostilePool[1].length, 0);
  const reused = hostileActors(api, owner);
  try {
    assert.strictEqual(reused, outer, 'outer buffer is reused without a new array');
    assert.deepEqual(reused, [enemy1, enemy2]);
  } finally {
    releaseHostileActors(api);
  }
});

test('try/finally returns the nested pool to a clean state after an exception', () => {
  const { api, owner } = fixture();
  assert.throws(() => {
    const outer = hostileActors(api, owner);
    try {
      const inner = hostileActors(api, owner);
      try {
        assert.equal(inner.length, outer.length);
        throw new Error('synchronous nested hit');
      } finally { releaseHostileActors(api); }
    } finally { releaseHostileActors(api); }
  }, /synchronous nested hit/);
  assert.equal(api._allSubHostileDepth, 0);
  assert.deepEqual(api._allSubHostilePool.map(a => a.length), [0, 0]);
});


test('residual Line Marker releases its borrowed targets when collision hooks throw', () => {
  const updateAngleLine = new Function('hostileActors', 'releaseHostileActors', 'ownerLife',
    extract('updateAngleLine') + '\nreturn updateAngleLine;'
  )(hostileActors, releaseHostileActors, () => 0);
  const { api, owner } = fixture();
  api.THREE = { Vector3: class { copy(p) { Object.assign(this, p); return this; } } };
  api.PLAYER = { height: 2, squidHeight: 1, radius: .5 };
  const failure = new Error('residual line collision hook');
  let calls = 0;
  api.Physics = { segmentCapsuleDist() { calls++; throw failure; } };
  const object = { owner, age: 0, ghost: false, seenMarks: new Map(),
    lineSegments: [[{}, {}]], spec: { collisionRadius: .25 }, lineEndsAtAge: 10 };
  assert.throws(() => updateAngleLine(api, {}, object, 1 / 60), error => error === failure);
  assert.equal(calls, 1, 'the new residual-line lookup reaches its collision hook');
  assert.equal(api._allSubHostileDepth, 0);
  assert.deepEqual(api._allSubHostilePool.map(a => a.length), [0]);
  const reused = hostileActors(api, owner);
  try {
    assert.strictEqual(reused, api._allSubHostilePool[0]);
    assert.equal(reused.length, 2, 'the released buffer remains reusable');
  } finally { releaseHostileActors(api); }
  assert.equal(api._allSubHostileDepth, 0);
});
