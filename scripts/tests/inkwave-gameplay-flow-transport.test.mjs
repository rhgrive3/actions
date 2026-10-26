import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../check-inkwave-gameplay-resources.mjs', import.meta.url), 'utf8');

// Extract the actual evaluate call, including its callback and arguments. Both
// expression callbacks and async block callbacks must reach the same test.
function evaluationFor(method) {
  const operation = source.indexOf('__inkwave.' + method + '(');
  assert.notEqual(operation, -1, method + ' action present');
  const begin = source.lastIndexOf('page.evaluate(', operation);
  assert.notEqual(begin, -1, method + ' evaluate owner present');
  let depth = 1, quote = null;
  for (let at = begin + 'page.evaluate('.length; at < source.length; at++) {
    const ch = source[at];
    if (quote) {
      if (ch === '\\') at++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')' && --depth === 0) return source.slice(begin, at + 1);
  }
  throw Error('Unterminated evaluate for ' + method);
}

for (const method of ['startMatch', 'quitToMenu']) test(method + ' awaits native completion without serializing its Match result', async () => {
  let release, completed = false, reads = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const cyclic = {}; cyclic.self = cyclic;
  const match = new Proxy(cyclic, { ownKeys() { reads++; throw Error('Match graph must stay in the page'); } });
  const calls = [];
  const context = vm.createContext({ mapId: 'halyard', __inkwave: {
    async [method](...args) { calls.push(args); await gate; completed = true; return match; },
  }, page: {
    async evaluate(callback, argument) {
      const value = await callback(argument);
      // Model the evaluation boundary: any returned graph is inspected by the
      // transport. Returning this Match would traverse its scene/typed arrays.
      if (value && typeof value === 'object') Object.keys(value);
      return value;
    },
  } });
  const result = vm.runInContext(evaluationFor(method), context);
  await Promise.resolve();
  assert.equal(calls.length, 1);
  assert.equal(completed, false, 'operation is still pending');
  release();
  assert.equal(await result, undefined, 'native Match result stays inside page');
  assert.equal(completed, true, 'evaluation waits for completion');
  assert.equal(reads, 0, 'no Match enumeration at transport boundary');
  if (method === 'startMatch') assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), [{ mapId: 'halyard', difficulty: 'normal', duration: 180 }]);
  else assert.deepEqual(calls[0], []);
});
