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
const hitStateStart = source.indexOf("const HIT_AUTHORITY_TAG = '");
const hitStateEnd = source.indexOf('\nconst ADOPTION_STATE_TAG', hitStateStart);
assert.ok(hitStateStart >= 0 && hitStateEnd > hitStateStart, 'production hit-state snapshot helpers are composed');
const hitAuthoritySource = source.slice(hitStateStart, hitStateEnd);
const { packHitAuthorityState, readHitAuthorityState } = new Function(
  'PLAYER', `${hitAuthoritySource}\nreturn { packHitAuthorityState, readHitAuthorityState };`,
)({ hp: 100 });
function sourceFunction(name) {
  const start = source.indexOf(`function ${name}(`), end = source.indexOf('\n}\n', start);
  assert.ok(start >= 0 && end > start, `production ${name} is composed`);
  return source.slice(start, end + 3);
}
const productionPackActor = new Function(
  'PLAYER', 'F', 'SPAWN_ARMOR_FLAG', 'RESPAWN_PUNISHER_FLAG', 'chargerSightVisible', 'slamProtected',
  'spawnProtectionRemaining', 'respawnPunisherEquipped', 'swimTrailVisible', 'swimSplashVisible', 'r2', 'r3',
  'packAdoptionState', 'packC1088SurgePresentation',
  `${hitAuthoritySource}\n${sourceFunction('packActor')}\nreturn packActor;`,
)({ hp: 100 }, {}, 0, 0, () => false, () => false, () => 0, () => false, () => true, () => true,
  (x) => Math.round(x * 100) / 100, (x) => Math.round(x * 1000) / 1000, () => null, () => null);
