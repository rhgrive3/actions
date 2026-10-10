// Focused regression for INKWAVE issue #464.
//
// Two layers, no fabricated HUD tuple:
//  1. NATIVE PATH (primary): the real `PlayerController.computeAim()` / `update()`
//     sliced from the real source is evaluated in a VM against the real vendored
//     `three`, the real `Physics` ray/capsule queries and a real level block, and
//     its `{ onTarget, inRange }` is composed exactly as `src/main.js` does, then
//     fed into the real `HUD._updCrosshair()` body. This covers wall-blocked /
//     in-range / out-of-range enemies and proves the *existing* ray/wall filter
//     already yields a neutral reticle for a blocked enemy (onTarget stays null).
//  2. HUD UNIT CONTROLS: the presentation composition matrix in isolation.
//
// The adapter is presentation-only; the authoritative ray / magnetism / range
// code in `src/game/player.js` is loaded unmodified and asserted untouched.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptIssue464 } from '../issue-464-adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const UPSTREAM = process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public');
const readUpstream = (rel) => fs.readFileSync(path.join(UPSTREAM, rel), 'utf8');
const readHud = () => readUpstream('src/ui/hud.js');

// Slice the real HUD method out of the real file: start at the unique definition
// signature, stop at the next method definition, keep up to its closing brace.
function extractCrosshair(source) {
  const start = source.indexOf('  _updCrosshair(f, dt) {');
  const next = source.indexOf('\n  _updTank(f, dt) {', start);
  assert.ok(start >= 0 && next > start, 'real _updCrosshair method present');
  assert.equal(source.indexOf('  _updCrosshair(f, dt) {', start + 1), -1, 'unique method definition');
  const block = source.slice(start, next);
  return block.slice(0, block.lastIndexOf('}') + 1);
}

class FakeList {
  constructor() { this.names = new Set(); }
  add(...n) { n.forEach(x => this.names.add(x)); }
  remove(...n) { n.forEach(x => this.names.delete(x)); }
  contains(n) { return this.names.has(n); }
  toggle(n, on = !this.contains(n)) { on ? this.add(n) : this.remove(n); return on; }
}
const el = () => ({ classList: new FakeList(), style: { setProperty() {} } });

function makeHud(source) {
  const context = vm.createContext({ console, Math });
  const clamp = '(v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, +v || 0))';
  const Hud = vm.runInContext(`(() => { const clamp = ${clamp}; class Hud { ${extractCrosshair(source)} } return Hud; })()`, context);
  const hud = new Hud();
  Object.assign(hud, {
    _L: { weapon: 'shooter', kind: 'shooter' },
    xh: el(), ret: el(), shield: el(), subChip: el(), spIcon: {},
    _bloom: 0, _kick: 0,
    _local: () => null, _snd() {}, _restart() {}, _buildReticle() {},
  });
  return {
    frame({ onTarget, inRange }) {
      hud._updCrosshair({ weapon: 'shooter', crosshair: { spread: 0, onTarget, inRange } }, 1 / 60);
      const c = hud.xh.classList;
      return { target: c.contains('is-target'), far: c.contains('is-far'), farTarget: c.contains('is-far-target') };
    },
  };
}

const raw = readHud();
const adaptedSource = adaptIssue464('src/ui/hud.js', raw);

// ---------------------------------------------------------------- native VM realm
// Load the UNMODIFIED public sources (ctx/config/physics/player) with the real
// vendored three, so `computeAim` runs its actual ray → capsule selection and its
// actual wall cap. No adapter is applied: #464 must not touch authoritative aim.
async function loadNative() {
  const threeEntry = path.join(UPSTREAM, 'vendor/three/build/three.module.js');
  assert.ok(fs.existsSync(threeEntry), `vendored three present: ${threeEntry}`);
  const context = vm.createContext({ console, Math });
  const mods = new Map();
  const resolve = (spec, from) => {
    if (spec === 'three') return threeEntry;
    return path.resolve(path.dirname(from), spec);
  };
  const load = (file) => {
    if (mods.has(file)) return mods.get(file);
    const mod = new vm.SourceTextModule(fs.readFileSync(file, 'utf8'), { context, identifier: file });
    mods.set(file, mod);
    return mod;
  };
  const entry = new vm.SourceTextModule(`
    export { G, clamp } from './src/core/ctx.js';
    export { WEAPONS, PLAYER } from './src/config.js';
    export { Physics, Hit } from './src/game/physics.js';
    export { PlayerController } from './src/game/player.js';
    export * as THREE from 'three';
  `, { context, identifier: path.join(UPSTREAM, 'issue-464-native-fixture.mjs') });
  await entry.link((spec, from) => load(resolve(spec, from.identifier)));
  await entry.evaluate();
  return entry.namespace;
}
const native = await loadNative();
const { G, PlayerController, Physics, WEAPONS, PLAYER, THREE } = native;

