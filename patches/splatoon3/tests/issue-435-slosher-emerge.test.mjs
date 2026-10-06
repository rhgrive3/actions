// Issue #435 — Splat Slosher swim-exit first release: 17f (current published
// main) vs Splatoon 3 Ver. 11.3.0's 18f. Native path: real public Actor.update
// + active S3 Slosher wrapper through the build adapter chain, exact fixed
// 60 Hz steps; only display/audio/collision sinks stubbed. The unpatched chain
// (shared dispatcher alone = current main) is the negative main control: it
// must still reproduce 17f for the bug case and must be byte-identical for
// non-slosher weapons and for humanoid/hold timings this fix may not move.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';
import {
  adaptSlosherEmergeGate,
  SLOSHER_EMERGE_REL,
  SLOSHER_EMERGE_ANCHOR,
  SLOSHER_EMERGE_REPLACEMENT,
} from '../issue-435-adapter.mjs';
import { fixture as mainFixture } from './source-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const UPSTREAM = process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public');

// Derived from tests/source-fixture.mjs with exactly one difference: the
// adapter chain additionally applies adaptSlosherEmergeGate after the shared
// dispatcher — the chain the parent build runs once this adapter is wired.
async function patchedFixture() {
  const context = vm.createContext({ console, performance });
  const modules = new Map();
  function resolve(spec, from) {
    if (spec === 'three') return path.join(UPSTREAM, 'vendor/three/build/three.module.js');
    let file = path.resolve(path.dirname(from), spec);
    if (file.startsWith(path.join(ROOT, 'inkwave-public/'))) file = path.join(UPSTREAM, path.relative(path.join(ROOT, 'inkwave-public'), file));
    if (file.startsWith(path.join(UPSTREAM, 'patches/'))) file = path.join(ROOT, path.relative(UPSTREAM, file));
    if (file.startsWith(path.join(ROOT, 'src/'))) file = path.join(UPSTREAM, path.relative(ROOT, file));
    return file;
  }
  function load(file) {
    if (modules.has(file)) return modules.get(file);
    const relative = path.relative(UPSTREAM, file);
    const source = file.startsWith(UPSTREAM + path.sep)
      ? adaptQualitySource(relative, adaptReliability(relative, adaptTouchLayout(relative, adaptSource(relative, fs.readFileSync(file, 'utf8')))))
      : fs.readFileSync(file, 'utf8');
    const mod = new vm.SourceTextModule(source, { context, identifier: file });
    modules.set(file, mod);
    return mod;
  }
  const root = new vm.SourceTextModule(`
    export * from './inkwave-public/src/core/ctx.js';
    export * from './inkwave-public/src/config.js';
    export * from './inkwave-public/src/game/actor.js';
    export * from './inkwave-public/src/game/weapons.js';
    export * from './inkwave-public/src/game/physics.js';
    export * from './inkwave-public/src/game/player.js';
    export * from './inkwave-public/src/core/shadowcache.js';
    export * as THREE from 'three';
    export * from './patches/splatoon3/runtime/movement.mjs';
    export * from './patches/splatoon3/runtime/weapons.mjs';
    export * from './patches/splatoon3/runtime/gear.mjs';
    export * from './patches/splatoon3/runtime/flow.mjs';
    export * from './patches/splatoon3/runtime/resources.mjs';
    export * from './patches/splatoon3/runtime/render.mjs';
  `, { context, identifier: path.join(ROOT, 'fixture.mjs') });
  await root.link((spec, from) => load(resolve(spec, from.identifier)));
  await root.evaluate();
  const api = { ...root.namespace }, { G, THREE, PLAYER, WEAPONS, SUB } = api;
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json'), 'utf8'));
  Object.assign(PLAYER, profile.player); Object.assign(SUB.bomb, profile.bomb);
  for (const [id, data] of Object.entries(profile.weapons)) Object.assign(WEAPONS[id], data);
  for (const install of ['installWeapons', 'installMovement', 'installGear', 'installFlow', 'installResources', 'installRendering']) api[install](api, profile);
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.level = { blocks: [], groundHeight: () => 0 }; G.time = 0;
  G.physics = { los: () => true, raycast: (_a, _b, _c, h) => { h.hit = false; return h; } };
  G.paint = { sample: () => 1, splat: () => 0 }; G.match = { playing: () => true };
  const shots = [];
  G.projectiles = { fireCharger: (actor, weapon, charge) => shots.push({ kind: 'charger', charge }),
    fireShooter: () => shots.push({ kind: 'shooter' }), fireDualies: (_a, _w, spread) => shots.push({ kind: 'dualies', spread }),
    fireFlick: (actor, weapon) => shots.push({ kind: 'roller', windup: weapon.flickWindup }), fireBlaster: () => shots.push({ kind: 'blaster' }),
    fireSplatling: () => shots.push({ kind: 'splatling' }) };
  class Character {
    constructor() { this.root = { position: new THREE.Vector3(), rotation: {} }; this.events = []; }
    trigger(...args) { this.events.push(args); }
    getMuzzle(out) { return out.copy(this.root.position).add(new THREE.Vector3(0, 1.05, .3)); }
    setVisible() {} setHurt() {} setWeapon() {}
  }
  function make(weapon = 'shooter') {
    const a = new api.Actor({ team: 0, name: 'fixture', weapon, CharacterClass: Character });
    a.grounded = true; a.ground.hit = true; a.ground.face = 0;
    a._spawnBarrier = () => {}; a._finishFrame = () => {}; a._integrate = () => {};
    return a;
  }
  function tick(a, frames = 1) { for (let i = 0; i < frames; i++) { G.time += 1 / 60; a.update(1 / 60); } }
  return { ...api, profile, make, tick, shots };
}

