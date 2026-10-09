import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { mapNoBots, WEAPONS } from '../../../inkwave-public/src/config.js';
import { retireDisconnectedMainProjectiles } from '../../splatoon3/runtime/disconnect-fidelity.mjs';
import { respawnPunisherEquipped, withHitPunisher } from '../../splatoon3/runtime/clothing-gear.mjs';
import { validDamageGroup } from '../../splatoon3/runtime/final-damage.mjs';
import { C1088_SURGE_TAG, clearRemoteC1088Surge } from '../issue-1088-surge-presentation.mjs';
import { clearRemoteRollerPresentation } from '../roller-presentation.mjs';
import { clearRemoteDodgeClock } from '../../splatoon3/runtime/remote-dodge-clock.mjs';
import { KIT_FORWARD } from '../../splatoon3/runtime/kit-network.mjs';

const raw = fs.readFileSync(new URL('../../../inkwave-public/src/net/netmatch.js', import.meta.url), 'utf8');
const source = adaptBuildSource('src/net/netmatch.js', raw);
const sessionRaw = fs.readFileSync(new URL('../../../inkwave-public/src/net/session.js', import.meta.url), 'utf8');
const sessionSource = adaptBuildSource('src/net/session.js', sessionRaw);
const weaponsRaw = fs.readFileSync(new URL('../../../inkwave-public/src/game/weapons.js', import.meta.url), 'utf8');
const weaponsSource = adaptBuildSource('src/game/weapons.js', weaponsRaw);

function methodFrom(code, name, optional = false) {
  const start = code.indexOf('  ' + name + '(');
  if (start < 0) {
    assert.ok(optional, `composed NetMatch method ${name}`);
    return `  ${name}() { return false; }`;
  }
  const end = code.indexOf('\n  }\n', start);
  assert.ok(end > start, `composed NetMatch method end ${name}`);
  return code.slice(start, end + 4);
}
const method = (name, optional = false) => methodFrom(source, name, optional);