const productionUnpackActor = new Function('PLAYER',
  `${hitAuthoritySource}\n${sourceFunction('unpackActor')}\nreturn unpackActor;`,
)({ hp: 100 });

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
  const dropStart = source.indexOf('function clearRemoteDropRoll(');
  const dropEnd = source.indexOf('function syncRemoteDropRoll(', dropStart);
  assert.ok(dropStart >= 0 && dropEnd > dropStart, 'production Drop Roller cleanup is composed');
  const dropCleanup = source.slice(dropStart, dropEnd);
  const methodNames = [
    'sendHit', 'shouldApplyHit', '_retirePendingSequence', '_retirePendingHit', '_retirePendingHitsForVictim', '_retryPendingHitsForLeave',
    '_retryNackedHit', '_hitNack', '_hit', '_hitAck', '_hitHandoffPacket', '_readHitHandoffPacket', '_validHitAuthorityMetadata',
    '_hitHandoffParentEntries', '_hitHandoffParentOffset', '_mergeHitAuthorityParent', '_acceptHitAuthorityAck', '_acceptHitAuthoritySnapshot', '_hitAuthorityHp',
    'onMessage', 'onLeave', '_onLocalEvent', 'bind', 'dispose', '_requestFirstSplat',
  ];
  const forwardStart = source.indexOf('const FORWARD = '), forwardEnd = source.indexOf(';', forwardStart);
  assert.ok(forwardStart >= 0 && forwardEnd > forwardStart, 'production event-forward list is composed');
  const forwardList = source.slice(forwardStart, forwardEnd + 1);
  const limitsStart = source.indexOf('const HIT_DELIVERY_LIMIT = '), limitsEnd = source.indexOf('const TICK = 1 / 20;', limitsStart);
  assert.ok(limitsStart >= 0 && limitsEnd > limitsStart, 'production bounded hit limits are composed');
  const hitLimits = source.slice(limitsStart, limitsEnd);
  const methods = methodNames.map((name) => method(name, name.startsWith('_retire') || name.startsWith('_retry'))).join('\n');
  const NetMatchHarness = new Function(
    'G', 'PLAYER', 'on', 'emit', 'r2', 'IW_HIT_MAX_DAMAGE', 'IW_HIT_CAUSES', 'mapNoBots', 'now',
    'rearmTeamWipe', 'respawnPunisherEquipped', 'withHitPunisher', 'clearRemoteC1088Surge',
    'WEAPONS', 'validDamageGroup', 'clearRemoteRollerPresentation', 'C1088_SURGE_TAG',
    'retireDisconnectedMainProjectiles', 'clearRemoteDodgeClock', 'KIT_FORWARD',
    `${helpers}\n${ghostHelper}\n${dropCleanup}\n${hitLimits}\n${hitAuthoritySource}\n${forwardList}\nreturn class NetMatchHarness {
${methods}
  _setupActor() {}
  _adopt(actor) { actor.remote = false; actor.isBot = true; actor.net.buf.length = 0; }
  _remoteSplat(actor) { this.authoritySplatCalls = (this.authoritySplatCalls || 0) + 1; actor.alive = false; actor.hp = 0; }
  _remove(actor) {
    if (actor.net) { actor.net._hitHandoff = null; actor.net._hitAuthority = null; }
    this.byNid.delete(actor.nid); this.match?.removeActor?.(actor);
  }
  _stopLoops() {}
}`,
  )(
    G, { hp: 100, spawnInvuln: 3 }, on, emit, (x) => Math.round(x * 100) / 100,
    180, new Set(['shooter']), mapNoBots, () => 1,
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
      broadcast(data) { sent.push({ to: '*', data }); return true; },
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
    pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, stats: { turf: 0, specials: 0 },
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

function ack(world, index = -1) { return world.sent.filter((item) => item.data?.k === 'hit_ack').at(index)?.data; }

function deliver(from, to, packet) { to.net.onMessage(from.id, packet); }
function packedHitSnapshot(actor, time) {
  const row = productionPackActor(actor);
  const sample = productionUnpackActor(row, time);
  sample.life = actor.netLife; // the live t packet carries this life in its outer `l` map
  assert.equal(sample.hp, actor.hp, 'the production actor row preserves the current HP');
  return sample;
}
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
  const receipt = ack(f.V);
  assert.ok(receipt, `victim owner returns the existing hit ACK: ${JSON.stringify(f.V.sent)}`);
  assert.equal(receipt.hp, 64, 'ACK carries the victim owner’s resulting HP');
  deliver(f.V, f.S, receipt);
  deliver(f.V, f.S, receipt);
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
  const receipt = ack(f.V);
  leave(f.S, 'V', 'H');
  leave(f.H, 'V', 'H');
  assert.equal(f.S.victim.owner, 'H');
  assert.equal(f.H.victim.remote, false, 'the new host adopts the same Actor');
  assert.equal(f.S.sent.length, 1, 'a hit already delivered to the old owner is not rerouted on leave');
  assert.equal(f.V.victim.hp, 64, 'the departed owner already applied the hit exactly once');
  deliver(f.V, f.H, receipt);
  assert.equal(f.H.victim.hp, 64, 'the host receives same-life HP before the next owner snapshot');
  deliver(f.V, f.S, receipt);
  assert.equal(f.S.net.hitPending.size, 0);
  assert.equal(f.S.net._pendingHits.size, 0);
  assert.equal(f.S.events.filter((event) => event.name === 'combat:confirmed').length, 1);
});

test('composed owner ACK survives a pre-hit snapshot and a later post-hit snapshot without HP rollback', () => {
  const f = room();
  f.S.net.sendHit(f.S.attacker, f.S.victim, 36, 'shooter');
  deliver(f.S, f.V, f.S.sent[0].data);
  const receipt = ack(f.V);
  const oldSnapshot = { t: 0.9, life: 5, hitLife: 5, hitSeq: 0, hp: 100, f: 1 };
  assert.equal(f.H.net._acceptHitAuthoritySnapshot(f.H.victim, oldSnapshot, 'V'), true);
  deliver(f.V, f.H, receipt);
  assert.equal(f.H.victim.hp, 64);
  assert.equal(f.H.net._hitAuthorityHp(f.H.victim, oldSnapshot, 'V'), 64,
    'a delayed pre-hit owner sample cannot resurrect HP');
  const newSnapshot = { t: 2, life: 5, hitLife: 5, hitSeq: receipt.hr, hp: 64, f: 1 };
  assert.equal(f.H.net._hitAuthorityHp(f.H.victim, newSnapshot, 'V'), 64,
    'the first post-hit owner sample confirms the same revision');
  leave(f.H, 'V', 'H');
  assert.equal(f.H.victim.hp, 64, 'adoption keeps the confirmed same-life HP');
  deliver(f.V, f.H, receipt);
  assert.equal(f.H.victim.hp, 64, 'duplicate owner receipt is idempotent');
});

