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

async function createCombatWorld(owner, { apply427 = true, pr400 = false } = {}) {
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

  const attacker = make(1, 0, 'A'), victim = make(2, 1, 'B');
  G.actors = [attacker, victim];

  const wire = [];
  const session = {
    myId: owner, hostId: 'A', isHost: owner === 'A', _members: new Map([['A', 'A'], ['B', 'B']]),
    tr: {
      sendTo: (to, data) => wire.push({ to, data: JSON.parse(JSON.stringify(data)) }),
      broadcast: data => wire.push({ data: JSON.parse(JSON.stringify(data)) })
    }
  };
  const net = new api.NetMatch(session, { map: 'reef' });
  const match = { actors: G.actors, state: 'playing', time: 180, canRespawn: () => true };
  G.match = match; net.bind(match);
  G.projectiles = { applyHit: api.Projectiles.prototype.applyHit };

  const deliver = (from, data) => {
    net.onMessage(from, JSON.parse(JSON.stringify(data)));
    const peer = net.peers.get(from);
    if (peer) { peer.tr = (data.ts || 0) + 1; peer.sim = Number.MAX_SAFE_INTEGER; net._playEvents(); }
  };

  return {
    ...api, profile, attacker, victim, net, wire, paint, deliver,
    advance: dt => { clock += (dt || 0.05); G.time += (dt || 0.05); },
    dispose: () => net.dispose()
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
    // Equip Quick Respawn on attacker
    shooter.attacker.s3.loadout = [
      { main: 'quickRespawn', subs: ['none', 'none', 'none'] },
      { main: 'none', subs: ['none', 'none', 'none'] },
      { main: 'none', subs: ['none', 'none', 'none'] }
    ];
    shooter.attacker.setWeapon('shooter');

    // Simulate clean previous life (died with no splat)
    shooter.attacker.splat(null);
    const regularRespawn = shooter.attacker.respawnTimer;
    shooter.attacker.reset();
    assert.equal(shooter.attacker.s3.previousLifeNoSplat, true);
    assert.equal(shooter.attacker.s3.splatsThisLife, 0);

    // Cross-owner splat on remote victim B
    shooter.G.projectiles.applyHit(shooter.attacker, shooter.victim, 100, 'shooter');
    const hitPkt = shooter.wire.find(x => x.to === 'B').data;
    defender.net.onMessage('A', hitPkt);
    const ackPkt = defender.wire.find(x => x.to === 'A' && x.data.k === 'hit_ack')?.data;
    shooter.net.onMessage('B', ackPkt);

    assert.equal(shooter.attacker.s3.splatsThisLife, 1, 'confirmed kill recorded');

    // Attacker is now splatted
    shooter.attacker.splat(null);

    // Quick Respawn MUST NOT trigger because attacker got a kill this life!
    assert.equal(shooter.attacker.respawnTimer, regularRespawn, 'Quick Respawn correctly denied after confirmed kill');
    assert.equal(shooter.attacker.s3.previousLifeNoSplat, false, 'previousLifeNoSplat cleared after kill life');
  } finally {
    shooter.dispose(); defender.dispose();
  }
});

test('patched: rejected hit (spawn invulnerability) does not advance Flow or splatsThisLife', async () => {
  const shooter = await createCombatWorld('A', { apply427: true });
  const defender = await createCombatWorld('B', { apply427: true });
  try {
    defender.victim.invuln = 2.0;
    shooter.attacker.s3.flow.score = 2.6;
    shooter.G.projectiles.applyHit(shooter.attacker, shooter.victim, 100, 'shooter');
    const hitPkt = shooter.wire.find(x => x.to === 'B').data;
    defender.net.onMessage('A', hitPkt);
    assert.equal(defender.victim.hp, 100, 'invulnerable victim took no damage');

    const ackPkt = defender.wire.find(x => x.to === 'A' && x.data.k === 'hit_ack')?.data;
    assert.equal(ackPkt.d, 0);
    assert.equal(ackPkt.kld, 0);

    shooter.net.onMessage('B', ackPkt);
    assert.equal(shooter.attacker.s3.flow.score, 2.6, 'Flow score untouched');
    assert.equal(shooter.attacker.s3.flow.active, false);
    assert.equal(shooter.attacker.s3.splatsThisLife ?? 0, 0);
  } finally {
    shooter.dispose(); defender.dispose();
  }
});