function makeWorld(id) {
  const events = [], sent = [], listeners = new Map(), calls = [];
  const on = (name, callback) => {
    const set = listeners.get(name) || new Set();
    set.add(callback); listeners.set(name, set);
    return () => set.delete(callback);
  };
  const emit = (name, detail) => {
    events.push({ name, detail });
    for (const callback of listeners.get(name) || []) callback(detail);
  };
  const G = { netm: null, projectiles: {
    list: [], bombs: [], clouds: [], beams: [], beamPool: [], sights: new Map(), scene: { remove() {} },
    _releaseBomb() {}, _releaseCloud() {},
    applyHit(attacker, victim, damage, weapon, group) {
      calls.push({ attacker, victim, damage, weapon, group });
      const applied = Math.min(damage, victim.hp);
      victim.hp -= applied;
      if (applied > 0) emit('damage', { attacker, victim, amount: applied });
      if (victim.hp <= 0 && victim.alive) {
        victim.alive = false;
        emit('splatted', { attacker, victim });
      }
      return applied;
    },
  } };
  const helpers = source.slice(
    source.indexOf('function clearRemoteSquidroll('),
    source.indexOf('function syncRemoteSquidroll('),
  );
  const ghostsAt = source.indexOf('function retireNetworkGhosts(');
  const ghostsEnd = source.indexOf('\n}\n', ghostsAt);
  assert.ok(helpers.length > 0 && ghostsAt >= 0 && ghostsEnd > ghostsAt, 'handoff cleanup helpers are composed');
  const ghostHelper = source.slice(ghostsAt, ghostsEnd + 3);
  const methodNames = [
    'sendHit', 'shouldApplyHit', '_retirePendingSequence', '_retirePendingHit', '_retirePendingHitsForVictim', '_retryPendingHitsForLeave',
    '_retryNackedHit', '_hitNack', '_hit', '_hitAck', 'onMessage', 'onLeave', '_onLocalEvent', 'bind', 'dispose', '_requestFirstSplat',
  ];
  const forwardStart = source.indexOf('const FORWARD = '), forwardEnd = source.indexOf(';', forwardStart);
  assert.ok(forwardStart >= 0 && forwardEnd > forwardStart, 'production event-forward list is composed');
  const forwardList = source.slice(forwardStart, forwardEnd + 1);
  const limitsStart = source.indexOf('const HIT_DELIVERY_LIMIT = '), limitsEnd = source.indexOf('const TICK = 1 / 20;', limitsStart);
  assert.ok(limitsStart >= 0 && limitsEnd > limitsStart, 'production bounded hit limits are composed');
  const hitLimits = source.slice(limitsStart, limitsEnd);
  const methods = methodNames.map((name) => method(name, name.startsWith('_retire') || name.startsWith('_retry'))).join('\n');
  const NetMatchHarness = new Function(
    'G', 'PLAYER', 'on', 'emit', 'r2', 'IW_HIT_MAX_DAMAGE', 'IW_HIT_CAUSES', 'mapNoBots',
    'rearmTeamWipe', 'respawnPunisherEquipped', 'withHitPunisher', 'clearRemoteC1088Surge',
    'WEAPONS', 'validDamageGroup', 'clearRemoteRollerPresentation', 'C1088_SURGE_TAG',
    'retireDisconnectedMainProjectiles', 'clearRemoteDodgeClock', 'KIT_FORWARD',
    `${helpers}\n${ghostHelper}\n${hitLimits}\n${forwardList}\nreturn class NetMatchHarness {
${methods}
  _setupActor() {}
  _adopt(actor) { actor.remote = false; actor.isBot = true; actor.net.buf.length = 0; }
  _remove(actor) { this.byNid.delete(actor.nid); this.match?.removeActor?.(actor); }
  _stopLoops() {}
}`,
  )(
    G, { hp: 100, spawnInvuln: 3 }, on, emit, (x) => Math.round(x * 100) / 100,
    180, new Set(['shooter']), mapNoBots,
    () => {}, respawnPunisherEquipped, withHitPunisher, clearRemoteC1088Surge,
    WEAPONS, validDamageGroup, clearRemoteRollerPresentation, C1088_SURGE_TAG,
    retireDisconnectedMainProjectiles, clearRemoteDodgeClock, KIT_FORWARD,
  );
  const net = new NetMatchHarness();
  Object.assign(net, {
    myId: id, isHost: id === 'H' || id === 'C', cfg: { map: 'normal' },
    byNid: new Map(), hitNextSeq: 0, hitPending: new Map(), _pendingHits: new Map(),
    peers: new Map(), unsubs: [],
    match: { boss: null, follower: true, removeActor() {} },
    s: { hostId: 'H', _members: new Set(['H', 'S', 'V', 'C']), tr: {
      sendTo(to, data) { sent.push({ to, data }); return true; },
    } },
    _peer(peer) {
      let value = this.peers.get(peer);
      if (!value) this.peers.set(peer, value = {});
      return value;
    },
  });
  return { id, net, events, sent, calls, G };
}

function actor(nid, owner, localId, team, life) {
  return {
    nid, owner, team, netLife: life, alive: true, remote: owner !== localId,
    hp: 100, isBot: false, net: { buf: [], tp: 0 }, character: {}, weaponRunner: {}, s3: {},
    pos: { x: 0, y: 0, z: 0 },
  };
}

function room() {
  const worlds = Object.fromEntries(['S', 'V', 'H', 'C'].map((id) => [id, makeWorld(id)]));
  for (const world of Object.values(worlds)) {
    world.attacker = actor(7, 'S', world.id, 0, 2);
    world.victim = actor(4, 'V', world.id, 1, 5);
    world.net.byNid.set(world.attacker.nid, world.attacker);
    world.net.byNid.set(world.victim.nid, world.victim);
  }
  return worlds;
}

function leave(world, departed, newHost, hostChanged = false) {
  world.net.s.hostId = newHost;
  world.net.onLeave(departed, hostChanged);
}