// Fixed-step rig over a full native Actor.update: slosh starts ('slosh'
// character event) and actual releases (Projectiles.fireSlosh) are recorded
// against the fixed tick of the swim ZR press (F0).
async function rig(factory, weapon = 'slosher') {
  const f = await factory(), a = f.make(weapon);
  const starts = [], shots = [];
  let tick = 0;
  const trigger = a.character.trigger;
  a.character.trigger = function (name, ...args) {
    if (name === 'slosh') starts.push(tick);
    return trigger.call(this, name, ...args);
  };
  f.G.projectiles.fireSlosh = () => shots.push(tick);
  f.G.projectiles.fireShooter = () => shots.push(tick);
  const step = (dt = 1 / 60) => { tick++; f.G.time += dt; a.update(dt); };
  const trace = rows => rows.push({ tick, form: a.form, kidT: a.kidT, fireBuffer: a.fireBuffer,
    cooldown: a.weaponRunner.cooldown, slosh: a.weaponRunner.slosh, shots: shots.length });
  return { f, a, starts, shots, step, trace, get tick() { return tick; } };
}

// Swim form for three ticks, then press and hold ZR (F0 = that update).
function swimPress(r) {
  r.a.intent.squid = true;
  r.step(); r.step(); r.step();
  assert.equal(r.a.form, 'squid', 'precondition: submerged in swim form');
  r.a.intent.fire = true;
  r.step();
  const f0 = r.tick;
  assert.equal(r.a.form, 'kid', 'F0: ZR press wins over swim input and pops out');
  return f0;
}

test('swim-form Slosher releases at 18f under the adapter; main control still shows 17f', async () => {
  for (const [factory, label, startF, shotF] of [
    [mainFixture, 'main control (bug)', 5, 17],
    [patchedFixture, 'issue #435 fix', 6, 18],
  ]) {
    const r = await rig(factory, 'slosher');
    const f0 = swimPress(r);
    r.step(); for (let i = 0; i < 79; i++) r.step();   // F1 .. F80
    assert.equal(r.starts.length, 3, `${label}: three attack starts`);
    assert.deepEqual(r.starts.map(t => t - f0), [startF, startF + 29, startF + 58], `${label}: start ticks`);
    assert.deepEqual(r.shots.map(t => t - f0), [shotF, shotF + 29, shotF + 58], `${label}: release ticks`);
    assert.equal(r.shots[0] - r.starts[0], 12, `${label}: sourced 12f lift unchanged`);
  }
});