test('patched: special-blocked hit (armor reduction) awards only reduced accepted damage', async () => {
  const shooter = await createCombatWorld('A', { apply427: true });
  const defender = await createCombatWorld('B', { apply427: true });
  try {
    defender.victim.specialActive = { armor: true };
    shooter.attacker.s3.flow.score = 0;
    shooter.G.projectiles.applyHit(shooter.attacker, shooter.victim, 100, 'shooter');
    const hitPkt = shooter.wire.find(x => x.to === 'B').data;
    defender.net.onMessage('A', hitPkt);
    assert.equal(defender.victim.hp, 75, 'armored victim took 25 damage (100 * 0.25)');

    const ackPkt = defender.wire.find(x => x.to === 'A' && x.data.k === 'hit_ack')?.data;
    assert.equal(ackPkt.d, 25);
    assert.equal(ackPkt.kld, 0);

    shooter.net.onMessage('B', ackPkt);
    assert.ok(Math.abs(shooter.attacker.s3.flow.score - 0.075) < 1e-6, 'Flow awarded reduced 25 * 0.003');
    assert.equal(shooter.attacker.s3.splatsThisLife ?? 0, 0);
  } finally {
    shooter.dispose(); defender.dispose();
  }
});

test('patched: old-attacker-life ACK cannot progress a new life', async () => {
  const shooter = await createCombatWorld('A', { apply427: true });
  const defender = await createCombatWorld('B', { apply427: true });
  try {
    shooter.G.projectiles.applyHit(shooter.attacker, shooter.victim, 100, 'shooter');
    const hitPkt = shooter.wire.find(x => x.to === 'B').data;
    defender.net.onMessage('A', hitPkt);
    const ackPkt = defender.wire.find(x => x.to === 'A' && x.data.k === 'hit_ack')?.data;

    // Attacker dies and respawns before ACK arrives (advances netLife)
    shooter.attacker.netLife = (shooter.attacker.netLife ?? 0) + 1;
    shooter.attacker.s3.splatsThisLife = 0;
    shooter.attacker.s3.flow.score = 0;

    // Delayed ACK arrives
    shooter.net.onMessage('B', ackPkt);
    assert.equal(shooter.attacker.s3.splatsThisLife, 0, 'old life ACK rejected for new life');
    assert.equal(shooter.attacker.s3.flow.score, 0, 'old life Flow progression dropped');
  } finally {
    shooter.dispose(); defender.dispose();
  }
});

test('patched: malformed and foreign-sender ACKs are strictly rejected', async () => {
  const shooter = await createCombatWorld('A', { apply427: true });
  try {
    shooter.G.projectiles.applyHit(shooter.attacker, shooter.victim, 50, 'shooter');
    const h = shooter.net._hitSeq;
    const initialScore = shooter.attacker.s3.flow.score;

    // Foreign sender
    shooter.net.onMessage('foreign_peer', { k: 'hit_ack', h, v: 2, a: 1, d: 50, kld: 0, vl: 1 });
    assert.equal(shooter.attacker.s3.flow.score, initialScore);

    // Negative damage
    shooter.net.onMessage('B', { k: 'hit_ack', h, v: 2, a: 1, d: -10, kld: 0, vl: 1 });
    assert.equal(shooter.attacker.s3.flow.score, initialScore);

    // Invalid sequence
    shooter.net.onMessage('B', { k: 'hit_ack', h: NaN, v: 2, a: 1, d: 50, kld: 0, vl: 1 });
    assert.equal(shooter.attacker.s3.flow.score, initialScore);
  } finally {
    shooter.dispose();
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