function deliver(from, to, packet) { to.net.onMessage(from.id, packet); }
function productionProjectiles(G, events = []) {
  const applyHit = methodFrom(weaponsSource, 'applyHit');
  const ProjectilesHarness = new Function('G', 'emit', 'rumble', '_vh', `return class { ${applyHit} }`)(
    G, (name, detail) => events.push({ name, detail }), () => {}, { copy() { return this; }, y: 0 },
  );
  return new ProjectilesHarness();
}

test('composed normal hit ACK retires both pending records once', () => {
  const f = room();
  assert.equal(f.S.net.sendHit(f.S.attacker, f.S.victim, 36, 'shooter'), true);
  const packet = f.S.sent[0].data;
  deliver(f.S, f.V, packet);
  assert.equal(f.V.victim.hp, 64, 'the current victim owner applies accepted damage');
  const ack = f.V.sent.find((item) => item.to === 'S' && item.data.k === 'hit_ack')?.data;
  assert.ok(ack, 'victim owner returns the existing hit ACK');
  deliver(f.V, f.S, ack);
  deliver(f.V, f.S, ack);
  assert.equal(f.S.net.hitPending.size, 0, 'the delivery retry record is retired by its ACK');
  assert.equal(f.S.net._pendingHits.size, 0, 'the combat confirmation record is retired once');
  assert.equal(f.S.events.filter((event) => event.name === 'combat:confirmed').length, 1);
  deliver(f.S, f.V, packet);
  assert.equal(f.V.victim.hp, 64, 'duplicate hit identity cannot apply damage twice');
});

test('composed ACK from the departed owner can settle after the same-life actor is adopted', () => {
  const f = room();
  f.S.net.sendHit(f.S.attacker, f.S.victim, 36, 'shooter');
  const packet = f.S.sent[0].data;
  deliver(f.S, f.V, packet);
  const ack = f.V.sent.find((item) => item.to === 'S' && item.data.k === 'hit_ack')?.data;
  leave(f.S, 'V', 'H');
  leave(f.H, 'V', 'H');
  assert.equal(f.S.victim.owner, 'H');
  assert.equal(f.H.victim.remote, false, 'the new host adopts the same Actor');
  assert.equal(f.S.sent.length, 1, 'a hit already delivered to the old owner is not rerouted on leave');
  assert.equal(f.V.victim.hp, 64, 'the departed owner already applied the hit exactly once');
  deliver(f.V, f.S, ack);
  assert.equal(f.S.net.hitPending.size, 0);
  assert.equal(f.S.net._pendingHits.size, 0);
  assert.equal(f.S.events.filter((event) => event.name === 'combat:confirmed').length, 1);
});

test('bounded hit admission preserves all 64 accepted routes and rejects the next hit explicitly', () => {
  const f = room();
  for (let i = 0; i < 64; i++) assert.equal(f.S.net.sendHit(f.S.attacker, f.S.victim, 1, 'shooter'), true);
  const oldest = f.S.sent[0].data;
  assert.equal(f.S.net.hitPending.size, 64);
  assert.equal(f.S.net._pendingHits.size, 64);
  assert.equal(f.S.net.hitPending.get(oldest.seq).message, oldest);
  assert.ok(f.S.net._pendingHits.has(oldest.h));

  f.S.G.netm = f.S.net;
  const projectiles = productionProjectiles(f.S.G, f.S.events);
  assert.equal(projectiles.applyHit(f.S.attacker, f.S.victim, 36, 'shooter'), 'rejected',
    'the production hit caller observes failed bounded admission');
  assert.equal(f.S.sent.length, 64, 'a rejected hit is not put on the wire');
  assert.equal(f.S.net.hitNextSeq, 64, 'rejected admission does not allocate another delivery sequence');
  assert.ok(!f.S.events.some((event) => event.name === 'hit'), 'capacity rejection does not emit accepted-hit feedback');

  f.S.net.onMessage('__relay__', { k: 'hit_nack', seq: oldest.seq, to: 'V' });
  leave(f.S, 'V', 'H');
  leave(f.H, 'V', 'H');
  const retry = f.S.sent.at(-1);
  assert.equal(retry.to, 'H');
  assert.strictEqual(retry.data, oldest, 'the oldest accepted packet remains available for its NACK retry');
  deliver(f.S, f.H, retry.data);
  assert.equal(f.H.victim.hp, 99);
  assert.equal(f.H.calls.length, 1);
  const ack = f.H.sent.find((item) => item.to === 'S' && item.data.k === 'hit_ack')?.data;
  assert.ok(ack);
  deliver(f.H, f.S, ack);
  deliver(f.S, f.H, retry.data);
  assert.equal(f.H.victim.hp, 99, 'the accepted older hit still applies exactly once');
  assert.equal(f.H.calls.length, 1);
  assert.equal(f.S.net.hitPending.size, 63, 'the explicit ACK retires one delivery record');
  assert.equal(f.S.net._pendingHits.size, 63, 'the same ACK retires its combat receipt');
  assert.equal(f.S.net.sendHit(f.S.attacker, f.S.victim, 1, 'shooter'), true, 'a settled slot admits a new hit');
  assert.equal(f.S.net.hitPending.size, 64);
  assert.equal(f.S.net._pendingHits.size, 64);
});

