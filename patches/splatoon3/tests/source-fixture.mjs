// Actual public modules plus the build adapter. No renderer, fake game model,
// or second gameplay engine is used. Tests stub only display/audio/collisions.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../adapter.mjs';
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const BUILT = process.env.INKWAVE_BUILT_SITE;
const UPSTREAM = BUILT ? path.resolve(BUILT) : process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public');
export async function fixture(options = {}) {
  const extraExports = typeof options === 'string' ? options : options.extraExports || '';
  const { adapt = adaptSource, adaptNative = adapt, adaptRuntime = (_rel, source) => source } = typeof options === 'string' ? {} : options;
  const context = vm.createContext({ console, performance, URL, innerWidth:1280, innerHeight:720 });
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
    if (BUILT && file.startsWith(path.join(ROOT, 'patches/'))) file = path.join(UPSTREAM, path.relative(ROOT, file));
    if (modules.has(file)) return modules.get(file);
    const relative = path.relative(UPSTREAM, file);
    const native = !BUILT && file.startsWith(UPSTREAM + path.sep) ? adaptNative(relative, fs.readFileSync(file, 'utf8')) : fs.readFileSync(file, 'utf8');
    const source = file.startsWith(UPSTREAM + path.sep) ? native : adaptRuntime(path.relative(ROOT, file), native);
    const mod = new vm.SourceTextModule(source, { context, identifier: file, initializeImportMeta(meta) { meta.url = new URL(file, 'file:').href; } }); modules.set(file, mod); return mod;
  }
  const root = new vm.SourceTextModule(`
    export * from './inkwave-public/src/core/ctx.js';
    export * from './inkwave-public/src/config.js';
    export * from './inkwave-public/src/game/actor.js';
    export * from './inkwave-public/src/game/weapons.js';
    export * from './inkwave-public/src/game/physics.js';
    export * from './inkwave-public/src/net/netmatch.js';
    export * from './inkwave-public/src/game/player.js';
    export * from './inkwave-public/src/game/cameraRig.js';
    export * from './inkwave-public/src/net/netmatch.js';
    export * from './inkwave-public/src/world/level.js';
    export * from './inkwave-public/src/core/shadowcache.js';
    export * from './inkwave-public/src/world/paint.js';
    export * as THREE from 'three';
    export const VM_MATH = Math;
    export * from './patches/splatoon3/runtime/movement.mjs';
    export * from './patches/splatoon3/runtime/weapons.mjs';
    export * from './patches/splatoon3/runtime/gear.mjs';
    export * from './patches/splatoon3/runtime/flow.mjs';
    export * from './patches/splatoon3/runtime/resources.mjs';
    export * from './patches/splatoon3/runtime/render.mjs';
    export * from './patches/splatoon3/runtime/sub-special-fidelity.mjs';
    export * from './patches/splatoon3/runtime/clock.mjs';
    export const TEST_MATH = Math;
    ${extraExports}
  `, { context, identifier: path.join(ROOT, 'fixture.mjs') });
  await root.link((spec, from) => load(resolve(spec, from.identifier))); await root.evaluate();
  const api = { ...root.namespace }, { G, THREE, PLAYER, WEAPONS, SUB, SPECIALS } = api;
  const profile = JSON.parse(fs.readFileSync(path.join(BUILT ? UPSTREAM : ROOT, 'patches/splatoon3/profile.json'), 'utf8'));
  Object.assign(PLAYER, profile.player); Object.assign(SUB.bomb, profile.bomb);
  for (const [id, data] of Object.entries(profile.specials || {})) Object.assign(SPECIALS[id], data);
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
  const originalRandom = vm.runInContext('Math.random', context);
  function setRandom(random) {
    context.__inkwaveTestRandom = random;
    vm.runInContext('Math.random = globalThis.__inkwaveTestRandom', context);
    delete context.__inkwaveTestRandom;
  }
  function restoreRandom() { setRandom(originalRandom); }
  return { ...api, profile, make, tick, shots, setRandom, restoreRandom };
}
