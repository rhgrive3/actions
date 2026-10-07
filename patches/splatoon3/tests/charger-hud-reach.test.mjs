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
import { advanceFidelityProjectile, splatlingLaunchSpeed } from '../runtime/weapons-fidelity.mjs';
// #711: Charger HUD inRange must follow the live charge's flight reach, not full-charge reach.
// Logic-only: real composed player.js/weapons.js + the full splatoon3 install on the VM. Not a browser or Switch comparison.
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.join(ROOT, 'inkwave-public');
const STEP = 1 / 60;
const ORIGINAL_RANGE = "    const range = w.kind === 'charger' ? w.rangeMax : w.kind === 'roller' ? 6 : (w.range || 12);\n";

// main: reproduce origin/main's player.js (full-charge reach) by reverting only the #711 lines of the composed source.
async function boot({ main = false } = {}) {
  const math = Object.create(Math);
  const context = vm.createContext({ console, performance, URL, innerHeight: 720, Math: math }), modules = new Map();
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
    G.projectiles = projectiles;
    G.camera.position.set(0, 1.3, 0); G.camera.lookAt(10, 1.3, 0); G.camera.updateMatrixWorld(true);
    G.physics.raycast = (_s, _d, _m, hit) => { hit.hit = true; hit.dist = Math.sqrt(planar * planar - 1.3 * 1.3); return hit; };
    actor.weaponRunner.charge = charge;
    const controller = new api.PlayerController(actor, null, null);
    controller.computeAim();
    assert.ok(Math.abs(actor.aimPoint.distanceTo(actor.pos) - planar) < 1e-9, 'aim point sits exactly at the requested distance');
    return controller.inRange;
  }
  const close = () => { for (const a of G.actors) a.character.dispose(); real.clear(); };
  return { ...api, make, inRange, close, composed, real, math };
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
  assert.match(f.composed.player, /a\.weaponRunner\?\.s3Stored\?\.charge \?\? a\.weaponRunner\?\.charge \?\? 0/);
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