const noDown = () => false;
const mouseInput = (dx = 0, dy = 0) => ({
  mouse: { dx, dy, left: false, right: false }, lastDevice: 'mouse', pad: null, mobile: null,
  down: noDown, wasPressed: noDown, padButton: () => false, padValue: () => 0, padPressed: new Set(),
});
const padInput = () => ({
  pad: {}, lastDevice: 'pad', padStick: (_i, _j, out) => { out.x = 0; out.y = 0; out.mag = 0; },
  padButton: () => false, padValue: () => 0, padPressed: new Set(),
  mouse: { dx: 0, dy: 0, left: false, right: false }, down: noDown, wasPressed: noDown, mobile: null,
});
const touchInput = () => ({
  mobile: {
    active: true, root: {}, lookDX: 0, lookDY: 0, moveX: 0, moveY: 0, mapOpen: false,
    gyro: { enabled: false, discard() {} }, down: noDown, consumeJumpTarget: () => -1,
  },
  lastDevice: 'touch', mouse: { dx: 0, dy: 0, left: false, right: false },
  down: noDown, wasPressed: noDown, pad: null, padButton: () => false, padValue: () => 0, padPressed: new Set(),
});
const DEVICES = { mouse: mouseInput, pad: padInput, touch: touchInput };

function unitAxis() { return [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]; }
// One solid wall spanning the full width, thin in Z, at the requested plane.
function wallAt(z) {
  return {
    id: 0, center: new THREE.Vector3(0, 1.5, z), half: new THREE.Vector3(6, 1.5, 0.3), axes: unitAxis(),
    aabbMin: new THREE.Vector3(-6, 0, z - 0.3), aabbMax: new THREE.Vector3(6, 3, z + 0.3),
    solid: true, grate: false, faces: [-1, -1, -1, -1, -1, -1],
  };
}
function makeLevel(blocks) {
  return {
    blocks,
    queryBlocks(x0, z0, x1, z1, out) {
      out.length = 0;
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        if (b.aabbMax.x >= x0 && b.aabbMin.x <= x1 && b.aabbMax.z >= z0 && b.aabbMin.z <= z1) out.push(i);
      }
      return out;
    },
  };
}
function makeFighter(team, z) {
  return {
    team, alive: true, form: 'kid', smoothY: 0,
    pos: new THREE.Vector3(0, 0, z), aimPoint: new THREE.Vector3(), aimYaw: 0, aimPitch: 0,
    anim: { form: 'kid' }, weapon: WEAPONS.shooter,
    intent: { move: new THREE.Vector3(), jump: false, squid: false, fire: false, sub: false, special: false },
    canSuperJump: () => false,
  };
}
// Fresh world + camera aimed straight down +Z. `wallZ` blocks the ray before the enemy.
function world({ wallZ = null, enemyZ = 6 }) {
  G.settings = { sensitivity: 1, invertY: false, aimAssist: 0, aimAssistMouse: false, padSensitivity: 1, rumble: 0 };
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.boss = null;
  G.level = makeLevel(wallZ == null ? [] : [wallAt(wallZ)]);
  G.physics = new Physics(G.level);
  const cam = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
  cam.position.set(0, 1.5, -3);
  cam.lookAt(0, 1.5, 30);
  G.camera = cam;
  G.rig = { gameCam: cam, mapK: 0 };
  const local = makeFighter(0, 0);
  const enemy = makeFighter(1, enemyZ);
  G.actors = [local, enemy];
  return { local, enemy };
}
// Compose exactly as src/main.js does when it builds the HUD frame.
const compose = (c) => ({ onTarget: c.onTarget ? 'enemy' : null, inRange: c.inRange !== false });

