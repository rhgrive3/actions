import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// These are real module imports, not a replacement implementation. Offline
// receiver imports must not eagerly demand an encoder they never use. Real
// browsers and all mandatory-online VM sessions provide TextEncoder.
async function graph({ eager = false, TextEncoder: Encoder } = {}) {
  const globals = { crypto: globalThis.crypto };
  if (Encoder) globals.TextEncoder = Encoder;
  const context = vm.createContext(globals);
  const guard = new vm.SourceTextModule(fs.readFileSync(new URL('../snapshot-guard.mjs', import.meta.url), 'utf8'), { context });
  const utf8 = new vm.SourceTextModule(fs.readFileSync(new URL('../utf8-length.mjs', import.meta.url), 'utf8'), { context });
  let source = fs.readFileSync(new URL('../owner-clock.mjs', import.meta.url), 'utf8');
  if (eager) source = source.replace('let encoder;', 'const encoder = new TextEncoder();');
  const module = new vm.SourceTextModule(source, { context });
  await module.link(specifier => specifier === './utf8-length.mjs' ? utf8 : guard); await module.evaluate(); return module.namespace;
}

test('offline module import works without TextEncoder; exact eager declaration reproduces import failure', async () => {
  await assert.rejects(graph({ eager: true }), /TextEncoder is not defined/);
  const actual = await graph();
  assert.equal(actual.OWNER_CLOCK_VERSION, 1);
  assert.equal(actual.validOwnerClockTick({ s: {} }, 'peer', { ts: 10 }, 10), true, 'offline/custom legacy guard remains operational');
});

test('mandatory online queue still lazily uses real UTF-8 byte length and fixed queue budget', async () => {
  let constructions = 0, calls = 0;
  class ObservedEncoder extends TextEncoder {
    constructor() { super(); constructions++; }
    encode(value) { calls++; return super.encode(value); }
  }
  const actual = await graph({ TextEncoder: ObservedEncoder });
  assert.equal(constructions, 0);
  const nm = { myId: 'me', cfg: { id: 'match' }, match: {}, peers: new Map(),
    s: { ownerClockVersion: 1, _members: new Map([['me', 'me'], ['peer', 'peer']]), tr: { sendTo() { return true; } } } };
  actual.beginOwnerClock(nm, 10);
  const packet = { k: 't', oc: 1, ocm: 'match', ts: 20, payload: 'あ' };
  assert.equal(actual.handleOwnerClockMessage(nm, 'peer', packet, 10), true);
  assert.equal(constructions, 0); assert.equal(calls, 0, 'short UTF-8 packet needs no encoder allocation');
  assert.equal(actual.ownerClockStatus(nm, 'peer').pendingBytes, new TextEncoder().encode(JSON.stringify(packet)).byteLength);
  const large = { ...packet, payload: 'あ'.repeat(actual.OWNER_CLOCK_PENDING_BYTES) };
  actual.handleOwnerClockMessage(nm, 'peer', large, 10);
  assert.equal(actual.ownerClockStatus(nm, 'peer').pendingPackets, 1);
  assert.equal(actual.ownerClockStatus(nm, 'peer').dropped, 1);
  assert.equal(constructions, 1); assert.equal(calls, 1, 'large packets retain the native encoder');
});