test('receipt saturation and transport refusal do not evict accepted work or leave half-records', () => {
  const f = room();
  f.S.net._pendingHits = new Map(Array.from({ length: 120 }, (_, i) => [i + 1, { a: i, v: 4 }]));
  const oldestReceipt = f.S.net._pendingHits.get(1);
  assert.equal(f.S.net.sendHit(f.S.attacker, f.S.victim, 36, 'shooter'), false);
  assert.equal(f.S.net._pendingHits.size, 120);
  assert.strictEqual(f.S.net._pendingHits.get(1), oldestReceipt);
  assert.equal(f.S.net.hitPending.size, 0);
  assert.equal(f.S.sent.length, 0);

  const disconnected = room();
  disconnected.S.net.s.tr.sendTo = () => false;
  assert.equal(disconnected.S.net.sendHit(disconnected.S.attacker, disconnected.S.victim, 36, 'shooter'), false);
  assert.equal(disconnected.S.net.hitPending.size, 0, 'a transport refusal retires the unsent delivery record');
  assert.equal(disconnected.S.net._pendingHits.size, 0, 'a transport refusal retires its unsent combat receipt');
});

test('composed relay NACK follows chained owner transfers and accepts only the final owner ACK', () => {
  const f = room();
  f.S.net.sendHit(f.S.attacker, f.S.victim, 36, 'shooter');
  const original = f.S.sent[0].data;
  f.S.net.onMessage('__relay__', { k: 'hit_nack', seq: original.seq, to: 'V' });
  assert.equal(f.S.sent.length, 1, 'a relay NACK waits for the ordered owner leave');
  leave(f.S, 'V', 'H');
  leave(f.H, 'V', 'H');
  leave(f.C, 'V', 'H');
  const firstRetry = f.S.sent.at(-1);
  assert.equal(firstRetry.to, 'H');
  assert.strictEqual(firstRetry.data, original, 'retry preserves the original accepted hit identity');

  leave(f.S, 'H', 'C', true);
  leave(f.H, 'H', 'C', true);
  leave(f.C, 'H', 'C', true);
  f.S.net.onMessage('__relay__', { k: 'hit_nack', seq: original.seq, to: 'H' });
  const secondRetry = f.S.sent.at(-1);
  assert.equal(secondRetry.to, 'C', 'a second departed owner is followed');
  assert.strictEqual(secondRetry.data, original);
  const beforeStaleNack = f.S.sent.length;
  f.S.net.onMessage('__relay__', { k: 'hit_nack', seq: original.seq, to: 'V' });
  assert.equal(f.S.sent.length, beforeStaleNack, 'a stale first-owner NACK cannot repeat the hit');

  deliver(f.S, f.C, secondRetry.data);
  const finalAck = f.C.sent.find((item) => item.to === 'S' && item.data.k === 'hit_ack');
  assert.ok(finalAck, `final owner applied the retry and returned an ACK; calls=${f.C.calls.length}, hp=${f.C.victim.hp}`);
  deliver(f.C, f.S, finalAck.data);
  assert.equal(f.C.victim.hp, 64);
  assert.equal(f.C.calls.length, 1, 'only the final victim owner applies damage');
  assert.equal(f.S.net.hitPending.size, 0);
  assert.equal(f.S.net._pendingHits.size, 0);
  assert.equal(f.S.events.filter((event) => event.name === 'combat:confirmed').length, 1);
});

