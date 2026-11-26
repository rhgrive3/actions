import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { mapNoBots, WEAPONS } from '../../../inkwave-public/src/config.js';
import { installCombatProvenance, combatAdmission, claimCeiling } from '../combat-provenance.mjs';
import { commitOwnerTick } from '../owner-tick-receipt.mjs';
import { validActorSnapshotRow } from '../snapshot-guard.mjs';
import {
  bindSubBirthCommit,
  stageAcceptedSubBirth,
  replayWithSubBirthCommit,
  stageAcceptedSprinklerBirth,
  stageAcceptedNativeBombBirth,
  commitCreatedNativeBombBirth,
} from '../sub-birth-commit.mjs';
import { validResultPacket } from '../result-admission.mjs';

const rawNetmatch = fs.readFileSync(new URL('../../../inkwave-public/src/net/netmatch.js', import.meta.url), 'utf8');
const netmatchSource = adaptBuildSource('src/net/netmatch.js', rawNetmatch);

function extractMethod(code, name) {
  const start = code.indexOf(`  ${name}(`);
  assert.ok(start >= 0, `composed NetMatch method ${name} must exist`);
  const end = code.indexOf('\n  }\n', start);
  assert.ok(end > start, `composed NetMatch method ${name} end must exist`);
  return code.slice(start, end + 4);
}

function extractFunction(code, name) {
  const start = code.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `composed function ${name} must exist`);
  const end = code.indexOf('\n}\n', start);
  assert.ok(end > start, `composed function ${name} end must exist`);
  return code.slice(start, end + 3);
}

const hitStateStart = netmatchSource.indexOf("const HIT_AUTHORITY_TAG = '");
const hitStateEnd = netmatchSource.indexOf('\nconst ADOPTION_STATE_TAG', hitStateStart);
assert.ok(hitStateStart >= 0 && hitStateEnd > hitStateStart, 'hit authority helpers composed');
const hitAuthoritySource = netmatchSource.slice(hitStateStart, hitStateEnd);

