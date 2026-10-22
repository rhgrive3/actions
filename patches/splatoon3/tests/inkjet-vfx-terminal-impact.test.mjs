import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { fixture } from './source-fixture.mjs';
import { makePaintWorld } from './paint-authority-fixture.mjs';
import { installSpecialVfx } from '../runtime/special-vfx.mjs';

if (process.env.INKWAVE_BUILT_SITE) throw new Error('This source lifecycle suite is not built-site or browser acceptance');

// Actual Actor admission, native Projectiles/Physics and CPU paint. The source
// fixture simplifies the Character and actor movement; no rendered/retail claim.
async function nativeFixture() {
  let draws = 0, randomState = 0x12345678;
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true,
    vmPerformance: { now: () => 0 }, // Pin packet wall-clock stamps; gameplay advances through G.time.
    vmMathRandom: () => { draws++; randomState ^= randomState << 13; randomState ^= randomState >>> 17; randomState ^= randomState << 5; return (randomState >>> 0) / 0x100000000; } });
  f.nativeRng = { reset: () => { draws = 0; randomState = 0x12345678; }, count: () => draws };
  return f;
}
async function nativeRun(f, hz, mode, enabled) {
  const { G } = f, api = f.installedRuntime;
  G.actors.length = 0; G.time = 0;
  G.projectiles.clear();
  const { paint, level } = makePaintWorld(f, { wall: mode !== 'expiry' });
  if (mode === 'near') {
    level.faces[1].origin.z = .05;
    const b = level.blocks[1]; b.center.z = .55; b.aabbMin.z = .05; b.aabbMax.z = 1.05;
  }
  const fx = G.fx = new api.FX(G.scene, { quality: .35 }); fx.setCollider(() => null);
  fx.s3SpecialVfxEnabled = enabled;
  const d = fx.s3SpecialVfx, system = G.projectiles;
  const a = f.make('shooter'); a.isLocal = true; a.pos.set(0, 2, 0); a.form = 'kid'; a._resolve = () => {};
  a.weapon = { ...a.weapon, special: 'inkjet', specialCost: 200 }; a.special = 200;
  a.aimDir.set(0, -.4, 1).normalize(); a.aimPitch = .38; a.aimYaw = 0;
  let target = null;
  if (mode === 'actor') {
    target = f.make('shooter'); target.team = 1; target.hp = 1000; target.pos.set(0, 6.6, 3);
  }
  const contacts = [], bursts = [], visuals = [], births = [], travel = [], damage = [];
  let frame = -1, shot = null;
  const burst = system._blastBurst;
  system._blastBurst = function (p, at, ...args) {
    if (p.wid === 'inkjet') bursts.push({ frame, at: at.toArray(), pos: p.pos?.toArray() ?? null, age: p.age ?? null });
    return burst.call(this, p, at, ...args);
  };
  const impact = system._impact;
  system._impact = function (p, h, ...args) {
    if (p.wid === 'inkjet') contacts.push({ frame, point: h.point.toArray(), normal: h.normal.toArray() });
    return impact.call(this, p, h, ...args);
  };
  const hit = system.applyHit;
  system.applyHit = function (owner, target, amount, cause) {
    damage.push([owner === a, target.team, amount, cause]); return hit.apply(this, arguments);
  };
  const inkBlast = d.inkBlast;
  d.inkBlast = function (pos, col, radius, opts) {
    if (radius === 3.6) visuals.push({ frame, at: pos.toArray() });
    return inkBlast.call(this, pos, col, radius, opts);
  };
  try {
    f.nativeRng.reset(); a._startSpecial(); a.intent.fire = true;
    for (frame = 0; frame < hz * 4; frame++) {
      const dt = 1 / hz; G.time += dt; a.update(dt);
      if (!shot) {
        shot = system.list.find(p => p.wid === 'inkjet');
        if (shot) { births.push({ frame, pos: shot.pos.toArray(), vel: shot.vel.toArray(), seed: shot.seed }); a.intent.fire = false; }
      }
      system.update(dt);
      if (shot) travel.push([frame, ...shot.pos.toArray(), ...shot.vel.toArray(), shot.age, system.list.includes(shot)]);
      fx.update(dt, G.camera); paint.advanceSimulation(dt);
      // A terrain callback initially enqueues a snapshot. Continue through the
      // next-tick flush; stopping at first contact misses duplicate visuals.
      if (bursts.length && frame >= bursts[0].frame + 3) break;
    }
    assert.equal(births.length, 1, 'one native paid shot');
    assert.equal(bursts.length, mode === 'wall' || mode === 'near' ? 2 : 1, 'native terminal plus any deferred terrain flush');
    assert.ok(bursts[0].pos, 'first entry is the native projectile');
    if (bursts.length === 2) { assert.equal(bursts[1].pos, null, 'queued snapshot is not another projectile'); assert.deepEqual(bursts[1].at, bursts[0].at); }
    assert.equal(system.s3BlastQueue?.length || 0, 0, 'deferred work fully drained');
    assert.equal(contacts.length, mode === 'expiry' || mode === 'actor' ? 0 : 1);
    assert.equal(system.list.includes(shot), false, 'native retirement');
    if (mode === 'actor') assert.ok(damage.length > 0 && target.hp < 1000, 'real actor damage applied');
    assert.equal(d.errors, 0);
    assert.equal(visuals.length, enabled ? 1 : 0, 'same-frame impacts cannot be lost');
    if (enabled) assert.deepEqual(visuals[0], { frame: bursts[0].frame, at: bursts[0].at }, 'exact terminal point and frame');
    if (mode === 'near') assert.equal(births[0].frame, bursts[0].frame, 'shot retires before its first render');
    if (mode === 'expiry') assert.deepEqual(bursts[0].at, bursts[0].pos, 'expiry airburst is not mislabeled as world contact');
    else if (mode !== 'actor') assert.deepEqual(bursts[0].at, contacts[0].point);
    return structuredClone({ births, contacts, bursts, travel, damage, draws: f.nativeRng.count(),
      grid: crypto.createHash('sha256').update(Buffer.from(paint.grid)).digest('hex'),
      painted: Array.from(paint.counts), special: a.special, hp: a.hp, targetHp: target?.hp ?? null });
  } finally { fx.dispose?.(); system.clear(); }
}

