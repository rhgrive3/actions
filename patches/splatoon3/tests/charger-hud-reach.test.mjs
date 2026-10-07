import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';
// #711: Charger HUD inRange must follow the live charge's flight reach, not full-charge reach.
// Logic-only: real composed player.js/weapons.js + the full splatoon3 install on the VM. Not a browser or Switch comparison.
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.join(ROOT, 'inkwave-public');
const STEP = 1 / 60;
const ORIGINAL_RANGE = "    const range = w.kind === 'charger' ? w.rangeMax : w.kind === 'roller' ? 6 : (w.range || 12);\n";

// main: reproduce origin/main's player.js (full-charge reach) by reverting only the #711 lines of the composed source.
async function boot({ main = false } = {}) {
  const context = vm.createContext({ console, performance, URL, innerHeight: 720 }), modules = new Map();
  const composed = {};
  const load = requested => {
    let file = requested;
    if (file.startsWith(path.join(SRC, 'patches') + path.sep)) file = path.join(ROOT, path.relative(SRC, file));
    if (file.startsWith(path.join(ROOT, 'src') + path.sep)) file = path.join(SRC, path.relative(ROOT, file));
    if (modules.has(file)) return modules.get(file);
    const raw = fs.readFileSync(file, 'utf8'), rel = path.relative(SRC, file);
    let source = adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, raw))));
    if (rel === 'src/game/player.js') {
      composed.player = source;
      if (main) {
        const revert = /    const chargeNow = [^\n]*\n    const range = [^\n]*\n/;
        assert.equal(source.match(new RegExp(revert, 'g')).length, 1);
        source = source.replace(revert, ORIGINAL_RANGE);
      }
    }
    const mod = new vm.SourceTextModule(source, { context, identifier: file, initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; } });
    modules.set(file, mod); return mod;
  };
  const entry = new vm.SourceTextModule(`
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export { Level } from './src/world/level.js';
    export { PlayerController } from './src/game/player.js';
  `, { context, identifier: path.join(SRC, 'charger-hud-reach-entry.mjs') });
  await entry.link((spec, from) => load(spec === 'three' ? path.join(SRC, 'vendor/three/build/three.module.js')
    : spec.startsWith('three/addons/') ? path.join(SRC, 'vendor/three/jsm', spec.slice(13)) : path.resolve(path.dirname(from.identifier), spec)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json')));
  const api = { ...entry.namespace.install(profile), ...entry.namespace }, { G, THREE, Physics, Level } = api;
  const level = new Level({ bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }, spawnPads: [[-80, 0, 0], [80, 0, 0]], spawnBarrier: 0,
    single: [{ kind: 'box', min: [-100, -.5, -100], max: [100, 0, 100] }], half: [] });
  Object.assign(G, { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), settings: { quality: 'high' }, actors: [], time: 0,
    level, physics: new Physics(level), mode: 'match', teamColors: [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')],
    match: { playing: () => true, canRespawn: () => false }, paint: { sample: () => 1, splat: () => 0 } });
  G.projectiles = new api.Projectiles(G.scene);
  const real = G.projectiles;
  function make(weapon) {
    const a = new api.Actor({ team: 0, name: 'charger hud reach', weapon, CharacterClass: api.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
    a.character.actor = a; G.actors.push(a); G.scene.add(a.character.root);
    a.spawnAt(new THREE.Vector3(0, 0, 0), 0); a.invuln = 0; return a;
  }
  // Camera at the actor's eye line looking down +X; the ray is stubbed to hit exactly `distance` metres of aim-point offset.
  function inRange(actor, charge, planar, projectiles = G.projectiles) {
    const previousProjectiles = G.projectiles;
    try {
      G.projectiles = projectiles;
      G.camera.position.set(0, 1.3, 0); G.camera.lookAt(10, 1.3, 0); G.camera.updateMatrixWorld(true);
      G.physics.raycast = (_s, _d, _m, hit) => { hit.hit = true; hit.dist = Math.sqrt(planar * planar - 1.3 * 1.3); return hit; };
      actor.weaponRunner.charge = charge;
      const controller = new api.PlayerController(actor, null, null);
      controller.computeAim();
      assert.ok(Math.abs(actor.aimPoint.distanceTo(actor.pos) - planar) < 1e-9, 'aim point sits exactly at the requested distance');
      return controller.inRange;
    } finally { G.projectiles = previousProjectiles; }
  }
  const close = () => { for (const a of G.actors) a.character.dispose(); real.clear(); };
  return { ...api, make, inRange, close, composed, real };
}

const CHARGES = [0, .5, .998, 1];
// One VM boot per composition (boot is the slow part); tests clear projectiles and read charge explicitly.
const booted = [];
const shared = {};
const fixedBoot = () => shared.fixed ||= boot().then(f => (booted.push(f), f));
const mainBoot = () => shared.main ||= boot({ main: true }).then(f => (booted.push(f), f));
after(() => { for (const f of booted) f.close(); });

test('#711 the composed player.js contains the charge-dependent reach exactly once', async () => {
  const f = await fixedBoot();
  assert.equal(f.composed.player.split('chargerReach(chargeNow)').length - 1, 1);
  assert.equal(f.composed.player.includes(ORIGINAL_RANGE), false);
  assert.match(f.composed.player, /const chargeNow = clamp\(a\.weaponRunner\?\.s3Stored\?\.charge \?\? a\.weaponRunner\?\.charge \?\? 0, 0, 1\);/);
  assert.match(f.composed.player, /import \{ G, clamp, lerp, angleDiff \} from '\.\.\/core\/ctx\.js';/);
});

test('#711 chargerReach(c) equals the distance the installed flight job uses', async () => {
  const f = await fixedBoot();
  const a = f.make('charger'), P = f.real;
  assert.equal(typeof P.chargerReach, 'function');
  assert.equal(Object.hasOwn(Object.getPrototypeOf(P), 'chargerReach'), true);
  for (const c of CHARGES) {
    P.clear(); P.fireCharger(a, a.weapon, c);
    const job = P._fidelityChargerFlights.at(-1);
    assert.equal(P._fidelityChargerFlights.length, 1);
    assert.equal(job.range, P.chargerReach(c), `charge ${c}`);
    assert.ok(job.range > 0 && Number.isFinite(job.range));
  }
});

test('#711 reach is monotonic, clamps out-of-range input and spans min to full reach', async () => {
  const f = await fixedBoot();
  const P = f.real; let previous = -Infinity;
  for (let i = 0; i <= 1000; i++) { const reach = P.chargerReach(i / 1000); assert.ok(reach >= previous, `charge ${i / 1000}`); previous = reach; }
  assert.ok(P.chargerReach(0) < P.chargerReach(.5) && P.chargerReach(.5) < P.chargerReach(1));
  assert.equal(P.chargerReach(-3), P.chargerReach(0));
  assert.equal(P.chargerReach(7), P.chargerReach(1));
  assert.equal(P.chargerReach(NaN), P.chargerReach(0));
  assert.equal(P.chargerReach(.999), P.chargerReach(1), 'full-charge branch starts at .999 exactly like begin()');
});

test('#711 begin() keeps its maxDistance override for networked ghost shots', async () => {
  const f = await fixedBoot();
  const a = f.make('charger'), P = f.real;
  P.ghostFire(a, { weapon: 'charger', muzzle: a.pos, dir: new f.THREE.Vector3(1, 0, 0), charge: 1, len: 9.25 });
  assert.equal(P._fidelityChargerFlights.at(-1).range, 9.25);
  assert.notEqual(P.chargerReach(1), 9.25);
});

test('#711 computeAim inRange follows the live charge (installed flight reach)', async () => {
  const f = await fixedBoot();
  const a = f.make('charger'), P = f.real, min = P.chargerReach(0), full = P.chargerReach(1), mid = (min + full) / 2;
  assert.equal(f.inRange(a, 0, mid), false, 'charge 0 does not reach a mid-range point');
  assert.equal(f.inRange(a, 1, mid), true, 'full charge reaches it');
  assert.equal(f.inRange(a, 0, min + .5 - 1e-6), true, 'existing +0.5 tolerance kept at min reach');
  assert.equal(f.inRange(a, 0, min + .5 + 1e-6), false);
  assert.equal(f.inRange(a, 1, full + .5 - 1e-6), true);
  assert.equal(f.inRange(a, 1, full + .5 + 1e-6), false);
  for (const c of CHARGES) {
    assert.equal(f.inRange(a, c, P.chargerReach(c) + .5 - 1e-6), true, `charge ${c} edge in`);
    assert.equal(f.inRange(a, c, P.chargerReach(c) + .5 + 1e-6), false, `charge ${c} edge out`);
  }
  let seen = false;
  for (let i = 0; i <= 200; i++) { const now = f.inRange(a, i / 200, mid); if (seen) assert.equal(now, true, 'once in range, more charge never goes out'); seen ||= now; }
  assert.equal(seen, true);
  assert.equal(f.inRange(a, 5, full + .4), true, 'charge is clamped');
  assert.equal(f.inRange(a, -5, mid), false);
});

test('#711 a squid-form charge keep reports the stored full-charge reach', async () => {
  const f = await fixedBoot();
  const a = f.make('charger'), P = f.real, mid = (P.chargerReach(0) + P.chargerReach(1)) / 2;
  a.weaponRunner.s3Stored = { charge: 1, remaining: 1 };
  assert.equal(f.inRange(a, 0, mid), true, 'stored full charge keeps full reach while submerged (live charge is 0)');
  a.weaponRunner.s3Stored = null;
  assert.equal(f.inRange(a, 0, mid), false, 'no store: live charge 0 is minimum reach');
});

test('#711 non-charger ranges are unchanged and ignore charge', async () => {
  const f = await fixedBoot();
  for (const [id, range] of [['shooter', null], ['roller', 6], ['blaster', null]]) {
    const a = f.make(id), r = range ?? (a.weapon.range || 12);
    for (const charge of [0, .6, 1]) {
      assert.equal(f.inRange(a, charge, r + .5 - 1e-6), true, `${id} charge ${charge}`);
      assert.equal(f.inRange(a, charge, r + .5 + 1e-6), false, `${id} charge ${charge}`);
    }
  }
});

test('#711 native fallback (no chargerReach) lerps rangeMin to rangeMax by charge', async () => {
  const f = await fixedBoot();
  const a = f.make('charger'), w = a.weapon, native = {};
  assert.ok(w.rangeMax > w.rangeMin);
  for (const c of [0, .25, .5, 1]) {
    const reach = w.rangeMin + (w.rangeMax - w.rangeMin) * c;
    assert.equal(f.inRange(a, c, reach + .5 - 1e-6, native), true, `charge ${c}`);
    assert.equal(f.inRange(a, c, reach + .5 + 1e-6, native), false, `charge ${c}`);
  }
  assert.equal(f.inRange(a, 0, (w.rangeMin + w.rangeMax) / 2, native), false);
  assert.equal(f.inRange(a, 1, (w.rangeMin + w.rangeMax) / 2, native), true);
});

test('negative control: main\'s composition reports inRange=true at charge 0 for the mid-range point', async () => {
  const f = await mainBoot();
  const a = f.make('charger'), P = f.real, mid = (P.chargerReach(0) + P.chargerReach(1)) / 2;
  assert.equal(f.inRange(a, 0, mid), true, 'full-charge reach is used for every charge on main');
  const fixed = await fixedBoot();
  assert.equal(fixed.inRange(fixed.make('charger'), 0, mid), false);
});

// #937: Slosher's crosshair in-range threshold is state-dependent (S3: ~14.24 grounded / ~13.67 airborne). HUD classifier only.
test('#937 Slosher reticle range is shorter airborne than grounded', async () => {
  const f = await fixedBoot();
  const a = f.make('slosher'), r = a.weapon.reticleRange;
  assert.deepEqual(r, { ground: 14.24, air: 13.67 });
  assert.ok(r.air < r.ground);
  const at = (grounded, planar) => { a.grounded = grounded; return f.inRange(a, 0, planar); };
  // Clearly inside / outside both thresholds.
  for (const g of [true, false]) {
    assert.equal(at(g, 10), true, `inside both (grounded ${g})`);
    assert.equal(at(g, 20), false, `outside both (grounded ${g})`);
  }
  // Exact edges keep the existing +0.5 tolerance, per state.
  assert.equal(at(true, r.ground + .5 - 1e-6), true);
  assert.equal(at(true, r.ground + .5 + 1e-6), false);
  assert.equal(at(false, r.air + .5 - 1e-6), true);
  assert.equal(at(false, r.air + .5 + 1e-6), false);
  // A target in the separation band is in range on the ground and out of range in the air without moving.
  const band = (r.air + r.ground) / 2 + .5;
  assert.equal(at(true, band), true, 'band target in range while grounded');
  assert.equal(at(false, band), false, 'same target out of range while airborne');
  assert.equal(at(true, band), true, 'landing restores the grounded threshold');
});

test('#937 airborne reticle range is scoped to Slosher and leaves projectile/weapon range data untouched', async () => {
  const f = await fixedBoot();
  const s = f.make('slosher');
  assert.equal(s.weapon.range, 14.5, 'projectile/bot/aim-assist range is unchanged');
  for (const id of ['shooter', 'roller', 'blaster']) {
    const a = f.make(id), r = id === 'roller' ? 6 : (a.weapon.range || 12);
    assert.equal(a.weapon.reticleRange, undefined, id);
    for (const grounded of [true, false]) {
      a.grounded = grounded;
      assert.equal(f.inRange(a, 0, r + .5 - 1e-6), true, `${id} grounded ${grounded}`);
      assert.equal(f.inRange(a, 0, r + .5 + 1e-6), false, `${id} grounded ${grounded}`);
    }
  }
});