// ============================================================================
// P0-10 & P1-20: combat-provenance.mjs
// ============================================================================
function makeProvenanceStub(sub = 'burst', special = 'storm') {
  const attacker = {
    nid: 1,
    owner: 'peerA',
    remote: true,
    team: 0,
    alive: true,
    netLife: 0,
    weapon: { id: 'shooter', kind: 'shooter', range: 35, fireInterval: 0.12, damage: 36, special, sub },
    pos: { x: 0, y: 0, z: 0 },
    net: { cur: { f: 1 }, lastLife: 0, buf: [] },
    weaponRunner: { rolling: false },
    specialActive: null,
  };
  const victim = {
    nid: 2,
    owner: 'local',
    remote: false,
    team: 1,
    alive: true,
    netLife: 0,
    pos: { x: 0, y: 0, z: 7 },
  };
  class Stub {
    constructor() {
      this.myId = 'local';
      this.cfg = { id: 'audit-match' };
      this.byNid = new Map([[1, attacker], [2, victim]]);
      this.peers = new Map([['peerA', {}]]);
      this.s = { _members: new Set(['peerA']) };
      this.hitCalls = [];
      this.bossCalls = [];
      this.isHost = true;
      this._disposed = false;
      this.match = {
        state: 'playing',
        boss: {
          sim: true,
          dead: false,
          pos: { x: 0, y: 0, z: 12 },
          invuln: false,
          crabs: new Map([[7, { x: 0, y: 0, z: 8, dead: false }]]),
          model: { hitShapes: [{ active: true, weak: true, pos: { x: 0, y: 1, z: 12 }, r: 0.9 }] },
          remoteHit: (d) => this.bossCalls.push(d),
        },
      };
    }
    _tick(from, d) {
      const peer = this.peers.get(from) || {};
      peer.lastTs = d.ts;
      this.peers.set(from, peer);
      const admitted = [];
      for (const row of d.a || []) {
        const a = this.byNid.get(row[0]);
        if (!validActorSnapshotRow(row, d.ts) || !a?.remote || a.owner !== from) continue;
        const snap = { t: d.ts, x: row[1], y: row[2], z: row[3], f: row[10], life: d.l?.[a.nid] ?? 0 };
        a.net.buf = [snap];
        a.net.lastLife = snap.life;
        admitted.push({ actor: a, nid: a.nid, owner: a.owner, x: snap.x, y: snap.y, z: snap.z });
      }
      for (const e of d.e || []) {
        if (e[1] === 'ac' && e[2] === 'sub') {
          const a = this.byNid.get(e[3]);
          if (!a) continue;
          Object.assign(e, { _netPeer: from, _netTick: e[6], _netSeq: e[7] });
          if (stageAcceptedSubBirth(this, from, e, d.ts, e[6])) {
            replayWithSubBirthCommit(this, from, e, (report) => {
              if (e[5].phase !== 'spawn' || e[4] !== Math.max(a.netLife || 0, a.net.lastLife || 0) || e[5].subId !== a.weapon.sub) return false;
              report?.('created', { owner: a, seq: e[5].seq, sourceLife: e[4], subId: e[5].subId });
              return true;
            });
          }
        } else if (e[1] === 'b' && e[3] === 'bomb' && (e.length === 15 || e.length === 16)) {
          const a = this.byNid.get(e[2]);
          if (!a) continue;
          const tick = e.length === 16 ? e[14] : e[13];
          const seq = e.length === 16 ? e[15] : e[14];
          Object.assign(e, { _netPeer: from, _netTick: tick, _netSeq: seq });
          if (stageAcceptedNativeBombBirth(this, from, e, d.ts, tick)) {
            commitCreatedNativeBombBirth(this, from, e, {
              owner: a,
              ghost: true,
              kind: 'bomb',
              s3GhostResolved: { spec: { id: a.weapon.sub } },
              _netBorn: e[0],
              _netBornTick: tick,
              _netPeer: this.peers.get(from),
            });
          }
        }
      }
      commitOwnerTick(this, from, d, d.e || [], admitted);
    }
    _hit(d, from) {
      this.hitCalls.push({ d, from });
      return true;
    }
    onMessage(from, d) {
      if (d.k === 'hit') return this._hit(d, from);
    }
    _acceptBossHit() { return true; }
    onLeave() {}
    dispose() {}
    bind() {}
  }
  installCombatProvenance(Stub, {
    hitPayloadAllowed: () => true,
    hitReceiptAllowed: () => true,
    bossReceiptAllowed: () => true,
  });
  return new Stub();
}

function snapRow(id = 1, flags = 1) {
  return [id, 0, 0, 0, 0, 0, 0, 0, 0, 0, flags, 100, 100, 0, 0, 0, 0, 0, 0, 1, 0];
}

test('P0-10: catalogue subs cannot forge proof via raw b event; canonical ac/sub and native-bomb acceptedSub work', () => {
  for (const catSub of ['burst', 'fizzy', 'torpedo', 'inkMine']) {
    const nm = makeProvenanceStub(catSub);
    nm.onMessage('peerA', { k: 'hit', m: 'audit-match', a: 1, v: 2, h: 1, l: 0, d: 30, w: catSub });
    nm._tick('peerA', { k: 't', ts: 100.05, l: { 1: 0 }, a: [snapRow()], e: [[100, 'b', 1, 'bomb', 0, 1, 0, 0, 0, 45]] });
    assert.equal(nm.hitCalls.length, 0, `${catSub} must not mint proof from raw b event without acceptedSub`);
  }

  // Canonical ac/sub path succeeds for burst
  const burstNm = makeProvenanceStub('burst');
  burstNm.onMessage('peerA', { k: 'hit', m: 'audit-match', a: 1, v: 2, h: 1, l: 0, d: 35, w: 'burst' });
  burstNm._tick('peerA', {
    k: 't',
    ts: 100.05,
    l: { 1: 0 },
    a: [snapRow()],
    e: [[100, 'ac', 'sub', 1, 0, { v: 1, phase: 'spawn', subId: 'burst', seq: 1, life: 0, sourceLife: 0, x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 45 }, 6000, 1]],
  });
  assert.equal(burstNm.hitCalls.length, 1, 'canonical ac/sub burst spawn is admitted');

  // Native-bomb without acceptedSub is rejected; with acceptedSub is admitted
  const rawSuction = makeProvenanceStub('suction');
  rawSuction.onMessage('peerA', { k: 'hit', m: 'audit-match', a: 1, v: 2, h: 1, l: 0, d: 180, w: 'suction' });
  rawSuction._tick('peerA', { k: 't', ts: 100.05, l: { 1: 0 }, a: [snapRow()], e: [[100, 'b', 1, 'bomb', 0, 1, 0, 0, 0, 45]] });
  assert.equal(rawSuction.hitCalls.length, 0, 'native-bomb without acceptedSub is rejected');

  const committedSuction = makeProvenanceStub('suction');
  committedSuction.onMessage('peerA', { k: 'hit', m: 'audit-match', a: 1, v: 2, h: 1, l: 0, d: 180, w: 'suction' });
  committedSuction._tick('peerA', {
    k: 't',
    ts: 100.05,
    l: { 1: 0 },
    a: [snapRow()],
    e: [[100, 'b', 1, 'bomb', 0, 1, 0, 0, 0, 45, null, 'suction', 0, ['inkwave-kit-birth-v1', 'audit-match', 0], 6000, 1]],
  });
  assert.equal(committedSuction.hitCalls.length, 1, 'native-bomb with acceptedSub is admitted');
});