for (const hz of [30, 60, 120]) {
  test(`Inkjet native terminals at ${hz} Hz`, async t => {
    // Reuse a paired source fixture instead of retaining a new VM for every
    // scenario. Both contexts see the same lifetime sequence and native RNG.
    const offFixture = await nativeFixture(), onFixture = await nativeFixture();
    for (const mode of ['wall', 'near', 'expiry', 'actor']) await t.test(`${mode} preserves gameplay and exact terminal`, async () => {
      const off = await nativeRun(offFixture, hz, mode, false), on = await nativeRun(onFixture, hz, mode, true);
      assert.deepEqual(on, off, 'trajectory, damage, paint, owner gauge and native RNG are unchanged');
    });
    if (hz === 60) {
      let packets;
      await t.test('three pooled native shots preserve gameplay through deferred flush', async () => {
        const off = await repeatedNativeRun(offFixture, false); packets = off.packets;
        const on = await repeatedNativeRun(onFixture, true);
        assert.deepEqual(on, off, 'queued calls, trajectory, damage, paint, gauge, HP and RNG remain unchanged');
      });
      await t.test('actual remote ghosts without local special metadata present once per pooled lifetime', async () => {
        assert.ok(packets?.length, 'use an actual native NetMatch packet');
        const off = await ghostNativeRun(offFixture, packets[0], false), on = await ghostNativeRun(onFixture, packets[0], true);
        assert.deepEqual(on, off, 'remote presentation does not alter native calls, paint, damage, packets or RNG');
      });
    }
  });
}

// Real Director/kit/Three with a deliberately small chained native callback.
// This tests observer boundaries, not synthetic projectile gameplay acceptance.
function component() {
  const calls = [], visuals = [], result = {}, failure = new Error('native failure');
  let pooled = null, mutatePoint = false, throwNative = false;
  class FX {
    constructor() { this.root = new THREE.Group(); this.q = .35; }
    setCollider() {} update() {} clear() {} dispose() {}
  }
  class Projectiles {
    constructor() { this.list = []; }
    _new(...args) { calls.push({ kind: 'new', receiver: this, args }); return pooled; }
    _blastBurst(...args) {
      calls.push({ kind: 'burst', receiver: this, args });
      if (throwNative) throw failure;
      if (mutatePoint) args[1].set(999, 999, 999);
      return result;
    }
  }
  const G = { actors: [], teamColors: [new THREE.Color('#ff8800'), new THREE.Color('#2244ff')] };
  const api = { FX, Projectiles, THREE, G, on() {} };
  installSpecialVfx(api); installSpecialVfx(api);
  const fx = G.fx = new FX(); G.projectiles = new Projectiles(); fx.setCollider();
  const d = fx.s3SpecialVfx;
  d.inkBlast = (at, color, radius, options) => visuals.push({ at: at.toArray(), color: [...color], radius, options });
  const owner = { alive: true, team: 0, color: G.teamColors[0] };
  const p = { wid: 'inkjet', owner, team: 0, seed: .37, s3AllSpecialSeed: 17,
    pos: new THREE.Vector3(0, 3, 1), vel: new THREE.Vector3(0, 0, 20) };
  pooled = p;
  return { api, G, fx, d, p, owner, calls, visuals, result, failure,
    mutate: v => { mutatePoint = v; }, fail: v => { throwNative = v; } };
}