test('composed lethal ACK transfers death to the adopter without replaying the hit', () => {
  const f = room();
  f.V.victim.hp = 18;
  f.H.victim.hp = 18;
  f.S.net.sendHit(f.S.attacker, f.S.victim, 36, 'shooter');
  deliver(f.S, f.V, f.S.sent[0].data);
  const receipt = ack(f.V);
  assert.equal(receipt.kld, 1);
  assert.equal(receipt.hp, 0);
  leave(f.H, 'V', 'H');
  assert.equal(f.H.victim.alive, true, 'the adopter has not received the departed owner’s death yet');
  deliver(f.V, f.H, receipt);
  assert.equal(f.H.victim.hp, 0);
  assert.equal(f.H.victim.alive, false);
  assert.equal(f.H.calls.length, 0, 'the ACK transfers state without applying damage again');
  deliver(f.V, f.H, receipt);
  assert.equal(f.H.net.authoritySplatCalls, 1, 'duplicate lethal receipt cannot replay the splat');
  assert.equal(f.H.victim.hp, 0);
});

test('composed wrong-owner and malformed receipts cannot transfer HP state', () => {
  const f = room();
  f.S.net.sendHit(f.S.attacker, f.S.victim, 36, 'shooter');
  deliver(f.S, f.V, f.S.sent[0].data);
  const receipt = ack(f.V);
  deliver(f.C, f.H, receipt);
  assert.equal(f.H.victim.hp, 100, 'a different authenticated peer cannot transfer the old owner state');
  deliver(f.V, f.H, { ...receipt, hp: 101 });
  assert.equal(f.H.victim.hp, 100, 'out-of-range HP is rejected');
  deliver(f.V, f.H, receipt);
  assert.equal(f.H.victim.hp, 64, 'the authenticated owner receipt is accepted');
  deliver(f.V, f.H, receipt);
  assert.equal(f.H.victim.hp, 64, 'the accepted receipt is duplicate-safe');
});

test('composed owner handoff preserves HP recovery newer than its accepted-hit watermark', () => {
  const f = room();
  assert.equal(f.S.net.sendHit(f.S.attacker, f.S.victim, 36, 'shooter'), true);
  deliver(f.S, f.V, f.S.sent.at(-1).data);
  const receipt = ack(f.V);
  deliver(f.V, f.H, receipt);
  assert.equal(f.H.victim.hp, 64);

  f.H.victim.hp = 80; // owner-side recovery after the accepted hit
  leave(f.H, 'V', 'H');
  assert.equal(f.H.victim.hp, 80, 'adoption checkpoints current HP instead of the older hit ACK HP');
  assert.deepEqual(f.H.victim.net._hitHandoff, {
    owner: 'V', life: 5, sequence: receipt.hr, ts: receipt.ht, hp: 80,
  });

  deliver(f.V, f.H, receipt);
  assert.equal(f.H.victim.hp, 80, 'a duplicate old-owner receipt cannot undo the recovery');
  const adoptedState = readHitAuthorityState(packHitAuthorityState(f.H.victim), 5);
  assert.equal(adoptedState.parent.hp, 80, 'the next snapshot carries the recovered HP checkpoint');
});

