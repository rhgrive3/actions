import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { installSpecialVfx } from '../runtime/special-vfx.mjs';
import { fixture } from './source-fixture.mjs';
import { makePaintWorld } from './paint-authority-fixture.mjs';

const IDS = ['tentaMissiles', 'booyahBomb', 'ultraStamp', 'crabTank', 'trizooka', 'inkVac'];

// Real Director and GPU pool objects with a minimal native callback. This part
// checks observer composition, not gameplay or rendered/retail appearance.
function component(id) {
  let pooled, mutate = false, failure = null;
  const calls = [], visuals = [], result = {};
  class FX {
    constructor() { this.root = new THREE.Group(); this.q = .35; }
    setCollider() {} update() {} clear() {} dispose() {}
  }
  class Projectiles {
    constructor() { this.list = []; }
    _new(...args) { calls.push(['new', this, args]); return pooled; }
    _blastBurst(...args) {
      calls.push(['burst', this, args]);
      if (failure) throw failure;
      if (mutate) args[1].set(99, 99, 99);
      return result;
    }
  }
  const G = { actors: [], teamColors: [new THREE.Color('#ff8800'), new THREE.Color('#2244ff')] };
  const api = { FX, Projectiles, THREE, G, on() {} };
  installSpecialVfx(api); installSpecialVfx(api);
  const fx = G.fx = new FX(); G.projectiles = new Projectiles(); fx.setCollider();
  const d = fx.s3SpecialVfx;
  d.inkBlast = (at, color, radius) => visuals.push({ at: at.toArray(), color: [...color], radius });
  d.flash = (at, color, radius) => { if (id === 'booyahBomb' && radius === 2.2) visuals.push({ at: at.toArray(), color: [...color], radius }); };
  const p = pooled = { wid: id, type: 'blast', owner: { alive: true, team: 0, color: G.teamColors[0] }, team: 0,
    radius: 11, seed: .37, s3AllSpecialSeed: 17, s3AllSpecialMode: id === 'crabTank' ? 'cannon' : undefined,
    pos: new THREE.Vector3(0, 3, 1), vel: new THREE.Vector3(0, 0, 20) };
  return { api, G, fx, d, p, calls, visuals, result, mutate: v => { mutate = v; }, fail: v => { failure = v; } };
}

for (const id of IDS) {
  test(`${id}: native terminal snapshots point, retires trail and deduplicates pooled lifetime`, () => {
    const f = component(id), at = new THREE.Vector3(1, 2, 3), victim = {}, extra = {};
    try {
      f.G.projectiles.list = [f.p]; f.d.updateRounds(1 / 60);
      const tracked = f.d.rounds.get(f.p); assert.ok(tracked);
      f.mutate(true);
      assert.equal(f.G.projectiles._blastBurst(f.p, at, victim, extra), f.result);
      assert.deepEqual(f.calls[0], ['burst', f.G.projectiles, [f.p, at, victim, extra]]);
      assert.equal(f.visuals.length, 1); assert.deepEqual(f.visuals[0].at, [1, 2, 3]);
      assert.equal(f.d.rounds.size, 0);
      for (const rec of Object.values(tracked.d)) {
        if (rec?.pts) assert.equal(rec.ended, true);
        else if (rec?.v && 'dead' in rec) assert.equal(rec.dead, true);
      }
      f.G.projectiles._blastBurst(f.p, at); f.d.updateRounds(1 / 60);
      assert.equal(f.visuals.length, 1, 'duplicate native calls and list observation cannot replay impact');
      assert.equal(f.calls.length, 2, 'native calls are not deduplicated');
      f.G.projectiles.list = [];
      assert.equal(f.G.projectiles._new(), f.p);
      f.p.owner = { alive: false, team: 1, color: f.G.teamColors[1] }; f.p.team = 1;
      f.G.projectiles._blastBurst(f.p, new THREE.Vector3(4, 5, 6));
      assert.equal(f.visuals.length, 2); assert.deepEqual(f.visuals[1].color, f.G.teamColors[1].toArray());
      if (id === 'inkVac') {
        const shells = f.d.kit.shells.recs;
        const dome = shells.find(r => r.follow && r.life === .7);
        assert.ok(dome, 'unobserved terminal still creates the charged dome');
        dome.t = dome.life; dome.follow(dome, 0);
        assert.equal(dome.v[4], 11, 'same-frame impact retains charge-scaled native radius');
      }
    } finally { f.fx.dispose(); }
  });

  for (const mode of ['remove', 'dead', 'recycle', 'clear', 'dispose']) test(`${id}: ${mode} retires without impact`, () => {
    const f = component(id);
    try {
      f.G.projectiles.list = [f.p]; f.d.updateRounds(1 / 60);
      assert.equal(f.d.rounds.size, 1);
      if (mode === 'remove') f.G.projectiles.list = [];
      if (mode === 'dead') f.p.dead = true;
      if (mode === 'recycle') f.G.projectiles._new();
      if (mode === 'clear') f.fx.clear();
      if (mode === 'dispose') f.fx.dispose();
      if (mode === 'remove' || mode === 'dead') f.d.updateRounds(1 / 60);
      assert.equal(f.d.rounds.size, 0); assert.equal(f.visuals.length, 0);
    } finally { if (f.fx.s3SpecialVfx) f.fx.dispose(); }
  });
}