test('Inkjet chains native callbacks once, preserves args/return and snapshots scratch point', () => {
  const x = component(), at = new THREE.Vector3(1, 2, 3), victim = {}, extra = {};
  x.G.projectiles.list = [x.p]; x.d.updateRounds(1 / 60); assert.equal(x.d.rounds.size, 1);
  x.mutate(true);
  assert.equal(x.G.projectiles._blastBurst(x.p, at, victim, extra), x.result);
  assert.equal(x.calls.length, 1); assert.equal(x.calls[0].receiver, x.G.projectiles);
  assert.deepEqual(x.calls[0].args, [x.p, at, victim, extra]);
  assert.deepEqual(x.visuals[0].at, [1, 2, 3]); assert.equal(x.d.rounds.size, 0);
  x.G.projectiles.list = []; x.d.updateRounds(1 / 60); assert.equal(x.visuals.length, 1);
  x.fx.dispose();
});

test('Inkjet suppresses duplicate VFX only, and pooled same-seed reuse resets identity and owner', () => {
  const x = component(), at = new THREE.Vector3(1, 2, 3);
  x.G.projectiles._blastBurst(x.p, at); x.G.projectiles._blastBurst(x.p, at);
  assert.equal(x.calls.length, 2, 'native calls are never deduplicated'); assert.equal(x.visuals.length, 1);
  const token = {}; assert.equal(x.G.projectiles._new(token), x.p);
  assert.equal(x.calls.at(-1).args[0], token);
  x.p.owner = { alive: false, team: 1, color: x.G.teamColors[1] }; x.p.team = 1;
  x.G.projectiles._blastBurst(x.p, at);
  assert.equal(x.visuals.length, 2); assert.deepEqual(x.visuals[1].color, x.G.teamColors[1].toArray());
  x.fx.dispose();
});

test('Inkjet removal and reuse without a native burst end trails without invented impact', () => {
  const x = component(); x.G.projectiles.list = [x.p]; x.d.updateRounds(1 / 60);
  const old = x.d.rounds.get(x.p).d.ink;
  x.G.projectiles.list = []; x.d.updateRounds(1 / 60);
  assert.equal(x.d.rounds.size, 0); assert.equal(x.visuals.length, 0);
  x.G.projectiles.list = [x.p]; x.d.updateRounds(1 / 60); x.G.projectiles._new();
  assert.equal(x.d.rounds.size, 0); assert.equal(x.visuals.length, 0);
  x.p.wid = 'shot'; x.d.updateRounds(1 / 60); assert.equal(x.visuals.length, 0);
  assert.equal(old.ended, true, 'retired ribbon ends'); x.fx.dispose();
});

test('Inkjet clear/dispose do not fabricate impacts or leak old dedup lifetime', () => {
  const x = component(), at = new THREE.Vector3(1, 2, 3);
  x.G.projectiles._blastBurst(x.p, at); x.fx.clear();
  x.G.projectiles._new(); x.G.projectiles._blastBurst(x.p, at); assert.equal(x.visuals.length, 2);
  x.fx.dispose(); x.G.projectiles._blastBurst(x.p, at); assert.equal(x.visuals.length, 2);
});

test('Inkjet disabled/missing FX, foreign systems and other specials do not intercept visuals', () => {
  const x = component(), at = new THREE.Vector3(1, 2, 3);
  x.fx.s3SpecialVfxEnabled = false; x.G.projectiles._blastBurst(x.p, at);
  x.fx.s3SpecialVfxEnabled = true; const fx = x.G.fx; x.G.fx = null; x.G.projectiles._blastBurst(x.p, at); x.G.fx = fx;
  new x.api.Projectiles()._blastBurst(x.p, at);
  const wid = x.p.wid; x.p.wid = 'trizooka'; x.G.projectiles._blastBurst(x.p, at); x.p.wid = wid;
  assert.equal(x.calls.length, 4); assert.equal(x.visuals.length, 0);
  x.G.projectiles._blastBurst(x.p, at); assert.equal(x.visuals.length, 1); x.fx.dispose();
});

