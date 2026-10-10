import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import { adaptSource } from '../adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';
import { adaptIssue427 } from '../issue-427-adapter.mjs';
import { calculateFlowSplatPoints } from '../issue-481-adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.join(ROOT, 'inkwave-public');
const FLOW = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json'), 'utf8')).flow;
const damageScore = amount => amount * FLOW.weights.damage;
const assistScore = FLOW.weights.assist;
function syncTick(sender, recipient) { sender.net._sendTick(); recipient.deliver(sender.net.myId, sender.wire.at(-1).data); }

async function createCombatWorld(owner, { apply427 = true, pr400 = false, roster = null, offline = false, oldAssistLife = false } = {}) {
  let clock = 1000;
  const context = vm.createContext({ console, performance: { now: () => clock * 1000 } });
  const mods = new Map();

  let pr400Adapter = null;
  if (pr400) {
    const pr400Path = path.join(ROOT, 'evidence/pr400-adapter.mjs');
    if (fs.existsSync(pr400Path)) {
      const mod = await import(pr400Path);
      pr400Adapter = mod.adaptClothingGear;
    }
  }

  const resolve = (spec, from) => {
    if (spec === 'three') return path.join(SRC, 'vendor/three/build/three.module.js');
    let file = path.resolve(path.dirname(from), spec);
    if (file.startsWith(path.join(SRC, 'patches/'))) file = path.join(ROOT, path.relative(SRC, file));
    if (file.startsWith(path.join(ROOT, 'src/'))) file = path.join(SRC, path.relative(ROOT, file));
    return file;
  };

  const load = file => {
    if (mods.has(file)) return mods.get(file);
    let source = fs.readFileSync(file, 'utf8');
    const rel = file.startsWith(SRC + path.sep) ? path.relative(SRC, file) : path.relative(ROOT, file);

    source = adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, source)));
    if (apply427) source = adaptQualitySource(rel, source);
    if (oldAssistLife && rel === 'patches/splatoon3/runtime/flow.mjs') {
      const current = 'event.assists.filter(helper => validAssist427(helper, victim, event))';
      assert(source.includes(current)); source = source.replace(current, 'event.assists');
    }
    if (pr400Adapter) {
      source = pr400Adapter(rel, source, (code, b, a, lbl) => {
        const idx = code.indexOf(b);
        if (idx === -1) return code;
        return code.slice(0, idx) + a + code.slice(idx + b.length);
      });
    }

    const mod = new vm.SourceTextModule(source, { context, identifier: file });
    mods.set(file, mod);
    return mod;
  };

  const entry = new vm.SourceTextModule(`
    export * from './src/core/ctx.js'; export * from './src/config.js';
    export * from './src/game/actor.js'; export * from './src/game/weapons.js';
    export * from './src/game/physics.js';
    export * from './src/net/netmatch.js'; export * as THREE from 'three';
    export * from './patches/splatoon3/runtime/movement.mjs';
    export * from './patches/splatoon3/runtime/weapons.mjs';
    export * from './patches/splatoon3/runtime/gear.mjs';
    export * from './patches/splatoon3/runtime/flow.mjs';
    export * from './patches/splatoon3/runtime/resources.mjs';
  `, { context, identifier: path.join(SRC, 'integration-fixture-427.mjs') });

  await entry.link((spec, from) => load(resolve(spec, from.identifier)));
  await entry.evaluate();

  const api = { ...entry.namespace }, { G, THREE, PLAYER, WEAPONS, SUB } = api;
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json'), 'utf8'));
  Object.assign(PLAYER, profile.player); Object.assign(SUB.bomb, profile.bomb);
  for (const [id, data] of Object.entries(profile.weapons)) Object.assign(WEAPONS[id], data);
  for (const name of ['installWeapons', 'installMovement', 'installGear', 'installFlow', 'installResources']) api[name](api, profile);

  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.level = { spawnPads: [new THREE.Vector3(), new THREE.Vector3(20, 0, 20)], blocks: [], groundHeight: () => 0 };
  G.physics = { los: () => true, groundProbe: () => ({ hit: false }) };
  const paint = [];
  G.paint = {
    sample: () => 1,
    splat: (pos, radius, team, opts = {}) => {
      paint.push({ pos: pos.toArray(), radius, team });
      G.netm?.recSplat(pos, radius, team, opts);
      return 0.123456789;
    }
  };
  G.time = 0;

  class Display {
    constructor() { this.root = new THREE.Group(); }
    trigger() {} setVisible(value) { this.root.visible = value; } setHurt() {} setWeapon() {}
  }

  const make = (nid, team, actorOwner) => {
    const a = new api.Actor({ team, name: 'actor-' + nid, weapon: 'shooter', CharacterClass: Display });
    a.nid = nid; a.owner = actorOwner; a.isLocal = actorOwner === owner;
    a.spawnAt(new THREE.Vector3(nid * 2, 0, 0), 0); a.invuln = 0;
    a._nearCamera = () => false; a._finishFrame = () => {}; a._integrate = () => {}; a._resolve = () => {};
    return a;
  };

  const actorDefs = roster || [
    { nid: 1, team: 0, owner: 'A' },
    { nid: 2, team: 1, owner: 'B' }
  ];
  const actors = actorDefs.map(d => make(d.nid, d.team, d.owner));
  G.actors = actors;
  const attacker = actors[0], victim = actors[1];

  const wire = [], confirmed = [];
  api.on('combat:confirmed', e => confirmed.push({ damage: e.damage, killed: e.killed }));
  let net = null;
  if (!offline) {
    const session = {
      myId: owner, hostId: actorDefs[0].owner, isHost: owner === actorDefs[0].owner,
      _members: new Map(actorDefs.map(d => [d.owner, d.owner])),
      tr: {
        sendTo: (to, data) => wire.push({ to, data: JSON.parse(JSON.stringify(data)) }),
        broadcast: data => wire.push({ data: JSON.parse(JSON.stringify(data)) })
      }
    };
    net = new api.NetMatch(session, { id: 'test-round-427', map: 'reef' });
    const match = { actors: G.actors, state: 'playing', time: 180, playing: () => true, canRespawn: () => true };
    G.match = match; net.bind(match);
  }
  G.projectiles = { applyHit: api.Projectiles.prototype.applyHit };

  const deliver = (from, data) => {
    if (!net) return;
    net.onMessage(from, JSON.parse(JSON.stringify(data)));
    const peer = net.peers.get(from);
    if (peer) { peer.tr = (data.ts || 0) + 1; peer.sim = Number.MAX_SAFE_INTEGER; net._playEvents(); }
  };

  const receiveHit = (from, data) => {
    net.onMessage(from, data);
    // The current lethal owner commits at the next native Actor phase, not inside _hit.
    for (const a of actors) if (!a.remote && a.alive && a.hp <= 0) {
      G.time += 1 / 60; a.update(1 / 60);
    }
  };
  return {
    ...api, profile, attacker, victim, actors, net, wire, paint, deliver, receiveHit, confirmed,
    advance: dt => { clock += (dt || 0.05); G.time += (dt || 0.05); },
    dispose: () => net?.dispose()
  };
}