test('composed stale-life NACK and Practice Range removal retire without damage or reroute', () => {
  const f = room();
  f.S.net.sendHit(f.S.attacker, f.S.victim, 36, 'shooter');
  const packet = f.S.sent[0].data;
  leave(f.S, 'V', 'H');
  f.S.victim.netLife++;
  f.S.net.onMessage('__relay__', { k: 'hit_nack', seq: packet.seq, to: 'V' });
  assert.equal(f.S.sent.length, 1, 'a previous-life hit is not forwarded to the adopted owner');
  assert.equal(f.S.net.hitPending.size, 0);
  assert.equal(f.S.net._pendingHits.size, 0);

  const noBots = room();
  noBots.S.net.cfg.map = 'range';
  noBots.S.net.sendHit(noBots.S.attacker, noBots.S.victim, 36, 'shooter');
  const noBotsHit = noBots.S.sent[0].data;
  leave(noBots.S, 'V', 'H');
  noBots.S.net.onMessage('__relay__', { k: 'hit_nack', seq: noBotsHit.seq, to: 'V' });
  assert.equal(noBots.S.net.byNid.has(4), false, 'the noBots Actor remains removed on leave');
  assert.equal(noBots.S.net.hitPending.size, 0);
  assert.equal(noBots.S.net._pendingHits.size, 0);
});

test('production mapNoBots cargo removes the actor and retires its hit without rerouting', () => {
  assert.equal(mapNoBots('cargo'), true, 'cargo is the production noBots map id');
  const f = room();
  f.S.net.cfg.map = 'cargo';
  assert.equal(f.S.net.sendHit(f.S.attacker, f.S.victim, 36, 'shooter'), true);
  const packet = f.S.sent[0].data;
  f.S.net.onMessage('__relay__', { k: 'hit_nack', seq: packet.seq, to: 'V' });
  leave(f.S, 'V', 'H');
  assert.equal(f.S.net.byNid.has(4), false, 'the actual noBots map removes the departing Actor');
  assert.equal(f.S.sent.length, 1, 'the intentionally removed Actor receives no handoff retry');
  assert.equal(f.S.net.hitPending.size, 0);
  assert.equal(f.S.net._pendingHits.size, 0);
});

test('composed hit receipt accepts a delayed retry before rejecting duplicate identity', () => {
  const f = room();
  const receiver = f.V.net;
  const base = { k: 'hit', v: 4, a: 7, l: 5, d: 20, w: 'shooter', rp: false };
  deliver(f.S, f.V, { ...base, h: 2, seq: 2 });
  deliver(f.S, f.V, { ...base, h: 1, seq: 1 });
  assert.equal(f.V.victim.hp, 60, 'an older undelivered hit can arrive after a newer accepted hit');
  deliver(f.S, f.V, { ...base, h: 1, seq: 1 });
  assert.equal(f.V.victim.hp, 60, 'the accepted hit sequence is deduplicated');
  assert.equal(receiver._peer('S').lastHit, 2);
});