// NATIVE case runner: drive the real update()/computeAim through one input device.
function nativeFrame({ wallZ = null, enemyZ = 6, device = 'mouse', viaUpdate = true } = {}) {
  const { local, enemy } = world({ wallZ, enemyZ });
  const c = new PlayerController(local, G.rig, DEVICES[device]());
  if (viaUpdate) {
    c.onTarget = 'sentinel'; c.inRange = 'sentinel';
    c.update(1 / 60);
    // #1008: with gameCam present the live frame (after CameraRig.update)
    // is the sole authoritative computeAim owner. Controller.update must
    // NOT perform a second stale-camera collision query.
    assert.equal(c.onTarget, 'sentinel', `${device}: controller defers to the live frame`);
    assert.equal(c.inRange, 'sentinel', `${device}: reach query is deferred too`);
    c.computeAim();
    assert.notEqual(c.onTarget, 'sentinel', `${device}: post-camera native computeAim ran`);
    assert.notEqual(c.inRange, 'sentinel', `${device}: post-camera reach query ran`);
  } else {
    c.computeAim();
  }
  return { controller: c, local, enemy, composition: compose(c) };
}

const CASES = {
  wallBlocked: { wallZ: 8, enemyZ: 16 },
  inRange: { wallZ: null, enemyZ: 6 },
  outOfRange: { wallZ: null, enemyZ: 20 },
};

test('native computeAim: the existing wall filter keeps a blocked enemy neutral', () => {
  const { controller, enemy, composition } = nativeFrame({ ...CASES.wallBlocked, viaUpdate: false });
  assert.equal(controller.onTarget, null, 'wall before the enemy caps the ray → no target picked');
  assert.equal(composition.onTarget, null);
  assert.equal(composition.inRange, true, 'the wall hit point is still within the weapon reach');
  assert.ok(enemy.pos.z > 8, 'the blocked enemy really does sit behind the wall');
  // Negative control: with the wall removed the SAME enemy and orientation DO lock on,
  // so the neutral result above is the wall filter at work, not merely out-of-reach.
  const open = nativeFrame({ wallZ: null, enemyZ: 16, viaUpdate: false });
  assert.equal(open.controller.onTarget, open.enemy, 'without the wall the ray reaches and targets the enemy');
  // Through the real HUD composition this is a fully neutral reticle (no false positive).
  assert.deepEqual(makeHud(adaptedSource).frame(composition), { target: false, far: false, farTarget: false });
});

test('native computeAim: only the out-of-range enemy produces the failing tuple', () => {
  const live = nativeFrame({ ...CASES.inRange, viaUpdate: false });
  assert.equal(live.controller.onTarget, live.enemy, 'enemy under the crosshair inside reach is targeted');
  assert.equal(live.composition.inRange, true);
  assert.deepEqual(live.composition, { onTarget: 'enemy', inRange: true });

  const far = nativeFrame({ ...CASES.outOfRange, viaUpdate: false });
  assert.equal(far.controller.onTarget, far.enemy, 'enemy under the crosshair beyond reach is still targeted');
  assert.equal(far.composition.inRange, false, 'the same enemy is reported out of range');
  assert.deepEqual(far.composition, { onTarget: 'enemy', inRange: false },
    'this is the exact native tuple issue #464 describes');
});

test('native tuple drives the HUD: raw is wrong, adapted gates on authoritative reach', () => {
  const live = nativeFrame({ ...CASES.inRange, viaUpdate: false }).composition;
  const far = nativeFrame({ ...CASES.outOfRange, viaUpdate: false }).composition;
  const wall = nativeFrame({ ...CASES.wallBlocked, viaUpdate: false }).composition;

  const rawHud = makeHud(raw);
  // Negative main control through the REAL native tuple, not a hand-written one.
  assert.deepEqual(rawHud.frame(far), { target: true, far: false, farTarget: false },
    'raw HUD forces the positive target reticle for a native out-of-range enemy');
  assert.deepEqual(rawHud.frame(live), { target: true, far: false, farTarget: false });
  assert.deepEqual(rawHud.frame(wall), { target: false, far: false, farTarget: false }, 'raw HUD is already neutral for a wall');

  const hud = makeHud(adaptedSource);
  assert.deepEqual(hud.frame(wall), { target: false, far: false, farTarget: false }, 'wall blocked → neutral');
  assert.deepEqual(hud.frame(live), { target: true, far: false, farTarget: false }, 'in range → positive target');
  assert.deepEqual(hud.frame(far), { target: false, far: true, farTarget: true }, 'out of range → far, never positive target');
});

