// Actual public modules plus the build adapter. No renderer, fake game model,
// or second gameplay engine is used. Tests stub only display/audio/collisions.
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
const UPSTREAM = process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public');
const adaptProduction = (rel, code) => adaptRange(rel, adaptNetworkSource(rel,
  adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code))))));
export async function fixture({ adapt = adaptSource, adaptRuntime = (_rel, source) => source,
  fullRuntime = false, productionComposition = false, realProjectiles = false } = {}) {
  const context = vm.createContext({ console, performance, URL, URLSearchParams, TextEncoder, TextDecoder,
    setTimeout, clearTimeout, queueMicrotask });
  const modules = new Map();
  function resolve(spec, from) {
    if (spec === 'three') return path.join(UPSTREAM, 'vendor/three/build/three.module.js');
    if (spec.startsWith('three/addons/')) return path.join(UPSTREAM, 'vendor/three/jsm', spec.slice('three/addons/'.length));
    let file = path.resolve(path.dirname(from), spec);
    if (file.startsWith(path.join(ROOT, 'inkwave-public/'))) file = path.join(UPSTREAM, path.relative(path.join(ROOT, 'inkwave-public'), file));
    if (file.startsWith(path.join(UPSTREAM, 'patches/'))) file = path.join(ROOT, path.relative(UPSTREAM, file));
    if (file.startsWith(path.join(ROOT, 'src/'))) file = path.join(UPSTREAM, path.relative(ROOT, file));
    return file;
  }
  function load(file) {
    if (modules.has(file)) return modules.get(file);
    const relative = path.relative(UPSTREAM, file);
    const raw = fs.readFileSync(file, 'utf8'), upstream = file.startsWith(UPSTREAM + path.sep);
    const rel = upstream ? relative : path.relative(ROOT, file);
    const source = productionComposition ? adaptProduction(rel, raw)
      : upstream ? adapt(relative, raw) : adaptRuntime(rel, raw);
    const mod = new vm.SourceTextModule(source, { context, identifier: file,
      initializeImportMeta(meta, module) { meta.url = pathToFileURL(module.identifier).href; } });
    modules.set(file, mod); return mod;
  }
  const root = new vm.SourceTextModule(`
    export * from './inkwave-public/src/core/ctx.js';
    export * from './inkwave-public/src/config.js';
    export * from './inkwave-public/src/game/actor.js';
    export * from './inkwave-public/src/game/weapons.js';
    export * from './inkwave-public/src/game/physics.js';
    export * from './inkwave-public/src/game/player.js';
    export { NetMatch } from './inkwave-public/src/net/netmatch.js';
    export * from './inkwave-public/src/core/shadowcache.js';
    export { install as installS3 } from './patches/splatoon3/runtime/install.mjs';
    export * as THREE from 'three';
    export const VM_MATH = Math;
    export * from './patches/splatoon3/runtime/movement.mjs';
    export * from './patches/splatoon3/runtime/weapons.mjs';
    export * from './patches/splatoon3/runtime/gear.mjs';
    export * from './patches/splatoon3/runtime/flow.mjs';
    export * from './patches/splatoon3/runtime/resources.mjs';
    export * from './patches/splatoon3/runtime/render.mjs';
    export * from './patches/splatoon3/runtime/sub-special-fidelity.mjs';
    export const TEST_MATH = Math;
  `, { context, identifier: path.join(ROOT, 'fixture.mjs') });
  await root.link((spec, from) => load(resolve(spec, from.identifier))); await root.evaluate();
  const api = { ...root.namespace }, { G, THREE, PLAYER, WEAPONS, SUB, SPECIALS } = api;
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json'), 'utf8'));
  Object.assign(PLAYER, profile.player); Object.assign(SUB.bomb, profile.bomb);
  for (const [id, data] of Object.entries(profile.weapons)) Object.assign(WEAPONS[id], data);
  if (fullRuntime) api.installS3(profile);
  else for (const install of ['installWeapons', 'installMovement', 'installGear', 'installFlow', 'installResources', 'installRendering']) api[install](api, profile);
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.level = { blocks: [], groundHeight: () => 0 }; G.time = 0; G.actors = [];
  G.physics = { los: () => true, raycast: (_a, _b, _c, h) => { h.hit = false; return h; } };
  G.paint = { sample: () => 1, splat: () => 0 }; G.match = { playing: () => true, canRespawn: () => false };
  const shots = [];
  G.projectiles = realProjectiles ? new api.Projectiles({ add() {}, remove() {} }) : { fireCharger: (actor, weapon, charge) => shots.push({ kind: 'charger', charge }),
    fireShooter: () => shots.push({ kind: 'shooter' }), fireDualies: (_a, _w, spread) => shots.push({ kind: 'dualies', spread }),
    fireFlick: (actor, weapon) => shots.push({ kind: 'roller', windup: weapon.flickWindup }), fireBlaster: () => shots.push({ kind: 'blaster' }),
    fireSplatling: () => shots.push({ kind: 'splatling' }) };
  class Character {
    constructor(actor) { this.actor = actor; this.root = { position: new THREE.Vector3(), rotation: {} }; this.events = []; }
    _owner() { return this.actor; }
    _runner() { return this.actor?.weaponRunner; }
    trigger(...args) { this.events.push(args); }
    getMuzzle(out) { return out.copy(this.root.position).add(new THREE.Vector3(0, 1.05, .3)); }
    setVisible() {} setHurt() {} setWeapon() {}
  }
  function make(weapon = 'shooter') {
    const a = new api.Actor({ team: 0, name: 'fixture', weapon, CharacterClass: Character });
    if (!a.character.actor) a.character.actor = a;
    a.grounded = true; a.ground.hit = true; a.ground.face = 0;
    a._spawnBarrier = () => {}; a._finishFrame = () => {}; a._integrate = () => {};
    G.actors.push(a);
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