test('negative control: omitting owner isolation leaks kill progression to the defender proxy', async () => {
  const shooter = await createCombatWorld('A', { apply427: false });
  const defender = await createCombatWorld('B', { apply427: false });
  try {
    shooter.attacker.s3.flow.score = 2.6;
    shooter.G.projectiles.applyHit(shooter.attacker, shooter.victim, 100, 'shooter');
    const hitPkt = shooter.wire.find(x => x.to === 'B').data;
    defender.receiveHit('A', hitPkt);
    defender.net._sendTick();
    shooter.deliver('B', defender.wire.at(-1).data);

    // Negative check: Flow did NOT activate on shooter, splatsThisLife is unincremented
    assert.equal(shooter.attacker.s3.flow.active, true, 'current native terminal also reaches the local killer; the negative boundary is proxy isolation');

    // Remote proxy on defender incorrectly accumulated proxy progression
    assert.equal(defender.attacker.s3.splatsThisLife, 1, 'unpatched main leaked kill count to remote proxy');
  } finally {
    shooter.dispose(); defender.dispose();
  }
});

test('patched: cross-owner confirmed lethal hit activates Flow and increments splatsThisLife exactly once', async () => {
  const shooter = await createCombatWorld('A', { apply427: true });
  const defender = await createCombatWorld('B', { apply427: true });
  try {
    shooter.attacker.s3.flow.score = 2.6;
    shooter.G.projectiles.applyHit(shooter.attacker, shooter.victim, 100, 'shooter');
    const hitPkt = shooter.wire.find(x => x.to === 'B').data;
    assert.ok(hitPkt.h >= 1, 'hit sequence assigned');

    defender.receiveHit('A', hitPkt);
    assert.equal(defender.victim.alive, false, 'victim killed on its authoritative owner');

    // Defender proxy must NOT accumulate proxy progression
    assert.equal(defender.attacker.s3.flow.score, 0, 'remote proxy does not accumulate Flow');
    assert.equal(defender.attacker.s3.splatsThisLife ?? 0, 0, 'remote proxy does not accumulate splatsThisLife');

    const ackPkt = defender.wire.find(x => x.to === 'A' && x.data.k === 'hit_ack')?.data;
    assert.ok(ackPkt, 'victim owner sent hit_ack');
    assert.equal(ackPkt.d, 100, 'confirmed accepted damage');
    assert.equal(ackPkt.kld, 0, 'immediate ACK precedes the next-tick authoritative splat');

    shooter.net.onMessage('B', ackPkt);
    syncTick(defender, shooter);

    // Current high-tier splat points cross the configured activation threshold after the terminal.
    assert.equal(shooter.attacker.s3.flow.active, true, 'Flow activated on attacker owner');
    assert.equal(shooter.attacker.s3.flow.score, 0, 'Flow score resets to 0 on activation');
    assert.equal(shooter.attacker.s3.splatsThisLife, 1, 'splatsThisLife incremented on attacker owner');

    // Duplicate ACK must be rejected
    shooter.net.onMessage('B', ackPkt);
    syncTick(defender, shooter);
    assert.equal(shooter.attacker.s3.splatsThisLife, 1, 'duplicate ACK does not increment splatsThisLife twice');
  } finally {
    shooter.dispose(); defender.dispose();
  }
});

test('patched: cross-owner confirmed nonlethal hit awards damage progress without kill progression', async () => {
  const shooter = await createCombatWorld('A', { apply427: true });
  const defender = await createCombatWorld('B', { apply427: true });
  try {
    shooter.attacker.s3.flow.score = 0;
    shooter.G.projectiles.applyHit(shooter.attacker, shooter.victim, 30, 'shooter');
    const hitPkt = shooter.wire.find(x => x.to === 'B').data;
    defender.receiveHit('A', hitPkt);
    assert.equal(defender.victim.hp, 70, 'victim took 30 damage');
    assert.equal(defender.victim.alive, true);

    const ackPkt = defender.wire.find(x => x.to === 'A' && x.data.k === 'hit_ack')?.data;
    assert.equal(ackPkt.d, 30);
    assert.equal(ackPkt.kld, 0);

    shooter.net.onMessage('B', ackPkt);
    syncTick(defender, shooter);
    assert.ok(Math.abs(shooter.attacker.s3.flow.score - damageScore(30)) < 1e-6, 'current configured damage progression retained');
    assert.equal(shooter.attacker.s3.flow.active, false, 'nonlethal hit did not activate Flow');
    assert.deepEqual(shooter.confirmed, [{ damage: 30, killed: false }], 'confirmed accepted damage is observed even when its configured Flow weight is zero');
    assert.equal(shooter.attacker.s3.splatsThisLife ?? 0, 0, 'nonlethal hit did not increment splatsThisLife');
  } finally {
    shooter.dispose(); defender.dispose();
  }
});

test('patched: reversed owners (B shoots A) retains symmetric confirmed progression', async () => {
  const shooter = await createCombatWorld('B', { apply427: true });
  const defender = await createCombatWorld('A', { apply427: true });
  try {
    shooter.victim.s3.flow.score = 2.6;
    shooter.G.projectiles.applyHit(shooter.victim, shooter.attacker, 100, 'shooter');
    const hitPkt = shooter.wire.find(x => x.to === 'A').data;
    defender.receiveHit('B', hitPkt);
    assert.equal(defender.attacker.alive, false);

    const ackPkt = defender.wire.find(x => x.to === 'B' && x.data.k === 'hit_ack')?.data;
    shooter.net.onMessage('A', ackPkt);
    syncTick(defender, shooter);

    assert.equal(shooter.victim.s3.flow.active, true, 'Flow activated for B');
    assert.equal(shooter.victim.s3.splatsThisLife, 1, 'splatsThisLife incremented for B');
  } finally {
    shooter.dispose(); defender.dispose();
  }
});

