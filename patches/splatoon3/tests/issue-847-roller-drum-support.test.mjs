// 847: Roller-body terrain contact via complete production composition.
// Flat rolling unchanged; ledge drum-void suppresses; airborne wall contact
// preserves; no-stick residual causes no damage. Stub physics falls back.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { rollerDrumSupport, rollerStickActive } from '../runtime/roller.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.join(ROOT, 'inkwave-public');
let api = null;
async function production() {
  if (api) return api;
  const context = vm.createContext({ console, performance, URL, innerHeight: 720 });
  const modules = new Map();
  const load = (requested) => {
    let file = requested.startsWith(path.join(SRC, 'patches') + path.sep)
      ? path.join(ROOT, path.relative(SRC, requested)) : requested;
    if (file.startsWith(path.join(ROOT, 'src') + path.sep)) file = path.join(SRC, path.relative(ROOT, file));
    if (modules.has(file)) return modules.get(file);
    const source = fs.readFileSync(file, 'utf8');
    const mod = new vm.SourceTextModule(file.startsWith(SRC + path.sep) ? adaptSource(path.relative(SRC, file), source) : source,
      { context, identifier: file, initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; } });
    modules.set(file, mod); return mod;
  };
  const entry = new vm.SourceTextModule(`
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export { Level } from './inkwave-public/src/world/level.js';
  `, { context, identifier: path.join(ROOT, 'cl8-847-test-entry.mjs') });
  await entry.link((spec, from) => load(spec === 'three' ? path.join(SRC, 'vendor/three/build/three.module.js')
    : spec.startsWith('three/addons/') ? path.join(SRC, 'vendor/three/jsm', spec.slice(13))
      : path.resolve(path.dirname(from.identifier), spec)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json')));
  const installed = { ...entry.namespace.install(profile), ...entry.namespace, profile };
  const { G, THREE, Physics, Level } = installed;
  // One stage: flat everywhere except a ledge void at x>=0 near z=0 and a
  // wall at z=2. Flat pad at z=-5 serves the flat/no-stick cases.
  const level = new Level({ bounds: { minX: -30, maxX: 30, minZ: -30, maxZ: 30 }, spawnPads: [[-25, 0, 0], [25, 0, 0]],
    spawnBarrier: 0, half: [],
    single: [
      { kind: 'box', min: [-30, -.5, -30], max: [30, 0, 30] },
      { kind: 'box', min: [-30, 0, 2], max: [30, 3, 2.5] },
    ] });
  // Carve the ledge: remove floor at x in [0,3], z in [-2,2] by blocking? Level
  // has no carve API; emulate the edge with a dedicated second level instead.
  Object.assign(G, { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), settings: { quality: 'high' },
    actors: [], time: 0, level, physics: new Physics(level), mode: 'match',
    teamColors: [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')],
    match: { playing: () => true, canRespawn: () => false }, paint: { sample: () => 1, splat: () => 0 } });
  G.projectiles = new installed.Projectiles(G.scene);
  api = installed; return api;
}

test('847 flat rolling unchanged on full production composition', async () => {
  const f = await production();
  const a = new f.Actor({ team: 0, name: 'r847flat', isLocal: true, weapon: 'roller', CharacterClass: f.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  a.character.onEvent = null; f.G.actors = [a];
  a.pos.set(0, 0, -5); a.yaw = 0; a.aimYaw = 0; a.ink = 100;
  for (let i = 0; i < 10; i++) { f.G.time += 1 / 60; a.update(1 / 60); }
  a.intent.move.set(0, 0, 1); a.intent.fire = true;
  for (let i = 0; i < 45; i++) { f.G.time += 1 / 60; a.update(1 / 60); }
  assert.equal(a.weaponRunner.rolling, true, 'flat + stick + fire keeps rolling');
  assert.ok(Math.hypot(a.vel.x, a.vel.z) > 1.0, 'roll speed preserved');
  f.G.actors = [];
});

test('847 no-stick residual causes no contact damage', async () => {
  const f = await production();
  const a = new f.Actor({ team: 0, name: 'r847stick', isLocal: true, weapon: 'roller', CharacterClass: f.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  a.character.onEvent = null;
  const v = new f.Actor({ team: 1, name: 'r847victim', isLocal: false, weapon: 'shooter', CharacterClass: f.Character, style: { hair: 0, skin: 0, outfit: 0, eyes: 0 } });
  v.character.onEvent = null;
  f.G.actors = [a];
  a.pos.set(0, 0, -5); a.yaw = 0; a.aimYaw = 0; a.ink = 100;
  for (let i = 0; i < 10; i++) { f.G.time += 1 / 60; a.update(1 / 60); }
  a.intent.move.set(0, 0, 1); a.intent.fire = true;
  for (let i = 0; i < 45; i++) { f.G.time += 1 / 60; a.update(1 / 60); }
  assert.equal(a.weaponRunner.rolling, true);
  assert.ok(Math.hypot(a.vel.x, a.vel.z) > 1.0, 'residual speed present');
  v.pos.set(a.pos.x, a.pos.y, a.pos.z + 0.8); v.hp = 500; v.alive = true; v.invuln = 0;
  f.G.actors = [a, v];
  a.intent.move.set(0, 0, 0); a.intent.fire = true;
  for (let i = 0; i < 5; i++) { f.G.time += 1 / 60; a.update(1 / 60); }
  assert.equal(v.hp, 500, 'no Left Stick input admits no roll damage despite residual speed');
  assert.equal(a.weaponRunner.rolling, true, 'rolling state itself is stick-independent');
  f.G.actors = [];
});

test('847 airborne wall drum contact preserves rolling', async () => {
  const f = await production();
  const a = new f.Actor({ team: 0, name: 'r847wall', isLocal: true, weapon: 'roller', CharacterClass: f.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  a.character.onEvent = null; f.G.actors = [a];
  a.pos.set(0, 0, -5); a.yaw = 0; a.aimYaw = 0; a.ink = 100;
  for (let i = 0; i < 10; i++) { f.G.time += 1 / 60; a.update(1 / 60); }
  a.intent.move.set(0, 0, 1); a.intent.fire = true;
  for (let i = 0; i < 45; i++) { f.G.time += 1 / 60; a.update(1 / 60); }
  assert.equal(a.weaponRunner.rolling, true);
  // Pin airborne in front of the wall (drum ray hits at dist ~1.0), fire held.
  a.yaw = 0; a.aimYaw = 0; a.intent.move.set(0, 0, 1); a.intent.fire = true;
  for (let i = 0; i < 8; i++) {
    a.pos.set(0, 1.4, 1.0); a.vel.set(0, 0, 1.0);
    f.G.time += 1 / 60; a.update(1 / 60);
    a.pos.set(0, 1.4, 1.0);
  }
  assert.equal(a.grounded, false, 'actor stays airborne while pinned');
  assert.equal(a.weaponRunner.rolling, true, 'wall drum contact keeps the S3-valid roll while airborne');
  f.G.actors = [];
});

test('847 ledge drum void suppresses rolling while feet stay grounded', async () => {
  const f = await production();
  // Same realm, ledge stage: floor only at x<0. Fresh actor per stage.
  const ledge = new f.Level({ bounds: { minX: -30, maxX: 30, minZ: -30, maxZ: 30 }, spawnPads: [[-25, 0, 0], [25, 0, 0]],
    spawnBarrier: 0, half: [], single: [{ kind: 'box', min: [-30, -.5, -30], max: [0, 0, 30] }] });
  const keep = { level: f.G.level, physics: f.G.physics, projectiles: f.G.projectiles, scene: f.G.scene };
  f.G.level = ledge; f.G.physics = new f.Physics(ledge);
  f.G.projectiles = new f.Projectiles(f.G.scene);
  try {
    const a = new f.Actor({ team: 0, name: 'r847ledge', isLocal: true, weapon: 'roller', CharacterClass: f.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
    a.character.onEvent = null; f.G.actors = [a];
    // Establish facing away from the edge so the run-up stays on the floor.
    a.pos.set(-3, 0, 0); a.yaw = -Math.PI / 2; a.aimYaw = -Math.PI / 2; a.ink = 100;
    for (let i = 0; i < 10; i++) { f.G.time += 1 / 60; a.update(1 / 60); }
    a.intent.move.set(-1, 0, 0); a.intent.fire = true;
    for (let i = 0; i < 45; i++) { f.G.time += 1 / 60; a.update(1 / 60); }
    assert.equal(a.weaponRunner.rolling, true, 'roll establishes on the ledge floor');
    // Pin feet at x=-0.25 (floor under feet) facing +x: drum center x=0.5 over void.
    a.yaw = Math.PI / 2; a.aimYaw = Math.PI / 2;
    a.intent.move.set(1, 0, 0); a.intent.fire = true;
    for (let i = 0; i < 8; i++) {
      a.pos.set(-0.25, 0, 0); a.vel.set(0, 0, 0);
      f.G.time += 1 / 60; a.update(1 / 60);
    }
    assert.equal(a.grounded, true, 'feet stay grounded at the edge while pinned');
    assert.equal(a.weaponRunner.rolling, false, 'unsupported drum stops contact behavior at the ledge');
  } finally {
    f.G.level = keep.level; f.G.physics = keep.physics; f.G.projectiles = keep.projectiles;
    f.G.actors = [];
  }
});

test('847 support probe falls back to feet grounding without stage collision', () => {
  const stubG = { physics: { raycast: (o, d, m, h) => { h.hit = false; return h; } } };
  const scratch = { ground: { hit: false }, hit: { hit: false }, origin: { set() {} }, dir: { set() {} } };
  const a = { grounded: true, yaw: 0, pos: { x: 0, y: 0, z: 0 }, intent: { move: { x: 0, z: 0 } }, remote: false };
  const sup = rollerDrumSupport(a, { rollWidth: 1.9 }, stubG, { stepUp: 0.35, stepDown: 0.45 }, scratch);
  assert.equal(sup.supported, true, 'stub physics keeps the previous feet-grounded admission');
  assert.equal(rollerStickActive(a), false, 'zero stick reads inactive for the owner');
  assert.equal(rollerStickActive({ ...a, intent: { move: { x: 0, z: 1 } } }), true);
  assert.equal(rollerStickActive({ ...a, remote: true }), true, 'remote proxies defer to owner authority');
});
