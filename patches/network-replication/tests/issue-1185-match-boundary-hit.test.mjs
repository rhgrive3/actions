// #1185: a hit or hit_ack created in one match must not touch a reused actor in the next match.
// Executes the composed production NetMatch owner methods; transport and damage are bounded sinks.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';
import { adaptNetworkSource } from '../adapter.mjs';
import { validDamageGroup } from '../../splatoon3/runtime/final-damage.mjs';
import { respawnPunisherEquipped, withHitPunisher } from '../../splatoon3/runtime/clothing-gear.mjs';
import { clearRemoteC1088Surge } from '../issue-1088-surge-presentation.mjs';
import { clearRemoteRollerPresentation } from '../roller-presentation.mjs';
import { clearRemoteDodgeClock } from '../../splatoon3/runtime/remote-dodge-clock.mjs';
import { rearmTeamWipe } from '../../local-quality/team-wipeout.mjs';

const raw = fs.readFileSync(new URL('../../../inkwave-public/src/net/netmatch.js', import.meta.url), 'utf8');
const rel = 'src/net/netmatch.js';
const source = adaptNetworkSource(rel, adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, raw)))));
const hitStateStart = source.indexOf("const HIT_AUTHORITY_TAG = '");
const hitStateEnd = source.indexOf('\nconst ADOPTION_STATE_TAG', hitStateStart);
assert.ok(hitStateStart >= 0 && hitStateEnd > hitStateStart, 'production hit-authority serialization is composed');
const hitAuthoritySource = source.slice(hitStateStart, hitStateEnd);
const limitsStart = source.indexOf('const HIT_DELIVERY_LIMIT = '), limitsEnd = source.indexOf('const TICK = 1 / 20;', limitsStart);
assert.ok(limitsStart >= 0 && limitsEnd > limitsStart, 'production bounded hit limits are composed');
const hitLimits = source.slice(limitsStart, limitsEnd);
const dropStart = source.indexOf('function clearRemoteDropRoll('), dropEnd = source.indexOf('function syncRemoteDropRoll(', dropStart);
assert.ok(dropStart >= 0 && dropEnd > dropStart, 'production Drop Roller cleanup helper is composed');
const dropCleanup = source.slice(dropStart, dropEnd);
function method(name) {
  const start = source.indexOf('  ' + name + '('), end = source.indexOf('\n  }\n', start);
  assert.ok(start >= 0 && end > start, name);
  return source.slice(start, end + 4);
}
const METHODS = ['onMessage', 'sendHit', '_retirePendingSequence', '_retirePendingHit', '_retirePendingHitsForVictim',
  '_hitHandoffPacket', '_readHitHandoffPacket', '_hitHandoffParentEntries', '_hitHandoffParentOffset', '_mergeHitAuthorityParent',
  '_hit', '_validHitAuthorityMetadata', '_acceptHitAuthorityAck', '_acceptHitAuthoritySnapshot', '_hitAuthorityHp', '_hitAck', '_remoteRespawn'];

// One production NetMatch instance for one match id. Every instance has its own state, as in separate rounds.
function matchWorld({ myId, cfgId }) {
  const sent = [], events = [], listeners = new Map(), calls = [];
  const on = (type, cb) => { const set = listeners.get(type) || new Set(); set.add(cb); listeners.set(type, set); return () => set.delete(cb); };
  const emit = (type, detail) => { events.push({ type, detail }); for (const cb of listeners.get(type) || []) cb(detail); };
  const G = { projectiles: { applyHit(a, v, damage, weapon, group) {
    calls.push({ attacker: a.nid, victim: v.nid, damage, weapon, group });
    v.hp -= damage;
    emit('damage', { victim: v, attacker: a, amount: damage });
  } } };
  const Klass = new Function('G', 'PLAYER', 'on', 'emit', 'r2', 'now', 'IW_HIT_MAX_DAMAGE', 'IW_HIT_CAUSES', 'rearmTeamWipe', 'respawnPunisherEquipped', 'withHitPunisher', 'clearRemoteC1088Surge',
    'WEAPONS', 'validDamageGroup', 'clearRemoteRollerPresentation', 'clearRemoteDodgeClock',
    source.slice(source.indexOf('function clearRemoteSquidroll('), source.indexOf('function syncRemoteSquidroll(')) + dropCleanup + hitLimits + hitAuthoritySource
      + 'return class {' + METHODS.map(method).join('\n') + '}');
  const NetMatchClass = Klass(G, { hp: 100, spawnInvuln: 3 }, on, emit, x => Math.round(x * 100) / 100, () => 1, 1000, new Set(['shooter']), rearmTeamWipe,
    respawnPunisherEquipped, withHitPunisher, clearRemoteC1088Surge, { slosher: { kind: 'slosher' } }, validDamageGroup, clearRemoteRollerPresentation, clearRemoteDodgeClock);
  const n = new NetMatchClass();
  Object.assign(n, { myId, cfg: { id: cfgId }, hitNextSeq: 0, byNid: new Map(), hitPending: new Map(),
    s: { tr: { sendTo(to, data) { sent.push({ to, data }); return true; } } }, peers: new Map(),
    _peer(id) { if (!this.peers.has(id)) this.peers.set(id, {}); return this.peers.get(id); } });
  return { n, sent, events, calls };
}
const actor = (nid, owner, extra = {}) => ({ nid, owner, netLife: 1, alive: true, remote: false, team: 0, hp: 100, ...extra });
const confirmed = (world) => world.events.filter(e => e.type === 'combat:confirmed').length;