test('patched: Quick Respawn is correctly withheld after cross-owner kill (noquickrespawn-afterkill)', async () => {
  const shooter = await createCombatWorld('A', { apply427: true });
  const defender = await createCombatWorld('B', { apply427: true });
  try {
    shooter.attacker.s3.loadout = [
      { main: 'quickRespawn', subs: ['none', 'none', 'none'] },
      { main: 'none', subs: ['none', 'none', 'none'] },
      { main: 'none', subs: ['none', 'none', 'none'] }
    ];
    shooter.attacker.setWeapon('shooter');

    shooter.attacker.splat(shooter.victim);
    const regularRespawn = shooter.attacker.respawnTimer;
    shooter.attacker.respawn();
    assert.equal(shooter.attacker.s3.quickRespawnHistory.seenEnemyDeath, true);
    assert.equal(shooter.attacker.s3.splatsThisLife, 0);

    shooter.G.projectiles.applyHit(shooter.attacker, shooter.victim, 100, 'shooter');
    const hitPkt = shooter.wire.find(x => x.to === 'B').data;
    defender.receiveHit('A', hitPkt);
    const ackPkt = defender.wire.find(x => x.to === 'A' && x.data.k === 'hit_ack')?.data;
    shooter.net.onMessage('B', ackPkt);
    syncTick(defender, shooter);

    assert.equal(shooter.attacker.s3.splatsThisLife, 1, 'confirmed kill recorded');

    shooter.attacker.splat(shooter.victim);
    assert.equal(shooter.attacker.respawnTimer, regularRespawn, 'Quick Respawn correctly denied after confirmed kill');
    assert.equal(shooter.attacker.s3.quickRespawnHistory.splats, 0, 'the completed enemy death retires this life kill history');
  } finally {
    shooter.dispose(); defender.dispose();
  }
});

test('adversarial: false sender cannot consume real ack, which subsequently grants progression', async () => {
  const shooter = await createCombatWorld('A', { apply427: true });
  const defender = await createCombatWorld('B', { apply427: true });
  try {
    shooter.attacker.s3.flow.score = 0;
    shooter.G.projectiles.applyHit(shooter.attacker, shooter.victim, 30, 'shooter');
    const h = shooter.net._hitSeq;
    assert.equal(shooter.net._pendingHits.has(h), true, 'pending hit registered');

    // Attacker sends forged ACK from forged sender 'C'
    const forgedAck = { k: 'hit_ack', m: 'test-round-427', h, v: 2, a: 1, d: 30, kld: 0, vl: defender.victim.netLife ?? 0 };
    shooter.net.onMessage('C', forgedAck);

    // Verify progression was NOT awarded, and crucially, pending hit was NOT consumed!
    assert.equal(shooter.attacker.s3.flow.score, 0, 'forged sender cannot award Flow');
    assert.equal(shooter.net._pendingHits.has(h), true, 'forged sender must NOT delete/consume valid pending request');

    // Genuine ACK arrives from authenticated victim owner 'B'
    shooter.net.onMessage('B', forgedAck);

    // Verify authenticated ACK is accepted, progress awarded, and pending consumed exactly once
    assert.ok(Math.abs(shooter.attacker.s3.flow.score - damageScore(30)) < 1e-6, 'genuine ACK awards Flow progression');
    assert.equal(shooter.net._pendingHits.has(h), false, 'pending request consumed after genuine ACK');
  } finally {
    shooter.dispose(); defender.dispose();
  }
});

test('adversarial: wrong a/v/life and malformed payloads are rejected without consuming pending', async () => {
  const shooter = await createCombatWorld('A', { apply427: true });
  const defender = await createCombatWorld('B', { apply427: true });
  try {
    shooter.attacker.s3.flow.score = 0;
    shooter.G.projectiles.applyHit(shooter.attacker, shooter.victim, 40, 'shooter');
    const h = shooter.net._hitSeq;
    const correctVl = defender.victim.netLife ?? 0;

    // 1. Wrong attacker ID
    shooter.net.onMessage('B', { k: 'hit_ack', m: 'test-round-427', h, v: 2, a: 999, d: 40, kld: 0, vl: correctVl });
    assert.equal(shooter.attacker.s3.flow.score, 0);
    assert.equal(shooter.net._pendingHits.has(h), true);

    // 2. Wrong victim ID
    shooter.net.onMessage('B', { k: 'hit_ack', m: 'test-round-427', h, v: 999, a: 1, d: 40, kld: 0, vl: correctVl });
    assert.equal(shooter.attacker.s3.flow.score, 0);
    assert.equal(shooter.net._pendingHits.has(h), true);

    // 3. Wrong victim life
    shooter.net.onMessage('B', { k: 'hit_ack', m: 'test-round-427', h, v: 2, a: 1, d: 40, kld: 0, vl: 999 });
    assert.equal(shooter.attacker.s3.flow.score, 0);
    assert.equal(shooter.net._pendingHits.has(h), true);

    // 4. Negative damage
    shooter.net.onMessage('B', { k: 'hit_ack', m: 'test-round-427', h, v: 2, a: 1, d: -10, kld: 0, vl: correctVl });
    assert.equal(shooter.attacker.s3.flow.score, 0);
    assert.equal(shooter.net._pendingHits.has(h), true);

    // 5. Non-finite damage (NaN / string / Infinity)
    shooter.net.onMessage('B', { k: 'hit_ack', m: 'test-round-427', h, v: 2, a: 1, d: NaN, kld: 0, vl: correctVl });
    shooter.net.onMessage('B', { k: 'hit_ack', m: 'test-round-427', h, v: 2, a: 1, d: '40', kld: 0, vl: correctVl });
    shooter.net.onMessage('B', { k: 'hit_ack', m: 'test-round-427', h, v: 2, a: 1, d: Infinity, kld: 0, vl: correctVl });
    assert.equal(shooter.attacker.s3.flow.score, 0);
    assert.equal(shooter.net._pendingHits.has(h), true);

    // 6. Non-strict killed (truthiness / invalid numbers)
    shooter.net.onMessage('B', { k: 'hit_ack', m: 'test-round-427', h, v: 2, a: 1, d: 40, kld: 2, vl: correctVl });
    shooter.net.onMessage('B', { k: 'hit_ack', m: 'test-round-427', h, v: 2, a: 1, d: 40, kld: true, vl: correctVl });
    shooter.net.onMessage('B', { k: 'hit_ack', m: 'test-round-427', h, v: 2, a: 1, d: 40, kld: '1', vl: correctVl });
    assert.equal(shooter.attacker.s3.flow.score, 0);
    assert.equal(shooter.attacker.s3.splatsThisLife ?? 0, 0);
    assert.equal(shooter.net._pendingHits.has(h), true);

    // 7. Finally valid genuine ACK is accepted and consumes pending
    shooter.net.onMessage('B', { k: 'hit_ack', m: 'test-round-427', h, v: 2, a: 1, d: 40, kld: 0, vl: correctVl });
    assert.ok(Math.abs(shooter.attacker.s3.flow.score - damageScore(40)) < 1e-6);
    assert.equal(shooter.net._pendingHits.has(h), false);
  } finally {
    shooter.dispose(); defender.dispose();
  }
});