test('P1-20: non-damaging specials (tacticooler, bubbler) fail closed on direct claims while preserving crablet main/sub ceiling', () => {
  for (const sp of ['tacticooler', 'bubbler']) {
    const nm = makeProvenanceStub('bomb', sp);
    const attacker = nm.byNid.get(1);
    assert.equal(claimCeiling(attacker, { w: sp, c: -1 }, 'pvp'), -1, `${sp} direct PvP ceiling must be -1`);
    assert.equal(claimCeiling(attacker, { w: sp, c: -1 }, 'boss'), -1, `${sp} direct Boss ceiling must be -1`);
    // Crablet ceiling must remain bounded by main/sub (bomb=180), not Infinity or -1
    assert.equal(claimCeiling(attacker, { w: 'crab', c: 7 }, 'boss'), 180, `${sp} crablet ceiling stays at max(main, sub, 0)`);

    // Even with an active special snapshot and specialActive set, specialProof must reject
    attacker.specialActive = { id: sp };
    nm._tick('peerA', { k: 't', ts: 100.05, l: { 1: 0 }, a: [snapRow(1, 1 | 8192)], e: [] });
    assert.equal(
      combatAdmission(nm, 'peerA', { k: 'hit', m: 'audit-match', a: 1, v: 2, h: 1, l: 0, d: 10, w: sp }, 'pvp', performance.now() / 1000),
      false,
      `${sp} must never pass specialProof or combatAdmission`,
    );
  }
});

