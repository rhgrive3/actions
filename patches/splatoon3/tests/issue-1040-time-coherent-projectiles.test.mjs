// Issue #1040: time-coherent projectile/actor motion over the same fixed step.
//
// Boots the COMPLETE six-adapter production composition (build-inkwave order)
// with the installed Actor/NetMatch/FixedClock and drives every scenario
// through the REAL clock (runSimulation), so the snapshot hook, the actor
// update order and the projectile sweep are exactly what ships:
//   snapshot all start-of-tick poses -> actors advance -> rounds sweep.
//
// Permanent coverage requested for this issue:
//   CE-1 no phantom, CE-2 exactly one hit, static target regression,
//   terrain-first ordering + nearest-victim selection, actual local AND remote
//   victims (real NetMatch _sample -> applyRemote), 24/30/60/120 Hz long-frame
//   clock equivalence, and teleport/spawn/owner-change record resets.
//
// Fixture geometry and speeds are internal test values only; no sourced
// Nintendo frame numbers are invented or asserted here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';
import { adaptNetworkSource } from '../../network-replication/adapter.mjs';
import { adaptRange } from '../../practice-range/adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.join(ROOT, 'inkwave-public');
const STEP = 1 / 60;

function testElement(tag) {
  return { tagName: tag, children: [], style: {}, attributes: {}, animations: [], textContent: '', hidden: false,
    setAttribute(n, v) { this.attributes[n] = String(v); }, appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    classList: { add() {}, remove() {}, toggle() {} },
    animate() { const a = { frames: 0, cancelled: false, cancel() { this.cancelled = true; } }; this.animations.push(a); return a; } };
}