test('Inkjet native failures propagate unchanged and cosmetic failure cannot replace native result', () => {
  const x = component(), at = new THREE.Vector3(1, 2, 3);
  x.fail(true); assert.throws(() => x.G.projectiles._blastBurst(x.p, at), e => e === x.failure);
  assert.equal(x.visuals.length, 0); x.fail(false);
  const expected = new Error('cosmetic failure'); x.d.inkjetImpact = () => { throw expected; };
  const warn = console.warn; console.warn = () => {};
  try { assert.equal(x.G.projectiles._blastBurst(x.p, at), x.result); } finally { console.warn = warn; }
  assert.equal(x.d.errors, 1); x.fx.dispose();
});

test('Inkjet malformed terminal or projectile coordinates cannot consume a valid presentation lifetime', () => {
  const x = component(); const initial = x.p.pos.clone(); x.p.pos.x = NaN;
  x.G.projectiles._blastBurst(x.p, new THREE.Vector3(1, 2, 3)); assert.equal(x.visuals.length, 0); x.p.pos.copy(initial);
  x.G.projectiles._blastBurst(x.p, new THREE.Vector3(NaN, 2, 3));
  assert.equal(x.visuals.length, 0); x.G.projectiles._blastBurst(x.p, new THREE.Vector3(1, 2, 3));
  assert.equal(x.visuals.length, 1); x.fx.dispose();
});