// ============================================================================
// P0-11, P0-12, P1-19, P1-21, P2-15: adapter.mjs (composed NetMatch)
// ============================================================================
test('P0-11: adoption sequence is owner-scoped in _tick, unconditionally handed off & reset in _adopt, and reset on non-adopt leave', () => {
  // Verify restoreAdoptionState no longer writes back actor.net._adoptionSeq
  const restoreFn = extractFunction(netmatchSource, 'restoreAdoptionState');
  assert.equal(restoreFn.includes('actor.net._adoptionSeq'), false, 'restoreAdoptionState must not write back actor.net._adoptionSeq');

  // Verify _tick uses owner-scoped previousSequence
  const tickMethod = extractMethod(netmatchSource, '_tick');
  assert.ok(
    tickMethod.includes('a.net._adoptionTickOwner === from ? a.net._adoptionSeq : 0'),
    '_tick must scope previousSequence to a.net._adoptionTickOwner === from',
  );

  // Execute composed _adopt with transfer === null (early return path in restoreAdoptionState)
  const adoptMethod = extractMethod(netmatchSource, '_adopt');
  const AdoptHarness = new Function(
    'G', 'F', 'BotBrain', 'latestAdoptionTransfer', 'applyAcceptedGear', 'applyConditionalGear',
    'clearRemoteSquidroll', 'clearRemoteDropRoll', 'clearRemoteRollerPresentation',
    'retireNetworkGhosts', 'restoreAdoptionState', 'restoreAdoptedGearGauge', 'restoreAdoptedTransientGear',
    'resetC1088SurgePresentation', 'clearRemoteRollerSuspension', 'clearRemoteDodgeClock',
    `return class { ${adoptMethod} _stopLoops() {} }`,
  )(
    { match: { mode: 'turf', opts: {} }, time: 10 },
    { specialReady: 1, special: 2 },
    class BotBrain {},
    () => null, // force transfer === null early return
    () => {}, () => {}, () => {}, () => {}, () => {}, () => {},
    () => {}, () => {}, () => {}, () => {}, () => {}, () => {},
  );
  const h = new AdoptHarness();
  h.cfg = { difficulty: 'normal' };
  const actor = {
    nid: 3,
    alive: true,
    remote: true,
    isBot: false,
    yaw: 0,
    _adoptionSequence: 2,
    intent: { move: { set() {} } },
    net: { buf: [], spawnPending: false, _adoptionSeq: 17, _adoptionTickOwner: 'peerOld', err: { set() {} }, errV: { set() {} } },
    weaponRunner: { reset() {} },
    character: { setVisible() {}, root: { visible: true } },
    vel: { set() {} },
    s3: {},
  };
  h._adopt(actor);
  assert.equal(actor._adoptionSequence, 17, '_adopt must monotonically carry a.net._adoptionSeq even when transfer is null');
  assert.equal(actor.net._adoptionSeq, 0, '_adopt must reset a.net._adoptionSeq to 0');
  assert.equal(actor.net._adoptionTickOwner, null, '_adopt must reset a.net._adoptionTickOwner to null');
});

test('P0-12: applyHitHandoff invokes actor.splat for local actors when present and falls back to net._remoteSplat otherwise', () => {
  const { applyHitHandoff } = new Function('PLAYER', `${hitAuthoritySource}\nreturn { applyHitHandoff };`)({ hp: 100 });

  // Local actor with splat() -> calls actor.splat, not net._remoteSplat
  let localSplatArgs = null;
  let remoteSplatCalls = 0;
  const net = { _remoteSplat() { remoteSplatCalls++; } };
  const localActor = {
    remote: false,
    alive: true,
    hp: 30,
    splat(attacker, weapon) { localSplatArgs = [attacker, weapon]; this.alive = false; },
  };
  const state1 = ['peerOld', 0, 1, 1, 30];
  applyHitHandoff(net, localActor, state1, 2, 2, 0, true);
  assert.deepEqual(localSplatArgs, [null, 'shooter'], 'local actor with splat() must broadcast death via actor.splat');
  assert.equal(remoteSplatCalls, 0, 'net._remoteSplat must not be called when local actor.splat runs');

  // Local actor mock without splat() (issue-1033 compatibility) -> falls back to net._remoteSplat
  const mockLocal = { remote: false, alive: true, hp: 30 };
  const state2 = ['peerOld', 0, 1, 1, 30];
  applyHitHandoff(net, mockLocal, state2, 2, 2, 0, true);
  assert.equal(remoteSplatCalls, 1, 'local mock without splat() must fall back to net._remoteSplat');

  // Remote actor even with splat() -> calls net._remoteSplat
  let remoteOwnSplat = 0;
  const remoteActor = { remote: true, alive: true, hp: 30, splat() { remoteOwnSplat++; } };
  const state3 = ['peerOld', 0, 1, 1, 30];
  applyHitHandoff(net, remoteActor, state3, 2, 2, 0, true);
  assert.equal(remoteOwnSplat, 0, 'remote actor must not invoke actor.splat');
  assert.equal(remoteSplatCalls, 2, 'remote actor must invoke net._remoteSplat');
});

