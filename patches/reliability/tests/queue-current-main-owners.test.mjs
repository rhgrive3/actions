import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptQueueNetworkUi } from '../queue-network-ui-adapter.mjs';

// Observe the queue owner's input while executing the full production pipeline.
// The observer calls the real owner so subsequent layers retain their required
// transformations and fail-closed anchors instead of duplicating the pipeline.
const compositionURL = new URL('../../../scripts/inkwave-source-composition.mjs', import.meta.url);
const composition = fs.readFileSync(compositionURL, 'utf8')
  .replace("import { adaptQueueNetworkUi } from '../patches/reliability/queue-network-ui-adapter.mjs';",
    "import { adaptQueueNetworkUi as actualQueueNetworkUi } from '../patches/reliability/queue-network-ui-adapter.mjs'; export const observedQueueInputs = new Map(); const adaptQueueNetworkUi = (rel, code) => { observedQueueInputs.set(rel, code); return actualQueueNetworkUi(rel, code); };")
  .replace(/from '([^']+)'/g, (_match, specifier) => "from '" + new URL(specifier, compositionURL).href + "'");
const observed = await import('data:text/javascript;base64,' + Buffer.from(composition).toString('base64'));
function input(rel) {
  observed.adaptBuildSource(rel, fs.readFileSync(new URL('../../../inkwave-public/' + rel, import.meta.url), 'utf8'));
  return observed.observedQueueInputs.get(rel);
}

test('current main event compaction and the earlier splice owner converge; mixed or drifted owners fail closed', () => {
  const rel = 'src/net/netmatch.js', current = input(rel);
  const owned = '      if (consumed) { p.events.copyWithin(0, consumed); p.events.length -= consumed; }';
  const original = '      if (consumed) p.events.splice(0, consumed);';
  assert.ok(current.includes(owned));
  const output = adaptQueueNetworkUi(rel, current);
  assert.equal(adaptQueueNetworkUi(rel, current.replace(owned, original)), output);
  assert.throws(() => adaptQueueNetworkUi(rel, current + '\n' + original), /prefix owner/);
  assert.throws(() => adaptQueueNetworkUi(rel, current.replace('p.events.length -= consumed;', 'p.events.length -= consumed + 1;')), /prefix owner/);
});

test('Input retains the earlier platform listener owner and rejects unknown or doubled constructors', () => {
  const rel = 'src/core/input.js', current = input(rel), output = adaptQueueNetworkUi(rel, current);
  assert.equal((current.match(/this\._listenPlatform\(/g) || []).length, 10);
  assert.equal((output.match(/this\._listenPlatform\(/g) || []).length, 10);
  assert.match(output, /this\.disposePlatform\?\.\(\);/);
  assert.match(output, /if \(!this\._platformInputDisposed\) this\.mobile\?\.destroy\?\.\(\);/);
  assert.throws(() => adaptQueueNetworkUi(rel, current.replace("this._listenPlatform(window, 'keydown'", "this._listenPlatformDrift(window, 'keydown'")), /constructor listener owner/);
  assert.throws(() => adaptQueueNetworkUi(rel, current + '\n' + current), /constructor listener owner/);
});

test('current main completed voices use the qualified emitter owner and allocation-free safe stopAll', () => {
  const rel = 'src/audio/audio.js', current = input(rel), output = adaptQueueNetworkUi(rel, current);
  assert.match(output, /if \(!list\.length && this\.byName\.get\(emitterKey\) === list\) this\.byName\.delete\(emitterKey\);/);
  assert.match(output, /for \(let i = this\.voices\.length - 1; i >= 0; i--\) this\._steal\(this\.voices\[i\], now\);/);
  assert.doesNotMatch(output, /for \(const vc of \[\.\.\.this\.voices\]\)/);
  assert.throws(() => adaptQueueNetworkUi(rel, current.replace('const owners = this.byName.get(name);', 'const owners = this.byName.get(name + "drift");')), /completed one-shot owner/);
  assert.throws(() => adaptQueueNetworkUi(rel, current.replace('for (const vc of [...this.voices]) this._steal(vc, now);', 'for (const vc of [...this.voices]) this._steal(vc, now + 1);')), /stopAll voice owner/);
});