test('composed same-life owner epochs merge concurrent hits regardless of ACK delivery order', () => {
  const run = (oldAckFirst) => {
    const f = room();
    assert.equal(f.S.net.sendHit(f.S.attacker, f.S.victim, 36, 'shooter'), true);
    const oldHit = f.S.sent.at(-1).data;
    deliver(f.S, f.V, oldHit);
    const oldAck = ack(f.V);
    assert.equal(oldAck.hr, 1);
    assert.equal(oldAck.hp, 64);

    leave(f.S, 'V', 'H');
    leave(f.H, 'V', 'H');
    assert.equal(f.H.victim.hp, 100, 'the new owner adopted the stale pre-hit snapshot');
    assert.deepEqual(f.H.victim.net._hitHandoff, { owner: 'V', life: 5, sequence: 0, ts: 0, hp: 100 });

    assert.equal(f.S.net.sendHit(f.S.attacker, f.S.victim, 36, 'shooter'), true);
    const newHit = f.S.sent.at(-1).data;
    assert.equal(f.S.sent.at(-1).to, 'H');
    deliver(f.S, f.H, newHit);
    const newAck = ack(f.H);
    assert.equal(newAck.hr, 1, 'the adopted owner starts its own revision sequence');
    assert.equal(newAck.hp, 64);
    assert.deepEqual(newAck.he, ['V', 5, 0, 0, 100], 'the ACK identifies its prior-owner checkpoint');

    deliver(f.V, f.H, oldAck);
    assert.equal(f.H.victim.hp, 28, 'the delayed prior-owner ACK contributes its unmerged 36 damage');
    assert.equal(f.H.victim.net._hitAuthority.owner, 'H');
    assert.equal(f.H.victim.net._hitAuthority.sequence, 1, 'the prior epoch cannot advance or replace H revision 1');
    const row = packHitAuthorityState(f.H.victim);
    assert.deepEqual(readHitAuthorityState(row, 5), {
      life: 5, sequence: 1, parent: { owner: 'V', life: 5, sequence: 1, ts: oldAck.ht, hp: 64 },
    });
    const staleNewOwnerSample = { t: newAck.ht + 1, life: 5, hitLife: 5, hitSeq: 1, hp: 64,
      hitParent: { owner: 'V', life: 5, sequence: 0, ts: 0, hp: 100 } };
    assert.equal(f.H.net._hitAuthorityHp(f.H.victim, staleNewOwnerSample, 'H'), 28,
      'a delayed snapshot from H cannot roll back V damage already merged after H emitted it');
    const recoveredSample = { t: newAck.ht + 2, life: 5, hitLife: 5, hitSeq: 1, hp: 32,
      hitParent: { owner: 'V', life: 5, sequence: 1, ts: oldAck.ht, hp: 64 } };
    assert.equal(f.H.net._hitAuthorityHp(f.H.victim, recoveredSample, 'H'), 32,
      'a newer same-owner sample still carries HP recovery');

    if (oldAckFirst) {
      deliver(f.V, f.S, oldAck);
      deliver(f.H, f.S, newAck);
    } else {
      deliver(f.H, f.S, newAck);
      deliver(f.V, f.S, oldAck);
    }
    assert.equal(f.S.victim.hp, 28, 'both valid owner epochs remain represented at the shooter');
    return { f, oldAck, newAck };
  };
  run(false);
  run(true);
});

test('composed late owner ACK survives the actual V to H to C two-hop handoff', () => {
  const f = room();
  assert.equal(f.S.net.sendHit(f.S.attacker, f.S.victim, 36, 'shooter'), true);
  deliver(f.S, f.V, f.S.sent.at(-1).data);
  const oldAck = ack(f.V);
  assert.equal(oldAck.hp, 64);

  for (const world of [f.S, f.H, f.C]) leave(world, 'V', 'H');
  for (const world of [f.S, f.H, f.C]) leave(world, 'H', 'C', true);
  assert.equal(f.C.victim.owner, 'C');
  assert.deepEqual(f.C.net._hitHandoffPacket(f.C.victim), [
    'inkwave-hit-handoff-chain-v1', ['V', 5, 0, 0, 100], ['H', 5, 0, 0, 100],
  ], 'the second handoff carries both same-life predecessor checkpoints');

  deliver(f.V, f.C, oldAck);
  deliver(f.V, f.S, oldAck);
  assert.equal(f.C.victim.hp, 64, 'the final owner applies the original accepted damage exactly once');
  assert.equal(f.S.victim.hp, 64, 'the shooter receives the same reconciled HP');
  deliver(f.V, f.C, oldAck);
  deliver(f.V, f.S, oldAck);
  assert.equal(f.C.victim.hp, 64, 'duplicate old-owner ACK cannot apply damage twice');
  assert.equal(f.S.events.filter((event) => event.name === 'combat:confirmed').length, 1,
    'the accepted hit confirms once');
  assert.equal(f.S.net.hitPending.size, 0);
  assert.equal(f.S.net._pendingHits.size, 0);
});