test('P1-19: _hit clamps negative delayed-lethal HP and _acceptHitAuthorityAck preserves delayed-lethal deferral without breaking compound lethality', () => {
  // Check _hit clamps v.hp into hitState[4]
  const hitMethod = extractMethod(netmatchSource, '_hit');
  assert.ok(
    hitMethod.includes('const hitState = [this.myId, hitLife, hitRevision, now(), hitClamp(v.hp), !!v.alive];'),
    '_hit must clamp v.hp with hitClamp(v.hp) when building hitState',
  );

  // Execute composed _acceptHitAuthorityAck
  const methods = [
    '_hitHandoffPacket', '_readHitHandoffPacket', '_validHitAuthorityMetadata',
    '_hitHandoffParentEntries', '_hitHandoffParentOffset', '_mergeHitAuthorityParent',
    '_acceptHitAuthorityAck',
  ].map((m) => extractMethod(netmatchSource, m)).join('\n');

  const AckHarness = new Function(
    'PLAYER',
    `${hitAuthoritySource}\nreturn class { ${methods} _remoteSplat(v) { this.splats = (this.splats || 0) + 1; v.alive = false; v.hp = 0; } }`,
  )({ hp: 100 });

  // Case 1: Delayed 1-frame lethal overkill (d.la === 1 && d.hp === 0) -> no premature _remoteSplat
  const h1 = new AckHarness();
  const v1 = { nid: 4, owner: 'V', remote: true, alive: true, hp: 40, netLife: 1, net: {} };
  h1.byNid = new Map([[4, v1]]);
  const ackDelayed = { k: 'hit_ack', h: 1, v: 4, a: 7, d: 60, kld: 0, vl: 1, hp: 0, hr: 1, ht: 10, la: 1, he: null };
  assert.equal(h1._validHitAuthorityMetadata(ackDelayed), true, 'clamped hp=0 with la=1 passes metadata validation');
  assert.equal(h1._acceptHitAuthorityAck(ackDelayed, 'V'), true);
  assert.equal(v1.hp, 0);
  assert.equal(v1.alive, true, 'delayed-lethal la=1,hp=0 must not prematurely splat victim');
  assert.equal(h1.splats || 0, 0);

  // Case 2: Compound lethality across owner handoff (d.la === 1 && d.hp > 0, parentOffset pushes victim.hp <= 0) -> MUST splat
  const h2 = new AckHarness();
  const v2 = {
    nid: 4,
    owner: 'H',
    remote: true,
    alive: true,
    hp: 30,
    netLife: 1,
    net: { _hitHandoff: ['V', 1, 2, 5, 30] }, // receiver already knows V dropped victim to 30
  };
  h2.byNid = new Map([[4, v2]]);
  // H thinks V was at 100 (he: ['V', 1, 0, 0, 100]), so H reports hp=60 (40 dmg); parentOffset = 100 - 30 = 70 -> reportedHp = 60 - 70 = -10 -> clamped 0
  const ackCompound = { k: 'hit_ack', h: 2, v: 4, a: 7, d: 40, kld: 0, vl: 1, hp: 60, hr: 1, ht: 12, la: 1, he: ['V', 1, 0, 0, 100] };
  assert.equal(h2._acceptHitAuthorityAck(ackCompound, 'H'), true);
  assert.equal(v2.alive, false, 'compound lethal damage across handoff must still splat victim');
  assert.equal(h2.splats, 1);

  // Case 3: Direct lethal ACK (d.la === 0) -> MUST splat
  const h3 = new AckHarness();
  const v3 = { nid: 4, owner: 'V', remote: true, alive: true, hp: 20, netLife: 1, net: {} };
  h3.byNid = new Map([[4, v3]]);
  const ackLethal = { k: 'hit_ack', h: 3, v: 4, a: 7, d: 36, kld: 1, vl: 1, hp: 0, hr: 1, ht: 15, la: 0, he: null };
  assert.equal(h3._acceptHitAuthorityAck(ackLethal, 'V'), true);
  assert.equal(v3.alive, false);
  assert.equal(h3.splats, 1);
});