test('humanoid 12f startup and 29f held repeat are byte-identical to main', async () => {
  const traces = [];
  for (const factory of [mainFixture, patchedFixture]) {
    const r = await rig(factory, 'slosher'), rows = [];
    r.a.intent.fire = true;
    r.step(); const f0 = r.tick;          // F0: already humanoid, admitted immediately
    for (let i = 0; i < 80; i++) { r.step(); r.trace(rows); }
    assert.equal(r.a.form, 'kid');
    assert.deepEqual(r.starts.map(t => t - f0), [0, 29, 58]);
    assert.deepEqual(r.shots.map(t => t - f0), [12, 41, 70]);
    assert.equal(r.a.weapon.windup, 12 / 60, 'pinned 12f windup untouched');
    assert.equal(r.a.weapon.fireInterval, 29 / 60, 'pinned 29f repeat untouched');
    assert.ok(r.a.ink < 100, 'each start still debits ink once per attack');
    traces.push(rows);
  }
  assert.deepEqual(traces[0], traces[1], 'humanoid native path must not move by a single tick or state field');
});

test('negative main control: swim-form Shooter admission trace is identical to main', async () => {
  const traces = [];
  for (const factory of [mainFixture, patchedFixture]) {
    const r = await rig(factory, 'shooter'), rows = [];
    swimPress(r);
    for (let i = 0; i < 60; i++) { r.step(); r.trace(rows); }
    assert.equal(r.a.form, 'kid');
    assert.ok(r.shots.length > 0, 'shooter actually fired through the gate');
    traces.push(rows);
  }
  assert.deepEqual(traces[0], traces[1],
    'non-slosher weapons must keep the byte-identical emergeDelay boundary and runner trace');
});

test('result is identical under 30/60/120 Hz render schedules over the same fixed simulation', async () => {
  // Same sim-tick intent program delivered through different render batchings:
  // intents are applied per fixed sim tick inside the tick callback, so the
  // simulation sees an identical input sequence and must produce identical
  // releases (F0 + 6f start / F0 + 18f release). Setting intents per render
  // frame instead would quantize the ZR edge differently per cadence, which
  // is a harness artifact, not simulation drift.
  const results = [];
  for (const hz of [30, 60, 120]) {
    const f = await patchedFixture(), a = f.make('slosher');
    const starts = [], shots = [];
    let simTick = 0;
    const F0 = 4;
    const trigger = a.character.trigger;
    a.character.trigger = function (name, ...args) {
      if (name === 'slosh') starts.push(simTick);
      return trigger.call(this, name, ...args);
    };
    f.G.projectiles.fireSlosh = () => shots.push(simTick);
    const run = dt => {
      simTick++;
      a.intent.squid = true;
      if (simTick >= F0) a.intent.fire = true;
      f.G.time += dt; a.update(dt);
      if (simTick === 3) assert.equal(a.form, 'squid', `hz=${hz}: submerged before the ZR edge`);
      if (simTick === F0) assert.equal(a.form, 'kid', `hz=${hz}: ZR press wins over swim input`);
    };
    const clock = new FixedClock();
    for (let renders = 0; simTick - F0 < 80 && renders < 1000; renders++) clock.advance(1 / hz, run);
    assert.equal(simTick - F0, 80, `hz=${hz}: exact fixed-step count, no dropped time`);
    results.push({ starts: starts.map(t => t - F0), shots: shots.map(t => t - F0), form: a.form });
  }
  assert.deepEqual(results[0], { starts: [6, 35, 64], shots: [18, 47, 76], form: 'kid' });
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(results[1], results[2]);
});