test('adversarial: authenticated blocked ACK retires pending request without granting', async () => {
  const shooter = await createCombatWorld('A', { apply427: true });
  const defender = await createCombatWorld('B', { apply427: true });
  try {
    defender.victim.invuln = 2.0;
    shooter.attacker.s3.flow.score = 1.0;
    shooter.G.projectiles.applyHit(shooter.attacker, shooter.victim, 100, 'shooter');
    const h = shooter.net._hitSeq;
    assert.equal(shooter.net._pendingHits.has(h), true);

    const hitPkt = shooter.wire.find(x => x.to === 'B').data;
    defender.receiveHit('A', hitPkt);
    const ackPkt = defender.wire.find(x => x.to === 'A' && x.data.k === 'hit_ack')?.data;
    assert.equal(ackPkt.d, 0);
    assert.equal(ackPkt.kld, 0);

    // Shooter delivers authenticated blocked ACK
    shooter.net.onMessage('B', ackPkt);
    syncTick(defender, shooter);

    // Authenticated blocked ACK retires pending without granting progression
    assert.equal(shooter.attacker.s3.flow.score, 1.0, 'Flow score unchanged');
    assert.equal(shooter.attacker.s3.splatsThisLife ?? 0, 0, 'splatsThisLife unchanged');
    assert.equal(shooter.net._pendingHits.has(h), false, 'pending hit retired cleanly');

    // Duplicate delivery finds no pending hit and is safely ignored
    shooter.net.onMessage('B', ackPkt);
    syncTick(defender, shooter);
    assert.equal(shooter.attacker.s3.flow.score, 1.0);
  } finally {
    shooter.dispose(); defender.dispose();
  }
});

test('adversarial: out-of-order distinct legitimate ACKs each credit without drop', async () => {
  const shooter = await createCombatWorld('A', { apply427: true });
  const defender = await createCombatWorld('B', { apply427: true });
  try {
    shooter.attacker.s3.flow.score = 0;

    // Send hit 1 (20 dmg) and hit 2 (30 dmg)
    shooter.G.projectiles.applyHit(shooter.attacker, shooter.victim, 20, 'shooter');
    const h1 = shooter.net._hitSeq;
    shooter.G.projectiles.applyHit(shooter.attacker, shooter.victim, 30, 'shooter');
    const h2 = shooter.net._hitSeq;

    assert.equal(h1, 1);
    assert.equal(h2, 2);
    assert.equal(shooter.net._pendingHits.size, 2);

    const vl = defender.victim.netLife ?? 0;
    const ack1 = { k: 'hit_ack', m: 'test-round-427', h: h1, v: 2, a: 1, d: 20, kld: 0, vl };
    const ack2 = { k: 'hit_ack', m: 'test-round-427', h: h2, v: 2, a: 1, d: 30, kld: 0, vl };

    // Network reordering: ACK 2 arrives BEFORE ACK 1!
    shooter.net.onMessage('B', ack2);
    assert.ok(Math.abs(shooter.attacker.s3.flow.score - damageScore(30)) < 1e-6, 'ACK 2 processed first with the current configured weight');
    assert.equal(shooter.net._pendingHits.has(h2), false, 'pending hit 2 consumed');
    assert.equal(shooter.net._pendingHits.has(h1), true, 'pending hit 1 still awaiting ACK');

    // ACK 1 arrives SECOND (out-of-order reordered arrival)
    shooter.net.onMessage('B', ack1);
    assert.ok(Math.abs(shooter.attacker.s3.flow.score - damageScore(50)) < 1e-6, 'reordered ACK 1 processed without being dropped (total damageScore(50))');
    assert.equal(shooter.net._pendingHits.has(h1), false, 'pending hit 1 consumed');

    // Replay of ACK 1 or ACK 2 is dropped exactly once
    shooter.net.onMessage('B', ack1);
    shooter.net.onMessage('B', ack2);
    assert.ok(Math.abs(shooter.attacker.s3.flow.score - damageScore(50)) < 1e-6, 'no duplicate progression on replay');
  } finally {
    shooter.dispose(); defender.dispose();
  }
});

test('adversarial: dead or stale owner cannot progress combat state and cleans up on death/respawn', async () => {
  const shooter = await createCombatWorld('A', { apply427: true });
  const defender = await createCombatWorld('B', { apply427: true });
  try {
    shooter.attacker.s3.flow.score = 0;
    shooter.G.projectiles.applyHit(shooter.attacker, shooter.victim, 50, 'shooter');
    const h1 = shooter.net._hitSeq;
    const vl = defender.victim.netLife ?? 0;

    // Attacker dies before ACK arrives
    shooter.attacker.alive = false;
    shooter.net.onMessage('B', { k: 'hit_ack', m: 'test-round-427', h: h1, v: 2, a: 1, d: 50, kld: 0, vl });
    assert.equal(shooter.attacker.s3.flow.score, 0, 'dead attacker cannot progress Flow');

    // Attacker respawns (new combat life)
    shooter.attacker.alive = true;
    shooter.attacker.spawnAt(new shooter.THREE.Vector3(0, 0, 0), 0);
    assert.ok((shooter.attacker.netLife ?? 0) > 1);

    // Old-life ACK arriving for new life is strictly rejected
    shooter.net.onMessage('B', { k: 'hit_ack', m: 'test-round-427', h: h1, v: 2, a: 1, d: 50, kld: 0, vl });
    assert.equal(shooter.attacker.s3.flow.score, 0, 'old life ACK rejected for respawned life');

    // New hit in new life records pending hit, but local splat cleans it up immediately
    shooter.G.projectiles.applyHit(shooter.attacker, shooter.victim, 50, 'shooter');
    const h2 = shooter.net._hitSeq;
    assert.equal(shooter.net._pendingHits.has(h2), true);

    // Local death occurs
    shooter.attacker.splat(null);
    assert.equal(shooter.net._pendingHits.has(h2), false, 'pending hit cleaned up on actor splat');
  } finally {
    shooter.dispose(); defender.dispose();
  }
});