test('the shared native path is deterministic across mouse / pad / touch', () => {
  for (const [name, opts] of Object.entries(CASES)) {
    const seen = [];
    for (const device of Object.keys(DEVICES)) {
      const { controller, composition } = nativeFrame({ ...opts, device, viaUpdate: true });
      seen.push({ device, composition });
      // Sanity: each device reaches the same authoritative outcome for this case.
      if (name === 'wallBlocked') assert.equal(controller.onTarget, null, `${device} wall → null`);
      else assert.ok(controller.onTarget, `${device} ${name} → targeted`);
    }
    const [first, ...rest] = seen;
    for (const other of rest) {
      assert.deepEqual(other.composition, first.composition,
        `${name}: ${other.device} must match ${first.device} through the shared computeAim`);
    }
    const expected = name === 'wallBlocked' ? { onTarget: null, inRange: true }
      : name === 'inRange' ? { onTarget: 'enemy', inRange: true }
        : { onTarget: 'enemy', inRange: false };
    assert.deepEqual(first.composition, expected, `${name}: authoritative composition`);
  }
});

test('issue-464 stays presentation-scoped and never edits authoritative aim', () => {
  const playerSrc = readUpstream('src/game/player.js');
  assert.equal(adaptIssue464('src/game/player.js', playerSrc), playerSrc,
    'adapter must not touch the authoritative ray / magnetism / range source');
  assert.equal(adaptIssue464('src/main.js', 'unchanged'), 'unchanged');
  assert.equal(adaptIssue464('src/ui/menus.js', ''), '');
  assert.throws(() => adaptIssue464('src/ui/hud.js', 'const tgt = 1;'), /Issue-464 HUD anchor mismatch/);
  assert.notEqual(adaptedSource, raw);
  assert.match(adaptedSource, /const inReach = ch\.inRange !== false;/);
  assert.match(adaptedSource, /classList\.toggle\('is-far-target', farTgt\)/);
});

// ---------------------------------------------------------------- HUD unit controls
test('negative main control: raw HUD source reproduces issue #464', () => {
  const rawHud = makeHud(raw);
  assert.deepEqual(rawHud.frame({ onTarget: 'enemy', inRange: false }), { target: true, far: false, farTarget: false },
    'raw source forces the positive in-range target state for an out-of-range enemy and suppresses the out-of-range state');
  assert.deepEqual(rawHud.frame({ onTarget: null, inRange: false }), { target: false, far: true, farTarget: false });
});

test('adapted HUD gates the positive target state behind authoritative reach', () => {
  const hud = makeHud(adaptedSource);
  assert.deepEqual(hud.frame({ onTarget: 'enemy', inRange: true }), { target: true, far: false, farTarget: false });
  assert.deepEqual(hud.frame({ onTarget: 'enemy', inRange: false }), { target: false, far: true, farTarget: true });
  assert.deepEqual(hud.frame({ onTarget: null, inRange: false }), { target: false, far: true, farTarget: false });
  assert.deepEqual(hud.frame({ onTarget: null, inRange: true }), { target: false, far: false, farTarget: false });
  assert.deepEqual(hud.frame({ onTarget: 'enemy', inRange: undefined }), { target: true, far: false, farTarget: false });
});

test('transitions recompose cleanly when reachability changes under the crosshair', () => {
  const hud = makeHud(adaptedSource);
  assert.deepEqual(hud.frame({ onTarget: 'enemy', inRange: true }), { target: true, far: false, farTarget: false });
  assert.deepEqual(hud.frame({ onTarget: 'enemy', inRange: false }), { target: false, far: true, farTarget: true });
  assert.deepEqual(hud.frame({ onTarget: 'enemy', inRange: true }), { target: true, far: false, farTarget: false });
});

// Keep the runtime symbol referenced so the loader's PLAYER import is not dropped.
void PLAYER;
