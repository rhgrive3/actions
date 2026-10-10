// Issue #94 projectile-impact agreement: fire the actual composed Shooter through
// Projectiles.fireShooter/update (full six-adapter production composition) with a
// deterministic neutral native RNG in TESTONLY, record the real weapon:impact
// position and the native field query, and require the weapon-side muzzle marker
// to agree with that real impact. The cue stays presentation-only: querying it
// never creates a projectile or consumes RNG.
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
const SRC = path.resolve(process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public'));
const adaptBuildSource = (rel, code) => adaptRange(rel, adaptNetworkSource(rel, adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code))))));
let loaded;

async function production() {
  if (loaded) return loaded;
  const context = vm.createContext({ console, performance, URL }), modules = new Map();
  const load = requested => {
    let file = requested.startsWith(path.join(SRC, 'patches') + path.sep)
      ? path.join(ROOT, path.relative(SRC, requested)) : requested;
    if (file.startsWith(path.join(ROOT, 'src') + path.sep)) file = path.join(SRC, path.relative(ROOT, file));
    if (modules.has(file)) return modules.get(file);
    const source = fs.readFileSync(file, 'utf8');
    const rel = file.startsWith(SRC + path.sep) ? path.relative(SRC, file)
      : file.startsWith(ROOT + path.sep) ? path.relative(ROOT, file) : null;
    const module = new vm.SourceTextModule(rel ? adaptBuildSource(rel, source) : source,
      { context, identifier: file, initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; } });
    modules.set(file, module); return module;
  };
  const entry = new vm.SourceTextModule(`
    export { install } from './patches/splatoon3/runtime/install.mjs';
  `, { context, identifier: path.join(ROOT, 'issue-94-impact-entry.mjs') });
  await entry.link((specifier, from) => load(specifier === 'three'
    ? path.join(SRC, 'vendor/three/build/three.module.js')
    : specifier.startsWith('three/addons/')
      ? path.join(SRC, 'vendor/three/jsm', specifier.slice('three/addons/'.length))
      : path.resolve(path.dirname(from.identifier), specifier)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json')));
  const api = entry.namespace.install(profile);
  loaded = { ...api, profile, vmContext: context };
  return loaded;
}

async function scene(look = [0.1, 1.3, 50]) {
  const api = await production();
  const { G, THREE, Physics, Actor, Character, Projectiles, PlayerController } = api;
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.scene = new THREE.Scene();
  G.level = {
    blocks: [], faces: [], groundHeight: () => 0,
    queryBlocks(_minX, _minZ, _maxX, _maxZ, out) {
      out.length = 0;
      this.blocks.forEach((_block, index) => out.push(index));
      return out;
    },
  };
  G.physics = new Physics(G.level);
  G.paint = { sample: () => 1, splat: () => 0 };
  G.match = { playing: () => true, canRespawn: () => false };
  G.actors = [];
  G.time = 0;
  G.boss = null;
  const camera = new THREE.PerspectiveCamera(65, 1.6, 0.1, 1000);
  camera.position.set(-1.25, 1.3, -4);
  camera.lookAt(look[0], look[1], look[2]);
  camera.updateMatrixWorld(true);
  G.camera = camera;
  G.rig = { gameCam: camera };
  const actor = new Actor({ team: 0, name: 'issue 94 impact regression', weapon: 'shooter',
    CharacterClass: Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  actor.character.wAim = 1;
  G.scene.add(actor.character.root);
  actor.character.root.updateMatrixWorld(true);
  G.actors = [actor];
  const controller = new PlayerController(actor, null, null);
  const projectiles = G.projectiles = new Projectiles(G.scene);
  controller.computeAim();
  const s = { api, G, THREE, actor, camera, controller, projectiles };
  s.muzzleLine = () => {
    const muzzle = projectiles._muzzle(actor, new THREE.Vector3());
    const dir = projectiles._aimFrom(actor, muzzle, new THREE.Vector3());
    return { muzzle, dir };
  };
  s.rebuild = () => { G.physics = new Physics(G.level); controller.computeAim(); };
  s.cameraClear = () => {
    const forward = camera.getWorldDirection(new THREE.Vector3());
    const pivot = actor.pos.clone(); pivot.y += 1.3;
    const along = Math.max(0, pivot.sub(camera.position).dot(forward));
    const start = camera.position.clone().addScaledVector(forward, along);
    return !G.physics.raycast(start, forward, 70, new api.Hit(), true).hit;
  };
  return s;
}

function addBox(s, cx, cy, cz, hx, hy, hz) {
  const id = s.G.level.blocks.length;
  s.G.level.blocks.push({
    id, solid: true, grate: false,
    center: new s.THREE.Vector3(cx, cy, cz),
    half: new s.THREE.Vector3(hx, hy, hz),
    axes: [new s.THREE.Vector3(1, 0, 0), new s.THREE.Vector3(0, 1, 0), new s.THREE.Vector3(0, 0, 1)],
    faces: [-1, -1, -1, -1, -1, -1],
  });
  return id;
}

// TESTONLY: deterministic neutral native RNG for the composed realm while the
// actual shot fires; the presentation marker itself must not draw from it.
function neutralRng(api) {
  const vmMath = vm.runInContext('Math', api.vmContext);
  const native = vmMath.random;
  const state = { calls: 0, restore() { vmMath.random = native; } };
  vmMath.random = () => { state.calls++; return 0.5; };
  return state;
}

function fireActualShot(s, maxFrames = 300) {
  const events = [];
  const off = s.api.on('weapon:impact', e => events.push({ pos: e.pos.clone(), kind: e.kind }));
  const rng = neutralRng(s.api);
  let frames = 0, fired = null;
  try {
    // spread 0: the nominal center shot, so no spread draws and a stable line
    s.projectiles.fireShooter(s.actor, s.actor.weapon, 0);
    fired = s.projectiles.list.at(-1) || null;
    while (!events.length && frames < maxFrames) { s.projectiles.update(1 / 60); frames++; }
  } finally { off(); rng.restore(); }
  const field = fired && fired.fidelityFieldCollision;
  console.log('#94 fired shot native field collision record:',
    field ? `init=${field.initRadius} end=${field.endRadius} changeFrame=${field.changeTime}` : String(field),
    '| rng draws during fire+flight:', rng.calls);
  return { events, frames, fired };
}

// Execute the actual composed main.js projection lines (not a copy) against the
// production camera and projectiles; returns the crosshair muzzleBlock payload.
function composedMuzzleBlock(s, W = 1600, H = 900) {
  const main = adaptBuildSource('src/main.js', fs.readFileSync(path.join(SRC, 'src/main.js'), 'utf8'));
  const start = main.indexOf('    const muzzleContact =');
  const rawFrame = main.indexOf('    const frame = {', start);
  const snapshotFrame = main.indexOf('    const frame = hudFrameSnapshot(', start);
  const end = rawFrame >= 0 && snapshotFrame >= 0 ? Math.min(rawFrame, snapshotFrame) : Math.max(rawFrame, snapshotFrame);
  assert.ok(start >= 0 && end > start, 'composed main keeps the projected shooter muzzle contact connection');
  const sandbox = { THREE: s.THREE, G: s.G, w: s.actor.weapon, cam: s.camera, W, H, a: s.actor };
  const fn = vm.runInNewContext(`(function () {\n${main.slice(start, end)}\nreturn muzzleBlock; })`, sandbox);
  return fn.call(sandbox);
}

test('#94 near cover: the actual composed shooter impact agrees with the weapon-side marker', async () => {
  const s = await scene();
  const { muzzle, dir } = s.muzzleLine();
  const at = Math.min(0.75, muzzle.distanceTo(s.actor.aimPoint) * 0.25);
  const contact = muzzle.clone().addScaledVector(dir, at);
  const block = addBox(s, contact.x, contact.y, contact.z, 0.025, 0.12, 0.025);
  s.rebuild();
  assert.equal(s.cameraClear(), true, 'camera ray clears the cover edge (parallax control)');
  const raw = s.G.physics.raycast(muzzle, dir, muzzle.distanceTo(s.actor.aimPoint), new s.api.Hit(), true);
  console.log('#94 near-cover native raw field raycast:', raw.hit, raw.point.toArray().map(v => v.toFixed(3)).join(','));
  const { events } = fireActualShot(s);
  assert.equal(events.length, 1, 'the composed shot reaches the near cover');
  const impact = events[0].pos;
  const marker = s.projectiles.muzzleBlockFeedback(s.actor);
  console.log('#94 near-cover real weapon:impact', impact.toArray().map(v => v.toFixed(4)).join(','),
    '| marker', marker ? marker.point.toArray().map(v => v.toFixed(4)).join(',') : null,
    '| delta', marker ? marker.point.distanceTo(impact).toFixed(4) : null);
  assert.ok(marker, 'weapon-side marker must show the near-cover obstruction');
  assert.equal(marker.block, block, 'the marker contact is on the cover block');
  assert.ok(marker.point.distanceTo(impact) < 0.05,
    `projectile impact must agree with the weapon-side marker within 0.05m (got ${marker.point.distanceTo(impact)}m)`);
  const firstPoint = marker.point.clone();
  const repeat = s.projectiles.muzzleBlockFeedback(s.actor);
  assert.ok(repeat && repeat.point.equals(firstPoint), 'deterministic repeat query');
});

for (const side of [1, -1]) {
  const label = side > 0 ? 'right' : 'left';
  test(`#94 ${label} cover graze inside the sourced field collision radius is not missed`, async () => {
    const s = await scene();
    const { muzzle, dir } = s.muzzleLine();
    const perp = new s.THREE.Vector3(-dir.z, 0, dir.x).normalize().multiplyScalar(side);
    const at = muzzle.clone().addScaledVector(dir, 2).addScaledVector(perp, 0.17);
    const block = addBox(s, at.x, at.y, at.z, 0.05, 0.5, 0.5);
    s.rebuild();
    assert.equal(s.cameraClear(), true, 'camera-center ray stays clear of the graze cover');
    const { events } = fireActualShot(s);
    assert.equal(events.length, 1, 'the actual swept shot hits the graze cover');
    const impact = events[0].pos;
    const marker = s.projectiles.muzzleBlockFeedback(s.actor);
    console.log(`#94 ${label}-graze real weapon:impact`, impact.toArray().map(v => v.toFixed(4)).join(','),
      '| marker', marker ? marker.point.toArray().map(v => v.toFixed(4)).join(',') : null);
    assert.ok(marker, 'the radius graze must produce weapon-side feedback (the actual shot hits it)');
    assert.equal(marker.block, block, 'marker contacts the graze cover block');
    assert.ok(marker.point.distanceTo(impact) < 0.05,
      `projectile impact must agree with the marker (got ${marker.point.distanceTo(impact)}m)`);
  });
}

test('#94 far wall beyond the composed shot flight is not warned', async () => {
  const s = await scene();   // level horizon aim, open void: only the far wall exists
  const { muzzle, dir } = s.muzzleLine();
  const wallZ = 54.5;
  const t = (wallZ - muzzle.z) / dir.z;
  assert.ok(Number.isFinite(t) && t > 5, 'the nominal muzzle line crosses the far wall plane');
  const lineY = muzzle.y + dir.y * t;
  const camY = 1.3;   // the gameplay camera ray stays level at this height
  assert.ok(lineY < camY, `muzzle line passes below the camera line at the wall (${lineY.toFixed(3)} < ${camY})`);
  const top = lineY + 0.6 * (camY - lineY);   // wall top between the two parallax lines
  addBox(s, 0, top / 2, wallZ + 0.5, 40, top / 2, 0.5);   // front face exactly at wallZ
  s.rebuild();
  assert.equal(s.cameraClear(), true, 'camera ray clears the far wall so aimPoint stays long-range');
  const { events, frames } = fireActualShot(s);
  assert.equal(events.length, 0,
    `the shot expires by lifetime/water (${frames} frames) before an unhittable far wall`);
  const marker = s.projectiles.muzzleBlockFeedback(s.actor);
  console.log('#94 far wall beyond reach: real impact none; marker',
    marker ? marker.point.toArray().map(v => v.toFixed(3)).join(',') : null);
  assert.equal(marker, null, 'no weapon-side warning for a wall the projectile can never reach');
});

test('#94 open ground long range: impact agreement and near-center weapon reticle', async () => {
  const s = await scene();
  addBox(s, 0, -0.5, 60, 150, 0.5, 150);   // flat ground, top face at y = 0
  s.rebuild();
  assert.equal(s.cameraClear(), true, 'open-ground camera ray reaches the horizon');
  const { events } = fireActualShot(s);
  assert.equal(events.length, 1, 'the open-ground shot lands on the ground');
  const impact = events[0].pos;
  const marker = s.projectiles.muzzleBlockFeedback(s.actor);
  console.log('#94 open-ground real weapon:impact', impact.toArray().map(v => v.toFixed(4)).join(','),
    '| marker', marker ? marker.point.toArray().map(v => v.toFixed(4)).join(',') : null);
  assert.ok(marker, 'the weapon-side reticle shows the actual open-ground impact');
  assert.ok(marker.point.distanceTo(impact) < 0.05,
    `projectile impact must agree with the weapon-side reticle (got ${marker.point.distanceTo(impact)}m)`);
  const block = composedMuzzleBlock(s, 1600, 900);
  console.log('#94 open-ground projected reticle px', block);
  assert.ok(block && Number.isFinite(block.x) && Number.isFinite(block.y),
    'composed main projects the impact reticle');
  const r = Math.hypot(block.x, block.y);
  assert.ok(r <= 90,
    `open-ground long-range weapon reticle approximately overlaps center aim (|r|=${r.toFixed(1)}px <= 90px on 900px)`);
});

// DOM shim + module harness: the actual composed HUD code runs against it, so
// style/class writes are executed behaviour, not source regex.
class El {
  constructor(tag = 'div') {
    this.tag = tag; this.children = []; this.dataset = {}; this.parts = new Map();
    this.style = { setProperty(k, v) { this[k] = v; } };
    this.names = new Set();
    this.classList = {
      add: (...ns) => ns.forEach(n => this.names.add(n)),
      remove: (...ns) => ns.forEach(n => this.names.delete(n)),
      toggle: (n, on = !this.names.has(n)) => (on ? this.names.add(n) : this.names.delete(n)),
      contains: n => this.names.has(n),
    };
  }
  set className(s) { this.names = new Set(s.split(/\s+/).filter(Boolean)); }
  get className() { return [...this.names].join(' '); }
  set innerHTML(s) { this.html = s; }
  get innerHTML() { return this.html || ''; }
  set textContent(s) { this._text = s; }
  get textContent() { return this._text || ''; }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  append(...ns) { ns.forEach(n => this.appendChild(n)); }
  setAttribute(k, v) { this[k] = v; }
  addEventListener() {}
  remove() {}
  animate() { return {}; }
  get offsetWidth() { return 1000; }
  querySelectorAll(selector) {
    const names = selector.split('.').filter(Boolean), out = [];
    for (const c of this.children) {
      if (names.every(n => c.names?.has(n))) out.push(c);
      if (c.querySelectorAll) out.push(...c.querySelectorAll(selector));
    }
    return out;
  }
  querySelector(selector) {
    const found = this.querySelectorAll(selector)[0];
    if (found) return found;
    if (!this.parts.has(selector)) this.parts.set(selector, new El());
    return this.parts.get(selector);
  }
}

async function hudHarness() {
  const code = adaptBuildSource('src/ui/hud.js', fs.readFileSync(path.join(SRC, 'src/ui/hud.js'), 'utf8'));
  const context = vm.createContext({
    console, Math, innerWidth: 1600, innerHeight: 900,
    document: {
      createElement: tag => new El(tag),
      createTextNode: text => { const n = new El('#text'); n.textContent = text; return n; },
    },
  });
  const imports = new Map();
  for (const m of code.matchAll(/import\s+\{([^}]*)\}\s+from\s+'([^']+)';?/g)) {
    const names = m[1].split(',').map(part => part.trim().split(/\s+as\s+/)[0]).filter(Boolean);
    if (!imports.has(m[2])) imports.set(m[2], new Set());
    for (const n of names) imports.get(m[2]).add(n);
  }
  const i18n = new vm.SyntheticModule(['tx', 'isJa'], function () {
    this.setExport('tx', v => v); this.setExport('isJa', () => false);
  }, { context });
  const util = new vm.SourceTextModule(fs.readFileSync(path.join(SRC, 'src/ui/ui-util.js'), 'utf8'), { context });
  await util.link(() => i18n); await util.evaluate();
  const inkFlight = new vm.SourceTextModule(fs.readFileSync(path.join(SRC, 'src/game/inkFlight.js'), 'utf8'), { context });
  await inkFlight.link(() => { throw new Error('inkFlight must stay dependency free'); });
  const config = new vm.SourceTextModule(fs.readFileSync(path.join(SRC, 'src/config.js'), 'utf8'), { context });
  await config.link(spec => {
    if (spec === './game/inkFlight.js') return inkFlight;
    throw new Error('Unexpected config dependency: ' + spec);
  }); await config.evaluate();
  const values = {
    G: { match: null }, on: () => () => {}, t: v => v, tx: v => v, isJa: () => false,
    ...config.namespace,
    GLYPHS: {}, SUB_ICONS: {}, weaponIcon: () => '', specialIcon: () => '',
    keycap: () => '', richText: () => '',
    BossHud: class { constructor() { this.on = false; } update() {} },
    installBossAudio() {}, bossEmblem: () => '', BOSS_NAME: '', BOSS_EPITHET: '',
  };
  const mod = new vm.SourceTextModule(code, { context });
  await mod.link(specifier => {
    if (specifier === './ui-util.js') return util;
    const names = imports.get(specifier);
    assert.ok(names, `unexpected composed hud import ${specifier}`);
    return new vm.SyntheticModule([...names], function () {
      for (const n of names) this.setExport(n, n in values ? values[n] : () => {});
    }, { context });
  });
  await mod.evaluate();
  const hud = () => Object.assign(Object.create(mod.namespace.HUD.prototype), {
    _L: {}, _bloom: 0, _kick: 0, _fxTime: 0,
    overLayer: new El(), ret: new El(), xh: new El(), spIcon: new El(), shield: new El(), subChip: new El(),
    lab: null, _snd() {}, _restart() {},
  });
  return { hud, code };
}

test('#94 composed projection and HUD style update run for the real contact', async () => {
  const s = await scene();
  const { muzzle, dir } = s.muzzleLine();
  const at = Math.min(0.75, muzzle.distanceTo(s.actor.aimPoint) * 0.25);
  const contact = muzzle.clone().addScaledVector(dir, at);
  addBox(s, contact.x, contact.y, contact.z, 0.025, 0.12, 0.025);
  s.rebuild();
  const { events } = fireActualShot(s);
  assert.equal(events.length, 1, 'the composed shot reaches the cover');
  const block = composedMuzzleBlock(s, 1600, 900);
  console.log('#94 composed projected muzzleBlock px', block);
  assert.ok(block && Number.isFinite(block.x) && Number.isFinite(block.y),
    'the actual composed main.js projection returns the contact payload');
  const { hud, code } = await hudHarness();
  const h = hud();
  h._updCrosshair({ weapon: 'shooter', crosshair: { spread: 3.5, onTarget: 'enemy', inRange: false, muzzleBlock: block } }, 1 / 60);
  assert.ok(h.xh.classList.contains('is-muzzle-blocked'), 'HUD shows the weapon-side contact ring');
  assert.equal(h.xh.style['--muzzle-hit-x'], `${block.x.toFixed(1)}px`, 'native style var carries the projected x');
  assert.equal(h.xh.style['--muzzle-hit-y'], `${block.y.toFixed(1)}px`, 'native style var carries the projected y');
  assert.equal(h.ret.style['--sp'], '3.5', 'spread feedback unchanged');
  assert.ok(code.includes('is-far-target'), 'the current HUD keeps its range-qualified target owner');
  assert.ok(h.xh.classList.contains('is-far-target'), 'out-of-range target feedback is unchanged');
  assert.ok(h.xh.classList.contains('is-far'), 'out-of-range state is unchanged');
  assert.ok(!h.xh.classList.contains('is-target'), 'out-of-range targets do not claim the in-range target class');
  h._updCrosshair({ weapon: 'shooter', crosshair: { spread: 3.5, onTarget: null, inRange: false, muzzleBlock: block } }, 1 / 60);
  assert.ok(h.xh.classList.contains('is-far'), 'out-of-range feedback is unchanged when not on target');
  assert.ok(!h.xh.classList.contains('is-far-target'), 'target-specific far feedback clears with the target');
  assert.ok(h.xh.classList.contains('is-muzzle-blocked'), 'ring persists while the contact input persists');
  h._updCrosshair({ weapon: 'shooter', crosshair: { spread: 3.7, onTarget: null, inRange: true, muzzleBlock: null } }, 1 / 60);
  assert.ok(!h.xh.classList.contains('is-muzzle-blocked'), 'ring clears when the marker input clears');
  h._updCrosshair({ weapon: 'slosher', crosshair: { spread: 2, muzzleBlock: { x: 9, y: 9 } } }, 1 / 60);
  assert.ok(!h.xh.classList.contains('is-muzzle-blocked'),
    'existing ShotGuide weapons never get the shooter ring (no duplicate feedback)');
});

test('#94 cue stays shooter-only and existing guides keep their own path', async () => {
  const s = await scene();
  for (const kind of ['roller', 'charger', 'splatling', 'blaster', 'slosher', 'dualies']) {
    const fake = { alive: true, form: 'kid', weapon: { kind }, character: {}, aimPoint: new s.THREE.Vector3(0, 1, 30), aimDir: new s.THREE.Vector3(0, 0, 1) };
    assert.equal(s.projectiles.muzzleBlockFeedback(fake), null, `${kind} keeps the existing guide path only`);
  }
  assert.equal(s.projectiles.muzzleBlockFeedback(null), null);
  assert.equal(typeof s.projectiles.s3WeaponGuide, 'function', 'existing ShotGuide composition untouched');
  const hud = adaptBuildSource('src/ui/hud.js', fs.readFileSync(path.join(SRC, 'src/ui/hud.js'), 'utf8'));
  assert.match(hud, /--gx/, 'Slosher/Blaster ShotGuide projection still present');
  const main = adaptBuildSource('src/main.js', fs.readFileSync(path.join(SRC, 'src/main.js'), 'utf8'));
  assert.match(main, /muzzleBlockFeedback/, 'shooter muzzle contact connection still present');
  assert.doesNotMatch(main, /muzzleBlockFeedback[\s\S]{0,400}bloom/, 'cue does not touch bloom timing');
});
