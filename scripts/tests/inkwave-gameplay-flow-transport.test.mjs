import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = [
  '../check-inkwave-gameplay-resources.mjs',
  '../lib/inkwave-projectile-menu-start.mjs',
].map(file => fs.readFileSync(new URL(file, import.meta.url), 'utf8')).join('\n');

// Extract the actual evaluate call, including its callback and arguments. Both
// expression callbacks and async block callbacks must reach the same test.
function evaluationFor(method) {
  const operation = source.indexOf('__inkwave.' + method + '(', source.indexOf('page.evaluate('));
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

test('gameplay START unlocks audio from a trusted keyboard gesture and launches through native menu controls',()=>{
  // The app initializes Web Audio in its real keydown handler. Keep this test
  // on Chromium's trusted input path instead of calling startMatch inside
  // page.evaluate, which has no user activation and leaves AudioContext asleep.
  // Navigation now lives in the shared native-menu helper: it drives the
  // production menu with Playwright locator clicks and keyboard input.
  assert.match(source,/await startProjectileThroughMenu\(page,/);
  assert.match(source,/page\.keyboard\.press\('Enter'\)/);
  assert.match(source,/await click\('\.iw-main \[data-id="play"\]'\);/);
  assert.match(source,/mode-turf/);
  assert.match(source,/click\('\.iw-setup \[data-id="start"\]\.iw-btn--start'\)/);
  assert.doesNotMatch(source,/page\.evaluate\(async\(\{mapId\}\)=>\{await __inkwave\.startMatch/);
});

test('quitToMenu awaits native completion without serializing its Match result', async () => {
  let release, completed = false, reads = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const cyclic = {}; cyclic.self = cyclic;
  const match = new Proxy(cyclic, { ownKeys() { reads++; throw Error('Match graph must stay in the page'); } });
  const calls = [];
  const context = vm.createContext({ __inkwave: {
    async quitToMenu(...args) { calls.push(args); await gate; completed = true; return match; },
  }, page: {
    async evaluate(callback, argument) {
      const value = await callback(argument);
      // Model the evaluation boundary: any returned graph is inspected by the
      // transport. Returning this Match would traverse its scene/typed arrays.
      if (value && typeof value === 'object') Object.keys(value);
      return value;
    },
  } });
  const result = vm.runInContext(evaluationFor('quitToMenu'), context);
  await Promise.resolve();
  assert.equal(calls.length, 1);
  assert.equal(completed, false, 'operation is still pending');
  release();
  assert.equal(await result, undefined, 'native Match result stays inside page');
  assert.equal(completed, true, 'evaluation waits for completion');
  assert.equal(reads, 0, 'no Match enumeration at transport boundary');
  assert.deepEqual(calls[0], []);
});