test('terminal observer ignores deferred snapshots, cancelled Trizooka and non-cannon Crab shots', () => {
  for (const [id, mutate] of [
    ['inkVac', p => { delete p.pos; }], ['trizooka', p => { p.s3TrizookaBirthPending = true; }],
    ['trizooka', p => { p.s3TrizookaBirthCancelled = true; }], ['trizooka', p => { p.delay = .1; }],
    ['crabTank', p => { p.type = 'shot'; delete p.s3AllSpecialMode; }],
  ]) {
    const f = component(id); mutate(f.p);
    try { f.G.projectiles._blastBurst(f.p, new THREE.Vector3(1, 2, 3)); assert.equal(f.visuals.length, 0); assert.equal(f.calls.length, 1); }
    finally { f.fx.dispose(); }
  }
});

test('native exception is preserved and failed/malformed callbacks do not consume valid impact', () => {
  const f = component('inkVac'), failure = new Error('native failure'), at = new THREE.Vector3(1, 2, 3);
  try {
    f.fail(failure); assert.throws(() => f.G.projectiles._blastBurst(f.p, at), e => e === failure);
    f.fail(null); f.G.projectiles._blastBurst(f.p, new THREE.Vector3(NaN, 0, 0));
    f.G.projectiles._blastBurst(f.p, at); assert.equal(f.visuals.length, 1);
  } finally { f.fx.dispose(); }
});

// The production-composed native Projectiles/Physics/Paint/NetMatch paths are
// used below. Actor movement/Character remain the source fixture's documented
// simplifications. Ink Vac uses its real exhale emitter and Trizooka its real
// three-glob volley. Other controlled rounds enter through native _new/_push
// with the installed descriptor, so no ability
// input timing or retail ballistic parity is claimed by this boundary test.
async function nativeFixture() {
  let draws = 0, seed = 0x12345678;
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true,
    extraExports: "export { throwVolley, trizookaSpecialWeapon } from './patches/splatoon3/runtime/kit-trizooka.mjs';",
    vmPerformance: { now: () => 0 }, vmMathRandom: () => {
      draws++; seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 0x100000000;
    } });
  f.resetRng = () => { draws = 0; seed = 0x12345678; }; f.rngCount = () => draws;
  return f;
}

function nativeRound(f, id, owner) {
  const system = f.G.projectiles;
  if (id === 'inkVac') return system.fireInkVacExhale(owner, { charge: 1 });
  if (id === 'trizooka') return f.throwVolley(system, owner, f.trizookaSpecialWeapon())[0];
  const p = system._new(), descriptor = f.SPECIALS[id].projectileDescriptor(p);
  Object.assign(p, { wid: id, type: 'blast', owner, team: owner.team, radius: descriptor.impactRadius,
    s3SpecialWeapon: descriptor, s3Weapon: descriptor, s3AllSpecial: id,
    s3AllSpecialMode: id === 'crabTank' ? 'cannon' : undefined, s3AllSpecialSeed: 17,
    age: 0, life: .6, straight: 0, grav: 0, drag: 0, trailEvery: 0, damage: descriptor.directDamage,
    size: .22, seed: .37 });
  p.pos.set(0, 3, 0); p.start.copy(p.pos); p.prev.copy(p.pos); p.vel.set(0, 0, 20);
  system._push(p); return p;
}