test('composed concurrent old/new hits reconcile ACK and packed snapshots in either order', () => {
  const run = (oldAckFirst) => {
    const f = room();
    assert.equal(f.S.net.sendHit(f.S.attacker, f.S.victim, 36, 'shooter'), true);
    deliver(f.S, f.V, f.S.sent.at(-1).data);
    const oldAck = ack(f.V);
    for (const world of [f.S, f.H, f.C]) leave(world, 'V', 'H');
    for (const world of [f.S, f.H, f.C]) leave(world, 'H', 'C', true);

    assert.equal(f.S.net.sendHit(f.S.attacker, f.S.victim, 36, 'shooter'), true);
    const newHit = f.S.sent.at(-1).data;
    assert.equal(f.S.sent.at(-1).to, 'C');
    deliver(f.S, f.C, newHit);
    const newAck = ack(f.C);
    assert.equal(f.C.victim.hp, 64, 'the new owner independently accepts its concurrent hit');
    const staleSnapshot = packedHitSnapshot(f.C.victim, newAck.ht + 0.1);
    assert.equal(staleSnapshot.hitSeq, newAck.hr, 'snapshot revision comes from the production hit-state serializer');

    if (oldAckFirst) {
      deliver(f.V, f.C, oldAck);
      deliver(f.V, f.S, oldAck);
      deliver(f.C, f.S, newAck);
    } else {
      deliver(f.C, f.S, newAck);
      deliver(f.V, f.C, oldAck);
      deliver(f.V, f.S, oldAck);
    }
    assert.equal(f.C.victim.hp, 28, 'the final owner combines both accepted hits');
    assert.equal(f.S.victim.hp, 28, 'ACK order cannot roll back either hit');
    assert.equal(f.S.net._acceptHitAuthoritySnapshot(f.S.victim, staleSnapshot, 'C'), true,
      'a snapshot emitted before the old ACK is reconciled against the newer local checkpoint');
    assert.equal(f.S.victim.hp, 28, 'late snapshot cannot replace the newer reconciled HP');
    assert.equal(f.S.net._hitAuthorityHp(f.S.victim, staleSnapshot, 'C'), 28,
      'replayed stale snapshot remains behind the current owner watermark');

    deliver(f.V, f.C, oldAck);
    deliver(f.V, f.S, oldAck);
    deliver(f.C, f.S, newAck);
    assert.equal(f.C.victim.hp, 28, 'duplicate ACK delivery does not repeat damage');
    assert.equal(f.S.victim.hp, 28, 'duplicate ACK delivery cannot reset current-owner HP');
    assert.equal(f.V.calls.length, 1);
    assert.equal(f.C.calls.length, 1);
    assert.equal(f.S.events.filter((event) => event.name === 'combat:confirmed').length, 2,
      'each accepted hit confirms once across duplicate deliveries');
    assert.equal(f.S.net.hitPending.size, 0);
    assert.equal(f.S.net._pendingHits.size, 0);
  };
  run(true);
  run(false);
});

test('composed cumulative lethal damage across chained owners produces one splat', () => {
  for (const oldAckFirst of [true, false]) {
    const f = room();
    assert.equal(f.S.net.sendHit(f.S.attacker, f.S.victim, 60, 'shooter'), true);
    deliver(f.S, f.V, f.S.sent.at(-1).data);
    const oldAck = ack(f.V);
    assert.equal(oldAck.hp, 40);
    for (const world of [f.S, f.H, f.C]) leave(world, 'V', 'H');
    for (const world of [f.S, f.H, f.C]) leave(world, 'H', 'C', true);

    assert.equal(f.S.net.sendHit(f.S.attacker, f.S.victim, 50, 'shooter'), true);
    deliver(f.S, f.C, f.S.sent.at(-1).data);
    const newAck = ack(f.C);
    assert.equal(f.C.victim.hp, 50);
    if (oldAckFirst) {
      deliver(f.V, f.C, oldAck);
      deliver(f.V, f.S, oldAck);
      deliver(f.C, f.S, newAck);
    } else {
      deliver(f.C, f.S, newAck);
      deliver(f.V, f.C, oldAck);
      deliver(f.V, f.S, oldAck);
    }
    assert.equal(f.C.victim.hp, 0);
    assert.equal(f.C.victim.alive, false);
    assert.equal(f.S.victim.hp, 0);
    assert.equal(f.S.victim.alive, false);
    assert.equal(f.C.net.authoritySplatCalls, 1, 'combined accepted damage splats the final owner once');
    assert.equal(f.S.net.authoritySplatCalls, 1, 'combined accepted damage splats the shooter proxy once');
    deliver(f.V, f.C, oldAck);
    deliver(f.V, f.S, oldAck);
    deliver(f.C, f.S, newAck);
    assert.equal(f.C.net.authoritySplatCalls, 1, 'duplicate lethal ACKs cannot replay the splat');
    assert.equal(f.S.net.authoritySplatCalls, 1);
    assert.equal(f.S.events.filter((event) => event.name === 'combat:confirmed').length, 2);
    assert.equal(f.S.net.hitPending.size, 0);
    assert.equal(f.S.net._pendingHits.size, 0);
  }
});