test('admission is owner/remote and mode isolated: the injected gate has no local/remote branch', async () => {
  const runs = [];
  for (const isLocal of [true, false]) {
    const r = await rig(patchedFixture, 'slosher');
    r.a.isLocal = isLocal;
    const f0 = swimPress(r);
    for (let i = 0; i < 80; i++) r.step();   // F1 .. F80: covers start (F6) and release (F18)
    runs.push({ starts: r.starts.map(t => t - f0), shots: r.shots.map(t => t - f0) });
  }
  assert.deepEqual(runs[0], { starts: [6, 35, 64], shots: [18, 47, 76] });
  assert.deepEqual(runs[0], runs[1], 'fixed-step admission is shared deterministic simulation');
  assert.ok(!/isLocal|_nearCamera|remote/.test(SLOSHER_EMERGE_REPLACEMENT), 'injected gate is mode-agnostic');
});

test('adapter scope: single anchor, build-only, raw upstream never mutated', async () => {
  const untouched = 'export const X = 1;\n';
  for (const rel of ['src/game/weapons.js', 'src/config.js', 'src/main.js', 'patches/splatoon3/profile.json', '']) {
    assert.equal(adaptSlosherEmergeGate(rel, untouched), untouched, `unchanged for ${rel || '(empty)'}`);
  }

  const rawPath = path.join(UPSTREAM, 'src/game/actor.js');
  const before = fs.readFileSync(rawPath);
  const raw = before.toString('utf8');
  assert.ok(raw.includes(SLOSHER_EMERGE_ANCHOR), 'anchor exists in upstream source');
  assert.ok(!raw.includes(SLOSHER_EMERGE_REPLACEMENT), 'replacement not written upstream');

  const patched = adaptSlosherEmergeGate(SLOSHER_EMERGE_REL, raw);
  const after = fs.readFileSync(rawPath);
  assert.deepEqual(after, before, 'adapter is string-in/string-out; no raw mutation');
  assert.ok(patched.includes(SLOSHER_EMERGE_REPLACEMENT));
  assert.ok(!patched.includes(SLOSHER_EMERGE_ANCHOR), 'exactly one gate replaced');
  assert.ok(patched.includes('this.kidT >= P.emergeDelay'), 'non-slosher branch preserved verbatim');
  assert.ok(patched.includes('this.kidT + 1e-10 >= 6 / 60'), 'frame-derived slosher boundary with epsilon');

  assert.throws(() => adaptSlosherEmergeGate(SLOSHER_EMERGE_REL, patched),
    /INKWAVE patch conflict/, 'double application is a hard build error, not a silent no-op');
  assert.throws(() => adaptSlosherEmergeGate(SLOSHER_EMERGE_REL, 'no anchor here'),
    /INKWAVE patch conflict/, 'missing upstream anchor is a hard build error');
});


test('Super Jump landing kidT seed retains native Slosher admission and reset clears pending swim gate', async () => {
  const traces=[];
  for(const factory of [mainFixture,patchedFixture]) {
    const r=await rig(factory,'slosher');
    r.a.kidT=.05; r.a.form='kid'; r.a.intent.fire=true;
    for(let i=0;i<20;i++)r.step();
    traces.push({starts:r.starts,shots:r.shots});
    if(factory===patchedFixture) {
      const pending=await rig(patchedFixture,'slosher');
      swimPress(pending); assert.equal(pending.a._s435SwimExit,true);
      pending.a.reset(); assert.equal(pending.a._s435SwimExit,false);
    }
  }
  assert.deepEqual(traces[1],traces[0],'landing seed follows existing native gate');
  const r=await rig(patchedFixture,'slosher');
  r.a._s435SwimExit=true;
  r.a.superJump(new r.f.THREE.Vector3(4,0,4));
  assert.equal(r.a._s435SwimExit,false,'actual Super Jump entry clears pending swim gate');
});