test('P1-21 & P0-11 (onLeave): owner handoff deletes stale Super Jump epochs and resets non-adopted adoption sequence', () => {
  const onLeaveMethod = extractMethod(netmatchSource, 'onLeave');
  const OnLeaveHarness = new Function(
    'PLAYER', 'mapNoBots', 'clearRemoteSquidroll', 'clearRemoteDropRoll',
    'clearRemoteRollerPresentation', 'retireNetworkGhosts', 'clearRemoteC1088Surge',
    'clearRemoteRollerSuspension', 'clearRemoteDodgeClock', 'retireDisconnectedMainProjectiles',
    'forgetPaintPeer', 'transferPaintOwner', 'retireOwnerClock',
    `${hitAuthoritySource}\nreturn class {
      ${onLeaveMethod}
      _adopt(a) { this.adopted.push(a); }
      _remove(a) { this.byNid.delete(a.nid); }
      _retryPendingHitsForLeave() {}
      _retirePendingHitsForVictim() {}
    }`,
  )(
    { hp: 100 }, mapNoBots, () => {}, () => {}, () => {}, () => {}, () => {},
    () => {}, () => {}, () => {}, () => {}, () => {}, () => {},
  );

  const nm = new OnLeaveHarness();
  nm.myId = 'guestB';
  nm.isHost = false;
  nm.cfg = { map: 'normal' };
  nm.match = {};
  nm.s = { hostId: 'hostH', _members: new Set(['hostH', 'guestB', 'peerOld']) };
  nm.peers = new Map([['peerOld', {}]]);
  nm.bossHitPending = [];
  nm.adopted = [];
  const actor = {
    nid: 5,
    owner: 'peerOld',
    remote: true,
    alive: true,
    hp: 100,
    netLife: 1,
    _s3SuperJumpEpoch: 9,
    _s3SuperJumpEndedEpoch: 8,
    net: { buf: [{ t: 1 }], lastLife: 1, _adoptionSeq: 42, _adoptionTickOwner: 'peerOld' },
  };
  nm.byNid = new Map([[5, actor]]);

  nm.onLeave('peerOld', false);
  assert.equal(actor.owner, 'hostH');
  assert.equal(Object.hasOwn(actor, '_s3SuperJumpEpoch'), false, 'P1-21: _s3SuperJumpEpoch must be deleted on owner handoff');
  assert.equal(Object.hasOwn(actor, '_s3SuperJumpEndedEpoch'), false, 'P1-21: _s3SuperJumpEndedEpoch must be deleted on owner handoff');
  assert.equal(actor.net._adoptionSeq, 0, 'P0-11: non-adopt onLeave must reset _adoptionSeq');
  assert.equal(actor.net._adoptionTickOwner, null, 'P0-11: non-adopt onLeave must reset _adoptionTickOwner');
});

test('P2-15: _retryNackedHit retires pending hit and returns false when sendTo fails', () => {
  const methods = ['_retirePendingSequence', '_retirePendingHit', '_retryNackedHit']
    .map((m) => extractMethod(netmatchSource, m))
    .join('\n');
  const RetryHarness = new Function('PLAYER', `${hitAuthoritySource}\nreturn class { ${methods} }`)({ hp: 100 });

  function makeRetryFixture(sendResult) {
    const nm = new RetryHarness();
    nm.myId = 'S';
    const victim = { nid: 4, owner: 'H', remote: true, alive: true, netLife: 2, team: 1 };
    const attacker = { nid: 7, owner: 'S', remote: false, alive: true, netLife: 1, team: 0 };
    nm.byNid = new Map([[4, victim], [7, attacker]]);
    const message = { k: 'hit', h: 11, seq: 3, v: 4, a: 7, l: 2, d: 36 };
    const pending = [message, 'V', 'V', 'V', 0, new Set(['V'])];
    nm.hitPending = new Map([[3, pending]]);
    nm._pendingHits = new Map([[11, { v: 4, delivery: [pending[5], 3] }]]);
    nm.s = { tr: { sendTo: () => sendResult } };
    return { nm, pending };
  }

  const failed = makeRetryFixture(false);
  assert.equal(failed.nm._retryNackedHit(failed.pending), false, 'sendTo !== true must return false');
  assert.equal(failed.nm._pendingHits.size, 0, 'failed sendTo must retire _pendingHits entry');
  assert.equal(failed.nm.hitPending.size, 0, 'failed sendTo must retire hitPending entry');

  const succeeded = makeRetryFixture(true);
  assert.equal(succeeded.nm._retryNackedHit(succeeded.pending), true, 'sendTo === true must return true');
  assert.equal(succeeded.nm._pendingHits.size, 1, 'successful sendTo keeps _pendingHits entry');
  assert.equal(succeeded.nm.hitPending.size, 1, 'successful sendTo keeps hitPending entry');
});