test('composed owner checkpoint chain remains bounded and legacy checkpoint tuples still decode', () => {
  const f = room();
  let departed = 'V';
  for (let index = 0; index < 12; index++) {
    const successor = `peer-${index}`;
    f.S.net.s.hostId = successor;
    f.S.victim.owner = departed;
    f.S.net.onLeave(departed, true);
    departed = successor;
  }
  const packet = f.S.net._hitHandoffPacket(f.S.victim);
  assert.equal(packet[0], 'inkwave-hit-handoff-chain-v1');
  assert.equal(packet.length, 9, 'only eight owner checkpoints are retained on the wire');
  assert.deepEqual(f.S.net._readHitHandoffPacket(['legacy-owner', 5, 3, 7.5, 82]), {
    owner: 'legacy-owner', life: 5, sequence: 3, ts: 7.5, hp: 82,
  }, 'the pre-chain single-owner tuple remains readable');
  const twoHop = room();
  leave(twoHop.S, 'V', 'H');
  leave(twoHop.S, 'H', 'C', true);
  const oldFormatLatestParent = twoHop.S.net._readHitHandoffPacket(['H', 5, 0, 0, 100]);
  assert.ok(Number.isFinite(twoHop.S.net._hitHandoffParentOffset(twoHop.S.victim, oldFormatLatestParent)),
    'a legacy single-parent packet still matches the latest checkpoint of a local chain');
  assert.equal(f.S.net._readHitHandoffPacket([
    'inkwave-hit-handoff-chain-v1', ['duplicate', 5, 1, 1, 90], ['duplicate', 5, 2, 2, 80],
  ]), false, 'ambiguous repeated owners are rejected');
  assert.equal(f.S.net._readHitHandoffPacket([
    'inkwave-hit-handoff-chain-v1', ...Array.from({ length: 9 }, (_, i) => [`peer-${i}`, 5, 0, 0, 100]),
  ]), false, 'oversized chain metadata is rejected');
});

test('composed malformed authority ACK leaves the exact hit receipt pending for a valid ACK', () => {
  const f = room();
  assert.equal(f.S.net.sendHit(f.S.attacker, f.S.victim, 36, 'shooter'), true);
  const hit = f.S.sent.at(-1).data;
  deliver(f.S, f.V, hit);
  const receipt = ack(f.V);
  assert.equal(f.S.net.hitPending.size, 1);
  assert.equal(f.S.net._pendingHits.size, 1);

  deliver(f.V, f.S, { ...receipt, hp: 101 });
  assert.equal(f.S.net.hitPending.size, 1, 'malformed HP cannot retire delivery retry state');
  assert.equal(f.S.net._pendingHits.size, 1, 'malformed HP cannot retire combat confirmation state');
  assert.equal(f.S.events.filter((event) => event.name === 'combat:confirmed').length, 0);

  deliver(f.V, f.S, receipt);
  assert.equal(f.S.net.hitPending.size, 0);
  assert.equal(f.S.net._pendingHits.size, 0);
  assert.equal(f.S.events.filter((event) => event.name === 'combat:confirmed').length, 1,
    'the still-pending exact hit settles from its valid ACK');
});

test('composed multiple owner ACKs reconcile by life revision when they arrive out of order', () => {
  const f = room();
  f.S.net.sendHit(f.S.attacker, f.S.victim, 36, 'shooter');
  deliver(f.S, f.V, f.S.sent.at(-1).data);
  const first = ack(f.V);
  f.S.net.sendHit(f.S.attacker, f.S.victim, 10, 'shooter');
  deliver(f.S, f.V, f.S.sent.at(-1).data);
  const second = ack(f.V);
  assert.equal(first.hr, 1);
  assert.equal(second.hr, 2);
  deliver(f.V, f.H, second);
  deliver(f.V, f.H, first);
  deliver(f.V, f.H, second);
  assert.equal(f.H.victim.hp, 54, 'older and duplicate receipts cannot overwrite the newer owner result');
  leave(f.H, 'V', 'H');
  assert.equal(f.H.victim.hp, 54);
});

