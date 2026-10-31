import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';

const raw = fs.readFileSync(new URL('../../../inkwave-public/src/net/netmatch.js', import.meta.url), 'utf8');
const composed = adaptBuildSource('src/net/netmatch.js', raw);
const fields = ['hp', 'phase', 'f', 'mv', 'anim', 'turn', 'fl', 'wk', 'killer', 'maxHp', 'move'];
function copyBody(source) {
  const method = source.indexOf('  _sampleBoss(dt)');
  const start = source.indexOf('    const s0 = S.s0, s1 = S.s1;', method);
  const end = source.indexOf('    const cr = S.crabs || (S.crabs = []);', start);
  assert.ok(method >= 0 && start > method && end > start, 'extract the actual guest boss copy block');
  return source.slice(start, end);
}
const beforeBody = copyBody(raw), afterBody = copyBody(composed);
assert.match(beforeBody, /for \(const k of \[/);
assert.doesNotMatch(afterBody, /\bfor\s*\(/);
const before = new Function('S', '"use strict";\n' + beforeBody);
const after = new Function('S', '"use strict";\n' + afterBody);

function execute(fn, values, {missing = [], nextMove, throwGet, throwSet, throwNext = 0} = {}) {
  const trace = [], source = {}, result = {untouched: 'retained'}, failure = new Error('expected fixture failure');
  for (let i = 0; i < fields.length; i++) {
    const key = fields[i];
    result[key] = `old:${key}`;
    if (!missing.includes(key)) Object.defineProperty(source, key, {get() {
      trace.push(['get', key]);
      if (key === throwGet) throw failure;
      return values[i % values.length];
    }});
  }
  let nextReads = 0;
  const next = nextMove === null ? null : Object.defineProperty({}, 'move', {get() {
    trace.push(['next', ++nextReads]);
    if (nextReads === throwNext) throw failure;
    return nextMove;
  }});
  const state = new Proxy(result, {
    get(target, key) { if (key === 's0') return source; if (key === 's1') return next; return target[key]; },
    set(target, key, value) {
      trace.push(['set', key, value]);
      if (key === throwSet) throw failure;
      target[key] = value;
      return true;
    },
  });
  let thrown = false;
  try { fn(state); } catch (error) { assert.equal(error, failure); thrown = true; }
  return {result, trace, thrown};
}

test('actual guest boss copy preserves value identity, undefined writes and successor move precedence', () => {
  const reference = {move: 'same object'}, array = [1, 2];
  const values = [undefined, null, NaN, Infinity, -Infinity, -0, 0, false, true, reference, array];
  for (let offset = 0; offset < values.length; offset++) {
    const row = values.slice(offset).concat(values.slice(0, offset));
    for (const nextMove of [null, undefined, false, 0, '', reference, array]) {
      for (const missing of [[], fields, ['hp', 'killer', 'move']]) {
        assert.deepEqual(execute(after, row, {nextMove, missing}), execute(before, row, {nextMove, missing}));
      }
    }
  }
});

test('actual guest boss copy keeps getter/setter order and partial state at each exceptional field', () => {
  const values = fields.map((key, index) => ({key, index}));
  const nextMove = {next: true};
  const normal = execute(after, values, {nextMove});
  assert.deepEqual(normal.trace.filter(row => row[0] === 'get').map(row => row[1]), fields);
  for (const key of fields) {
    for (const options of [{throwGet: key}, {throwSet: key}]) {
      const expected = execute(before, values, {nextMove, ...options});
      assert.equal(expected.thrown, true);
      assert.deepEqual(execute(after, values, {nextMove, ...options}), expected);
    }
  }
  for (const throwNext of [1, 2]) {
    const expected = execute(before, values, {nextMove, throwNext});
    assert.equal(expected.thrown, true);
    assert.deepEqual(execute(after, values, {nextMove, throwNext}), expected);
  }
});
