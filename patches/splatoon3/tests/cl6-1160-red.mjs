// #1160 RED reproduction: 0.30 curb beneath 1.50 ceiling through full production composition.
// Native Actor + Physics + synthetic extra-block Level, adapter-transformed (adaptSource).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../adapter.mjs';
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const UPSTREAM = process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public');
async function loadApi() {
  const ctx = vm.createContext({ console, performance, setTimeout, clearTimeout, queueMicrotask, URL, URLSearchParams, TextEncoder, TextDecoder, innerWidth: 1280, innerHeight: 720 });
  const mods = new Map();
  const resolve = (spec, from) => {
    if (spec === 'three') return path.join(UPSTREAM, 'vendor/three/build/three.module.js');
    let file = path.resolve(path.dirname(from), spec);
    if (file.startsWith(path.join(ROOT, 'inkwave-public/'))) file = path.join(UPSTREAM, path.relative(path.join(ROOT, 'inkwave-public'), file));
    if (file.startsWith(path.join(UPSTREAM, 'patches/'))) file = path.join(ROOT, path.relative(UPSTREAM, file));
    if (file.startsWith(path.join(ROOT, 'src/'))) file = path.join(UPSTREAM, path.relative(ROOT, file));
    return file;
  };
  const get = (file) => {
    if (mods.has(file)) return mods.get(file);
    const raw = fs.readFileSync(file, 'utf8');
    const rel = path.relative(UPSTREAM, file);
    const src = file.startsWith(UPSTREAM + path.sep) ? adaptSource(rel, raw) : raw;
    const m = new vm.SourceTextModule(src, { context: ctx, identifier: file });
    mods.set(file, m); return m;
  };
  const root = new vm.SourceTextModule(`export * from './inkwave-public/src/core/ctx.js';export * from './inkwave-public/src/config.js';export * from './inkwave-public/src/game/actor.js';export * from './inkwave-public/src/game/physics.js';export * from './inkwave-public/src/world/level.js';export * from './inkwave-public/src/world/maps.js';export * as THREE from 'three';`, { context: ctx, identifier: path.join(ROOT, 'r1160.mjs') });
  await root.link((s, f) => get(resolve(s, f.identifier))); await root.evaluate();
  const api = { ...root.namespace };
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json'), 'utf8'));
  Object.assign(api.PLAYER, profile.player);
  return api;
}
const api = await loadApi();
const { G, THREE, PLAYER, Physics, Level, KELPLINE } = api;
if (!Level || !KELPLINE) throw new Error('Level/KELPLINE export missing');
// Fixture: flat floor y=0 everywhere near origin, 0.30 curb block, solid ceiling underside 1.50.
// Floor: big thin slab top at y=0. Curb: top at 0.30. Ceiling: underside at 1.50 (thick slab above).
G.level = new Level(KELPLINE, [
  { min: [-30, -1, -30], max: [30, 0, 30] },
  { min: [-30, 0, 0.6], max: [30, 0.30, 30] },
  { min: [-30, 1.50, -30], max: [30, 2.5, 30] },
]);
G.physics = new Physics(G.level);
G.paint = { sample: () => 1, splat: () => 0 };
G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
class Character { constructor(o){ this.root={position:new THREE.Vector3(),rotation:{}}; } trigger(){} getMuzzle(o){return o.set(0,1.05,.3);} setVisible(){} setHurt(){} setWeapon(){} }
const { Actor } = api;
const a = new Actor({ team: 0, name: 'r1160', weapon: 'shooter', CharacterClass: Character });
a._spawnBarrier = () => {}; a._finishFrame = () => {};
// Bypass action-admission runtime owners (not installed in this minimal harness);
// drive the adapter-transformed native controller directly at fixed 60Hz.
a._surface = () => { a.groundTeam = 0; }; a._onLand = () => {};
G.time = 0;
const stepNative = () => { G.time += 1/60; a._horizontal(1/60, false, false); a._integrate(1/60, false, false); };
a.pos.set(0, 0, -1.2); a.vel.set(0,0,0); a.grounded = true; a.ground.hit = true;
a.groundN.set(0,1,0); a.intent.move.set(0,0,1);
// prime ground state on flat floor
a._resolve(false, 0, true);
console.log('prime', JSON.stringify({ y: a.pos.y, grounded: a.grounded, radius: PLAYER.radius, terrainR: (PLAYER.s3HumanoidTerrainRadiusRaw ?? NaN), scale: PLAYER.s3TerrainDistanceScale }));
let snapped = null; const ys = [];
for (let i = 0; i < 600; i++) {
  const beforeY = a.pos.y;
  stepNative(); ys.push(a.pos.y);
  if (snapped === null && a.pos.y > 0.05) snapped = { tick: i, y: a.pos.y };
  if (i % 60 === 0 || (snapped && i - snapped.tick < 6)) console.log(`t${i} y=${a.pos.y.toFixed(4)} grounded=${a.grounded} z=${a.pos.z.toFixed(3)}`);
  if (a.pos.z > 3) break;
}
// oscillation: after snap, count frames where body resolution pushes down then feet re-snap up
let downs = 0, ups = 0;
for (let i = 1; i < ys.length; i++) { if (ys[i] < ys[i-1] - 1e-6) downs++; if (ys[i] > ys[i-1] + 1e-6) ups++; }
console.log('osc', JSON.stringify({ frames: ys.length, downs, ups }));
// full-body occupancy at final pose with the SAME adapter-transformed radius policy
const squid = false;
const terrainR = ((squid ? PLAYER.s3SwimTerrainRadiusRaw : PLAYER.s3HumanoidTerrainRadiusRaw) ?? PLAYER.radius) * (PLAYER.s3TerrainDistanceScale ?? 1);
const lift = PLAYER.stepUp, height = PLAYER.height;
const fitsNative = G.physics.bodyFits(new THREE.Vector3(a.pos.x, a.pos.y, a.pos.z), terrainR, lift, height, false);
const fitsRaw = G.physics.bodyFits(new THREE.Vector3(a.pos.x, a.pos.y, a.pos.z), PLAYER.radius, lift, height, false);
console.log('final', JSON.stringify({ y: a.pos.y, z: a.pos.z, grounded: a.grounded, terrainR, fitsNative, fitsRaw }));
// ceiling underside 1.50; kid height 1.45 -> any snapped y>0.05 overlaps the ceiling slab
if (snapped) console.log(`SNAP-UP y=${snapped.y.toFixed(4)} at tick ${snapped.tick} fitsNative=${fitsNative}`);
else console.log('NO-SNAP (blocked at curb base)');
