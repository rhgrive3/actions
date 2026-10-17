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

test('all eight sub-weapon enemy lookups release their borrowed array even when hooks throw', () => {
  assert.equal((source.match(/hostileActors\(api,(mine|object)\.owner\)/g) || []).length, 8);
  assert.equal((source.match(/releaseHostileActors\(api\)/g) || []).length, 9);
  assert.equal((source.match(/for \(const target of __iwHostiles\)/g) || []).length, 7);
  assert.match(source, /finally \{ releaseHostileActors\(api\); \}/);
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