function nearWallWorld(f, enabled) {
  const { G } = f; G.netm = null;
  const { paint, level } = makePaintWorld(f, { wall: true });
  level.faces[1].origin.z = .05;
  const b = level.blocks[1]; b.center.z = .55; b.aabbMin.z = .05; b.aabbMax.z = 1.05;
  const fx = G.fx = new f.installedRuntime.FX(G.scene, { quality: .35 }); fx.setCollider(() => null);
  fx.s3SpecialVfxEnabled = enabled;
  return { paint, fx, d: fx.s3SpecialVfx, system: G.projectiles };
}
function terminalObserver(d, system, currentFrame) {
  const bursts = [], visuals = [], damage = [];
  const burst = system._blastBurst, hit = system.applyHit, visual = d.inkBlast;
  system._blastBurst = function (p, at, ...args) {
    if (p.wid === 'inkjet') bursts.push({ frame: currentFrame(), at: at.toArray(), native: !!p.pos,
      team: p.team, ghost: !!p.ghost, pos: p.pos?.toArray() ?? null, age: p.age ?? null });
    return burst.call(this, p, at, ...args);
  };
  system.applyHit = function (owner, target, amount, cause) {
    damage.push([owner.team, target.team, amount, cause]); return hit.apply(this, arguments);
  };
  d.inkBlast = function (at, color, radius, ...args) {
    if (radius === 3.6) visuals.push({ frame: currentFrame(), at: at.toArray(), color: [...color] });
    return visual.call(this, at, color, radius, ...args);
  };
  return { bursts, visuals, damage };
}
function gameplayReceipt(f, paint, a, extra) {
  return structuredClone({ ...extra, draws: f.nativeRng.count(),
    grid: crypto.createHash('sha256').update(Buffer.from(paint.grid)).digest('hex'),
    painted: Array.from(paint.counts), special: a.special, hp: a.hp });
}
async function repeatedNativeRun(f, enabled) {
  const { G } = f, { paint, fx, d, system } = nearWallWorld(f, enabled);
  const a = f.make('shooter'); a.nid = 7; a.isLocal = true; a.pos.set(0, 2, 0); a.form = 'kid'; a._resolve = () => {};
  a.weapon = { ...a.weapon, special: 'inkjet', specialCost: 200 }; a.special = 200;
  a.aimDir.set(0, -.4, 1).normalize(); a.aimPitch = .38; a.aimYaw = 0;
  const nm = new f.NetMatch({ myId: 'owner' }, {}), births = [], travel = [], identities = new Set();
  let frame = -1;
  const { bursts, visuals, damage } = terminalObserver(d, system, () => frame), push = system._push;
  system._push = function (p, ...args) {
    const result = push.call(this, p, ...args);
    if (p.wid === 'inkjet') {
      identities.add(p); births.push({ frame, pos: p.pos.toArray(), vel: p.vel.toArray(), seed: p.seed });
      nm.recProj(p); // Actual packet serializer, without replacing native admission.
    }
    return result;
  };
  try {
    f.nativeRng.reset(); a._startSpecial(); a.intent.fire = true;
    for (frame = 0; frame < 360; frame++) {
      G.time += 1 / 60; a.update(1 / 60);
      travel.push([frame, ...system.list.filter(p => p.wid === 'inkjet').map(p => [...p.pos.toArray(), ...p.vel.toArray(), p.age])]);
      system.update(1 / 60); fx.update(1 / 60, G.camera); paint.advanceSimulation(1 / 60);
      if (births.length === 3 && frame >= births.at(-1).frame + 3) break;
    }
    const terminals = bursts.filter(b => b.native), queued = bursts.filter(b => !b.native);
    assert.equal(births.length, 3); assert.equal(terminals.length, 3); assert.equal(queued.length, 3);
    assert.equal(identities.size, 1, 'three real shots reuse one pooled projectile');
    assert.equal(system.s3BlastQueue?.length || 0, 0); assert.equal(system.list.length, 0); assert.equal(d.rounds.size, 0);
    assert.equal(visuals.length, enabled ? 3 : 0, 'queued clones must not double the special impact');
    for (let i = 0; i < 3; i++) {
      assert.equal(terminals[i].frame, births[i].frame, 'each near-wall shot terminates before its first render');
      assert.equal(queued[i].frame, terminals[i].frame + 1); assert.deepEqual(queued[i].at, terminals[i].at);
      if (enabled) assert.deepEqual(visuals[i], { frame: terminals[i].frame, at: terminals[i].at, color: Array.from(a.color.toArray()) });
    }
    assert.equal(d.errors, 0);
    const packets = JSON.parse(JSON.stringify(nm.out.filter(e => e[1] === 'p'))); assert.equal(packets.length, 3);
    return gameplayReceipt(f, paint, a, { births, bursts, travel, damage, packets });
  } finally { fx.dispose(); system.clear(); G.netm = null; }
}
async function ghostNativeRun(f, packet, enabled) {
  const { G } = f, { paint, fx, d, system } = nearWallWorld(f, enabled);
  const a = f.make('shooter'); a.remote = true; a.nid = 7; a.team = 1; a.color.copy(G.teamColors[1]);
  const nm = G.netm = new f.NetMatch({ myId: 'viewer' }, {}), identities = new Set(), births = [], travel = [];
  let frame = 0;
  const { bursts, visuals, damage } = terminalObserver(d, system, () => frame);
  try {
    f.nativeRng.reset();
    for (let lifetime = 0; lifetime < 3; lifetime++) {
      if (lifetime === 2) a.alive = false; // A departing owner must not suppress an in-flight ghost terminal.
      system.ghostProjectile(a, JSON.parse(JSON.stringify(packet)));
      const p = system.list.at(-1); assert.ok(p?.ghost); assert.equal(p.wid, 'inkjet');
      assert.equal(p.s3AllSpecial, undefined, 'real remote Inkjet has no local special metadata');
      identities.add(p); births.push({ frame, pos: p.pos.toArray(), vel: p.vel.toArray(), seed: p.seed, ownerAlive: a.alive });
      for (let tick = 0; tick < 4; tick++, frame++) {
        G.time += 1 / 60; system.update(1 / 60);
        travel.push([frame, ...p.pos.toArray(), ...p.vel.toArray(), p.age, system.list.includes(p)]);
        fx.update(1 / 60, G.camera); paint.advanceSimulation(1 / 60);
      }
      assert.equal(system.list.length, 0); assert.equal(system.s3BlastQueue?.length || 0, 0);
    }
    assert.equal(identities.size, 1, 'remote decoder reuses the actual pool');
    assert.equal(bursts.length, 3, 'ghost path presents directly and does not queue gameplay');
    assert.ok(bursts.every(b => b.native && b.ghost)); assert.equal(d.errors, 0);
    assert.equal(visuals.length, enabled ? 3 : 0);
    if (enabled) for (let i = 0; i < 3; i++) assert.deepEqual(visuals[i], { frame: bursts[i].frame, at: bursts[i].at, color: Array.from(a.color.toArray()) });
    assert.equal(damage.length, 0); assert.ok(Array.from(paint.counts).every(n => n === 0)); assert.equal(nm.out.length, 0);
    return gameplayReceipt(f, paint, a, { births, bursts, travel, damage, packets: nm.out, mute: nm.mute });
  } finally { fx.dispose(); system.clear(); G.netm = null; }
}
