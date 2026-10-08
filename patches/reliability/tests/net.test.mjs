import assert from 'node:assert/strict';
import test from 'node:test';
import { adaptNet } from '../net-adapter.mjs';
import { fixture, readSource, outcome, flush, deferred } from './net-fixture.mjs';

function assertCancelled(result) {
  assert.equal(result.error?.name, 'AbortError');
  assert.equal(result.error?.message, 'Connection cancelled');
}
function noWork(f, socket) {
  assert.equal(f.timers.size, 0);
  assert.equal(socket.onmessage, null);
  assert.equal(socket.onerror, null);
  assert.equal(socket.onclose, null);
}
async function room(f, code = 'BC235', options) {
  const promise = f.net.join(code, 'Player');
  f.welcome(f.sockets.at(-1), options);
  await promise;
}
function state(net) {
  return { state: net.state, code: net.code, myId: net.myId, hostId: net.hostId, tr: net.tr, lobby: net.lobby, members: [...net._members] };
}

// Self-test the build boundary as well as the runtime correction.
test('network transforms require unique source anchors and leave other paths unchanged', () => {
  for (const rel of ['src/net/session.js', 'src/net/transport.js', 'src/net/netmatch.js']) {
    const source = readSource(rel);
    assert.notEqual(adaptNet(rel, source), source);
    assert.throws(() => adaptNet(rel, ''), /anchor mismatch/);
    assert.throws(() => adaptNet(rel, source + source), /anchor mismatch/);
    assert.throws(() => adaptNet(rel, adaptNet(rel, source)), /anchor mismatch/);
  }
  assert.equal(adaptNet('src/core/ctx.js', 'untouched'), 'untouched');
});

test('pending Transport.close rejects promptly and removes every owned callback/timer', async () => {
  const f = await fixture();
  const tr = new f.Transport();
  const pending = outcome(tr.connect('BC234', 'Old', false));
  const socket = f.sockets[0];
  const staleTimeout = f.timers.get(f.timer(8000)).fn;
  const staleMessage = socket.onmessage, staleClose = socket.onclose, staleError = socket.onerror;
  tr.close();
  assertCancelled(await pending);
  noWork(f, socket);
  assert.equal(tr.ws, null);
  staleMessage({ data: JSON.stringify({ t: 'welcome', id: 'obsolete', host: 'obsolete', members: [] }) });
  staleTimeout(); staleError(); staleClose({ reason: 'obsolete' });
  assert.equal(tr.id, null);
  noWork(f, socket);
  tr.close();
  assert.equal(socket.closed.length, 1);
});

test('SIM receive timers are cancelled; queued callbacks cannot revive a closed transport', async () => {
  const f = await fixture({ search: '?netlag=50' });
  const tr = new f.Transport();
  const pending = outcome(tr.connect('BC234', 'Old', false));
  const socket = f.sockets[0];
  f.welcome(socket);
  const delayed = f.timers.get(f.timer(50)).fn;
  tr.close();
  assertCancelled(await pending);
  noWork(f, socket);
  delayed();
  assert.equal(tr.id, null);
  noWork(f, socket);
});

test('cancelled join and its obsolete socket/session callbacks cannot mutate a newer lobby', async () => {
  const f = await fixture();
  const pending = outcome(f.net.join('BC234', 'Old'));
  const oldTr = f.net.tr, oldSocket = f.sockets[0];
  const handlers = { message: oldSocket.onmessage, close: oldSocket.onclose, error: oldSocket.onerror,
    control: oldTr.onControl, payload: oldTr.onMessage, sessionClose: oldTr.onClose, timeout: f.timers.get(f.timer(8000)).fn };
  f.net.leave();
  await room(f, 'BC235', { id: 'new', host: 'host' });
  assertCancelled(await pending);
  const before = state(f.net);
  handlers.message({ data: JSON.stringify({ t: 'welcome', id: 'old', host: 'old', members: [] }) });
  handlers.message({ data: JSON.stringify({ t: 'err', e: 'Old failure' }) });
  handlers.error(); handlers.close({ reason: 'Old failure' }); handlers.timeout();
  handlers.control({ t: 'leave', id: 'new', host: 'old' });
  handlers.payload('host', { k: 'lobby', l: { players: [] } });
  handlers.sessionClose('Old failure');
  assert.deepEqual(state(f.net), before);
  assert.equal(f.net.tr.open, true);
  assert.equal(f.timers.size, 1); // only the new room's heartbeat
  f.net.leave();
  assert.equal(f.timers.size, 0);
});

