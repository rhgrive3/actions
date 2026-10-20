// #1654 (client half): the real adapted Transport/NetSession announce the wire
// major and gameplay-compatibility token, and fail closed against a relay that
// does not enforce them. The client's URL is also checked against the real Worker.
import assert from 'node:assert/strict';
import test from 'node:test';
import relay from '../../../server/src/index.js';
import { fixture, outcome } from './net-fixture.mjs';

const members = [{ id: 'host', name: 'Host' }, { id: 'me', name: 'Me' }];

test('the client announces wire major 2 and its compatibility token when creating and joining', async () => {
  const f = await fixture();
  assert.equal(f.PROTO, 2);
  assert.match(f.COMPAT, /^[A-Za-z0-9_-]{8,80}$/, 'the relay accepts only tokens of this shape');
  const created = f.net.create('Host');
  const createUrl = new URL(f.sockets.at(-1).url);
  f.welcome(f.sockets.at(-1), { id: 'host', host: 'host', members: [members[0]] });
  await created;
  const joined = f.net.join('BC235', 'Me');
  const joinUrl = new URL(f.sockets.at(-1).url);
  f.welcome(f.sockets.at(-1), { id: 'me', host: 'host', members });
  await joined;
  for (const url of [createUrl, joinUrl]) {
    assert.equal(url.searchParams.get('v'), '2');
    assert.equal(url.searchParams.get('compat'), f.COMPAT);
  }
  assert.equal(createUrl.searchParams.get('create'), '1');
  assert.equal(joinUrl.searchParams.get('create'), null);
});

test('what the client sends is admitted by the real relay Worker, and the pre-change client is not', async () => {
  const f = await fixture();
  const pending = f.net.join('BC235', 'Me');
  const url = new URL(f.sockets.at(-1).url);
  f.welcome(f.sockets.at(-1), { id: 'me', host: 'host', members });
  await pending;
  const routed = [];
  const env = { ROOMS: { idFromName: code => code, get: code => ({ fetch: async () => { routed.push(code); return new Response('routed'); } }) } };
  const asRequest = (query) => ({ url: `https://relay.test${url.pathname}?${query}`, method: 'GET', headers: new Headers({ Upgrade: 'websocket' }) });
  const globals = { pair: globalThis.WebSocketPair, response: globalThis.Response };
  globalThis.WebSocketPair = class { constructor() { this[0] = {}; this[1] = { accept() {}, send() {}, close() {} }; } };
  globalThis.Response = function (body, init = {}) { return init.status === 101 ? { status: 101 } : new globals.response(body, init); };
  try {
    const response = await relay.fetch(asRequest(url.searchParams.toString()), env);
    assert.equal(await response.text(), 'routed');
    assert.deepEqual(routed, ['BC235']);
    // The same request with the previous client's parameters (v=1, no compat) is refused.
    const legacy = new URLSearchParams(url.searchParams);
    legacy.set('v', '1'); legacy.delete('compat');
    assert.equal((await relay.fetch(asRequest(legacy.toString()), env)).status, 101);
    assert.deepEqual(routed, ['BC235'], 'the legacy request never reached a room');
  } finally { globalThis.WebSocketPair = globals.pair; globalThis.Response = globals.response; }
});

test('a welcome from a relay that predates admission (no proto) is refused, readably, and nothing starts', async () => {
  const f = await fixture();
  const tr = new f.Transport();
  const result = outcome(tr.connect('BC235', 'Me', false));
  const socket = f.sockets.at(-1);
  socket.onmessage({ data: JSON.stringify({ t: 'welcome', id: 'me', host: 'host', members }) });
  const { error } = await result;
  assert.match(error?.message, /reload/i);
  assert.equal(tr.id, null, 'identity is not adopted');
  assert.equal(tr.open, false);
  assert.equal(f.timers.size, 0, 'no heartbeat or handshake timer is left behind');
  assert.equal(socket.closed.length, 1);
});

test('a welcome with the wrong wire major or a different room token is refused', async () => {
  for (const bad of [{ proto: 1 }, { proto: 3 }, { proto: '2' }, { proto: null }, { compat: 'iw-gameplay-other-1' }]) {
    const f = await fixture();
    const tr = new f.Transport();
    const result = outcome(tr.connect('BC235', 'Me', false));
    f.sockets.at(-1).onmessage({ data: JSON.stringify({ t: 'welcome', proto: f.PROTO, compat: f.COMPAT, id: 'me', host: 'host', members, ...bad }) });
    const { error } = await result;
    assert.match(error?.message, /reload/i, JSON.stringify(bad));
    assert.equal(tr.id, null);
    assert.equal(f.timers.size, 0);
  }
});

test('a matching welcome connects, and a relay that has not pinned a token yet does not block play', async () => {
  for (const compat of [undefined, null]) {
    const f = await fixture();
    const tr = new f.Transport();
    const pending = tr.connect('BC235', 'Me', false);
    const welcome = { t: 'welcome', proto: f.PROTO, id: 'me', host: 'host', members };
    if (compat !== undefined) welcome.compat = compat;
    f.sockets.at(-1).onmessage({ data: JSON.stringify(welcome) });
    assert.equal((await pending).id, 'me');
    assert.equal(tr.open, true);
    tr.close();
  }
  const f = await fixture();
  const tr = new f.Transport();
  const pending = tr.connect('BC235', 'Me', false);
  f.welcome(f.sockets.at(-1));
  assert.equal((await pending).id, 'me');
});

test('a session that meets an out-of-date relay shows the reload message and stays out of the lobby', async () => {
  const f = await fixture();
  const joined = outcome(f.net.join('BC235', 'Me'));
  f.sockets.at(-1).onmessage({ data: JSON.stringify({ t: 'welcome', id: 'me', host: 'host', members }) });
  const { error } = await joined;
  assert.match(error.message, /reload/i);
  assert.match(f.net.error, /reload/i);
  assert.notEqual(f.net.state, 'lobby');
  assert.equal(f.net.code, null);
});