test('composed victim respawn retires a previous-life ACK while attacker respawn suppresses old progression', () => {
  const staleVictim = room();
  staleVictim.S.net.sendHit(staleVictim.S.attacker, staleVictim.S.victim, 36, 'shooter');
  deliver(staleVictim.S, staleVictim.V, staleVictim.S.sent[0].data);
  const oldLifeAck = ack(staleVictim.V);
  staleVictim.S.victim.netLife = 6;
  staleVictim.S.victim.hp = 100;
  deliver(staleVictim.V, staleVictim.S, oldLifeAck);
  assert.equal(staleVictim.S.victim.hp, 100, 'an old victim-life receipt cannot damage a respawned victim');
  assert.equal(staleVictim.S.events.filter((event) => event.name === 'combat:confirmed').length, 0);

  const staleAttacker = room();
  staleAttacker.S.net.sendHit(staleAttacker.S.attacker, staleAttacker.S.victim, 36, 'shooter');
  deliver(staleAttacker.S, staleAttacker.V, staleAttacker.S.sent[0].data);
  const attackerAck = ack(staleAttacker.V);
  staleAttacker.S.attacker.netLife = 3;
  deliver(staleAttacker.V, staleAttacker.S, attackerAck);
  assert.equal(staleAttacker.S.victim.hp, 64, 'the accepted victim state still transfers');
  assert.equal(staleAttacker.S.events.filter((event) => event.name === 'combat:confirmed').length, 0,
    'a respawned attacker receives no previous-life progression');
  assert.equal(staleAttacker.S.net._pendingHits.size, 0);
});

test('composed actor snapshot hit revision is life-bound and preserves the current owner sequence', () => {
  const a = actor(4, 'H', 'H', 1, 5);
  a.net._hitAuthority = { owner: 'H', life: 5, sequence: 2, ts: 3, hp: 54, alive: true };
  const row = packHitAuthorityState(a);
  assert.deepEqual(readHitAuthorityState(row, 5), { life: 5, sequence: 2, parent: null });
  assert.equal(readHitAuthorityState(row, 6), null, 'another life cannot reuse the previous revision');
  a.netLife = 6;
  assert.deepEqual(readHitAuthorityState(packHitAuthorityState(a), 6), { life: 6, sequence: 0, parent: null });
});

test('composed ordinary hit to a host-owned victim is acknowledged and deduplicated', () => {
  const f = room();
  for (const world of Object.values(f)) {
    world.victim.owner = 'H';
    world.victim.remote = world.id !== 'H';
  }
  assert.equal(f.S.net.sendHit(f.S.attacker, f.S.victim, 36, 'shooter'), true);
  const packet = f.S.sent[0].data;
  assert.equal(f.S.sent[0].to, 'H');
  deliver(f.S, f.H, packet);
  assert.equal(f.H.victim.hp, 64, 'the host owns and applies this ordinary cross-owner hit');
  const receipt = ack(f.H);
  assert.ok(receipt);
  deliver(f.H, f.S, receipt);
  deliver(f.S, f.H, packet);
  assert.equal(f.H.victim.hp, 64);
  assert.equal(f.H.calls.length, 1);
  assert.equal(f.S.net.hitPending.size, 0);
  assert.equal(f.S.net._pendingHits.size, 0);
});

test('composed lethal hit survives guest handoff and produces one splat', () => {
  const f = room();
  f.S.victim.hp = 18;
  f.H.victim.hp = 18;
  assert.equal(f.S.net.sendHit(f.S.attacker, f.S.victim, 36, 'shooter'), true);
  const packet = f.S.sent[0].data;
  f.S.net.onMessage('__relay__', { k: 'hit_nack', seq: packet.seq, to: 'V' });
  leave(f.S, 'V', 'H');
  leave(f.H, 'V', 'H');
  assert.equal(f.H.victim.remote, false, 'the host adopts the same victim life');
  const retry = f.S.sent.at(-1);
  assert.equal(retry.to, 'H');
  assert.strictEqual(retry.data, packet, 'handoff retries the accepted lethal packet unchanged');
  deliver(f.S, f.H, retry.data);
  assert.equal(f.H.victim.hp, 0);
  assert.equal(f.H.victim.alive, false);
  assert.equal(f.H.calls.length, 1);
  assert.equal(f.H.events.filter((event) => event.name === 'splatted').length, 1);
  const receipt = ack(f.H);
  assert.ok(receipt);
  deliver(f.H, f.S, receipt);
  deliver(f.S, f.H, retry.data);
  assert.equal(f.H.victim.hp, 0);
  assert.equal(f.H.calls.length, 1);
  assert.equal(f.H.events.filter((event) => event.name === 'splatted').length, 1);
  assert.equal(f.S.net.hitPending.size, 0);
  assert.equal(f.S.net._pendingHits.size, 0);
});