for (const method of ['join', 'create']) {
  for (const target of ['connecting', 'lobby']) {
    test(`stale ${method} failure cannot fail newer ${target} room or retry`, async () => {
      const f = await fixture();
      const old = outcome(method === 'join' ? f.net.join('BC234', 'Old') : f.net.create('Old'));
      f.message(f.sockets[0], { t: 'err', e: 'Room code taken' });
      const newer = outcome(f.net.join('BC235', 'New'));
      if (target === 'lobby') f.welcome(f.sockets[1], { id: 'new', host: 'new' });
      await flush();
      const oldResult = await old;
      assert.equal(oldResult.error.message, 'Room code taken');
      assert.equal(f.sockets.length, 2);
      assert.equal(f.net.state, target);
      assert.equal(f.net.error, null);
      assert.equal(f.net.tr.open, true);
      if (target === 'connecting') f.welcome(f.sockets[1]);
      assert.equal((await newer).error, undefined);
      f.net.leave();
    });
  }
}

test('welcome settled before leave cannot commit IDs into the replacement room', async () => {
  const f = await fixture();
  const old = outcome(f.net.join('BC234', 'Old'));
  f.welcome(f.sockets[0], { id: 'old', host: 'old' });
  const newer = f.net.join('BC235', 'New');
  f.welcome(f.sockets[1], { id: 'new', host: 'new' });
  await newer;
  assertCancelled(await old);
  assert.equal(f.net.code, 'BC235'); assert.equal(f.net.myId, 'new');
  f.net.leave();
});

test('synchronous connecting-state cancellation cannot acquire an orphan socket', async () => {
  const f = await fixture();
  f.net.on('state', ({ state }) => { if (state === 'connecting') f.net.leave(); });
  assertCancelled(await outcome(f.net.join('BC234')));
  assert.equal(f.net.state, 'offline');
  assert.equal(f.sockets.length, 0); assert.equal(f.timers.size, 0);
});

for (const failure of ['relay', 'timeout', 'close', 'error', 'constructor']) {
  test(`ordinary ${failure} handshake failure preserves player-facing errors and cleans up`, async () => {
    const f = await fixture();
    if (failure === 'constructor') f.constructionFails();
    const pending = outcome(f.net.join('BC234', 'Player'));
    const socket = f.sockets[0];
    if (failure === 'relay') f.message(socket, { t: 'err', e: 'Room not found' });
    if (failure === 'timeout') f.run(f.timer(8000));
    if (failure === 'close') socket.onclose({ reason: 'Room full' });
    if (failure === 'error') socket.onerror();
    const result = await pending;
    const message = failure === 'relay' ? 'Room not found' : failure === 'close' ? 'Room full' : 'Could not connect';
    assert.equal(result.error.message, message);
    assert.equal(f.net.error, message); assert.equal(f.net.state, 'error');
    assert.equal(f.net.tr, null); assert.equal(f.net.code, null);
    assert.equal(f.net.myId, null); assert.equal(f.net.hostId, null);
    assert.equal(f.timers.size, 0);
    if (socket) noWork(f, socket);
  });
}

