import {validDamageGroup} from '../../splatoon3/runtime/final-damage.mjs';
import {respawnPunisherEquipped,withHitPunisher} from '../../splatoon3/runtime/clothing-gear.mjs';
import { C1088_SURGE_TAG, clearRemoteC1088Surge } from '../issue-1088-surge-presentation.mjs';
import { clearRemoteRollerPresentation } from '../roller-presentation.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';
import { adaptNetworkSource } from '../adapter.mjs';
import { fixture } from './robustness-fixture.mjs';
import { rearmTeamWipe } from '../../local-quality/team-wipeout.mjs';
import { adaptIssue427 } from '../../splatoon3/issue-427-adapter.mjs';

const raw = fs.readFileSync(new URL('../../../inkwave-public/src/net/netmatch.js', import.meta.url), 'utf8');
const rel = 'src/net/netmatch.js';
const source = adaptNetworkSource(rel, adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, raw)))));
function method(name) {
  const start = source.indexOf('  ' + name + '('), end = source.indexOf('\n  }\n', start);
  assert.ok(start >= 0 && end > start, name);
  return source.slice(start, end + 4);
}
// Execute the exact composed owner methods; transport and damage-event delivery
// are bounded sinks. This covers the adapter connection, not live relay latency.
function hitWorld() {
  const sent = [], events = [], listeners = new Map();
  const on = (type, cb) => { const set = listeners.get(type) || new Set(); set.add(cb); listeners.set(type, set); return () => set.delete(cb); };
  const emit = (type, detail) => { events.push({ type, detail }); for (const cb of listeners.get(type) || []) cb(detail); };
  const calls = [];
  const G = { projectiles: { applyHit(a, v, damage, weapon, group) {
    calls.push({ a, v, damage, weapon, group, punisher:respawnPunisherEquipped(a) }); emit('damage', { victim: v, attacker: a, amount: damage });
  } } };
  const C = new Function('G', 'PLAYER', 'on', 'emit', 'r2', 'IW_HIT_MAX_DAMAGE', 'IW_HIT_CAUSES', 'rearmTeamWipe', 'respawnPunisherEquipped', 'withHitPunisher', 'clearRemoteC1088Surge',
    'WEAPONS', 'validDamageGroup', 'clearRemoteRollerPresentation',
    source.slice(source.indexOf('function clearRemoteSquidroll('), source.indexOf('function syncRemoteSquidroll(')) + 'return class {' + ['sendHit', '_retirePendingSequence', '_retirePendingHit', '_retirePendingHitsForVictim', '_hit', '_hitAck', '_remoteRespawn'].map(method).join('\n') + '}')
    (G, { hp: 100, spawnInvuln: 3 }, on, emit, x => Math.round(x * 100) / 100, 1000, new Set(['shooter']), rearmTeamWipe, respawnPunisherEquipped, withHitPunisher, clearRemoteC1088Surge, {slosher:{kind:'slosher'}}, validDamageGroup, clearRemoteRollerPresentation);
  const n = new C();
  Object.assign(n, { myId: 'A', byNid: new Map(), hitPending: new Map(), s: { tr: { sendTo(to, data) { sent.push({ to, data }); } } },
    peers: new Map(), _peer(id) { if (!this.peers.has(id)) this.peers.set(id, {}); return this.peers.get(id); } });
  return { n, sent, events, calls, G, listeners };
}

test('composed #427 keeps unrounded damage/group sidecar and binds one ACK to the current life', () => {
  const f = hitWorld(), a = { nid: 1, owner: 'A', netLife: 1, alive: true, remote: false },
    v = { nid: 2, owner: 'B', netLife: 2, alive: true, remote: true, s3PendingHitGroup: 'volley:7' };
  a.s3={loadout:[{main:'none'},{main:'respawnPunisher'},{main:'none'}]};
  f.n.byNid.set(1, a); f.n.byNid.set(2, v);
  assert.equal(f.n.sendHit(a, v, 12.34567, 'shooter'), true);
  const message = f.sent[0].data;
  assert.equal(message.rp,true,'actual equipment helper supplies wire metadata');
  assert.equal(message.d, 12.34567); assert.equal(message.g, 'volley:7');
  assert.equal(f.n._pendingHits.get(message.h).d, 12.34567);
  const ack = { h: message.h, a: 1, v: 2, vl: 2, d: 12.35, kld: 0 };
  f.n._hitAck(ack, 'intruder'); f.n._hitAck({ ...ack, vl: 3 }, 'B');
  assert.equal(f.n._pendingHits.size, 1); assert.equal(f.events.length, 0);
  f.n._hitAck(ack, 'B'); f.n._hitAck(ack, 'B');
  assert.equal(f.events.filter(e => e.type === 'combat:confirmed').length, 1);
  assert.equal(f.n._pendingHits.size, 0);
});

