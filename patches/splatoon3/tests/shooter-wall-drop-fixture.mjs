// #385 fixture: real public gameplay modules through the real build adapter.
// Only the renderer, audio and character mesh are absent; collision, projectiles
// and scoring paint are production code. Deterministic seeded PRNG.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../adapter.mjs';
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const UPSTREAM = process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public');
export async function fixture({ seed = 0x1a2b3c4d } = {}) {
  let state = seed >>> 0;
  const math = Object.create(Math);
  math.random = () => {
    state = state + 0x6d2b79f5 | 0;
    let t = Math.imul(state ^ state >>> 15, 1 | state);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  const context = vm.createContext({ console, performance, Math: math, structuredClone });
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
    const source = file.startsWith(UPSTREAM + path.sep) ? adaptSource(path.relative(UPSTREAM, file), fs.readFileSync(file, 'utf8')) : fs.readFileSync(file, 'utf8');
    const mod = new vm.SourceTextModule(source, { context, identifier: file });
    modules.set(file, mod); return mod;
  }
  const entry = new vm.SourceTextModule(`
    export * as THREE from 'three';
    export * from './src/core/ctx.js';
    export * from './src/config.js';
    export * from './src/game/actor.js';
    export * from './src/game/physics.js';
    export * from './src/game/weapons.js';
    export * from './src/world/paint.js';
    export * from './patches/splatoon3/runtime/clock.mjs';
    export * from './patches/splatoon3/runtime/weapons.mjs';
    export * from './patches/splatoon3/runtime/movement.mjs';
    export * from './patches/splatoon3/runtime/gear.mjs';
    export * from './patches/splatoon3/runtime/resources.mjs';
    export * from './patches/splatoon3/runtime/weapons-fidelity.mjs';
  `, { context, identifier: path.join(ROOT, 'fixture.mjs') });
  await entry.link((spec, from) => load(resolve(spec, from.identifier)));
  await entry.evaluate();
  const api = { ...entry.namespace };
  const { G, THREE, WEAPONS, PLAYER, SUB } = api;
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json'), 'utf8'));
  Object.assign(PLAYER, profile.player); Object.assign(SUB.bomb, profile.bomb);
  for (const [id, values] of Object.entries(profile.weapons)) Object.assign(WEAPONS[id], values);
  api.installWeapons(api, profile); api.installMovement(api, profile); api.installGear(api, profile); api.installResources(api, profile);
  api.installWeaponsFidelity(api, profile);
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  G.scene = new THREE.Scene(); G.camera = new THREE.PerspectiveCamera(70, 1, .1, 300); G.camera.position.set(0, 3, -4);
  G.teamColors = [new THREE.Color(0xff8a14), new THREE.Color(0x2f5bff)];
  G.settings = {}; G.mode = 'match'; G.time = 0; G.actors = []; G.match = { playing: () => true };
  const top = { id: 0, block: 0, origin: V(-40, 0, -5), u: V(1, 0, 0), v: V(0, 0, 1), n: V(0, 1, 0), su: 80, sv: 105, wall: false, turf: true, paintable: true };
  const box = { id: 0, solid: true, grate: false, center: V(0, -1, 47.5), half: V(40, 1, 52.5), axes: [V(1, 0, 0), V(0, 1, 0), V(0, 0, 1)], faces: [-1, -1, 0, -1, -1, -1], aabbMin: V(-40, -2, -5), aabbMax: V(40, 0, 100) };
  G.level = {
    faces: [top], blocks: [box], groundHeight: () => 0, pointInside: () => false,
    queryBlocks(_x0, _z0, _x1, _z1, out = []) { out.length = 0; for (let i = 0; i < this.blocks.length; i++) out.push(i); return out; },
  };
  G.physics = new api.Physics(G.level);
  class CpuPaint extends api.PaintSystem { _initGPU() { this.quads = 0; } }
  G.paint = new CpuPaint(null, G.level, { atlasSize: 4096, maxDensity: 8, cell: .25 });
  const paints = [];
  const splat = G.paint.splat;
  G.paint.splat = function (center, radius, team, opts = {}) {
    const area = splat.call(this, center, radius, team, opts);
    paints.push({ time: G.time, center: center.toArray(), radius, team, seed: opts.seed, area });
    return area;
  };
  const projectiles = G.projectiles = new api.Projectiles(G.scene);
  const impacts = [];
  api.on('weapon:impact', e => impacts.push({ time: G.time, pos: e.pos?.toArray(), kind: e.kind, radius: e.radius ?? null, victim: e.victim?.name ?? null }));
  class Character {
    constructor() { this.root = { position: V(), rotation: {} }; this.events = []; }
    trigger(...args) { this.events.push(args); }
    getMuzzle(out) { return out.copy(this.root.position).add(V(0, 1.05, .3)); }
    setVisible() {} setHurt() {} setWeapon() {}
  }
  function make(id = 'shooter', { team = 0, x = 0, y = 0, z = 0, name = id, hp = 100000 } = {}) {
    const a = new api.Actor({ team, name, weapon: id, CharacterClass: Character });
    a.pos.set(x, y, z); a.character.root.position.copy(a.pos); a.aimPoint.set(x, y + 1.05, z + 80);
    a.grounded = true; a.ground.hit = true; a.ground.y = y; a.ground.face = 0; a.alive = true; a.hp = hp; a.ink = 100; a.form = 'kid'; a.smoothY = 0;
    a._nearCamera = () => false; a._spawnBarrier = () => {}; a._finishFrame = () => {};
    a.damage = (d) => { a.hp -= d; return false; };
    a.addTurf = area => { a.turf = (a.turf || 0) + area; };
    return a;
  }
  function wall(z, { width = 10, height = 5, thickness = .1, grate = false, paintable = true } = {}) {
    const id = G.level.blocks.length;
    const faces = [-1, -1, -1, -1, -1, -1];
    if (!paintable) {
      G.level.faces.push({ id, block: id, origin: V(0, height / 2, z - thickness / 2), u: V(1, 0, 0), v: V(0, 0, 1), n: V(0, 0, -1), su: width, sv: height, wall: true, turf: false, paintable: false });
      faces[5] = G.level.faces.length - 1;
    }
    G.level.blocks.push({ id, solid: true, grate, center: V(0, height / 2, z), half: V(width / 2, height / 2, thickness / 2), axes: box.axes, faces, aabbMin: V(-width / 2, 0, z - thickness / 2), aabbMax: V(width / 2, height, z + thickness / 2) });
  }
  function tick(a, input = { fire: false }, dt = 1 / 60) {
    G.time += dt; a.lastFire += dt; a.intent.fire = !!input.fire; a.weaponRunner.update(dt, input); projectiles.update(dt);
  }
  return { ...api, context, profile, make, wall, tick, paints, impacts, projectiles, sourceFiles: [...modules.keys()] };
}