test('ordinary success keeps normal relay payloads and close notifies once', async () => {
  const f = await fixture();
  await room(f, 'bc-234', { id: 'me', host: 'host', members: [{ id: 'host', name: 'Host' }, { id: 'me', name: 'Player' }] });
  const socket = f.sockets[0];
  assert.equal(f.net.state, 'lobby'); assert.equal(f.net.code, 'BC234');
  assert.equal(socket.sent[0], 'ping');
  assert.match(socket.sent[1], /^s\|host\|\{"k":"me",/);
  const events = [];
  f.net.on('emote', value => events.push(value));
  f.message(socket, 'm|host|{"k":"emote","n":"hello"}');
  assert.equal(events[0].name, 'hello');
  const callback = socket.onclose;
  callback({ reason: 'Disconnected' }); callback({ reason: 'Disconnected' });
  assert.equal(f.net.state, 'error'); assert.equal(f.net.error, 'Lost connection to the room');
  assert.equal(f.net.myId, null); assert.equal(f.net.hostId, null); assert.equal(f.net._members.size, 0);
  noWork(f, socket);
});

test('ordinary close with bye returns offline', async () => {
  const f = await fixture(); await room(f);
  f.sockets[0].onclose({ reason: 'bye' });
  assert.equal(f.net.state, 'offline'); assert.equal(f.net.error, null); assert.equal(f.timers.size, 0);
});

test('room-code-taken create retries remain bounded and a retry can succeed', async () => {
  const f = await fixture();
  const pending = outcome(f.net.create('Player'));
  f.message(f.sockets[0], { t: 'err', e: 'Room code taken' });
  await flush();
  assert.equal(f.sockets.length, 2); assert.equal(f.net.state, 'connecting');
  assert.match(f.sockets[1].url, /&create=1$/);
  f.welcome(f.sockets[1]);
  const result = await pending;
  assert.equal(result.value, f.net.code); assert.equal(f.net.state, 'lobby');
  f.net.leave();

  const exhausted = outcome(f.net.create('Player'));
  for (let index = 2; index < 6; index++) {
    f.message(f.sockets[index], { t: 'err', e: 'Room code taken' });
    await flush();
  }
  assert.equal((await exhausted).error.message, 'Room code taken');
  assert.equal(f.sockets.length, 6); assert.equal(f.net.state, 'error'); assert.equal(f.timers.size, 0);
});

test('reusing Transport isolates old callbacks and heartbeat from its new socket', async () => {
  const f = await fixture(); const tr = new f.Transport();
  const old = tr.connect('BC234', 'Old', false); f.welcome(f.sockets[0]); await old;
  const ping = [...f.timers.values()][0].fn;
  const handle = f.sockets[0].onmessage, close = f.sockets[0].onclose;
  const newer = tr.connect('BC235', 'New', false); f.welcome(f.sockets[1], { id: 'new' }); await newer;
  const sent = f.sockets[1].sent.length;
  ping(); handle({ data: '{"t":"welcome","id":"old"}' }); close({ reason: 'old' });
  assert.equal(tr.id, 'new'); assert.equal(tr.open, true); assert.equal(f.sockets[1].sent.length, sent);
  tr.close(); assert.equal(f.timers.size, 0);
});

test('leaving or ending a match clears its ready timer; queued old go cannot launch a newer match', async () => {
  const f = await fixture(); await room(f);
  const oldCfg = { id: 'old', roster: [{ bot: false, owner: 'slow' }] };
  f.net._startCfg = oldCfg; f.net.state = 'starting'; f.net._ready = new Set(); f.net._members.set('slow', 'Slow');
  f.net._markReady('me');
  const callback = f.timers.get(f.timer(12000)).fn;
  f.net.leave(); assert.equal(f.timers.size, 0);
  await room(f, 'BC235');
  f.net._startCfg = { id: 'new' }; f.net.state = 'starting';
  callback(); assert.equal(f.net.state, 'starting'); assert.equal(f.net._goT, null);
  f.net._ready = new Set(); f.net._startCfg.roster = [{ bot: false, owner: 'slow' }]; f.net._members.set('slow', 'Slow');
  f.net._markReady('me'); assert.ok(f.timer(12000));
  f.net.endMatch(); assert.equal(f.timer(12000), undefined); assert.equal(f.net.state, 'lobby');
  f.net.leave();
});

for (const result of ['resolve', 'reject']) {
  test(`obsolete startNetMatch ${result} cannot signal or fail a newer room`, async () => {
    const f = await fixture(); await room(f);
    const gate = deferred();
    f.G.game.startNetMatch = () => gate.promise;
    const begin = f.net._begin({ id: 'old', roster: [] });
    await flush();
    const oldMatch = f.net.match;
    assert.ok(oldMatch);
    f.net.leave(); assert.equal(oldMatch.disposed, true);
    await room(f, 'BC235', { id: 'new', host: 'host' });
    const before = state(f.net), sent = f.sockets[1].sent.length;
    if (result === 'resolve') gate.resolve(); else gate.reject(new Error('Old load failed'));
    await begin;
    assert.deepEqual(state(f.net), before);
    assert.equal(f.sockets[1].sent.length, sent); assert.equal(f.net.error, null);
    f.net.leave();
  });
}

test('obsolete lobby launch cannot construct a match in a newer room', async () => {
  const f = await fixture(); await room(f);
  const gate = deferred(); f.G.game.menus = { launchLobby: () => gate.promise };
  const begin = f.net._begin({ id: 'old', roster: [] });
  f.net.leave(); await room(f, 'BC235'); gate.resolve(); await begin;
  assert.equal(f.net.state, 'lobby'); assert.equal(f.net.match, null); f.net.leave();
});

for (const method of ['join', 'create']) {
  test(`synchronous lobby-state cancellation rejects ${method} without stale lobby messages`, async () => {
    const f = await fixture();
    const events = [];
    f.net.on('state', ({ state }) => { if (state === 'lobby') f.net.leave(); });
    f.net.on('lobby', value => events.push(value));
    const pending = outcome(method === 'join' ? f.net.join('BC234') : f.net.create());
    f.welcome(f.sockets[0], { id: 'me', host: 'host' });
    assertCancelled(await pending);
    assert.equal(f.net.state, 'offline'); assert.equal(f.net.myId, null); assert.equal(f.timers.size, 0);
    assert.deepEqual(f.sockets[0].sent, ['ping']);
    assert.equal(events.length, 1); // only leave's lobby reset
  });
}

test('ordinary host match start launches when every human is ready', async () => {
  const f = await fixture(); await room(f);
  f.G.game.startNetMatch = async () => {};
  await f.net._begin({ id: 'normal', roster: [{ bot: false, owner: 'me' }] });
  assert.equal(f.net.state, 'match'); assert.equal(f.net.match.launched, true);
  assert.ok(f.sockets[0].sent.includes('b|{"k":"go","id":"normal"}'));
  f.net.leave(); assert.equal(f.timers.size, 0);
});

test('ordinary host ready timeout still starts its current match', async () => {
  const f = await fixture(); await room(f);
  f.G.game.startNetMatch = async () => {};
  f.net._members.set('slow', 'Slow');
  await f.net._begin({ id: 'normal', roster: [{ bot: false, owner: 'me' }, { bot: false, owner: 'slow' }] });
  assert.equal(f.net.state, 'starting');
  f.run(f.timer(12000));
  assert.equal(f.net.state, 'match'); assert.equal(f.net.match.launched, true);
  f.net.leave(); assert.equal(f.timers.size, 0);
});

test('synchronous starting-state cancellation stops match-start acquisition', async () => {
  const f = await fixture(); await room(f);
  let calls = 0, events = 0;
  f.G.game.menus = { launchLobby: () => { calls++; } };
  f.net.on('state', ({ state }) => { if (state === 'starting') f.net.leave(); });
  f.net.on('match', () => { events++; });
  await f.net._begin({ id: 'old', roster: [] });
  assert.equal(calls, 0); assert.equal(events, 0);
  assert.equal(f.net.state, 'offline'); assert.equal(f.net.match, null); assert.equal(f.timers.size, 0);
});

for (const retire of ['_fail', '_closed']) test(`#1159 ${retire} clears the old GO deadline before another room`, async () => {
  const f=await fixture(); await room(f);
  f.G.game.startNetMatch=async()=>{};
  f.net._members.set('slow','Slow');
  await f.net._begin({id:'old',roster:[{bot:false,owner:'me'},{bot:false,owner:'slow'}]});
  const id=f.timer(12000), queued=f.timers.get(id).fn;
  f.net[retire](retire==='_fail'?new Error('aborted'):'closed');
  assert.equal(f.timers.has(id),false);assert.equal(f.net._goT,null);
  await room(f,'BC236');
  f.net._members.set('slow','Slow');
  await f.net._begin({id:'new',roster:[{bot:false,owner:'me'},{bot:false,owner:'slow'}]});
  const current=f.timer(12000);
  queued();assert.equal(f.net.state,'starting');assert.equal(f.net._goT,current);
  assert.equal(f.timers.get(current).ms,12000);
  f.run(current);assert.equal(f.net.state,'match');f.net.leave();
});

test('#1159 a new round on the same transport retires the old deadline and owns a full interval', async()=>{
  const f=await fixture();await room(f);f.G.game.startNetMatch=async()=>{};
  f.net._members.set('slow','Slow');
  const cfg=id=>({id,roster:[{bot:false,owner:'me'},{bot:false,owner:'slow'}]});
  await f.net._begin(cfg('old'));const old=f.timer(12000),queued=f.timers.get(old).fn;
  await f.net._begin(cfg('new'));const current=f.timer(12000);
  assert.notEqual(current,old);assert.equal(f.timers.has(old),false);
  queued();assert.equal(f.net.state,'starting');assert.equal(f.net._goT,current);
  f.run(current);assert.equal(f.net.state,'match');f.net.leave();
});