test('composed hit dedupe retains the inclusive 65,536-id window without scanning its Set', () => {
  const f = room();
  const peer = f.V.net._peer('S');
  class NoFullScanSet extends Set {
    [Symbol.iterator]() { throw new Error('dedupe path scanned the retained Set'); }
  }
  peer.lastHit = 65536;
  peer.hitSequences = new NoFullScanSet([1, 65536]);
  peer.hitSequenceSlots = new Map([[1, 1], [0, 65536]]);
  const base = { k: 'hit', v: 4, a: 7, l: 5, d: 20, w: 'shooter', rp: false };
  deliver(f.S, f.V, { ...base, h: 65537, seq: 65537 });
  assert.equal(f.V.victim.hp, 80);
  assert.equal(peer.hitSequences.has(1), false, 'high-water movement retires the id at the expired boundary');
  assert.equal(peer.hitSequences.has(65536), true);
  assert.equal(peer.hitSequences.has(65537), true);
  assert.equal(peer.hitSequenceSlots.get(1), 65537);
  deliver(f.S, f.V, { ...base, h: 1, seq: 1 });
  deliver(f.S, f.V, { ...base, h: 2, seq: 2 });
  deliver(f.S, f.V, { ...base, h: 2, seq: 2 });
  assert.equal(f.V.victim.hp, 60, 'the expired boundary is rejected, the first in-window ID applies once');
  assert.equal(f.V.calls.length, 2);
});

test('bind, disposal, and the production session close path retire hit state before reconnect', () => {
  const f = room();
  f.S.net.sendHit(f.S.attacker, f.S.victim, 36, 'shooter');
  f.S.net.bind({ actors: [], boss: null });
  assert.equal(f.S.net.hitPending.size, 0, 'rebinding clears delivery retries');
  assert.equal(f.S.net._pendingHits.size, 0, 'rebinding clears combat receipts');
  assert.equal(f.S.G.netm, f.S.net, 'the composed production bind path owns the active match');

  f.S.net.sendHit(f.S.attacker, f.S.victim, 36, 'shooter');
  f.S.net.dispose();
  assert.equal(f.S.net.hitPending.size, 0, 'dispose clears delivery retries');
  assert.equal(f.S.net._pendingHits.size, 0, 'dispose clears combat receipts');
  assert.equal(f.S.net.unsubs.length, 0);

  const lost = room();
  lost.S.net.bind({ actors: [], boss: null });
  lost.S.net.sendHit(lost.S.attacker, lost.S.victim, 36, 'shooter');
  const SessionHarness = new Function('G', 'MAPS', 'MATCH', 'TEAM', 'mapNoBots',
    `return class SessionHarness { ${methodFrom(sessionSource, '_closed')} ${methodFrom(sessionSource, 'leave')} ${methodFrom(sessionSource, '_blankLobby')} }`)
    (lost.S.G, [{ id: 'tidewater' }], { defaultDuration: 180 }, 4, mapNoBots);
  const aborted = [];
  const session = Object.assign(new SessionHarness(), {
    state: 'match', match: lost.S.net, tr: { close() {} }, code: 'ROOM', error: null,
    _roomAttempt: 0, _members: new Map(), _goT: null,
    _setState(state) { this.state = state; }, _emit(name, detail) { aborted.push({ name, detail }); },
  });
  lost.S.G.game = { netMatchAborted(reason) { aborted.push({ name: 'aborted', reason }); } };
  session._closed('lost');
  assert.equal(session.match, null);
  assert.equal(lost.S.net.hitPending.size, 0, 'connection close disposes the old delivery queue');
  assert.equal(lost.S.net._pendingHits.size, 0, 'connection close disposes the old combat queue');
  const reconnected = makeWorld('S');
  reconnected.attacker = actor(7, 'S', 'S', 0, 2);
  reconnected.victim = actor(4, 'V', 'S', 1, 5);
  reconnected.net.byNid.set(7, reconnected.attacker);
  reconnected.net.byNid.set(4, reconnected.victim);
  assert.equal(reconnected.net.sendHit(reconnected.attacker, reconnected.victim, 36, 'shooter'), true);
  assert.equal(reconnected.sent[0].data.h, 1, 'a new match starts with a fresh hit identity space');
  assert.equal(reconnected.net.hitPending.size, 1);
});
