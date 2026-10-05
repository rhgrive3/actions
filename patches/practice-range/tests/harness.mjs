// Test harness: one vm module realm with the production gameplay installer (patches/splatoon3) and the Practice Range
// modules, all loaded from source exactly as the build composes them (every adapter applied). Headless: three.js runs,
// nothing renders. Same loader pattern as patches/splatoon3/tests/full-motion-install.test.mjs.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';
import { adaptRange } from '../adapter.mjs';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const SRC = path.resolve(process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public'));
export const compose = (rel, code) => adaptRange(rel, adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code)))));

let realm;
export async function rangeRealm() {
  if (realm) return realm;
  const store = new Map();
  const context = vm.createContext({ console, performance, URL, setTimeout, clearTimeout,
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) },
    navigator: { userAgent: 'node', maxTouchPoints: 0 }, matchMedia: () => ({ matches: false, addEventListener() {} }) });
  context.globalThis = context; context.window = context;
  const modules = new Map();
  const load = (requested) => {
    let file = requested.startsWith(path.join(SRC, 'patches') + path.sep) ? path.join(ROOT, path.relative(SRC, requested)) : requested;
    if (file.startsWith(path.join(ROOT, 'src') + path.sep) || file.startsWith(path.join(ROOT, 'assets') + path.sep)) file = path.join(SRC, path.relative(ROOT, file));
    if (modules.has(file)) return modules.get(file);
    const source = fs.readFileSync(file, 'utf8');
    const rel = file.startsWith(SRC + path.sep) ? path.relative(SRC, file) : path.relative(ROOT, file);
    const mod = new vm.SourceTextModule(compose(rel.split(path.sep).join('/'), source), { context, identifier: file, initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; } });
    modules.set(file, mod); return mod;
  };
  const entry = new vm.SourceTextModule(`
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export { RangeSession, REINFLATE_TIME, COMBO_GAP } from './patches/practice-range/runtime/session.mjs';
    export { TargetDummyCharacter } from './patches/practice-range/runtime/dummy.mjs';
    export * as ZONES from './patches/practice-range/stage/zones.mjs';
    export { LAYOUT } from './patches/practice-range/stage/layout.mjs';
    export { drawMurals } from './patches/practice-range/stage/murals.mjs';
    export { Level } from './src/world/level.js';
    export { Physics } from './src/game/physics.js';
    export { MAP_LAYOUTS } from './src/world/maps.js';
    export { MAPS, OFFLINE_MAPS, PLAYER, WEAPONS, SPECIALS } from './src/config.js';
    export { on, emit } from './src/core/ctx.js';
    export { Match } from './src/game/match.js';
    export { Projectiles } from './src/game/weapons.js';
    export { STAGE_SURFACES, STAGE_SLOTS, FIRST_STAGE_SLOT, LAST_STAGE_SLOT } from './src/world/stages/surfaces.js';
    export { STAGES } from './src/world/stages/index.js';
    export { installPracticeRange, isRangeMatch, RANGE_MATCH_TIME } from './patches/practice-range/install.mjs';
    export { HUD } from './src/ui/hud.js';
    export { RANGE_MAP, isRangeMap, rangeMapFor } from './patches/practice-range/range-map.mjs';
    export { PropKit } from './src/world/props.js';
    export { dressingFor } from './src/world/dressing.js';
  `, { context, identifier: path.join(ROOT, 'range-test-entry.mjs') });
  await entry.link((specifier, from) => load(specifier === 'three'
    ? path.join(SRC, 'vendor/three/build/three.module.js')
    : specifier.startsWith('three/addons/') ? path.join(SRC, 'vendor/three/jsm', specifier.slice('three/addons/'.length))
      : path.resolve(path.dirname(from.identifier), specifier)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json')));
  const api = entry.namespace.install(profile);
  realm = { ...api, ...entry.namespace, profile };
  return realm;
}

// A range world in the realm: the real Level + Physics of the range layout, a paint stub that records splats.
export function rangeWorld(R) {
  const { G, THREE, Level, Physics, LAYOUT } = R;
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.scene = new THREE.Scene();
  // the prop colliders the game adds to the level (main._buildWorld: dressing first, then Level(layout, colliders))
  const kit = new R.PropKit(null, { headless: true });
  const colliders = [];
  for (const it of R.dressingFor('range')) { const r = kit.add(it.type, it); if (r && r.colliders) colliders.push(...r.colliders); }
  G.level = new Level(LAYOUT, colliders);
  G.physics = new Physics(G.level);
  const splats = [];
  G.paint = { splat: (p, r, team, paint = {}) => { splats.push([p.x, p.y, p.z, r, team, paint.kind || null]); return 0; }, sample: () => 0, clear() { splats.length = 0; }, version: 0 };
  G.projectiles = { clear() {} };
  G.time = 0; G.actors = [];
  return { splats };
}