test('adversarial: assistant receives Flow assist progression on authenticated terminal event', async () => {
  // 3-player match:
  // Helper H (owner H, nid 1, Team 0)
  // Killer A (owner A, nid 2, Team 0)
  // Victim V (owner V, nid 3, Team 1)
  const roster = [
    { nid: 1, team: 0, owner: 'H' },
    { nid: 2, team: 0, owner: 'A' },
    { nid: 3, team: 1, owner: 'V' }
  ];

  const helperWorld = await createCombatWorld('H', { apply427: true, roster });
  const victimWorld = await createCombatWorld('V', { apply427: true, roster });

  try {
    const helperActorH = helperWorld.actors[0]; // local on helperWorld
    const victimActorV_onH = helperWorld.actors[2]; // remote on helperWorld

    const helperActorH_onV = victimWorld.actors[0]; // remote on victimWorld
    const killerActorA_onV = victimWorld.actors[1]; // remote on victimWorld
    const victimActorV = victimWorld.actors[2]; // local on victimWorld

    assert.equal(helperActorH.isLocal, true);
    assert.equal(victimActorV_onH.remote, true);
    assert.equal(victimActorV.isLocal, true);

    // 1. Helper H shoots victim V for 30 damage
    helperWorld.G.projectiles.applyHit(helperActorH, victimActorV_onH, 30, 'shooter');
    const hitPkt = helperWorld.wire.find(x => x.to === 'V').data;

    // Victim V receives and applies H's hit
    victimWorld.receiveHit('H', hitPkt);
    assert.equal(victimActorV.hp, 70);

    const ackPkt = victimWorld.wire.find(x => x.to === 'H' && x.data.k === 'hit_ack')?.data;
    assert.equal(ackPkt.d, 30);
    assert.equal(ackPkt.kld, 0);

    // Helper H receives confirmed damage; the current profile owns the award weight.
    helperWorld.net.onMessage('V', ackPkt);
    assert.ok(Math.abs(helperActorH.s3.flow.score - damageScore(30)) < 1e-6, 'helper awarded damage Flow progress');

    // 2. Killer A shoots victim V for 70 damage -> lethal blow!
    const hitPktFromA = { k: 'hit', m: 'test-round-427', v: 3, a: 2, l: victimActorV.netLife, h: 1, d: 70, w: 'shooter' };
    victimWorld.receiveHit('A', hitPktFromA);
    assert.equal(victimActorV.alive, false, 'victim is splatted');

    // Victim V broadcasts terminal event in tick
    victimWorld.net._sendTick();
    const tickPkt = victimWorld.wire.filter(x => x.data?.k === 't').at(-1)?.data;
    assert.ok(tickPkt, 'victim owner broadcast tick');

    // 3. Helper H receives and delivers victim's tick with authenticated terminal splatted event
    helperWorld.deliver('V', tickPkt);

    // Assistant progression follows the current configured assist weight.
    // The once-only authoritative assist is independent from the current damage weight.
    assert.ok(Math.abs(helperActorH.s3.flow.score - (damageScore(30) + assistScore)) < 1e-6, 'helper awarded assist Flow progression on terminal event');
    assert.equal(helperActorH.stats.splats, 0, 'helper is assistant, not killer (stats.splats remains 0)');

    // 4. Duplicate delivery of terminal tick does NOT award duplicate assist
    helperWorld.deliver('V', tickPkt);
    assert.ok(Math.abs(helperActorH.s3.flow.score - (damageScore(30) + assistScore)) < 1e-6, 'terminal event cannot duplicate assist');
  } finally {
    helperWorld.dispose(); victimWorld.dispose();
  }
});

test('negative counterexample: terminal-before-ACK ordering awards assist exactly once with ACK-first parity', async () => {
  // 3-player match:
  // Helper H (owner H, nid 1, Team 0)
  // Killer C (owner C, nid 2, Team 0)
  // Victim V (owner V, nid 3, Team 1)
  const roster = [
    { nid: 1, team: 0, owner: 'H' },
    { nid: 2, team: 0, owner: 'C' },
    { nid: 3, team: 1, owner: 'V' }
  ];

  // --- Part 1: Terminal-before-ACK sequence (counterexample) ---
  const helperWorld = await createCombatWorld('H', { apply427: true, roster });
  const killerWorld = await createCombatWorld('C', { apply427: true, roster });
  const victimWorld = await createCombatWorld('V', { apply427: true, roster });

  try {
    const helperH = helperWorld.actors[0]; // local on helperWorld
    const victimV_onH = helperWorld.actors[2]; // remote on helperWorld

    const killerC = killerWorld.actors[1]; // local on killerWorld
    const victimV_onC = killerWorld.actors[2]; // remote on killerWorld

    const victimV = victimWorld.actors[2]; // local on victimWorld

    // Spies for generic damage/splatted events on helper client
    let genericDamageCount = 0, genericSplatCount = 0;
    helperWorld.on('damage', () => genericDamageCount++);
    helperWorld.on('splatted', () => genericSplatCount++);

    // 1. Helper H shoots victim V for 30 nonlethal damage
    helperWorld.G.projectiles.applyHit(helperH, victimV_onH, 30, 'shooter');
    const hitPktFromH = helperWorld.wire.find(x => x.to === 'V' && x.data?.k === 'hit')?.data;
    assert.ok(hitPktFromH, 'hit packet sent from H to V');

    // Victim V receives and accepts H's hit
    victimWorld.receiveHit('H', hitPktFromH);
    assert.equal(victimV.hp, 70);

    // Victim V generates ACK to H, but ACK is delayed over the wire!
    const ackPktToH = victimWorld.wire.find(x => x.to === 'H' && x.data?.k === 'hit_ack')?.data;
    assert.ok(ackPktToH, 'ACK packet generated by V for H');
    assert.equal(ackPktToH.d, 30);
    assert.equal(ackPktToH.kld, 0);

    // 2. Killer C shoots victim V for 70 lethal damage
    killerWorld.G.projectiles.applyHit(killerC, victimV_onC, 70, 'shooter');
    const hitPktFromC = killerWorld.wire.find(x => x.to === 'V' && x.data?.k === 'hit')?.data;
    assert.ok(hitPktFromC, 'hit packet sent from C to V');

    // Victim V receives and accepts lethal hit from C
    victimWorld.receiveHit('C', hitPktFromC);
    assert.equal(victimV.alive, false, 'victim splatted on authoritative owner');

    // Killer C receives its ACK and records kill
    const ackPktToC = victimWorld.wire.find(x => x.to === 'C' && x.data?.k === 'hit_ack')?.data;
    assert.ok(ackPktToC, 'ACK packet generated by V for C');
    killerWorld.net.onMessage('V', ackPktToC);
    assert.equal(killerC.s3.splatsThisLife, 0, 'nonlethal ACK precedes next-tick terminal delivery');

    // Victim V broadcasts terminal tick packet
    victimWorld.net._sendTick();
    const terminalTick = victimWorld.wire.filter(x => x.data?.k === 't').at(-1)?.data;
    assert.ok(terminalTick, 'terminal tick broadcast by victim owner');
    killerWorld.deliver('V', terminalTick);
    assert.equal(killerC.s3.splatsThisLife, 1, 'authoritative terminal credits the killer once');

    // 3. NEGATIVE COUNTEREXAMPLE ORDER: Terminal packet reaches Helper H BEFORE delayed ACK!
    helperWorld.deliver('V', terminalTick);
    assert.equal(victimV_onH.alive, false, 'victim recognized as dead on helper client');
    // At this moment, delayed ACK has not arrived yet: Flow score must be 0 (no premature or unconfirmed awards)
    assert.equal(helperH.s3.flow.score, assistScore, 'life-bound victim terminal can grant the authoritative assist before its redundant ACK');
    assert.equal(helperH.stats.splats, 0);

    // 4. Delayed ACK finally reaches Helper H!
    helperWorld.net.onMessage('V', ackPktToH);

    // Damage and assist contributions remain separately configured and idempotent.
    assert.ok(Math.abs(helperH.s3.flow.score - (damageScore(30) + assistScore)) < 1e-6, 'helper awarded exactly-once assist upon delayed ACK arrival');
    assert.equal(helperH.stats.splats, 0, 'helper is assistant, not killer (stats.splats is 0)');
    assert.equal(helperH.s3.splatsThisLife ?? 0, 0, 'helper not credited with kill splatsThisLife');

    // 5. Idempotency: duplicate delayed ACK does not re-award assist or damage
    helperWorld.net.onMessage('V', ackPktToH);
    assert.ok(Math.abs(helperH.s3.flow.score - (damageScore(30) + assistScore)) < 1e-6, 'duplicate delayed ACK cannot duplicate progression');

    // Duplicate terminal tick does not duplicate assist
    helperWorld.deliver('V', terminalTick);
    assert.ok(Math.abs(helperH.s3.flow.score - (damageScore(30) + assistScore)) < 1e-6, 'duplicate terminal tick cannot duplicate progression');

    // 6. Current authoritative terminal emits one splatted notification; ACK replay emits no extra damage or terminal.
    assert.equal(genericDamageCount, 0, 'no generic damage events emitted during cross-owner assist');
    assert.equal(genericSplatCount, 1, 'exactly one current authoritative splatted notification survives both replay attempts');

    // 7. Killer C terminal delivery preservation: killer is not awarded an assist
    killerWorld.deliver('V', terminalTick);
    assert.equal(killerC.s3.splatsThisLife, 1, 'killer retained splatsThisLife');
    const killerTurfBonus = 0.123456789 * FLOW.weights.turf;
    assert.ok(Math.abs(killerC.s3.flow.score - ((damageScore(70) + calculateFlowSplatPoints(damageScore(70), false, FLOW).gain) + killerTurfBonus)) < 1e-6, `killer preserved without assist progression: ${killerC.s3.flow.score}, ${killerTurfBonus}`);
    assert.ok(killerC.s3.flow.score < 1.5, 'assist progression was not awarded to killer');

    // --- Part 2: ACK-first sequence for exact parity verification ---
    const helperWorld2 = await createCombatWorld('H', { apply427: true, roster });
    const victimWorld2 = await createCombatWorld('V', { apply427: true, roster });
    try {
      const h2 = helperWorld2.actors[0];
      const v2_onH = helperWorld2.actors[2];
      const v2 = victimWorld2.actors[2];

      // H2 shoots V2
      helperWorld2.G.projectiles.applyHit(h2, v2_onH, 30, 'shooter');
      const hitPkt2 = helperWorld2.wire.find(x => x.to === 'V' && x.data?.k === 'hit')?.data;
      victimWorld2.receiveHit('H', hitPkt2);
      const ackPkt2 = victimWorld2.wire.find(x => x.to === 'H' && x.data?.k === 'hit_ack')?.data;

      // In ACK-first order: ACK is delivered FIRST
      helperWorld2.net.onMessage('V', ackPkt2);
      assert.ok(Math.abs(h2.s3.flow.score - damageScore(30)) < 1e-6, 'ACK-first damage awarded');

      // V2 killed by C
      victimWorld2.receiveHit('C', { k: 'hit', m: 'test-round-427', v: 3, a: 2, l: v2.netLife, h: 1, d: 70, w: 'shooter' });
      victimWorld2.net._sendTick();
      const terminalTick2 = victimWorld2.wire.filter(x => x.data?.k === 't').at(-1)?.data;

      // In ACK-first order: Terminal is delivered SECOND
      helperWorld2.deliver('V', terminalTick2);
      assert.ok(Math.abs(h2.s3.flow.score - (damageScore(30) + assistScore)) < 1e-6, 'ACK-first assist awarded');

      // VERIFY EXACT PARITY: Terminal-first score === ACK-first score
      assert.ok(Math.abs(helperH.s3.flow.score - h2.s3.flow.score) < 1e-6, 'terminal-first and ACK-first achieve exact parity');
    } finally {
      helperWorld2.dispose(); victimWorld2.dispose();
    }
  } finally {
    helperWorld.dispose(); killerWorld.dispose(); victimWorld.dispose();
  }
});