test('composed #427 forwards the existing damage group and restores nested apply ownership on throw', () => {
  const f = hitWorld(), a = { nid: 1, owner: 'A', team: 0, remote: true }, v = { nid: 2, owner: 'B', team: 1, remote: false, alive: true, netLife: 2 };
  f.n.byNid.set(1, a); f.n.byNid.set(2, v); f.n.myId = 'B'; f.n._applyingHit = 'outer';
  const msg = { h: 1, a: 1, v: 2, l: 2, d: 12.34567, w: 'shooter', g: 'volley:7', rp:true };
  f.n._hit(msg, 'A');
  assert.equal(f.calls[0].punisher,true);assert.equal(a.s3.clothingHitPunisher,undefined,'scoped hit equipment is restored');
  assert.equal(f.calls[0].group, 'volley:7'); assert.equal(f.calls[0].damage, 12.34567);
  assert.equal(f.sent[0].data.k, 'hit_ack'); assert.equal(f.sent[0].data.d, 12.35);
  assert.equal(f.n._applyingHit, 'outer');
  f.G.projectiles.applyHit = () => { assert.equal(respawnPunisherEquipped(a),false);throw Error('damage sink'); };
  assert.throws(() => f.n._hit({ ...msg, h: 2, rp:false }, 'A'), /damage sink/);
  assert.equal(f.n._applyingHit, 'outer');
  for (const set of f.listeners.values()) assert.equal(set.size, 0);
  assert.equal(f.sent.length, 1, 'a throwing application produces no forged ACK');
  assert.equal(a.s3.clothingHitPunisher,undefined,'throw also restores scoped equipment');
});

test('composed respawn preserves all current retirements and clears only this victim pending hits', () => {
  const f = hitWorld(), a = { nid: 2, alive: false, hp: 0, invuln: 0, respawnTimer: 4, lastDamage: 0,
    superJumpGround: {}, net: { _stormBirthAuth: {} }, s3: { revealedUntil: 99 }, s3SpecialCost: 100,
    s3SpecialReady: true, lastAttacker: {}, lastAttackerHitAge: 0 };
  a.remote = true; a.owner = 'B';
  a.character = { s3RollerFlick: { networkRemote: true, owner: 'B', life: 1, epoch: 1, vertical: true } };
  a.weaponRunner = { s3RollerAttack: { networkRemote: true }, s3FlickVertical: true };
  a.net._rollerPresentationState = { owner: 'B', life: 1, epoch: 1, tick: 60, active: true };
  a.s3.c1088SurgePresentation = { tag: C1088_SURGE_TAG, life: 1, epoch: 1, phase: 'burst', charge: .8, time: .25, sampleAge: 0 };
  f.n._pendingHits = new Map([[1, { v: 2 }], [2, { v: 9 }]]);
  assert.equal(a.s3.c1088SurgePresentation.tag, C1088_SURGE_TAG, 'a live remote Surge presentation exists before respawn');
  f.n._remoteRespawn(a);
  assert.equal(a.alive, true); assert.equal(a.hp, 100); assert.equal(a.superJumpGround, null);
  assert.equal(a.net._stormBirthAuth, null); assert.equal(a.net.spawnPending, true);
  assert.equal(a.lastDamage, 99); assert.equal(a.lastAttacker, null); assert.equal(a.lastAttackerHitAge, 99);
  assert.equal(a.s3.revealedUntil, undefined); assert.equal(a.s3SpecialCost, undefined); assert.equal(a.s3SpecialReady, false);
  assert.equal(a.s3.c1088SurgePresentation, undefined, 'respawn retires the actual remote Surge presentation state');
  assert.equal(a.character.s3RollerFlick, null, 'respawn retires the real remote Roller pose');
  assert.equal(a.weaponRunner.s3RollerAttack, null, 'legacy network-owned Roller actions are retired');
  assert.equal(a.weaponRunner.s3FlickVertical, false);
  assert.deepEqual(a.net._rollerPresentationState, { owner: 'B', life: 1, epoch: 1, tick: 60, active: false },
    'retirement retains the Roller epoch watermark so stale packets cannot revive it');
  assert.deepEqual([...f.n._pendingHits.keys()], [2]);
  assert.equal(f.events.filter(e => e.type === 'combat:respawn').length, 1);
});

