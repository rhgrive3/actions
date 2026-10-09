import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';

// One module realm and the unmodified production installer. Do not combine this
// with individual installers in another realm: their WeakSets are independent.
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.resolve(process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public'));
let installed;
async function production() {
  if (installed) return installed;
  const context = vm.createContext({ console, performance, URL }), modules = new Map();
  const load = requested => {
    let file = requested.startsWith(path.join(SRC, 'patches') + path.sep)
      ? path.join(ROOT, path.relative(SRC, requested)) : requested;
    if (file.startsWith(path.join(ROOT, 'src') + path.sep)) file = path.join(SRC, path.relative(ROOT, file));
    if (modules.has(file)) return modules.get(file);
    const source = fs.readFileSync(file, 'utf8');
    const module = new vm.SourceTextModule(file.startsWith(SRC + path.sep)
      ? adaptSource(path.relative(SRC, file), source) : source,
      { context, identifier: file, initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; } });
    modules.set(file, module); return module;
  };
  const entry = new vm.SourceTextModule(`
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export { FixedClock } from './patches/splatoon3/runtime/clock.mjs';
    export { bigBubblerSnapshot } from './patches/splatoon3/runtime/kit-big-bubbler.mjs';
    export { inkVacState } from './patches/splatoon3/runtime/kit-ink-vac.mjs';
    export { trizookaIsActive } from './patches/splatoon3/runtime/kit-trizooka.mjs';
    export { movementMotionSnapshot } from './patches/splatoon3/runtime/movement-motion.mjs';
  `, { context, identifier: path.join(ROOT, 'kit-composition-entry.mjs') });
  await entry.link((specifier, from) => load(specifier === 'three'
    ? path.join(SRC, 'vendor/three/build/three.module.js')
    : specifier.startsWith('three/addons/')
      ? path.join(SRC, 'vendor/three/jsm', specifier.slice('three/addons/'.length))
      : path.resolve(path.dirname(from.identifier), specifier)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json')));
  const api = entry.namespace.install(profile);
  assert.throws(() => entry.namespace.install(profile), /already installed/);
  const { G, THREE } = api;
  // Pose/clock fixture: actual Actor, Runner, Character and rig; contact and
  // projectile collision are covered by the separate native-physics suites.
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.scene = new THREE.Scene(); G.level = { blocks: [], groundHeight: () => 0 };
  G.paint = { sample: () => 1, splat: () => 0 }; G.match = { playing: () => true };
  G.physics = { los: () => true, raycast: (_a, _b, _c, hit) => { hit.hit = false; return hit; } };
  G.actors = []; G.time = 0;
  installed = { ...api, ...entry.namespace, profile }; return installed;
}

test('the unmodified public installer activates all three genuine base kits before actors copy them', async () => {
  const api = await production();
  for (const [main, sub, special, cost] of [['shooter','suction','trizooka',200],['roller','curling','bubbler',180],['charger','bomb','inkVac',190]]) {
    assert.equal(api.WEAPONS[main].sub, sub, main + ' installed sub');
    assert.equal(api.WEAPONS[main].special, special, main + ' installed special');
    assert.equal(api.WEAPONS[main].specialCost, cost);
    assert.equal(api.WEAPONS[main].kitStatus, 'verified-base-kit');
    assert.ok(api.SUB[sub], 'registered sub mechanics'); assert.ok(api.SPECIALS[special], 'registered special mechanics');
    assert.ok(api.SUB_ICONS[sub]?.includes('<svg'), 'real menu sub icon registered');
    assert.ok(api.SPECIAL_ICONS[special]?.includes('<svg'), 'real menu special icon registered');
    const a = new api.Actor({team:0,name:'composed kit regression',weapon:main,CharacterClass:api.Character,
      style:{hair:0,skin:2,outfit:0,eyes:0}});
    try {
      assert.equal(a.weapon.sub,sub);assert.equal(a.weapon.special,special);assert.equal(a.specialCost(),cost);
      a.special = cost - .001; assert.equal(a.specialReady(),false);
      a.special = cost; assert.equal(a.specialReady(),true);
      assert.notEqual(a.weapon,api.WEAPONS[main], 'gear snapshot remains actor-local');
    } finally {a.character.dispose();}
  }
  for (const main of ['blaster','slosher','splatling','dualies']) {
    assert.equal(api.WEAPONS[main].kitStatus,'original-inkwave-kit');
    assert.match(api.WEAPONS[main].blurb,/Original INKWAVE kit/);
  }
});


test('the complete production wrapper chain activates each kit and refills exactly once', async () => {
  const api = await production();
  api.G.projectiles = new api.Projectiles(api.G.scene);
  for (const main of ['shooter', 'roller', 'charger']) {
    const a = new api.Actor({team:0,name:'real wrapper-chain regression',weapon:main,CharacterClass:api.Character,
      style:{hair:0,skin:2,outfit:0,eyes:0}});
    try {
      const cost = a.specialCost(); a.special = cost; a.ink = 7;
      const count = a.stats.specials;
      a._startSpecial();
      assert.equal(a.stats.specials, count + 1, main + ' native activation once');
      assert.equal(a.special, 0); assert.equal(a.ink, api.PLAYER.inkMax, main + ' outer resource refill');
      if (main === 'shooter') assert.equal(api.trizookaIsActive(a), true);
      if (main === 'roller') assert.equal(api.bigBubblerSnapshot().length, 1, 'delegated real Bubbler deployment');
      if (main === 'charger') assert.equal(api.inkVacState(a)?.phase, 'inhale', 'delegated real Vac intake');
      a.ink = 7; a._startSpecial();
      assert.equal(a.stats.specials, count + 1, main + ' re-entry does not spend or refill');
      assert.equal(a.ink, 7);
      a.reset();
      assert.equal(a.specialActive, null);
      assert.equal(api.trizookaIsActive(a), false);
      assert.equal(api.inkVacState(a), null);
    } finally { api.G.projectiles.clear(); a.character.dispose(); }
  }
});


test('ordinary turf after Bubbler deployment may change gauge without another activation or refill', async () => {
  const api = await production(); api.G.projectiles = new api.Projectiles(api.G.scene);
  const a = new api.Actor({team:0,name:'activation boundary regression',weapon:'roller',CharacterClass:api.Character,
    style:{hair:0,skin:2,outfit:0,eyes:0}});
  try {
    a.special = a.specialCost(); a.ink = 23; const count = a.stats.specials;
    a._startSpecial();
    assert.equal(a.special,0);assert.equal(a.ink,api.PLAYER.inkMax);assert.equal(a.stats.specials,count+1);
    assert.equal(a.specialActive,null,'a deployable Bubbler restores ordinary body control');
    a.addTurf(4); // real native owner credit, as remaining rounds may supply later in the frame
    assert.ok(a.special>0,'preserve the native post-token gauge policy');
    assert.equal(a.stats.specials,count+1);assert.equal(a.ink,api.PLAYER.inkMax);
    a.reset();
  } finally {api.G.projectiles.clear();a.character.dispose();}
});