test('adversarial: stale pending hits and credits are cleaned across owner death, respawn, and expired window', async () => {
  const roster = [
    { nid: 1, team: 0, owner: 'H' },
    { nid: 2, team: 0, owner: 'C' },
    { nid: 3, team: 1, owner: 'V' }
  ];

  const helperWorld = await createCombatWorld('H', { apply427: true, roster });
  const victimWorld = await createCombatWorld('V', { apply427: true, roster });

  try {
    const helperH = helperWorld.actors[0];
    const victimV_onH = helperWorld.actors[2];
    const victimV = victimWorld.actors[2];

    // 1. Focused regression: ACK-first damage -> helper dies + reset + newlife -> victim terminal yields no stale assist
    helperWorld.G.projectiles.applyHit(helperH, victimV_onH, 30, 'shooter');
    const hitPkt1 = helperWorld.wire.find(x => x.to === 'V' && x.data?.k === 'hit')?.data;
    victimWorld.receiveHit('H', hitPkt1);
    const ackPkt1 = victimWorld.wire.find(x => x.to === 'H' && x.data?.k === 'hit_ack')?.data;

    // ACK arrives first on helper: helper gets damage credit and is recorded in credits
    helperWorld.net.onMessage('V', ackPkt1);
    assert.ok(Math.abs(helperH.s3.flow.score - damageScore(30)) < 1e-6, 'helper awarded initial damage Flow progress');

    // Helper dies, resets, and respawns into new life
    const initialLife = helperH.netLife ?? 0;
    helperH.splat(null);
    helperH.reset();
    helperH.spawnAt(new helperWorld.THREE.Vector3(0, 0, 0), 0);
    assert.ok((helperH.netLife ?? 0) > initialLife, 'helper entered new combat life');
    assert.equal(helperH.s3.flow.score, 0, 'helper flow reset on new life');

    // Victim V dies to Killer C; victim owner broadcasts terminal tick
    victimWorld.receiveHit('C', { k: 'hit', m: 'test-round-427', v: 3, a: 2, l: victimV.netLife, h: 10, d: 70, w: 'shooter' });
    victimWorld.net._sendTick();
    const terminalTick1 = victimWorld.wire.filter(x => x.data?.k === 't').at(-1)?.data;

    // Helper delivers victim's terminal tick
    helperWorld.deliver('V', terminalTick1);

    // Stale credit check: Helper H in new life must NOT receive stale assist from previous life!
    assert.equal(helperH.s3.flow.score, 0, 'helper in new life does not receive stale assist from previous life');
    assert.equal(helperH.stats.splats, 0);

    // Preserve terminal-before-ACK parity:
    // When delayed ACK arrives for helper who died+reset+respawned, assist is similarly rejected
    const helperWorld2 = await createCombatWorld('H', { apply427: true, roster });
    const victimWorld2 = await createCombatWorld('V', { apply427: true, roster });
    try {
      const h2 = helperWorld2.actors[0];
      const v2_onH = helperWorld2.actors[2];
      const v2 = victimWorld2.actors[2];

      // H2 damages V2, but ACK is delayed
      helperWorld2.G.projectiles.applyHit(h2, v2_onH, 30, 'shooter');
      const hitPkt2 = helperWorld2.wire.find(x => x.to === 'V' && x.data?.k === 'hit')?.data;
      victimWorld2.receiveHit('H', hitPkt2);
      const ackPkt2 = victimWorld2.wire.find(x => x.to === 'H' && x.data?.k === 'hit_ack')?.data;

      // V2 dies to C; terminal tick arrives at H2 before delayed ACK
      victimWorld2.receiveHit('C', { k: 'hit', m: 'test-round-427', v: 3, a: 2, l: v2.netLife, h: 11, d: 70, w: 'shooter' });
      victimWorld2.net._sendTick();
      const terminalTick2 = victimWorld2.wire.filter(x => x.data?.k === 't').at(-1)?.data;
      helperWorld2.deliver('V', terminalTick2);

      // Helper dies, resets, and respawns into new life before delayed ACK arrives
      h2.splat(null);
      h2.reset();
      h2.spawnAt(new helperWorld2.THREE.Vector3(0, 0, 0), 0);
      assert.equal(h2.s3.flow.score, 0);

      // Delayed ACK finally arrives
      helperWorld2.net.onMessage('V', ackPkt2);

      // Both orderings yield exact parity: 0 assist
      assert.equal(h2.s3.flow.score, 0, 'terminal-before-ACK parity: helper in new life gets no stale assist on delayed ACK');
      assert.equal(helperH.s3.flow.score, h2.s3.flow.score, 'ACK-first and terminal-before-ACK parity preserved on helper death/respawn');
    } finally {
      helperWorld2.dispose(); victimWorld2.dispose();
    }

    // 2. Assist window expiration test:
    // Helper does not die, but delayed ACK arrives AFTER assistWindow (5.0s)
    const helperWorld3 = await createCombatWorld('H', { apply427: true, roster });
    const victimWorld3 = await createCombatWorld('V', { apply427: true, roster });
    try {
      const h3 = helperWorld3.actors[0];
      const v3_onH = helperWorld3.actors[2];
      const v3 = victimWorld3.actors[2];

      helperWorld3.G.projectiles.applyHit(h3, v3_onH, 30, 'shooter');
      const hitPkt3 = helperWorld3.wire.find(x => x.to === 'V' && x.data?.k === 'hit')?.data;
      victimWorld3.receiveHit('H', hitPkt3);
      const ackPkt3 = victimWorld3.wire.find(x => x.to === 'H' && x.data?.k === 'hit_ack')?.data;

      victimWorld3.receiveHit('C', { k: 'hit', m: 'test-round-427', v: 3, a: 2, l: v3.netLife, h: 12, d: 70, w: 'shooter' });
      victimWorld3.net._sendTick();
      const terminalTick3 = victimWorld3.wire.filter(x => x.data?.k === 't').at(-1)?.data;
      for (const row of terminalTick3.e || []) if (row[1] === 'ev' && row[2] === 'splatted') delete row[3].assistLives; // legacy metadata-free expiry path
      helperWorld3.deliver('V', terminalTick3);

      // Advance clock by 6.0 seconds (> cfg.assistWindow 5.0s)
      helperWorld3.advance(6.0);

      // Delayed ACK arrives after expiration: damage is credited, but assist is withheld!
      helperWorld3.net.onMessage('V', ackPkt3);
      assert.ok(Math.abs(h3.s3.flow.score - damageScore(30)) < 1e-6, 'assist withheld when ACK arrives past assistWindow');
    } finally {
      helperWorld3.dispose(); victimWorld3.dispose();
    }

    // 3. Remote victim respawn cleans pending hits targeting that victim:
    victimV_onH.alive = true; victimV_onH.hp = 100; victimV_onH.invuln = 0;
    helperWorld.G.projectiles.applyHit(helperH, victimV_onH, 30, 'shooter');
    assert.equal(helperWorld.net._pendingHits.size, 1, 'pending hit tracked');
    // Remote victim respawns
    helperWorld.net._remoteRespawn(victimV_onH);
    assert.equal(helperWorld.net._pendingHits.size, 0, 'pending hit cleaned when remote victim respawns');

    // 4. Local helper death cleans pending hits from that attacker:
    helperH.alive = true; helperH.hp = 100;
    victimV_onH.alive = true; victimV_onH.hp = 100; victimV_onH.invuln = 0;
    helperWorld.G.projectiles.applyHit(helperH, victimV_onH, 30, 'shooter');
    assert.equal(helperWorld.net._pendingHits.size, 1, 'pending hit tracked');
    helperH.splat(null);
    assert.equal(helperWorld.net._pendingHits.size, 0, 'pending hit cleaned when local actor is splatted');
  } finally {
    helperWorld.dispose(); victimWorld.dispose();
  }
});

