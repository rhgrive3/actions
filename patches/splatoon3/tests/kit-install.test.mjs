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
const BUILT = process.env.INKWAVE_BUILT_SITE;
const SRC = path.resolve(BUILT || process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public'));
let installed;
async function production() {
  if (installed) return installed;
  const context = vm.createContext({ console, performance, URL }), modules = new Map();
  const load = requested => {
    let file = requested.startsWith(path.join(SRC, 'patches') + path.sep)
      ? path.join(ROOT, path.relative(SRC, requested)) : requested;
    if (file.startsWith(path.join(ROOT, 'src') + path.sep)) file = path.join(SRC, path.relative(ROOT, file));
    if (BUILT && file.startsWith(path.join(ROOT, 'patches') + path.sep)) file = path.join(SRC, path.relative(ROOT, file));
    if (modules.has(file)) return modules.get(file);
    const source = fs.readFileSync(file, 'utf8');
    const module = new vm.SourceTextModule(!BUILT && file.startsWith(SRC + path.sep)
      ? adaptSource(path.relative(SRC, file), source) : source,
      { context, identifier: file, initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; } });
    modules.set(file, module); return module;
  };
  const entry = new vm.SourceTextModule(`
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export { FixedClock } from './patches/splatoon3/runtime/clock.mjs';
    export { bigBubblerSnapshot, clearBigBubblers } from './patches/splatoon3/runtime/kit-big-bubbler.mjs';
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
  const profile = JSON.parse(fs.readFileSync(path.join(BUILT ? SRC : ROOT, 'patches/splatoon3/profile.json')));
  if(BUILT)console.log('INKWAVE built kit fixture',SRC,'contentHash='+JSON.parse(fs.readFileSync(path.join(SRC,'inkwave-build.json'),'utf8')).contentHash);
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
  for (const [main, sub, special, cost] of [['shooter','suction','trizooka',200],['roller','curling','bubbler',180],['charger','bomb','inkVac',190],['blaster','autobomb','bubbler',190],['slosher','bomb','tripleInkstrike',220],['splatling','sprinkler','waveBreaker',210],['dualies','suction','crabTank',200]]) {
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
    assert.equal(api.WEAPONS[main].kitStatus,'verified-base-kit');
    assert.doesNotMatch(api.WEAPONS[main].blurb,/Original INKWAVE kit|Partial Splatoon 3 kit|11\.3\.0 kit slots installed/,
      main + ' complete base kit must not keep obsolete partial-kit copy');
    // These kit metadata objects originate in an isolated VM realm. Compare
    // portable values rather than failing on unrelated prototype identities.
    assert.deepEqual([...api.WEAPONS[main].kitVerifiedSlots], ['sub', 'special'], main);
    assert.deepEqual(Object.keys(api.WEAPONS[main].kitMissingSlots), [], main);
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
      // Trizooka/Vac expose their full native remaining duration at activation;
      // the immediately operating Bubbler consumes its points into a lock.
      assert.equal(a.special, main === 'roller' ? 0 : cost);
      assert.equal(a.ink, api.PLAYER.inkMax, main + ' outer resource refill');
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


test('ordinary turf scores during the Bubbler lock and refills only after real device retirement, without another activation or ink refill', async () => {
  const api = await production(); api.G.projectiles = new api.Projectiles(api.G.scene);
  const a = new api.Actor({team:0,name:'activation boundary regression',weapon:'roller',CharacterClass:api.Character,
    style:{hair:0,skin:2,outfit:0,eyes:0}});
  try {
    a.special = a.specialCost(); a.ink = 23; const count = a.stats.specials;
    a._startSpecial();
    assert.equal(a.special,0);assert.equal(a.ink,api.PLAYER.inkMax);assert.equal(a.stats.specials,count+1);
    assert.equal(a.specialActive,null,'a deployable Bubbler restores ordinary body control');
    const turf=a.stats.turf;a.addTurf(4); // native owner credit while the deployed device still operates
    assert.equal(a.stats.turf,turf+4,'the lock preserves ordinary turf score');assert.equal(a.special,0,'a deployed lock prevents refill');assert.equal(a.specialReady(),false);
    api.clearBigBubblers('kit-install-fixture');a.addTurf(4);
    assert.equal(a.special,4,'new ordinary turf refills after actual device retirement');
    assert.equal(a.stats.specials,count+1);assert.equal(a.ink,api.PLAYER.inkMax);
    a.reset();
  } finally {api.G.projectiles.clear();a.character.dispose();}
});