// ============================================================================
// P2-13: sub-birth-commit.mjs
// ============================================================================
test('P2-13: stageAcceptedSprinklerBirth rejects sparse holes and inherited pose slots', () => {
  function makeSprinklerNm() {
    const actor = {
      nid: 1,
      owner: 'peerA',
      remote: true,
      netLife: 0,
      weapon: { sub: 'sprinkler' },
      net: { lastLife: 0, buf: [{ t: 100.05, life: 0, x: 0, y: 0, z: 0 }] },
    };
    const nm = {
      _disposed: false,
      match: {},
      cfg: { id: 'm1' },
      s: { _members: new Set(['peerA']) },
      peers: new Map([['peerA', {}]]),
      byNid: new Map([[1, actor]]),
    };
    bindSubBirthCommit(nm, () => {});
    return nm;
  }

  const validEvent = [100, 'b', 1, 'bomb', 0, 1, 0, 0, 0, 10, null, 'sprinkler', 0, ['inkwave-kit-birth-v1', 'm1', 0], 6000, 1];
  Object.assign(validEvent, { _netPeer: 'peerA', _netTick: 6000, _netSeq: 1 });
  assert.equal(stageAcceptedSprinklerBirth(makeSprinklerNm(), 'peerA', validEvent, 100.05, 6000), true);

  // Sparse hole at index 5
  const sparseEvent = validEvent.slice();
  delete sparseEvent[5];
  Object.assign(sparseEvent, { _netPeer: 'peerA', _netTick: 6000, _netSeq: 1 });
  assert.equal(stageAcceptedSprinklerBirth(makeSprinklerNm(), 'peerA', sparseEvent, 100.05, 6000), false, 'sparse hole must be rejected');

  // Inherited property at index 5 via custom prototype
  const inheritedEvent = validEvent.slice();
  delete inheritedEvent[5];
  const proto = Object.create(Array.prototype);
  proto[5] = 1;
  Object.setPrototypeOf(inheritedEvent, proto);
  Object.assign(inheritedEvent, { _netPeer: 'peerA', _netTick: 6000, _netSeq: 1 });
  assert.equal(stageAcceptedSprinklerBirth(makeSprinklerNm(), 'peerA', inheritedEvent, 100.05, 6000), false, 'inherited pose property must be rejected');
});

// ============================================================================
// P2-14: result-admission.mjs
// ============================================================================
test('P2-14: validResultPacket rejects specialCounts.length > 8 even when st == null, preserving <= 8 and non-array compatibility', () => {
  const nine = Array.from({ length: 9 }, (_, i) => [i, 1]);
  const eight = Array.from({ length: 8 }, (_, i) => [i, 1]);

  // Legacy packet with st == null must NOT bypass specialCounts.length > 8 guard
  assert.equal(validResultPacket({ cov: [0.5, 0.5], win: 0, specialCounts: nine }), false, 'st==null with 9 specialCounts must be rejected');
  assert.equal(validResultPacket({ cov: [0.5, 0.5], win: 0, st: null, specialCounts: nine }), false, 'st:null with 9 specialCounts must be rejected');
  assert.equal(validResultPacket({ cov: [0.5, 0.5], win: 0, st: [[1, 100, 1, 0]], specialCounts: nine }), false, 'st present with 9 specialCounts must be rejected');

  // Boundary <= 8 and non-array legacy values remain accepted
  assert.equal(validResultPacket({ cov: [0.5, 0.5], win: 0, specialCounts: eight }), true, '8 specialCounts is accepted');
  assert.equal(validResultPacket({ cov: [0.5, 0.5], win: 0, specialCounts: {} }), true, 'non-array specialCounts stays backward compatible');
  assert.equal(validResultPacket({ cov: [0.5, 0.5], win: 0, specialCounts: 'invalid' }), true, 'string specialCounts stays backward compatible');
});