test('normal/offline: local combat retains standard progression with no duplication', async () => {
  const offlineWorld = await createCombatWorld('A', { apply427: true, offline: true });
  try {
    const p1 = offlineWorld.attacker, p2 = offlineWorld.victim;
    p1.s3.flow.score = 2.6;

    // Normal local nonlethal hit
    offlineWorld.G.projectiles.applyHit(p1, p2, 40, 'shooter');
    assert.equal(p2.hp, 60);
    assert.ok(Math.abs(p1.s3.flow.score - (2.6 + damageScore(40))) < 1e-6, 'damage progress awarded offline');
    assert.equal(p1.s3.flow.active, false);

    // Normal local lethal hit
    offlineWorld.G.projectiles.applyHit(p1, p2, 60, 'shooter');
    offlineWorld.G.time += 1 / 60; p2.update(1 / 60);
    assert.equal(p2.alive, false);
    assert.equal(p1.s3.flow.active, true, 'Flow activated offline on splat');
    assert.equal(p1.s3.splatsThisLife, 1, 'splatsThisLife incremented offline');
  } finally {
    offlineWorld.dispose();
  }
});

test('adversarial: spoof ownership cannot consume pending, changed victim owner ACK rejects, and disposal clears', async () => {
  const shooter = await createCombatWorld('A', { apply427: true });
  try {
    shooter.G.projectiles.applyHit(shooter.attacker, shooter.victim, 50, 'shooter');
    const h = shooter.net._hitSeq;
    assert.equal(shooter.net._pendingHits.has(h), true, 'pending hit registered');

    // 1. Spoof ownership message / reserved no-op cannot consume or clear pending hits
    shooter.net.onMessage('B', { k: 'own', map: { 2: 'C' } });
    shooter.net._ownership({ 2: 'C' });
    assert.equal(shooter.net._pendingHits.has(h), true, 'spoof ownership packet cannot consume or clear pending hits');

    // 2. Real changed victim owner ACK rejects:
    // If victim's actual owner changes to C:
    shooter.victim.owner = 'C';
    const vl = shooter.victim.netLife ?? 0;

    // ACK from old owner B is rejected because victim.owner ('C') !== from ('B')
    shooter.net.onMessage('B', { k: 'hit_ack', m: 'test-round-427', h, v: 2, a: 1, d: 50, kld: 0, vl });
    assert.equal(shooter.attacker.s3.flow.score, 0, 'ACK from old owner rejected when victim owner changed');
    assert.equal(shooter.net._pendingHits.has(h), true, 'pending hit not consumed by rejected ACK');

    // ACK from new owner C is rejected because from ('C') !== pending.vo ('B')
    shooter.net.onMessage('C', { k: 'hit_ack', m: 'test-round-427', h, v: 2, a: 1, d: 50, kld: 0, vl });
    assert.equal(shooter.attacker.s3.flow.score, 0, 'ACK from new owner rejected because pending was bound to old owner');
    assert.equal(shooter.net._pendingHits.has(h), true, 'pending hit not consumed by mismatched owner ACK');

    // 3. Genuine disposal cleans up pending hits
    shooter.dispose();
    assert.equal(shooter.net._pendingHits.size, 0, 'disposal clears pending hits');
  } finally {
    shooter.dispose();
  }
});