test('#1185 an old-match hit cannot damage a reused actor or consume the new match first hit sequence', () => {
  const oldA = matchWorld({ myId: 'A', cfgId: 'round-old' });
  const oldShooter = actor(2, 'A', { team: 1 }), oldVictim = actor(1, 'B', { remote: true });
  oldA.n.byNid.set(1, oldVictim); oldA.n.byNid.set(2, oldShooter);
  assert.equal(oldA.n.sendHit(oldShooter, oldVictim, 36, 'shooter'), true);
  const stale = oldA.sent[0].data;
  assert.equal(stale.m, 'round-old', 'the hit carries the identity of the match that created it');

  // Same room, next match: new actors reuse nid 1/2 and life 1 for the victim owner B.
  const newB = matchWorld({ myId: 'B', cfgId: 'round-new' });
  const victim = actor(1, 'B'), shooter = actor(2, 'A', { team: 1, remote: true });
  newB.n.byNid.set(1, victim); newB.n.byNid.set(2, shooter);
  newB.n.onMessage('A', stale);
  assert.equal(newB.calls.length, 0, 'delayed old-match hit never reaches damage');
  assert.equal(victim.hp, 100);

  // A packet without any identity is also rejected before it can touch sequence state.
  const newA = matchWorld({ myId: 'A', cfgId: 'round-new' });
  const shooterA = actor(2, 'A', { team: 1 }), victimA = actor(1, 'B', { remote: true });
  newA.n.byNid.set(1, victimA); newA.n.byNid.set(2, shooterA);
  newA.n.sendHit(shooterA, victimA, 36, 'shooter');
  const fresh = newA.sent[0].data;
  assert.equal(fresh.h, 1, 'the new match first hit reuses sequence 1 from the stale packet');
  newB.n.onMessage('A', { ...fresh, m: undefined });
  assert.equal(newB.calls.length, 0, 'identity-less hit is rejected');

  newB.n.onMessage('A', fresh);
  assert.equal(newB.calls.length, 1, 'the new match first valid hit is still applied');
  assert.equal(victim.hp, 64);
});

test('#1185 an old-match ACK cannot settle a new pending hit or award new-match progression', () => {
  const oldA = matchWorld({ myId: 'A', cfgId: 'round-old' });
  const oldShooter = actor(2, 'A', { team: 1 }), oldVictim = actor(1, 'B', { remote: true });
  oldA.n.byNid.set(1, oldVictim); oldA.n.byNid.set(2, oldShooter);
  oldA.n.sendHit(oldShooter, oldVictim, 36, 'shooter');
  const stale = oldA.sent[0].data;

  // The old victim owner produces the real ACK for the old packet.
  const oldB = matchWorld({ myId: 'B', cfgId: 'round-old' });
  oldB.n.byNid.set(1, actor(1, 'B')); oldB.n.byNid.set(2, actor(2, 'A', { team: 1, remote: true }));
  oldB.n.onMessage('A', stale);
  const oldAck = oldB.sent.find(item => item.data.k === 'hit_ack')?.data;
  assert.ok(oldAck, 'old victim owner acknowledges the old hit');
  assert.equal(oldAck.m, 'round-old', 'the ACK carries the identity of the hit it settles');

  // The new match has its own pending hit with the same sequence and life.
  const newA = matchWorld({ myId: 'A', cfgId: 'round-new' });
  const shooter = actor(2, 'A', { team: 1 }), victim = actor(1, 'B', { remote: true });
  newA.n.byNid.set(1, victim); newA.n.byNid.set(2, shooter);
  newA.n.sendHit(shooter, victim, 36, 'shooter');
  assert.equal(newA.n._pendingHits.size, 1);
  newA.n.onMessage('B', oldAck);
  assert.equal(newA.n._pendingHits.size, 1, 'stale ACK leaves the new receipt pending');
  assert.equal(newA.n.hitPending.size, 1, 'stale ACK leaves the new delivery pending');
  assert.equal(confirmed(newA), 0, 'stale ACK awards no combat progression');

  // The new match's own ACK still settles it exactly once.
  const newB = matchWorld({ myId: 'B', cfgId: 'round-new' });
  newB.n.byNid.set(1, actor(1, 'B')); newB.n.byNid.set(2, actor(2, 'A', { team: 1, remote: true }));
  newB.n.onMessage('A', newA.sent[0].data);
  const freshAck = newB.sent.find(item => item.data.k === 'hit_ack')?.data;
  assert.equal(freshAck?.m, 'round-new');
  newA.n.onMessage('B', freshAck);
  newA.n.onMessage('B', freshAck);
  assert.equal(confirmed(newA), 1, 'the current ACK confirms once');
  assert.equal(newA.n._pendingHits.size, 0);
  assert.equal(newA.n.hitPending.size, 0);
});