function nativeRun(f, id, hz, mode, enabled, packet = null) {
  const { G } = f; G.netm = null;
  const { paint, level } = makePaintWorld(f, { wall: mode === 'wall' || mode === 'near' });
  if (mode === 'near') {
    level.faces[1].origin.z = .05;
    const b = level.blocks[1]; b.center.z = .55; b.aabbMin.z = .05; b.aabbMax.z = 1.05;
  }
  const fx = G.fx = new f.installedRuntime.FX(G.scene, { quality: .35 }); fx.setCollider(() => null);
  fx.s3SpecialVfxEnabled = enabled;
  const d = fx.s3SpecialVfx, system = G.projectiles;
  const owner = f.make('shooter'); owner.isLocal = !packet; owner.remote = !!packet; owner.nid = 7;
  owner.pos.set(0, 2, 0); owner.aimDir.set(0, 0, 1); owner.aimYaw = 0;
  owner.character.root.position.copy(owner.pos);
  const target = mode === 'actor' ? f.make('shooter') : null;
  if (target) { target.team = 1; target.isLocal = true; target.hp = 1000; target.pos.set(0, 2, 3); }
  const nm = G.netm = new f.NetMatch({ myId: packet ? 'viewer' : 'owner' }, {});
  const native = [], visual = [], travel = [], damage = [];
  let frame = -1;
  const originalBurst = system._blastBurst;
  system._blastBurst = function (p, at, ...args) {
    if (p.wid === id) native.push({ frame, at: at.toArray(), live: !!p.pos });
    return originalBurst.call(this, p, at, ...args);
  };
  const originalHit = system.applyHit;
  system.applyHit = function (attacker, victim, amount, cause) {
    damage.push([attacker === owner, victim === target, amount, cause]);
    return originalHit.apply(this, arguments);
  };
  const originalVisual = id === 'booyahBomb' ? d.flash : d.inkBlast;
  d[id === 'booyahBomb' ? 'flash' : 'inkBlast'] = function (at, color, radius, ...args) {
    if (id !== 'booyahBomb' || radius === 2.2) visual.push({ frame, at: at.toArray() });
    return originalVisual.call(this, at, color, radius, ...args);
  };
  try {
    f.resetRng();
    let p;
    if (packet) { system.ghostProjectile(owner, JSON.parse(JSON.stringify(packet))); p = system.list.at(-1); assert.ok(p?.ghost); }
    else p = nativeRound(f, id, owner);
    const packets = JSON.parse(JSON.stringify(nm.out));
    if (mode === 'remove') {
      fx.update(1 / hz, G.camera); system.clear();
    }
    for (frame = 0; frame < hz * 3; frame++) {
      G.time += 1 / hz; system.update(1 / hz);
      travel.push([frame, ...p.pos.toArray(), ...p.vel.toArray(), p.age, system.list.includes(p)]);
      fx.update(1 / hz, G.camera); paint.advanceSimulation(1 / hz);
      if (!system.list.length && frame > 3) break;
    }
    assert.equal(d.errors, 0);
    assert.equal(system.list.includes(p), false);
    const terminal = native.filter(n => n.live);
    assert.equal(terminal.length, mode === 'remove' ? 0 : id === 'trizooka' && !packet ? 3 : 1, `${id} ${mode}: native terminal count`);
    assert.equal(visual.length, enabled ? terminal.length : 0, `${id} ${mode}: one visual per actual terminal`);
    if (enabled) assert.deepEqual(visual, terminal.map(({ frame, at }) => ({ frame, at })), 'native position and frame');
    if (mode === 'near' && !packet) assert.equal(terminal[0].frame, 0, 'terminal precedes first render');
    if (mode === 'actor' && id !== 'booyahBomb') assert.ok(damage.some(row => row[1] && row[2] > 0), 'real native actor hit');
    return structuredClone({ native, travel, damage, packets, outgoing: nm.out, hp: owner.hp, targetHp: target?.hp, special: owner.special,
      paint: crypto.createHash('sha256').update(Buffer.from(paint.grid)).digest('hex'), draws: f.rngCount() });
  } finally { fx.dispose(); system.clear(); G.netm = null; }
}

for (const hz of [30, 60, 120]) test(`production terminal lifecycle at ${hz} Hz preserves gameplay and native RNG`, async t => {
  const offFixture = await nativeFixture(), onFixture = await nativeFixture();
  for (const id of IDS) for (const mode of ['wall', 'near', 'actor', 'expiry', 'remove']) await t.test(`${id} ${mode}`, () => {
    const off = nativeRun(offFixture, id, hz, mode, false), on = nativeRun(onFixture, id, hz, mode, true);
    assert.deepEqual(on, off, 'same trajectories, native/deferred calls, paint, network, HP, gauge and RNG');
  });
  for (const id of IDS) await t.test(`${id} actual serialized ghost terminal and cleanup`, () => {
    const source = nativeRun(offFixture, id, hz, 'near', false);
    const packet = source.packets.find(row => row[1] === 'p'); assert.ok(packet, 'native serializer supplies the replay packet');
    for (const mode of ['near', 'remove']) {
      const off = nativeRun(offFixture, id, hz, mode, false, packet), on = nativeRun(onFixture, id, hz, mode, true, packet);
      assert.deepEqual(on, off, 'remote lifecycle preserves native authority and outgoing packets');
    }
  });
});
