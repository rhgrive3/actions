import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync(new URL('../../.github/workflows/cxx-openttd-projection-20260924.yml', import.meta.url), 'utf8');
const start = workflow.indexOf('          const rawSymbols =');
const end = workflow.indexOf('          const sizeByAddress =', start);
assert.ok(start > 0 && end > start);
// Execute the actual workflow setup. SymbolIndex's address contract rejects the
// undefined ELF symbols that crashed job 121571586772 before the probe ran.
const setup = Function('image', 'SymbolIndex', workflow.slice(start, end) + '\nreturn symbols;');
class AddressIndex {
  constructor(input) {
    for (const address of input.addrs) assert.notEqual(address == null, true);
    for (const values of Object.values(input)) assert.equal(values.length, input.addrs.length);
    this.input = input;
  }
}
test('historical external diagnostic has an explicit manual entrypoint', () => {
  const events = workflow.slice(workflow.indexOf('on:\n'), workflow.indexOf('jobs:\n'));
  assert.match(events, /^on:\n  workflow_dispatch:\n/);
  assert.doesNotMatch(events, /^  (?:push|pull_request):/m);
  assert.match(workflow, /ref: fix\/cxx-output-projection-member-types-20260924/);
  assert.match(workflow, /if \(!typedHit\) process.exitCode = 3/);
});
test('real probe setup excludes addressless symbols while preserving zero, order and aligned metadata', () => {
  const rows = [{name:'undefined', address:null}, {name:'missing'}, {name:'zero', address:0n}, {name:'method', address:42n}];
  const before = structuredClone(rows);
  assert.deepEqual(setup({symbols:rows}, AddressIndex).input, {
    addrs:[0n,42n], names:['zero','method'], kinds:[0,0], flags:[0,0],
  });
  assert.deepEqual(rows, before);
  assert.deepEqual(setup({}, AddressIndex).input.addrs, []);
});