async function boot() {
  const context = vm.createContext({ console, performance, URL, innerHeight: 720, innerWidth: 1280,
    screen: { width: 1280, height: 720, orientation: { angle: 0 } },
    document: { body: testElement('body'), documentElement: testElement('html'), createElement: t => testElement(t) } });
  const modules = new Map();
  const compose = (rel, code) => adaptRange(rel, adaptNetworkSource(rel, adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code))))));
  const load = requested => {
    let file = requested;
    if (file.startsWith(path.join(SRC, 'patches') + path.sep)) file = path.join(ROOT, path.relative(SRC, file));
    if (file.startsWith(path.join(ROOT, 'src') + path.sep)) file = path.join(SRC, path.relative(ROOT, file));
    if (modules.has(file)) return modules.get(file);
    const raw = fs.readFileSync(file, 'utf8'), rel = path.relative(SRC, file);
    const mod = new vm.SourceTextModule(compose(rel, raw), { context, identifier: file, initializeImportMeta(m) { m.url = pathToFileURL(file).href; } });
    modules.set(file, mod); return mod;
  };
  const entry = new vm.SourceTextModule(`
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export { FixedClock, runSimulation, STEP } from './patches/splatoon3/runtime/clock.mjs';
    export { coherentMotionStart, actorMotionTick } from './patches/splatoon3/runtime/actor-motion.mjs';
    export { Level } from './src/world/level.js';
    export { NetMatch, NET_FLAGS } from './src/net/netmatch.js';
  `, { context, identifier: path.join(SRC, 'c1040-test-entry.mjs') });
  await entry.link((spec, from) => load(spec === 'three' ? path.join(SRC, 'vendor/three/build/three.module.js')
    : spec.startsWith('three/addons/') ? path.join(SRC, 'vendor/three/jsm', spec.slice(13)) : path.resolve(path.dirname(from.identifier), spec)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json')));
  const api = { ...entry.namespace.install(profile), ...entry.namespace }, { G, THREE, Physics, Level } = api;
  // Visual/audio sinks: any method exists and any call is a no-op, so native
  // fx/audio calls (muzzle, burst, wake, loop handles) never break the harness.
  const sink = () => new Proxy({}, { get: (t, k) => (typeof k === 'symbol' ? undefined : () => t) });
  const level = new Level({ bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }, spawnPads: [[-80, 0, 0], [80, 0, 0]], spawnBarrier: 0,
    single: [{ kind: 'box', min: [-100, -.5, -100], max: [100, 0, 100] }], half: [] });
  Object.assign(G, { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), settings: { quality: 'high' }, actors: [], time: 0,
    level, physics: new Physics(level), mode: 'match', teamColors: [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')],
    match: { playing: () => true, canRespawn: () => false }, paint: { sample: () => 1, splat: () => 0 },
    fx: sink(), audio: sink() });
  G.projectiles = new api.Projectiles(G.scene);
  class C { constructor() { this.root = new THREE.Object3D(); this.color = new THREE.Color(); this.events = []; }
    _owner() { return this.actor; } trigger(...a) { this.events.push(a); } update() {}
    getMuzzle(o) { return o.copy(this.root.position).add(new THREE.Vector3(0, 1.05, .3)); }
    setVisible() {} setHurt() {} setWeapon() {} dispose() {} }
  const make = ({ pos = [0, 0, 0], team = 0, name = 'p' } = {}) => {
    const a = new api.Actor({ team, name, weapon: 'shooter', CharacterClass: C, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
    a.character.actor = a; G.actors.push(a); G.scene.add(a.character.root);
    a.spawnAt(new THREE.Vector3(...pos), 0); a.invuln = 0; return a;
  };
  const remove = a => { const i = G.actors.indexOf(a); if (i >= 0) G.actors.splice(i, 1); G.scene.remove(a.character.root); };
  // Production tick harness: the fake Match.update mirrors src/game/match.js
  // ("remote actors get applyRemote, locals get Actor.update") so the REAL
  // clock drives snapshot -> actor motion -> projectile sweep each fixed step.
  const game = {
    input: { padPressed: new Set(), _padEpoch: 0, pollPad() {}, endFrame() {} },
    _padMenus() {},
    rig: { mode: 'free', target: null, follow() {} },
    match: null,
  };
  game.match = {
    paused: false, state: 'playing', attract: false, local: null, controller: null,
    actors: G.actors,
    updateController() {},
    update(dt) {
      const nm = G.netm;
      for (const a of this.actors) { if (a.remote && nm) nm.applyRemote(a, dt); else a.update(dt); }
    },
  };
  return { ...api, make, remove, game, G };
}

const f = await boot();
const G = f.G, THREE = f.THREE;
const runTick = (n = 1, dt = STEP) => { for (let i = 0; i < n; i++) f.runSimulation(f.game, dt); };
const clearProjectiles = () => { G.projectiles.list.length = 0; };
const freeze = a => { a.update = () => {}; };
const hitCounter = victim => {
  const c = { hits: 0, off: null };
  c.off = f.on('hit', e => { if (e.victim === victim) c.hits++; });
  return c;
};
// One round repositioned onto the victim line after a real fireShooter push;
// vel parameterised so scenarios can control how far it travels in one tick.
const spawnShot = (vel = 40) => {
  G.projectiles.fireShooter(shooter, shooter.weapon, 0);
  const p = G.projectiles.list.at(-1);
  p.pos.set(-0.08, 0.6, 0); p.prev.copy(p.pos); p.start.copy(p.pos);
  p.vel.set(vel, 0, 0); p.straight = 1e9; p.drag = 0; p.life = 5; p.age = 0; p.delay = 0;
  return p;
};

const shooter = f.make({ pos: [0, 0, -8], team: 0, name: 'shooter' });
freeze(shooter);

// --- native per-tick displacement of a falling/rising victim (same method as
// the original qualification probe, so the geometry carries over) ---
const victim = f.make({ pos: [0, 6, 0], team: 1, name: 'calib-victim' });
victim.grounded = false;
const trialStep = velY => {
  victim.pos.set(0, 2, 0); victim.vel.set(0, velY, 0); victim.grounded = false;
  const y0 = victim.pos.y; victim.update(STEP); const d = Math.abs(victim.pos.y - y0); victim.pos.y = y0; return d;
};
for (let i = 0; i < 200 && victim.vel.y > -6.6; i++) victim.update(STEP);
const dFall = trialStep(-6.982), dRise = trialStep(6.982);

// --- empirical static hit band of the composed capsule test (frozen target) ---
freeze(victim);
let lastHitY = null, firstMissY = null;
for (let y = 0.7; y <= 1.45; y += 0.05) {
  victim.pos.set(0, y, 0); victim.hp = 1000; victim.alive = true;
  spawnShot(); runTick();                       // one REAL fixed tick
  const hit = victim.hp < 1000;
  clearProjectiles();
  if (hit) lastHitY = y; else if (lastHitY !== null && firstMissY === null) firstMissY = y;
}
assert.ok(lastHitY !== null && firstMissY !== null, 'static band must be measurable');
const BAND_TOP = (lastHitY + firstMissY) / 2;
const BAND_IN = lastHitY - 0.025;               // comfortably inside the hit zone
f.remove(victim);
assert.ok(dFall > 0.06 && dRise > 0.06, 'native per-tick displacement must be significant');

test('#1040 static target in the band still takes exactly one hit (coherent record present)', () => {
  const v = f.make({ pos: [0, BAND_IN, 0], team: 1, name: 'static-victim' });
  freeze(v);
  const c = hitCounter(v);
  spawnShot(40); runTick();
  assert.equal(c.hits, 1, 'stationary target must still be hit');
  assert.ok(v.hp < 100 && v.hp > 0, 'victim damaged, alive');
  assert.ok(f.coherentMotionStart(v), 'snapshot record is coherent for a continuous target');
  assert.equal(f.coherentMotionStart(v).y0, BAND_IN, 'record stores the start-of-tick pose');
  c.off?.(); clearProjectiles(); f.remove(v);
});

test('#1040 CE-1: target entering the path only after the round passed takes no damage', () => {
  // Round travels 6.67 m in the tick, so it leaves the target's reach by
  // t~0.11; the victim only enters the band at t~0.76. The end-of-tick pose is
  // inside the band (legacy phantom), but no instant of the shared interval has
  // both round and target on the path -> no hit allowed.
  const v = f.make({ pos: [0, 0, 0], team: 1, name: 'ce1-victim' });
  const yEnd = BAND_TOP - 0.03, y0 = yEnd + dFall;
  v.pos.set(0, y0, 0); v.vel.set(0, -6.982, 0); v.grounded = false;
  v.hp = 100;
  const c = hitCounter(v);
  spawnShot(400); runTick();
  const yEndActual = v.pos.y;
  assert.ok(Math.abs(yEndActual - yEnd) < 1e-6, 'victim really ends the tick inside the band');
  assert.ok(yEndActual <= lastHitY, 'legacy end-pose test would have hit (phantom is real)');
  assert.equal(c.hits, 0, 'no phantom hit');
  assert.equal(v.hp, 100, 'target untouched');
  assert.ok(f.coherentMotionStart(v), 'sweep used the coherent start-of-tick interval');
  c.off?.(); clearProjectiles(); f.remove(v);
});

test('#1040 CE-2: target occupying the path at the pass time takes exactly one hit', () => {
  const v = f.make({ pos: [0, 0, 0], team: 1, name: 'ce2-victim' });
  const y0 = BAND_TOP + 0.03 - dRise;
  v.pos.set(0, y0, 0); v.vel.set(0, 6.982, 0); v.grounded = false;
  v.hp = 100;
  assert.ok(y0 <= lastHitY, 'victim starts inside the band');
  const c = hitCounter(v);
  spawnShot(40); runTick();
  assert.ok(v.pos.y > BAND_TOP, 'target has left the band by end of tick (legacy dropped the hit)');
  assert.equal(c.hits, 1, 'exactly one hit');
  assert.ok(v.hp < 100, 'damage applied');
  assert.ok(f.coherentMotionStart(v), 'sweep used the coherent start-of-tick interval');
  c.off?.(); clearProjectiles(); f.remove(v);
});

test('#1040 nearest victim wins; the later one on the line stays untouched', () => {
  const a = f.make({ pos: [0.0, BAND_IN, 0], team: 1, name: 'a-target' });
  const b = f.make({ pos: [0.70, BAND_IN, 0], team: 1, name: 'b-target' });
  freeze(a); freeze(b);
  // b alone is reachable, otherwise the "nearest" claim would be vacuous.
  a.alive = false;
  const solo = hitCounter(b);
  spawnShot(40); runTick();
  assert.equal(solo.hits, 1, 'later victim is reachable on its own');
  solo.off?.(); clearProjectiles();
  a.alive = true;
  const ca = hitCounter(a), cb = hitCounter(b);
  a.hp = b.hp = 100;
  spawnShot(40); runTick();
  assert.equal(ca.hits, 1, 'nearest victim takes the hit');
  assert.equal(cb.hits, 0, 'later victim untouched');
  assert.ok(b.hp === 100, 'later victim full hp');
  ca.off?.(); cb.off?.(); clearProjectiles(); f.remove(a); f.remove(b);
});

test('#1040 terrain between round and victim wins the ordering (no victim hit)', () => {
  const v = f.make({ pos: [2.0, BAND_IN, 0], team: 1, name: 'terrain-victim' });
  freeze(v);
  // Control: no wall -> the far victim is hit inside the same tick.
  let c = hitCounter(v);
  spawnShot(400); runTick();
  assert.equal(c.hits, 1, 'control: far victim reachable without the wall');
  c.off?.(); clearProjectiles();
  // Wall slab between the round origin and the victim.
  const origLevel = G.level, origPhysics = G.physics;
  const wallLevel = new f.Level({ bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }, spawnPads: [[-80, 0, 0], [80, 0, 0]], spawnBarrier: 0,
    single: [{ kind: 'box', min: [-100, -.5, -100], max: [100, 0, 100] }, { kind: 'box', min: [0.02, -0.5, -2], max: [0.12, 3, 2] }], half: [] });
  try {
    G.level = wallLevel; G.physics = new f.Physics(wallLevel);
    v.hp = 100;
    c = hitCounter(v);
    spawnShot(400); runTick();
    assert.equal(c.hits, 0, 'wall contact precedes any victim contact');
    assert.equal(v.hp, 100, 'victim untouched behind the wall');
    c.off?.();
  } finally {
    G.level = origLevel; G.physics = origPhysics;
  }
  clearProjectiles(); f.remove(v);
});

test('#1040 remote victim driven by the real sample pipeline is time-coherent', () => {
  const peer = { tr: 0, rate: 1, delay: 0.03, events: [] };
  const nm = Object.create(f.NetMatch.prototype);
  Object.assign(nm, { stats: { extrap: 0, snaps: 0 }, debug: false, mute: 0,
    _peer: () => peer,
    shouldApplyHit: () => 'local', recProj() {}, _rec() {}, sendHit() {} });
  G.netm = nm;
  const netInit = a => {
    a.remote = true; a.owner = peer; a.nid = 'remote-1';
    a.net = { buf: [], err: new THREE.Vector3(), errV: new THREE.Vector3(), tp: -1, lastRaw: null,
      rendered: new THREE.Vector3(), has: false, prevGrounded: true, prevVy: 0, yawPrev: 0,
      loops: {}, sjTo: null, sjRing: 0, spawnPending: false, ready: false };
  };
  const pushSample = (a, t, y) => a.net.buf.push({ t, tp: 0, x: 0, y, z: 0, vx: 0, vy: 0, vz: 0,
    yaw: 0, aimYaw: 0, aimPitch: 0, f: 0, hp: 100, ink: 100, sp: 0, ch: 0, turf: 0, wx: 0, wy: 0, wz: 1, lock: 0 });
  // Remote CE-2: sample path rises out of the band inside the tick, round still
  // alongside -> exactly one hit.
  const rv = f.make({ pos: [0, BAND_TOP + 0.03 - dRise, 0], team: 1, name: 'remote-ce2' });
  netInit(rv);
  const c2 = hitCounter(rv);
  spawnShot(40);
  peer.tr += STEP; pushSample(rv, peer.tr, rv.pos.y + dRise);
  nm._sample(rv, peer.tr, STEP);                 // real NetMatch sample evaluation
  runTick();                                     // snapshot -> applyRemote -> sweep
  assert.equal(c2.hits, 1, 'remote CE-2: exactly one hit from the sampled motion');
  assert.ok(rv.hp < 100, 'remote CE-2: damage applied');
  assert.ok(f.coherentMotionStart(rv), 'remote CE-2: coherent record over the applied sample');
  c2.off?.(); clearProjectiles(); f.remove(rv);
  // Remote CE-1: sample path falls into the band only after the round passed.
  const rv2 = f.make({ pos: [0, BAND_TOP - 0.03 + dFall, 0], team: 1, name: 'remote-ce1' });
  netInit(rv2);
  const c1 = hitCounter(rv2);
  peer.tr += STEP; pushSample(rv2, peer.tr, rv2.pos.y - dFall);
  nm._sample(rv2, peer.tr, STEP);
  spawnShot(400); runTick();
  assert.ok(Math.abs(rv2.pos.y - (BAND_TOP - 0.03)) < 1e-6, 'remote CE-1: sample ends inside the band');
  assert.equal(c1.hits, 0, 'remote CE-1: no phantom hit');
  assert.equal(rv2.hp, 100, 'remote CE-1: untouched');
  assert.ok(f.coherentMotionStart(rv2), 'remote CE-1: coherent record over the applied sample');
  c1.off?.(); clearProjectiles(); f.remove(rv2);
  G.netm = null;
});

test('#1040 teleport, spawn and owner change reset the record (no sweep across discontinuities)', () => {
  // T1: teleport out of the band inside the tick -> record must not be swept.
  let v = f.make({ pos: [0, BAND_IN, 0], team: 1, name: 'teleport-victim' });
  v.update = () => { v.pos.set(40, BAND_IN, 0); };
  let c = hitCounter(v);
  spawnShot(400); runTick();
  assert.equal(f.coherentMotionStart(v), null, 'teleport invalidates the record');
  assert.equal(c.hits, 0, 'no hit swept across the teleport path');
  assert.equal(v.hp, 100, 'teleported target untouched');
  c.off?.(); clearProjectiles(); f.remove(v);
  // T2: die and respawn far away inside the tick -> no sweep across the death.
  v = f.make({ pos: [0, BAND_IN, 0], team: 1, name: 'death-respawn-victim' });
  v.update = () => { v.alive = false; v.spawnAt(new THREE.Vector3(40, BAND_IN, 0), 0); v.invuln = 0; };
  c = hitCounter(v);
  spawnShot(400); runTick();
  assert.equal(f.coherentMotionStart(v), null, 'in-tick respawn invalidates the record');
  assert.equal(c.hits, 0, 'no hit swept across the death/respawn jump');
  c.off?.(); clearProjectiles(); f.remove(v);
  // T3: dead at the snapshot, spawned INTO the path during the tick -> the
  // record stays reset and the decision uses the static current pose.
  v = f.make({ pos: [40, BAND_IN, 0], team: 1, name: 'spawn-in-path-victim' });
  v.alive = false;
  v.update = () => { v.spawnAt(new THREE.Vector3(0, BAND_IN, 0), 0); v.invuln = 0; };
  c = hitCounter(v);
  spawnShot(400); runTick();
  assert.equal(f.coherentMotionStart(v), null, 'spawn resets the record');
  assert.equal(c.hits, 1, 'static fallback still tests the current pose after spawn');
  c.off?.(); clearProjectiles(); f.remove(v);
  // T4: owner identity change (adoption / dead-owner handoff) inside the tick.
  v = f.make({ pos: [0, BAND_IN, 0], team: 1, name: 'owner-change-victim' });
  const otherPeer = { id: 'other-peer' };
  v.update = () => { v.owner = otherPeer; };
  c = hitCounter(v);
  spawnShot(400); runTick();
  assert.equal(f.coherentMotionStart(v), null, 'owner change invalidates the record');
  assert.equal(c.hits, 1, 'static fallback still tests the unchanged current pose');
  c.off?.(); clearProjectiles(); f.remove(v);
});

test('#1040 motion record is one preallocated object per actor, stable across ticks', () => {
  const v = f.make({ pos: [0, BAND_IN, 0], team: 1, name: 'record-victim' });
  assert.equal(v.s3Motion, undefined, 'record is allocated on first snapshot, not on construction');
  runTick();
  const recA = v.s3Motion, tickA = f.actorMotionTick();
  assert.ok(recA && typeof recA.x0 === 'number', 'record holds plain numeric pose fields');
  runTick();
  assert.equal(v.s3Motion, recA, 'same preallocated record object is reused');
  assert.equal(f.actorMotionTick(), tickA + 1, 'snapshot counter advances once per fixed tick');
  assert.ok(shooter.s3Motion && shooter.s3Motion !== recA, 'one record per actor');
  clearProjectiles(); f.remove(v);
});

test('#1040 24/30/60/120 Hz render cadence produces identical fixed-tick outcomes', () => {
  const cadences = [[1 / 24, 24], [1 / 30, 30], [1 / 60, 60], [1 / 120, 120]];
  const outcomes = [];
  for (const [dt, calls] of cadences) {
    const v = f.make({ pos: [0, BAND_TOP + 0.03 - dRise, 0], team: 1, name: 'cadence-victim' });
    v.vel.set(0, 6.982, 0); v.grounded = false; v.hp = 100;
    const c = hitCounter(v);
    spawnShot(40);
    f.game.s3Clock?.reset();
    const before = f.game.s3Clock?.ticks ?? 0;
    for (let i = 0; i < calls; i++) f.runSimulation(f.game, dt);
    const ticks = (f.game.s3Clock?.ticks ?? 0) - before;
    outcomes.push({ dt, ticks, hits: c.hits, hp: v.hp });
    c.off?.(); clearProjectiles(); f.remove(v);
  }
  for (const o of outcomes) {
    assert.equal(o.ticks, 60, `dt=${o.dt} must run exactly 60 fixed ticks in 1 s of render time`);
    assert.equal(o.hits, 1, `dt=${o.dt} must land exactly one hit`);
  }
  const ref = outcomes[0];
  for (const o of outcomes) assert.equal(o.hp, ref.hp, `dt=${o.dt} damage identical to dt=${ref.dt}`);
});