test('composed handoff outcome is invariant across 30/60/120 Hz render callback schedules', () => {
  const run = (hz) => {
    const f = room();
    f.S.victim.hp = 18;
    f.H.victim.hp = 18;
    assert.equal(f.S.net.sendHit(f.S.attacker, f.S.victim, 36, 'shooter'), true);
    const packet = f.S.sent[0].data;
    const actions = [
      { at: 0.017, run: () => f.S.net.onMessage('__relay__', { k: 'hit_nack', seq: packet.seq, to: 'V' }) },
      { at: 0.034, run: () => { leave(f.S, 'V', 'H'); leave(f.H, 'V', 'H'); } },
      { at: 0.067, run: () => deliver(f.S, f.H, f.S.sent.at(-1).data) },
      { at: 0.084, run: () => deliver(f.H, f.S, ack(f.H)) },
    ];
    let renderedFrames = 0;
    for (const action of actions) {
      const targetFrame = Math.ceil(action.at * hz - 1e-9);
      while (renderedFrames < targetFrame) renderedFrames++;
      action.run();
    }
    return {
      hp: f.H.victim.hp,
      alive: f.H.victim.alive,
      splats: f.H.events.filter((event) => event.name === 'splatted').length,
      applications: f.H.calls.length,
      deliveryPending: f.S.net.hitPending.size,
      receiptPending: f.S.net._pendingHits.size,
      renderedFrames,
    };
  };
  const results = [30, 60, 120].map(run);
  assert.deepEqual(results, [
    { hp: 0, alive: false, splats: 1, applications: 1, deliveryPending: 0, receiptPending: 0, renderedFrames: 3 },
    { hp: 0, alive: false, splats: 1, applications: 1, deliveryPending: 0, receiptPending: 0, renderedFrames: 6 },
    { hp: 0, alive: false, splats: 1, applications: 1, deliveryPending: 0, receiptPending: 0, renderedFrames: 11 },
  ]);
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
  const receipt = ack(f.H);
  assert.ok(receipt);
  deliver(f.H, f.S, receipt);
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
  const finalAck = ack(f.C);
  assert.ok(finalAck, `final owner applied the retry and returned an ACK; calls=${f.C.calls.length}, hp=${f.C.victim.hp}`);
  deliver(f.C, f.S, finalAck);
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

  const removedChain = room();
  leave(removedChain.S, 'V', 'H');
  assert.ok(removedChain.S.victim.net._hitHandoff, 'the first transfer established owner checkpoint state');
  removedChain.S.net.cfg.map = 'range';
  leave(removedChain.S, 'H', 'C', true);
  assert.equal(removedChain.S.net.byNid.has(4), false);
  assert.equal(removedChain.S.victim.net._hitHandoff, null, 'Range removal releases the retained owner chain');
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
  leave(f.S, 'V', 'H');
  leave(f.S, 'H', 'C', true);
  assert.ok(f.S.victim.net._hitHandoff, 'the actual two-hop handoff retains a chain before rebinding');
  f.S.net.bind({ actors: [], boss: null });
  assert.equal(f.S.net.hitPending.size, 0, 'rebinding clears delivery retries');
  assert.equal(f.S.net._pendingHits.size, 0, 'rebinding clears combat receipts');
  assert.equal(f.S.victim.net._hitHandoff, null, 'rebinding releases the old match owner chain');
  assert.equal(f.S.G.netm, f.S.net, 'the composed production bind path owns the active match');

  f.S.net.sendHit(f.S.attacker, f.S.victim, 36, 'shooter');
  leave(f.S, 'C', 'H');
  assert.ok(f.S.victim.net._hitHandoff, 'the next session has fresh owner state before disposal');
  f.S.net.dispose();
  assert.equal(f.S.net.hitPending.size, 0, 'dispose clears delivery retries');
  assert.equal(f.S.net._pendingHits.size, 0, 'dispose clears combat receipts');
  assert.equal(f.S.victim.net._hitHandoff, null, 'dispose releases the owner chain before reconnect');
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
