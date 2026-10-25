import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RoomDurableObject } from '../src/index.js';

// Preserve the shipped admission epoch and the spawn-exclusion composition.
// The production-composed client epoch is checked by relay-compatibility.test.mjs.
const epochs = ['iw-gameplay-20261023-start-admission-v1', 'iw-gameplay-20261024-spawn-start-admission-v1'];
class Socket {
  constructor() { this.sent = []; this.events = {}; this.bufferedAmount = 0; }
  accept() {}
  send(value) { if (this.failSend) throw Error('failed result delivery'); this.sent.push(value); }
  addEventListener(name, callback) { this.events[name] = callback; }
  close() { if (this.closed) return; this.closed = true; this.events.close?.(); }
  message(value) { this.events.message?.({ data: value }); }
  get welcome() { return this.sent.map(parse).find(value => value?.t === 'welcome'); }
  get id() { return this.welcome.id; }
  get results() { return this.sent.map(parse).filter(value => value?.t === 'start_result'); }
  get messages() { return this.sent.filter(value => value.startsWith('m|')); }
}
function parse(value) { try { return JSON.parse(value); } catch { return null; } }
async function withRoom(compat, run, Room = RoomDurableObject) {
  const savedResponse = globalThis.Response, savedPair = globalThis.WebSocketPair;
  const room = new Room({}, {});
  globalThis.Response = class { constructor(body, options = {}) { this.body = body; Object.assign(this, options); this.status ??= 200; } };
  globalThis.WebSocketPair = class { constructor() { this[0] = new Socket(); this[1] = new Socket(); } };
  try {
    for (const create of [true, false]) {
      const response = await room.fetch({ url: 'https://relay.test/room/BCEFG?v=2&compat=' + compat + (create ? '&create=1' : ''), method: 'GET', headers: new Headers({ Upgrade: 'websocket' }) });
      assert.equal(response.status, 101);
    }
    const [host, guest] = [...room.members.values()].map(member => member.ws);
    assert.equal(host.welcome.compat, compat); assert.equal(guest.welcome.compat, compat);
    const config = (extra = {}) => ({ k: 'start', id: 'epoch-round', proto: 2, compat, host: host.id, roster: [host, guest].map((socket, nid) => ({ nid, owner: socket.id, bot: false, style: null })), ...extra });
    await run({ room, host, guest, config });
  } finally {
    for (const member of [...room.members.values()]) member.ws.close();
    globalThis.Response = savedResponse;
    if (savedPair === undefined) delete globalThis.WebSocketPair; else globalThis.WebSocketPair = savedPair;
  }
}

// Historical source contract, not a claim about currently deployed clients:
// 07a9792142564756189342a2e86d0bc3afe275ed/inkwave-public/src/net/session.js:281-285
// sends lock(true), START, then begins locally without waiting for an ACK.
// Its production-composition relay-compatibility.test.mjs:37-39 asserts that
// behavior. The current queue adapter changes both the ordering and COMPAT.
const legacyEpoch = 'iw-gameplay-20261023-spawn-exclusion-v1';
const currentEpoch = 'iw-gameplay-20261024-spawn-start-admission-v1';
const serverURL = new URL('../src/index.js', import.meta.url);
const serverSource = readFileSync(serverURL, 'utf8');

async function observeStart(Room, compat, lockFirst) {
  let outcome;
  await withRoom(compat, ({ room, host, guest, config }) => {
    assert.equal(room.locked, false);
    let lockAtPeerStart = null;
    const send = guest.send.bind(guest);
    guest.send = value => {
      if (value.startsWith('m|')) lockAtPeerStart = room.locked;
      send(value);
    };
    if (lockFirst) {
      host.message(JSON.stringify({ t: 'lock', v: true }));
      assert.equal(room.locked, true, 'the historical lock frame is applied before START');
    }
    const cfg = config();
    broadcast(host, cfg);
    outcome = {
      locked: room.locked,
      acknowledgments: host.results.map(result => ({ id: result.id, ok: result.ok })),
      peerStarts: guest.messages.length,
      lockAtPeerStart,
      exactPeerPayload: guest.messages[0] === 'm|' + host.id + '|' + JSON.stringify(cfg),
    };
  }, Room);
  return outcome;
}

const legacyOutcome = { locked: true, acknowledgments: [], peerStarts: 1, lockAtPeerStart: true, exactPeerPayload: true };
const currentOutcome = {
  locked: true,
  acknowledgments: [{ id: 'epoch-round', ok: true }],
  peerStarts: 1,
  lockAtPeerStart: true,
  exactPeerPayload: true,
};
async function requireLegacyStart(Room) {
  assert.deepEqual(await observeStart(Room, legacyEpoch, true), legacyOutcome,
    'legacy lock-before-START must forward once without a relay ACK');
}
async function requireCurrentStart(Room) {
  assert.deepEqual(await observeStart(Room, currentEpoch, false), currentOutcome,
    'current START must ACK and atomically lock before forwarding');
}

