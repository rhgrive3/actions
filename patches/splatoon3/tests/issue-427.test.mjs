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

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.join(ROOT, 'inkwave-public');

async function createCombatWorld(owner, { apply427 = true, pr400 = false, roster = null, offline = false } = {}) {
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
    return file;
  };

  const load = file => {
    if (mods.has(file)) return mods.get(file);
    let source = fs.readFileSync(file, 'utf8');
    const rel = file.startsWith(SRC + path.sep) ? path.relative(SRC, file) : path.relative(ROOT, file);

    source = adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, source))));
    if (pr400Adapter) {
      source = pr400Adapter(rel, source, (code, b, a, lbl) => {
        const idx = code.indexOf(b);
        if (idx === -1) return code;
        return code.slice(0, idx) + a + code.slice(idx + b.length);
      });
    }
    if (apply427) {
      source = adaptIssue427(rel, source);
    }

    const mod = new vm.SourceTextModule(source, { context, identifier: file });
    mods.set(file, mod);
    return mod;
  };

  const entry = new vm.SourceTextModule(`
    export * from './src/core/ctx.js'; export * from './src/config.js';
    export * from './src/game/actor.js'; export * from './src/game/weapons.js';
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
    a._nearCamera = () => false; a._finishFrame = () => {};
    return a;
  };

  const actorDefs = roster || [
    { nid: 1, team: 0, owner: 'A' },
    { nid: 2, team: 1, owner: 'B' }
  ];
  const actors = actorDefs.map(d => make(d.nid, d.team, d.owner));
  G.actors = actors;
  const attacker = actors[0], victim = actors[1];

  const wire = [];
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
    net = new api.NetMatch(session, { map: 'reef' });
    const match = { actors: G.actors, state: 'playing', time: 180, canRespawn: () => true };
    G.match = match; net.bind(match);
  }
  G.projectiles = { applyHit: api.Projectiles.prototype.applyHit };

  const deliver = (from, data) => {
    if (!net) return;
    net.onMessage(from, JSON.parse(JSON.stringify(data)));
    const peer = net.peers.get(from);
    if (peer) { peer.tr = (data.ts || 0) + 1; peer.sim = Number.MAX_SAFE_INTEGER; net._playEvents(); }
  };

  return {
    ...api, profile, attacker, victim, actors, net, wire, paint, deliver,
    advance: dt => { clock += (dt || 0.05); G.time += (dt || 0.05); },
    dispose: () => net?.dispose()
  };
}

test('negative control: unpatched main leaves shooter Flow inactive and misses splatsThisLife on attacker owner', async () => {
  const shooter = await createCombatWorld('A', { apply427: false });
  const defender = await createCombatWorld('B', { apply427: false });
  try {
    shooter.attacker.s3.flow.score = 2.6;
    shooter.G.projectiles.applyHit(shooter.attacker, shooter.victim, 100, 'shooter');
    const hitPkt = shooter.wire.find(x => x.to === 'B').data;
    defender.net.onMessage('A', hitPkt);
    defender.net._sendTick();
    shooter.deliver('B', defender.wire.at(-1).data);

    // Negative check: Flow did NOT activate on shooter, splatsThisLife is unincremented
    assert.equal(shooter.attacker.s3.flow.active, false, 'unpatched main cannot activate Flow');
    assert.ok(shooter.attacker.s3.flow.score < 3.0, 'unpatched main misses cross-owner Flow combat progression');
    assert.equal(shooter.attacker.s3.splatsThisLife ?? 0, 0, 'unpatched main misses authoritative splatsThisLife');

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

    defender.net.onMessage('A', hitPkt);
    assert.equal(defender.victim.alive, false, 'victim killed on its authoritative owner');

    // Defender proxy must NOT accumulate proxy progression
    assert.equal(defender.attacker.s3.flow.score, 0, 'remote proxy does not accumulate Flow');
    assert.equal(defender.attacker.s3.splatsThisLife ?? 0, 0, 'remote proxy does not accumulate splatsThisLife');

    const ackPkt = defender.wire.find(x => x.to === 'A' && x.data.k === 'hit_ack')?.data;
    assert.ok(ackPkt, 'victim owner sent hit_ack');
    assert.equal(ackPkt.d, 100, 'confirmed accepted damage');
    assert.equal(ackPkt.kld, 1, 'confirmed kill');

    shooter.net.onMessage('B', ackPkt);

    // Flow activation: 2.6 + (100 * 0.003 = 0.3) + 1.0 (splat) = 3.9 >= 3.0 -> Flow active
    assert.equal(shooter.attacker.s3.flow.active, true, 'Flow activated on attacker owner');
    assert.equal(shooter.attacker.s3.flow.score, 0, 'Flow score resets to 0 on activation');
    assert.equal(shooter.attacker.s3.splatsThisLife, 1, 'splatsThisLife incremented on attacker owner');

    // Duplicate ACK must be rejected
    shooter.net.onMessage('B', ackPkt);
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
    defender.net.onMessage('A', hitPkt);
    assert.equal(defender.victim.hp, 70, 'victim took 30 damage');
    assert.equal(defender.victim.alive, true);

    const ackPkt = defender.wire.find(x => x.to === 'A' && x.data.k === 'hit_ack')?.data;
    assert.equal(ackPkt.d, 30);
    assert.equal(ackPkt.kld, 0);

    shooter.net.onMessage('B', ackPkt);
    assert.ok(Math.abs(shooter.attacker.s3.flow.score - 0.09) < 1e-6, 'damage progress awarded (30 * 0.003)');
    assert.equal(shooter.attacker.s3.flow.active, false, 'nonlethal hit did not activate Flow');
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
    defender.net.onMessage('B', hitPkt);
    assert.equal(defender.attacker.alive, false);

    const ackPkt = defender.wire.find(x => x.to === 'B' && x.data.k === 'hit_ack')?.data;
    shooter.net.onMessage('A', ackPkt);

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

    shooter.attacker.splat(null);
    const regularRespawn = shooter.attacker.respawnTimer;
    shooter.attacker.reset();
    assert.equal(shooter.attacker.s3.previousLifeNoSplat, true);
    assert.equal(shooter.attacker.s3.splatsThisLife, 0);

    shooter.G.projectiles.applyHit(shooter.attacker, shooter.victim, 100, 'shooter');
    const hitPkt = shooter.wire.find(x => x.to === 'B').data;
    defender.net.onMessage('A', hitPkt);
    const ackPkt = defender.wire.find(x => x.to === 'A' && x.data.k === 'hit_ack')?.data;
    shooter.net.onMessage('B', ackPkt);

    assert.equal(shooter.attacker.s3.splatsThisLife, 1, 'confirmed kill recorded');

    shooter.attacker.splat(null);
    assert.equal(shooter.attacker.respawnTimer, regularRespawn, 'Quick Respawn correctly denied after confirmed kill');
    assert.equal(shooter.attacker.s3.previousLifeNoSplat, false, 'previousLifeNoSplat cleared after kill life');
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
    const forgedAck = { k: 'hit_ack', h, v: 2, a: 1, d: 30, kld: 0, vl: defender.victim.netLife ?? 0 };
    shooter.net.onMessage('C', forgedAck);

    // Verify progression was NOT awarded, and crucially, pending hit was NOT consumed!
    assert.equal(shooter.attacker.s3.flow.score, 0, 'forged sender cannot award Flow');
    assert.equal(shooter.net._pendingHits.has(h), true, 'forged sender must NOT delete/consume valid pending request');

    // Genuine ACK arrives from authenticated victim owner 'B'
    shooter.net.onMessage('B', forgedAck);

    // Verify authenticated ACK is accepted, progress awarded, and pending consumed exactly once
    assert.ok(Math.abs(shooter.attacker.s3.flow.score - 0.09) < 1e-6, 'genuine ACK awards Flow progression');
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
    shooter.net.onMessage('B', { k: 'hit_ack', h, v: 2, a: 999, d: 40, kld: 0, vl: correctVl });
    assert.equal(shooter.attacker.s3.flow.score, 0);
    assert.equal(shooter.net._pendingHits.has(h), true);

    // 2. Wrong victim ID
    shooter.net.onMessage('B', { k: 'hit_ack', h, v: 999, a: 1, d: 40, kld: 0, vl: correctVl });
    assert.equal(shooter.attacker.s3.flow.score, 0);
    assert.equal(shooter.net._pendingHits.has(h), true);

    // 3. Wrong victim life
    shooter.net.onMessage('B', { k: 'hit_ack', h, v: 2, a: 1, d: 40, kld: 0, vl: 999 });
    assert.equal(shooter.attacker.s3.flow.score, 0);
    assert.equal(shooter.net._pendingHits.has(h), true);

    // 4. Negative damage
    shooter.net.onMessage('B', { k: 'hit_ack', h, v: 2, a: 1, d: -10, kld: 0, vl: correctVl });
    assert.equal(shooter.attacker.s3.flow.score, 0);
    assert.equal(shooter.net._pendingHits.has(h), true);

    // 5. Non-finite damage (NaN / string / Infinity)
    shooter.net.onMessage('B', { k: 'hit_ack', h, v: 2, a: 1, d: NaN, kld: 0, vl: correctVl });
    shooter.net.onMessage('B', { k: 'hit_ack', h, v: 2, a: 1, d: '40', kld: 0, vl: correctVl });
    shooter.net.onMessage('B', { k: 'hit_ack', h, v: 2, a: 1, d: Infinity, kld: 0, vl: correctVl });
    assert.equal(shooter.attacker.s3.flow.score, 0);
    assert.equal(shooter.net._pendingHits.has(h), true);

    // 6. Non-strict killed (truthiness / invalid numbers)
    shooter.net.onMessage('B', { k: 'hit_ack', h, v: 2, a: 1, d: 40, kld: 2, vl: correctVl });
    shooter.net.onMessage('B', { k: 'hit_ack', h, v: 2, a: 1, d: 40, kld: true, vl: correctVl });
    shooter.net.onMessage('B', { k: 'hit_ack', h, v: 2, a: 1, d: 40, kld: '1', vl: correctVl });
    assert.equal(shooter.attacker.s3.flow.score, 0);
    assert.equal(shooter.attacker.s3.splatsThisLife ?? 0, 0);
    assert.equal(shooter.net._pendingHits.has(h), true);

    // 7. Finally valid genuine ACK is accepted and consumes pending
    shooter.net.onMessage('B', { k: 'hit_ack', h, v: 2, a: 1, d: 40, kld: 0, vl: correctVl });
    assert.ok(Math.abs(shooter.attacker.s3.flow.score - 0.12) < 1e-6);
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
    defender.net.onMessage('A', hitPkt);
    const ackPkt = defender.wire.find(x => x.to === 'A' && x.data.k === 'hit_ack')?.data;
    assert.equal(ackPkt.d, 0);
    assert.equal(ackPkt.kld, 0);

    // Shooter delivers authenticated blocked ACK
    shooter.net.onMessage('B', ackPkt);

    // Authenticated blocked ACK retires pending without granting progression
    assert.equal(shooter.attacker.s3.flow.score, 1.0, 'Flow score unchanged');
    assert.equal(shooter.attacker.s3.splatsThisLife ?? 0, 0, 'splatsThisLife unchanged');
    assert.equal(shooter.net._pendingHits.has(h), false, 'pending hit retired cleanly');

    // Duplicate delivery finds no pending hit and is safely ignored
    shooter.net.onMessage('B', ackPkt);
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
    const ack1 = { k: 'hit_ack', h: h1, v: 2, a: 1, d: 20, kld: 0, vl };
    const ack2 = { k: 'hit_ack', h: h2, v: 2, a: 1, d: 30, kld: 0, vl };

    // Network reordering: ACK 2 arrives BEFORE ACK 1!
    shooter.net.onMessage('B', ack2);
    assert.ok(Math.abs(shooter.attacker.s3.flow.score - 0.09) < 1e-6, 'ACK 2 processed first (30 * 0.003)');
    assert.equal(shooter.net._pendingHits.has(h2), false, 'pending hit 2 consumed');
    assert.equal(shooter.net._pendingHits.has(h1), true, 'pending hit 1 still awaiting ACK');

    // ACK 1 arrives SECOND (out-of-order reordered arrival)
    shooter.net.onMessage('B', ack1);
    assert.ok(Math.abs(shooter.attacker.s3.flow.score - 0.15) < 1e-6, 'reordered ACK 1 processed without being dropped (total 0.15)');
    assert.equal(shooter.net._pendingHits.has(h1), false, 'pending hit 1 consumed');

    // Replay of ACK 1 or ACK 2 is dropped exactly once
    shooter.net.onMessage('B', ack1);
    shooter.net.onMessage('B', ack2);
    assert.ok(Math.abs(shooter.attacker.s3.flow.score - 0.15) < 1e-6, 'no duplicate progression on replay');
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
    shooter.net.onMessage('B', { k: 'hit_ack', h: h1, v: 2, a: 1, d: 50, kld: 0, vl });
    assert.equal(shooter.attacker.s3.flow.score, 0, 'dead attacker cannot progress Flow');

    // Attacker respawns (new combat life)
    shooter.attacker.alive = true;
    shooter.attacker.spawnAt(new shooter.THREE.Vector3(0, 0, 0), 0);
    assert.ok((shooter.attacker.netLife ?? 0) > 1);

    // Old-life ACK arriving for new life is strictly rejected
    shooter.net.onMessage('B', { k: 'hit_ack', h: h1, v: 2, a: 1, d: 50, kld: 0, vl });
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
    victimWorld.net.onMessage('H', hitPkt);
    assert.equal(victimActorV.hp, 70);

    const ackPkt = victimWorld.wire.find(x => x.to === 'H' && x.data.k === 'hit_ack')?.data;
    assert.equal(ackPkt.d, 30);
    assert.equal(ackPkt.kld, 0);

    // Helper H receives confirmed damage ACK: Flow awards 30 * 0.003 = 0.09
    helperWorld.net.onMessage('V', ackPkt);
    assert.ok(Math.abs(helperActorH.s3.flow.score - 0.09) < 1e-6, 'helper awarded damage Flow progress');

    // 2. Killer A shoots victim V for 70 damage -> lethal blow!
    const hitPktFromA = { k: 'hit', v: 3, a: 2, l: victimActorV.netLife, h: 1, d: 70, w: 'shooter' };
    victimWorld.net.onMessage('A', hitPktFromA);
    assert.equal(victimActorV.alive, false, 'victim is splatted');

    // Victim V broadcasts terminal event in tick
    victimWorld.net._sendTick();
    const tickPkt = victimWorld.wire.filter(x => x.data?.k === 't').at(-1)?.data;
    assert.ok(tickPkt, 'victim owner broadcast tick');

    // 3. Helper H receives and delivers victim's tick with authenticated terminal splatted event
    helperWorld.deliver('V', tickPkt);

    // Assistant progression: cfg.weights.assist is 0.5
    // Flow score on Helper H should advance from 0.09 to 0.09 + 0.5 = 0.59!
    assert.ok(Math.abs(helperActorH.s3.flow.score - 0.59) < 1e-6, 'helper awarded assist Flow progression on terminal event');
    assert.equal(helperActorH.stats.splats, 0, 'helper is assistant, not killer (stats.splats remains 0)');

    // 4. Duplicate delivery of terminal tick does NOT award duplicate assist
    helperWorld.deliver('V', tickPkt);
    assert.ok(Math.abs(helperActorH.s3.flow.score - 0.59) < 1e-6, 'terminal event cannot duplicate assist');
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
    assert.ok(Math.abs(p1.s3.flow.score - (2.6 + 40 * 0.003)) < 1e-6, 'damage progress awarded offline');
    assert.equal(p1.s3.flow.active, false);

    // Normal local lethal hit
    offlineWorld.G.projectiles.applyHit(p1, p2, 60, 'shooter');
    assert.equal(p2.alive, false);
    assert.equal(p1.s3.flow.active, true, 'Flow activated offline on splat');
    assert.equal(p1.s3.splatsThisLife, 1, 'splatsThisLife incremented offline');
  } finally {
    offlineWorld.dispose();
  }
});

test('patched: ownership handoff and disposal clear pending hits', async () => {
  const shooter = await createCombatWorld('A', { apply427: true });
  try {
    shooter.G.projectiles.applyHit(shooter.attacker, shooter.victim, 50, 'shooter');
    const h = shooter.net._hitSeq;
    assert.equal(shooter.net._pendingHits.has(h), true);

    // Ownership handoff clears pending hits
    shooter.net._ownership({});
    assert.equal(shooter.net._pendingHits.size, 0);

    // Late ACK cannot match
    shooter.net.onMessage('B', { k: 'hit_ack', h, v: 2, a: 1, d: 50, kld: 0, vl: 1 });
    assert.equal(shooter.attacker.s3.flow.score, 0);

    // Disposal cleans up
    shooter.G.projectiles.applyHit(shooter.attacker, shooter.victim, 50, 'shooter');
    assert.equal(shooter.net._pendingHits.size, 1);
    shooter.dispose();
    assert.equal(shooter.net._pendingHits.size, 0);
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
    defender.net.onMessage('A', hitPkt);
    const ackPkt = defender.wire.find(x => x.to === 'A' && x.data.k === 'hit_ack')?.data;
    shooter.net.onMessage('B', ackPkt);

    assert.equal(shooter.attacker.s3.flow.active, true, 'Flow active under PR400 composition');
    assert.equal(shooter.attacker.s3.splatsThisLife, 1, 'splatsThisLife incremented under PR400 composition');
  } finally {
    shooter.dispose(); defender.dispose();
  }
});
