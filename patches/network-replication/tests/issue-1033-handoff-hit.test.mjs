import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { WEAPONS } from '../../../inkwave-public/src/config.js';
import { retireDisconnectedMainProjectiles } from '../../splatoon3/runtime/disconnect-fidelity.mjs';
import { respawnPunisherEquipped, withHitPunisher } from '../../splatoon3/runtime/clothing-gear.mjs';
import { validDamageGroup } from '../../splatoon3/runtime/final-damage.mjs';
import { C1088_SURGE_TAG, clearRemoteC1088Surge } from '../issue-1088-surge-presentation.mjs';
import { clearRemoteRollerPresentation } from '../roller-presentation.mjs';

const raw = fs.readFileSync(new URL('../../../inkwave-public/src/net/netmatch.js', import.meta.url), 'utf8');
const source = adaptBuildSource('src/net/netmatch.js', raw);

function method(name, optional = false) {
  const start = source.indexOf('  ' + name + '(');
  if (start < 0) {
    assert.ok(optional, `composed NetMatch method ${name}`);
    return `  ${name}() { return false; }`;
  }
  const end = source.indexOf('\n  }\n', start);
  assert.ok(end > start, `composed NetMatch method end ${name}`);
  return source.slice(start, end + 4);
}

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
    'sendHit', '_retirePendingSequence', '_retirePendingHit', '_retirePendingHitsForVictim', '_retryPendingHitsForLeave',
    '_retryNackedHit', '_hitNack', '_hit', '_hitAck', 'onMessage', 'onLeave', 'dispose',
  ];
  const methods = methodNames.map((name) => method(name, name.startsWith('_retire') || name.startsWith('_retry'))).join('\n');
  const NetMatchHarness = new Function(
    'G', 'PLAYER', 'on', 'emit', 'r2', 'IW_HIT_MAX_DAMAGE', 'IW_HIT_CAUSES', 'mapNoBots',
    'rearmTeamWipe', 'respawnPunisherEquipped', 'withHitPunisher', 'clearRemoteC1088Surge',
    'WEAPONS', 'validDamageGroup', 'clearRemoteRollerPresentation', 'C1088_SURGE_TAG',
    'retireDisconnectedMainProjectiles',
    `${helpers}\n${ghostHelper}\nreturn class NetMatchHarness {
${methods}
  _adopt(actor) { actor.remote = false; actor.isBot = true; actor.net.buf.length = 0; }
  _remove(actor) { this.byNid.delete(actor.nid); this.match?.removeActor?.(actor); }
  _stopLoops() {}
}`,
  )(
    G, { hp: 100, spawnInvuln: 3 }, on, emit, (x) => Math.round(x * 100) / 100,
    180, new Set(['shooter']), (map) => map === 'cargo-terminal' || map === 'range',
    () => {}, respawnPunisherEquipped, withHitPunisher, clearRemoteC1088Surge,
    WEAPONS, validDamageGroup, clearRemoteRollerPresentation, C1088_SURGE_TAG,
    retireDisconnectedMainProjectiles,
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
  deliver(f.V, f.S, ack);
  assert.equal(f.S.net.hitPending.size, 0);
  assert.equal(f.S.net._pendingHits.size, 0);
  assert.equal(f.S.events.filter((event) => event.name === 'combat:confirmed').length, 1);
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