async function selectorMutant(before, after) {
  assert.equal(serverSource.split(before).length, 2, 'one exact selector mutation anchor');
  const changed = serverSource.replace(before, after);
  // Load only an in-memory mutant. Resolve its unchanged relative imports to
  // the same real helpers used by the production server; no temp checkout,
  // network access, VM flag, installed package, or production-file write.
  const relocated = changed.replace(/from (['"])(\.\.?\/[^'"]+)\1/g,
    (_match, _quote, specifier) => 'from ' + JSON.stringify(new URL(specifier, serverURL).href));
  const module = await import('data:text/javascript;base64,' + Buffer.from(relocated).toString('base64'));
  assert.equal(readFileSync(serverURL, 'utf8'), serverSource, 'production server stays unchanged');
  return module.RoomDurableObject;
}

test('legacy spawn-exclusion lock then START preserves the historical forwarding protocol', async () => {
  await requireLegacyStart(RoomDurableObject);
});

test('semantic control: adding the legacy epoch to strict admission breaks its real ordering', async t => {
  await requireLegacyStart(RoomDurableObject);
  const marker = "  'iw-gameplay-20261024-spawn-start-admission-v1',";
  const Mutant = await selectorMutant(marker, marker + "\n  'iw-gameplay-20261023-spawn-exclusion-v1',");
  await assert.rejects(() => requireLegacyStart(Mutant), error => {
    assert.equal(error.code, 'ERR_ASSERTION');
    assert.match(error.message, /legacy lock-before-START must forward once without a relay ACK/);
    assert.deepEqual(error.actual, {
      locked: true,
      acknowledgments: [{ id: 'epoch-round', ok: false }],
      peerStarts: 0,
      lockAtPeerStart: null,
      exactPeerPayload: false,
    });
    t.diagnostic(JSON.stringify({ mutation: 'legacy-added-to-strict', observedFailure: error.actual }));
    return true;
  });
});

test('semantic control: removing the current strict epoch loses ACK and atomic lock', async t => {
  await requireCurrentStart(RoomDurableObject);
  const Mutant = await selectorMutant("  'iw-gameplay-20261024-spawn-start-admission-v1',\n", '');
  await assert.rejects(() => requireCurrentStart(Mutant), error => {
    assert.equal(error.code, 'ERR_ASSERTION');
    assert.match(error.message, /current START must ACK and atomically lock before forwarding/);
    assert.deepEqual(error.actual, {
      locked: false,
      acknowledgments: [],
      peerStarts: 1,
      lockAtPeerStart: false,
      exactPeerPayload: true,
    });
    t.diagnostic(JSON.stringify({ mutation: 'current-removed-from-strict', observedFailure: error.actual }));
    return true;
  });
});
const broadcast = (socket, config) => socket.message('b|' + JSON.stringify(config));
for (const epoch of epochs) {
  test(epoch + ': actual fetch admits only a matching host START and locks once', async () => {
    await withRoom(epoch, ({ room, host, guest, config }) => {
      const cfg = config(); broadcast(host, cfg);
      assert.deepEqual(host.results, [{ t: 'start_result', id: cfg.id, ok: true }]);
      assert.equal(room.locked, true);
      assert.deepEqual(guest.messages, ['m|' + host.id + '|' + JSON.stringify(cfg)]);
      broadcast(host, cfg);
      assert.deepEqual(host.results.at(-1), { t: 'start_result', id: cfg.id, ok: false });
      assert.equal(guest.messages.length, 1);
    });
  });
  test(epoch + ': mismatch and invalid roster never forward or lock', async () => {
    for (const mutate of [
      c => { c.proto = 99; }, c => { c.proto = '2'; }, c => { delete c.proto; },
      c => { c.compat = 'other-version'; }, c => { delete c.compat; },
      c => { c.host = 'forged-host'; }, c => { c.roster = null; },
      c => { c.roster = []; }, c => { c.roster.pop(); },
      c => { c.roster[1].owner = c.roster[0].owner; },
      c => { c.roster[1].owner = 'absent-owner'; },
      c => { c.roster[1].nid = c.roster[0].nid; },
      c => { c.roster[1].nid = -1; }, c => { c.roster[1].nid = '1'; },
      c => { c.roster[1].bot = 'false'; },
      c => { c.roster.push({ nid: 2, owner: 'forged-host', bot: true }); },
    ]) await withRoom(epoch, ({ room, host, guest, config }) => {
      const cfg = config(); mutate(cfg); broadcast(host, cfg);
      assert.deepEqual(host.results, [{ t: 'start_result', id: cfg.id, ok: false }]);
      assert.equal(room.locked, false); assert.equal(guest.messages.length, 0);
    });
  });
  test(epoch + ': non-host, directed and invalid-ID START cannot bypass admission', async () => {
    await withRoom(epoch, ({ room, host, guest, config }) => {
      const cfg = config(); broadcast(guest, cfg);
      host.message('s|' + guest.id + '|' + JSON.stringify(cfg));
      for (const id of [undefined, '', 1, 'x'.repeat(65)]) broadcast(host, config({ id }));
      const outsider = new Socket(); room._handleMessage(host.id, outsider, 'b|' + JSON.stringify(cfg));
      assert.equal(host.results.length, 0); assert.equal(guest.results.length, 0);
      assert.equal(host.messages.length, 0); assert.equal(guest.messages.length, 0); assert.equal(room.locked, false);
      cfg.roster.push({ nid: 2, owner: host.id, bot: true, style: null });
      broadcast(host, cfg); assert.equal(host.results.at(-1).ok, true); assert.equal(guest.messages.length, 1);
    });
  });
  test(epoch + ': failed ACK and departed host cannot launch; new host can', async () => {
    await withRoom(epoch, ({ room, host, guest, config }) => {
      const cfg = config(); host.failSend = true; broadcast(host, cfg);
      assert.equal(guest.messages.length, 0); assert.equal(room.locked, false);
      host.failSend = false; host.close(); assert.equal(room.hostId, guest.id);
      broadcast(host, cfg); assert.equal(guest.messages.length, 0);
      const migrated = config({ id: 'migrated-round', host: guest.id, roster: [{ nid: 0, owner: guest.id, bot: false, style: null }] });
      broadcast(guest, migrated);
      assert.deepEqual(guest.results.at(-1), { t: 'start_result', id: migrated.id, ok: true }); assert.equal(room.locked, true);
    });
  });
}