test('patched: composition with PR400 clothing gear adapter preserves hit transactions and flow progress', async () => {
  const shooter = await createCombatWorld('A', { apply427: true, pr400: true });
  const defender = await createCombatWorld('B', { apply427: true, pr400: true });
  try {
    shooter.attacker.s3.flow.score = 2.6;
    shooter.G.projectiles.applyHit(shooter.attacker, shooter.victim, 100, 'shooter');
    const hitPkt = shooter.wire.find(x => x.to === 'B').data;
    defender.receiveHit('A', hitPkt);
    const ackPkt = defender.wire.find(x => x.to === 'A' && x.data.k === 'hit_ack')?.data;
    shooter.net.onMessage('B', ackPkt);
    syncTick(defender, shooter);

    assert.equal(shooter.attacker.s3.flow.active, true, 'Flow active under PR400 composition');
    assert.equal(shooter.attacker.s3.splatsThisLife, 1, 'splatsThisLife incremented under PR400 composition');
  } finally {
    shooter.dispose(); defender.dispose();
  }
});

async function assistPacketRig({ oldAssistLife = false, newOwner = false } = {}) {
  const roster = [{nid:1,team:0,owner:'H'}, {nid:2,team:0,owner:'C'}, {nid:3,team:1,owner:'V'}];
  const h = await createCombatWorld('H', {roster,oldAssistLife}), v = await createCombatWorld('V',{roster});
  const target = h.net.byNid.get(3), victim = v.net.byNid.get(3), helper = h.net.byNid.get(1);
  h.G.projectiles.applyHit(helper,target,30,'shooter');
  v.receiveHit('H',h.wire.find(x=>x.data.k==='hit').data);
  const ack = v.wire.find(x=>x.data.k==='hit_ack').data;
  v.receiveHit('C',{k:'hit',m:'test-round-427',v:3,a:2,l:victim.netLife,h:1,d:70,w:'shooter'});
  v.net._sendTick();
  const packet=v.wire.findLast(x=>x.data.k==='t').data;
  const payload=packet.e.find(row=>row[1]==='ev'&&row[2]==='splatted')[3];
  let receiver=h;
  if(newOwner){
    receiver=await createCombatWorld('N',{roster});
    receiver.net.s.hostId='N';receiver.net.s.isHost=true;
    const life=receiver.net.byNid.get(1).netLife;
    receiver.net.onLeave('H',true);
    assert.equal(receiver.net.byNid.get(1).remote,false);
    assert.equal(receiver.net.byNid.get(1).netLife,life);
  }
  return {h,v,receiver,helper:receiver.net.byNid.get(1),ack,packet,payload,
    close(){h.dispose();v.dispose();if(receiver!==h)receiver.dispose();}};
}

test('assist life metadata preserves the ID array, rejects a new helper life and closes the old alias counterexample',async()=>{
 for(const oldAssistLife of [false,true]){
  const f=await assistPacketRig({oldAssistLife});
  try {
   assert.deepEqual(f.payload.assists,[1]);assert.equal(f.payload.assistLives[1],f.helper.netLife);
   const oldLife=f.helper.netLife;f.helper.splat(null);f.helper.reset();f.helper.spawnAt(new f.h.THREE.Vector3(),0);
   assert(f.helper.netLife>oldLife);
   f.h.deliver('V',f.packet);
   assert.equal(f.helper.s3.flow.score,oldAssistLife?assistScore:0);
  }finally{f.close();}
 }
});
test('legacy assist packet uses proven ACK credit in either order, without assigning an unknown epoch',async()=>{
 for(const ackFirst of [false,true]){
  const f=await assistPacketRig();
  try {
   delete f.payload.assistLives;
   if(ackFirst)f.h.net.onMessage('V',f.ack);
   f.h.deliver('V',f.packet);
   assert.equal(f.helper.s3.flow.score,ackFirst?assistScore:0);
   if(!ackFirst)f.h.net.onMessage('V',f.ack);
   assert.equal(f.helper.s3.flow.score,assistScore);
   f.h.net.onMessage('V',f.ack);f.h.deliver('V',f.packet);
   assert.equal(f.helper.s3.flow.score,assistScore);
  }finally{f.close();}
 }
});
test('same-life native owner adoption accepts victim metadata without an old-owner ACK',async()=>{
 const f=await assistPacketRig({newOwner:true});
 try{
  assert.equal(f.receiver.net._pendingHits?.size || 0,0);assert.equal(f.receiver.confirmed.length,0);
  f.receiver.deliver('V',f.packet);assert.equal(f.helper.s3.flow.score,assistScore);
  f.receiver.deliver('V',f.packet);assert.equal(f.helper.s3.flow.score,assistScore);
 }finally{f.close();}
});
test('malformed or mismatched assist life metadata never borrows the current helper epoch',async()=>{
 for(const value of [null,[],{}, {'1':-1},{'1':'1'},{'1':99}]){
  const f=await assistPacketRig();
  try{f.payload.assistLives=value;f.h.deliver('V',f.packet);assert.equal(f.helper.s3.flow.score,0);}
  finally{f.close();}
 }
});