test('current QR splat history shares the existing local/enemy guards with confirmed kills', () => {
  const rawGear = fs.readFileSync(new URL('../../splatoon3/runtime/gear.mjs', import.meta.url), 'utf8');
  const gear = adaptIssue427('patches/splatoon3/runtime/gear.mjs', rawGear);
  const start = gear.indexOf("  api.on('splatted', ({ attacker, victim })"), end = gear.indexOf('  const update = WeaponRunner.prototype.update;', start);
  assert.ok(start >= 0 && end > start);
  const listeners = new Map();
  new Function('api', gear.slice(start, end))({ on: (type, fn) => listeners.set(type, fn) });
  const attacker = { team: 0, remote: false, s3: { splatsThisLife: 0, quickRespawnHistory: { splats: 0 } } }, victim = { team: 1 };
  listeners.get('splatted')({ attacker, victim });
  assert.equal(attacker.s3.splatsThisLife, 1); assert.equal(attacker.s3.quickRespawnHistory.splats, 1);
  for (const event of [{ attacker, victim: attacker, killed: true }, { attacker, victim: { team: 0 }, killed: true }, { attacker, victim, killed: false }]) listeners.get('combat:confirmed')(event);
  attacker.remote = true; listeners.get('splatted')({ attacker, victim }); listeners.get('combat:confirmed')({ attacker, victim, killed: true });
  assert.equal(attacker.s3.splatsThisLife, 1); assert.equal(attacker.s3.quickRespawnHistory.splats, 1);
  attacker.remote = false; listeners.get('combat:confirmed')({ attacker, victim, killed: true });
  assert.equal(attacker.s3.splatsThisLife, 2); assert.equal(attacker.s3.quickRespawnHistory.splats, 2);
});

test('current 36-field projectile layout validates units without dropping legacy33 or accepting malformed units', async () => {
  const f = await fixture(), nm = f.makeNetMatch(f.makeSession());
  const a = f.makeActor({ nid: 0, owner: 'me', roller: true });
  a.character.getMuzzle = out => out.copy(a.pos).add(new f.THREE.Vector3(0, 1.05, .3));
  a.aimPoint.copy(a.pos).add(new f.THREE.Vector3(0, 1.05, 100)); f.bind(nm, [a]);
  try {
    f.projectiles.fireFlick(a, a.weapon, false);
    const packets = JSON.parse(JSON.stringify(nm.out.filter(e => e[1] === 'p')));
    assert.ok(packets.length > 0);
    const packet = packets[0], unit = packet[33];
    assert.equal(packet.length, 36); assert.ok(Number.isSafeInteger(unit) && unit >= 0);
    f.projectiles.clear(); a.remote = true; a.owner = 'B'; nm.peers.set('B', { tr: packet[0] });
    const invalid = [...packet]; invalid[33] = 999;
    nm._play('B', invalid); assert.equal(f.projectiles.list.length, 0);
    const wrongMode = [...packet]; wrongMode[30] = 2;
    nm._play('B', wrongMode); assert.equal(f.projectiles.list.length, 0);
    nm._play('B', packet); assert.equal(f.projectiles.list.length, 1);
    assert.equal(f.projectiles.list[0].fidelityRollerUnitIndex, unit);
    f.projectiles.clear(); nm.peers.set('B', { tr: packet[0] });
    const legacy = [...packet.slice(0, 27), ...packet.slice(30)];
    assert.equal(legacy.length, 33);
    const result = f.projectiles.ghostProjectile(a, legacy);
    assert.ok(result); assert.equal(f.projectiles.list[0].fidelityRollerUnitIndex, unit);
  } finally { nm.dispose(); }
});