test('#858 Splatling HUD reach follows the released charge snapshot and expires with its stream', async () => {
  const f = await fixedBoot(), a = f.make('splatling'), P = f.real;
  const circle = a.weapon.firstChargeTime / a.weapon.chargeTime;
  function actualForwardReach(charge) {
    const random = f.math.random;
    try {
      f.math.random = () => .5; // neutralize the installed speed bias and launch decoration draws
      a.aimDir.set(0, 0, 1);
      a.aimPoint.copy(a.pos).add(a.aimDir); // under 2 units: native _fireRound keeps the forward direction
      a.weaponRunner.charge = charge;
      a.weaponRunner.fidelitySplatlingCharge = charge;
      const before = f.real.list.length;
      f.real.fireSplatling(a, a.weapon, 0);
      assert.equal(f.real.list.length, before + 1, 'the production fire path emits one real reference projectile');
      const p = f.real.list.at(-1), start = p.pos.clone();
      assert.equal(p.life, 1.2, 'public _fireRound lifetime is copied without changing its owner');
      assert.equal(p.straight, a.weapon.straightTime, 'production uses the configured straight phase');
      assert.equal(p.fidelityMove.endSpeed, a.weapon.ballistics.endSpeed, 'production uses the configured brake speed cap');
      assert.ok(Math.abs(p.vel.length() - splatlingLaunchSpeed(a.weapon, charge)) < 1e-9,
        'the production launch uses the same deterministic no-random speed');
      while (p.age < p.life - 1e-10) {
        const step = Math.min(STEP, p.life - p.age);
        advanceFidelityProjectile(p, step);
      }
      return Math.hypot(p.pos.x - start.x, p.pos.z - start.z);
    } finally {
      f.math.random = random;
    }
  }
  const lowFlight = actualForwardReach(0), firstFlight = actualForwardReach(circle), higherFlight = actualForwardReach(.9);
  const lowReach = P.splatlingReach(a.weapon, 0), firstReach = P.splatlingReach(a.weapon, circle);
  assert.ok(Math.abs(lowReach - lowFlight) < 1e-9, 'HUD helper endpoint matches an actual minimum-charge projectile');
  assert.ok(Math.abs(firstReach - firstFlight) < 1e-9, 'HUD helper endpoint matches an actual first-circle projectile');
  assert.ok(Math.abs(P.splatlingReach(a.weapon, .9) - higherFlight) < 1e-9,
    'HUD helper follows the production first-charge speed cap above the circle');
  const mid = (lowReach + Math.min(firstReach, a.weapon.range + .5)) / 2;
  assert.ok(lowReach < firstReach);
  assert.ok(Math.abs(firstReach - higherFlight) < 1e-9, 'higher charge keeps the first-circle launch-speed cap');
  assert.equal(P.splatlingReach(a.weapon, NaN), lowReach, 'invalid charge uses the deterministic minimum');

  const guideProjectile=P._s3SplatlingReachProjectile, advance=guideProjectile.pos.addScaledVector;
  let guideSteps=0;
  guideProjectile.pos.addScaledVector=function(...args){guideSteps++;return advance.apply(this,args);};
  try {
    const births=P.list.length;
    for(let i=0;i<60;i++)assert.equal(P.splatlingReach(a.weapon,0),lowReach);
    assert.equal(guideSteps,0,'steady charge reuses the exact nominal flight result');
    assert.equal(P.list.length,births,'HUD reach does not emit gameplay projectiles');
    assert.equal(P.splatlingReach(a.weapon,circle),firstReach);
    assert.ok(guideSteps>0,'changed charge recomputes the installed flight');
    guideSteps=0;
    const changed={...a.weapon,straightTime:a.weapon.straightTime+STEP};
    assert.ok(Number.isFinite(P.splatlingReach(changed,circle)));
    assert.ok(guideSteps>0,'changed flight inputs invalidate the memoized result');
  } finally {guideProjectile.pos.addScaledVector=advance;}

  const main = await mainBoot(), baseline = main.make('splatling');
  assert.equal(main.inRange(baseline, 0, mid), true, 'baseline fixed w.range reports this target in range at low charge');
  assert.equal(main.inRange(baseline, circle, mid), true, 'baseline fixed w.range gives the same result at first circle');
  assert.equal(f.inRange(a, 0, mid), false, 'low charge cannot reach the fixed target');
  assert.equal(f.inRange(a, circle, mid), true, 'first-circle charge reaches the same target');
  const insideBoth = Math.max(0, lowFlight - 2), beyondBoth = firstFlight + 3;
  assert.equal(f.inRange(a, 0, insideBoth), true, 'a target clearly inside both native-flight extents remains in range');
  assert.equal(f.inRange(a, circle, insideBoth), true);
  assert.equal(f.inRange(a, 0, beyondBoth), false, 'a target beyond both native-flight extents remains out of range');
  assert.equal(f.inRange(a, circle, beyondBoth), false);

  a.weaponRunner.streaming = false;
  a.weaponRunner.charging = false;
  a.weaponRunner.cooldown = 0;
  a.weaponRunner._splatling(1 / 60, { fire: true }, a.weapon); // consume the installed 1F startup owner
  a.weaponRunner._splatling(a.weapon.firstChargeTime, { fire: true }, a.weapon);
  assert.ok(Math.abs(a.weaponRunner.charge - circle) < 1e-9, 'real split owner reaches the first-circle charge');
  a.weaponRunner.fidelitySplatlingCharge = null;
  a.weaponRunner._splatling(1 / 60, { fire: false }, a.weapon);
  assert.equal(a.weaponRunner.streaming, true);
  assert.equal(a.weaponRunner.fidelitySplatlingCharge, circle, 'release snapshot is captured by the installed runner');
  assert.equal(f.inRange(a, 0, mid), true, 'HUD uses the same release snapshot while shots stream');

  const isolated = f.make('splatling');
  assert.equal(f.inRange(isolated, 0, mid), false, 'another Actor does not inherit the released charge');
  a.weaponRunner.burstT = 1 / 120;
  a.weaponRunner._splatling(1 / 60, { fire: false }, a.weapon);
  assert.equal(a.weaponRunner.streaming, false);
  assert.equal(f.inRange(a, 0, mid), false, 'completed stream ignores its retained snapshot');

  const shooter = f.make('shooter');
  assert.equal(f.inRange(shooter, 1, shooter.weapon.range), true, 'Shooter keeps its configured range');
  const charger = f.make('charger'), chargerMid = (P.chargerReach(0) + P.chargerReach(1)) / 2;
  assert.equal(f.inRange(charger, 0, chargerMid), false, 'Charger still uses its installed minimum-charge flight reach');
  assert.equal(f.inRange(charger, 1, chargerMid), true, 'Charger still uses its installed full-charge flight reach');
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
