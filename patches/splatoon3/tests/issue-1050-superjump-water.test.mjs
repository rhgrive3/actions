import test from 'node:test';
import assert from 'node:assert/strict';
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

// Issue #1050: Super Jump ownership must not rescue an actor that is already
// inside the lethal open-water boundary (pos.y < PLAYER.fallDeathY over open
// water where groundHeight(...) === -Infinity). These tests boot the COMPLETE
// six-adapter production composition — the same chain scripts/build-inkwave.mjs
// ships: adaptRange(adaptNetworkSource(adaptQualitySource(adaptReliability(
// adaptTouchLayout(adaptSource(...))))) — and install the real Actor/NetMatch,
// so every assertion runs against composed production source, never raw public
// or a single adapter.
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.join(ROOT, 'inkwave-public');
const STEP = 1 / 60;
const LETHAL_Y = -1.45; // PLAYER.fallDeathY (inkwave-public/src/config.js:49)

function testElement(tag) {
  const el = {
    tagName: tag, children: [], style: {}, attributes: {}, animations: [], textContent: '', hidden: false,
    setAttribute(name, value) { this.attributes[name] = String(value); },
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
    classList: { add() {}, remove() {}, toggle() {} },
    animate(frames, options) {
      const animation = { frames, options, cancelled: false, cancel() { this.cancelled = true; } };
      this.animations.push(animation); return animation;
    },
  };
  return el;
}

async function boot({ floor = true, extra = [] } = {}) {
  const context = vm.createContext({ console, performance, URL, innerHeight: 720, innerWidth: 1280,
    screen: { width: 1280, height: 720, orientation: { angle: 0 } },
    document: { body: testElement('body'), documentElement: testElement('html'), createElement: tag => testElement(tag) } }), modules = new Map();
  const compose = (rel, code) => adaptRange(rel, adaptNetworkSource(rel, adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code))))));
  const load = requested => {
    let file = requested;
    if (file.startsWith(path.join(SRC, 'patches') + path.sep)) file = path.join(ROOT, path.relative(SRC, file));
    if (file.startsWith(path.join(ROOT, 'src') + path.sep)) file = path.join(SRC, path.relative(ROOT, file));
    if (modules.has(file)) return modules.get(file);
    const raw = fs.readFileSync(file, 'utf8'), rel = path.relative(SRC, file);
    const mod = new vm.SourceTextModule(compose(rel, raw), { context, identifier: file, initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; } });
    modules.set(file, mod); return mod;
  };
  const entry = new vm.SourceTextModule(`
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export { FixedClock } from './patches/splatoon3/runtime/clock.mjs';
    export { Level } from './src/world/level.js';
    export { NetMatch, NET_FLAGS } from './src/net/netmatch.js';
    export { HUD } from './src/ui/hud.js';
  `, { context, identifier: path.join(SRC, 'issue-1050-test-entry.mjs') });
  await entry.link((spec, from) => load(spec === 'three' ? path.join(SRC, 'vendor/three/build/three.module.js')
    : spec.startsWith('three/addons/') ? path.join(SRC, 'vendor/three/jsm', spec.slice(13)) : path.resolve(path.dirname(from.identifier), spec)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json')));
  const api = { ...entry.namespace.install(profile), ...entry.namespace }, { G, THREE, Physics, Level } = api;
  const single = floor ? [{ kind: 'box', min: [-100, -.5, -100], max: [100, 0, 100] }] : [];
  single.push(...extra);
  const level = new Level({ bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }, spawnPads: [[-80, 0, 0], [80, 0, 0]], spawnBarrier: 0, single, half: [] });
  Object.assign(G, { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), settings: { quality: 'high' }, actors: [], time: 0,
    level, physics: new Physics(level), mode: 'match', teamColors: [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')],
    match: { playing: () => true, canRespawn: () => false }, paint: { sample: () => 1, splat: () => 0 } });
  G.projectiles = new api.Projectiles(G.scene);
  class GameplayCharacter {
    constructor() { this.root = new THREE.Object3D(); this.color = new THREE.Color(); this.events = []; }
    _owner() { return this.actor; }
    trigger(...args) { this.events.push(args); }
    update(_dt, state) { this.lastState = state; }
    getMuzzle(out) { return out.copy(this.root.position).add(new THREE.Vector3(0, 1.05, .3)); }
    setVisible(value) { this.root.visible = value; }
    setHurt() {} setWeapon() {} dispose() {}
  }
  function make({ pos = [0, 0, 0], weapon = 'shooter', team = 0, name = 'issue-1050', isLocal = false, remote = false } = {}) {
    const a = new api.Actor({ team, name, weapon, isLocal, CharacterClass: GameplayCharacter,
      style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
    a.character.actor = a; G.actors.push(a); G.scene.add(a.character.root);
    a.remote = remote;
    a.spawnAt(new THREE.Vector3(...pos), 0); a.invuln = 0; return a;
  }
  const tick = (a, count = 1, dt = STEP) => { for (let i = 0; i < count; i++) { G.time += dt; a.update(dt); } };
  const close = () => { for (const a of G.actors) a.character.dispose(); G.projectiles.clear(); };
  return { ...api, HUD: entry.namespace.HUD, context, profile, make, tick, close };
}

const track = f => { const deaths = []; f.on('splatted', e => deaths.push({ victim: e.victim, cause: e.cause })); return deaths; };
const waterDeaths = (deaths, a) => deaths.filter(d => d.victim === a && d.cause === 'water');

test('#1050 lethal open-water admission commits the owner water splat exactly once and cannot start a jump', async t => {
  const f = await boot(); t.after(f.close);
  const deaths = track(f);
  const a = f.make({ pos: [0, -1.46, 0] });   // below fallDeathY; floor top 0 → groundHeight(...) === -Infinity
  const ok = a.superJump(new f.THREE.Vector3(10, 0, 0));
  assert.equal(ok, false, 'admission must decline a Super Jump requested inside lethal open water');
  assert.equal(a.alive, false, 'the owner water splat must commit at the request');
  assert.equal(a.superJumpState, null, 'no charge/flight state may exist for a lethal request');
  assert.equal(a.stats.deaths, 1, 'exactly one death stat');
  assert.equal(waterDeaths(deaths, a).length, 1, 'exactly one water splatted event');
  f.tick(a, 30);
  assert.equal(waterDeaths(deaths, a).length, 1, 'no repeat splat while dead');
  assert.equal(a.stats.deaths, 1);
  // Control: the identical lethal state without a jump dies through the ordinary owner.
  const b = f.make({ pos: [4, -1.46, 0] });
  f.tick(b);
  assert.equal(b.alive, false, 'ordinary water hazard still commits');
  assert.equal(b.stats.deaths, 1);
  assert.equal(waterDeaths(deaths, b).length, 1);
});

test('#1050 wall-supported charge below the lethal boundary cannot rescue the actor to a safe target', async t => {
  const f = await boot({ extra: [{ kind: 'box', min: [2, -10, -10], max: [3, 20, 10] }] }); t.after(f.close);
  const deaths = track(f);
  const a = f.make({ pos: [1.7, -1.46, 0] });  // under water beside a wall face that reaches below the boundary
  a.climbing = true; a.wallN.set(-1, 0, 0);   // admission captures wallSupport → prepareSuperJump's wall early return
  let landed = 0; const offLand = f.on('superjump:land', e => { if (e.actor === a) landed++; });
  t.after(() => offLand && offLand());
  const ok = a.superJump(new f.THREE.Vector3(10, 0, 0));
  f.tick(a, 60 * 5);                          // enough time for charge + flight + landing if an escape existed
  assert.equal(a.alive, false, 'a wall-supported charge must not rescue an actor already inside lethal open water');
  assert.equal(a.stats.deaths, 1, 'exactly one death stat');
  assert.equal(waterDeaths(deaths, a).length, 1, 'exactly one water splatted event');
  assert.equal(a.superJumpState, null, 'the jump state is retired by the owner splat');
  assert.equal(landed, 0, 'the actor must never land alive at the target');
  assert.equal(ok, false, 'the lethal request itself must be declined');
});

test('#1050 charge-phase water crossing commits one owner splat with water cause', async t => {
  const f = await boot({ floor: false }); t.after(f.close);
  const deaths = track(f);
  const a = f.make({ pos: [0, 30, 0] });
  a.s3.jumpChargeTime = STEP; a.vel.y = -8;
  assert.equal(a.superJump(new f.THREE.Vector3(10, 0, 0)), true, 'admission above the boundary is legal');
  let guard = 0;
  while (a.alive && a.superJumpState && guard++ < 600) f.tick(a);
  assert.equal(a.alive, false, 'the falling charge still reaches the shared water owner');
  assert.equal(a.stats.deaths, 1);
  assert.equal(waterDeaths(deaths, a).length, 1, 'one water splat for the charge crossing');
  assert.equal(a.superJumpState, null);
  assert.equal(a.superJumpGround, null);
  // Control: the same fall without a jump also dies exactly once.
  const b = f.make({ pos: [8, 30, 0] });
  guard = 0; while (b.alive && guard++ < 600) f.tick(b);
  assert.equal(b.alive, false);
  assert.equal(waterDeaths(deaths, b).length, 1);
});

const injectFlight = (f, a, t0) => {
  a.pos.set(0, 2, 0); a.vel.set(0, 0, 0); a.grounded = false;
  a.superJumpState = { phase: 'flight', t: t0, dur: 1.2, from: new f.THREE.Vector3(0, 2, 0),
    to: new f.THREE.Vector3(10, 0, 0), marker: 0, wallSupport: null, startForm: 'kid', target: null };
};

test('#1050 early-flight crossing of the lethal boundary commits one owner water splat', async t => {
  const f = await boot(); t.after(f.close);
  const deaths = track(f);
  const a = f.make({ pos: [0, 2, 0] });
  injectFlight(f, a, 0.01);
  a.pos.y = -1.46;                             // crossing just after launch
  let landed = 0; const offLand = f.on('superjump:land', e => { if (e.actor === a) landed++; });
  t.after(() => offLand && offLand());
  f.tick(a);
  assert.equal(a.alive, false, 'early flight must not survive a lethal crossing');
  assert.equal(a.stats.deaths, 1);
  assert.equal(waterDeaths(deaths, a).length, 1);
  assert.equal(a.superJumpState, null);
  f.tick(a, 10);
  assert.equal(waterDeaths(deaths, a).length, 1, 'no double splat afterwards');
  assert.equal(landed, 0, 'no landing event after the hazard commits');
});

test('#1050 mid-flight crossing of the lethal boundary commits one owner water splat', async t => {
  const f = await boot(); t.after(f.close);
  const deaths = track(f);
  const a = f.make({ pos: [0, 2, 0] });
  injectFlight(f, a, 0.6);                     // t = 0.5 * dur with a safe start
  f.tick(a);                                   // advance over safe terrain
  assert.equal(a.alive, true, 'the safe first flight step is unchanged');
  a.pos.y = -1.46;                             // forced crossing at k ≈ 0.5
  let landed = 0; const offLand = f.on('superjump:land', e => { if (e.actor === a) landed++; });
  t.after(() => offLand && offLand());
  f.tick(a);
  assert.equal(a.alive, false, 'mid flight must not survive a lethal crossing');
  assert.equal(a.stats.deaths, 1);
  assert.equal(waterDeaths(deaths, a).length, 1);
  assert.equal(a.superJumpState, null);
  assert.equal(landed, 0);
});

test('#1050 late-flight crossing of the lethal boundary commits one owner water splat before landing', async t => {
  const f = await boot(); t.after(f.close);
  const deaths = track(f);
  const a = f.make({ pos: [0, 2, 0] });
  injectFlight(f, a, 1.17);                    // one safe frame before the landing frame at k = 1
  let landed = 0; const offLand = f.on('superjump:land', e => { if (e.actor === a) landed++; });
  t.after(() => offLand && offLand());
  f.tick(a);
  assert.equal(a.alive, true, 'the safe pre-crossing step is unchanged');
  a.pos.y = -1.46;                             // forced crossing on the landing frame
  f.tick(a);
  assert.equal(a.alive, false, 'late flight must not land the actor out of a lethal position');
  assert.equal(a.stats.deaths, 1);
  assert.equal(waterDeaths(deaths, a).length, 1);
  assert.equal(a.superJumpState, null);
  assert.equal(landed, 0, 'the hazard commits before any landing');
});

test('#1050 dry low terrain below sea level and a normal jump stay unchanged', async t => {
  const f = await boot({ extra: [{ kind: 'box', min: [8, -2, 8], max: [20, -1.5, 20] }] }); t.after(f.close);
  const deaths = track(f);
  // Dry trench: y < fallDeathY but groundHeight(...) !== -Infinity → safe.
  const a = f.make({ pos: [14, -1.46, 14] });
  assert.equal(a.superJump(new f.THREE.Vector3(0, 0, 0)), true, 'a dry position below sea level may start a jump');
  let guard = 0, sawLethalY = false;
  while (a.superJumpState && guard++ < 1200) { f.tick(a); if (a.alive && a.pos.y < LETHAL_Y) sawLethalY = true; }
  assert.equal(a.alive, true, 'dry low terrain is never splatted');
  assert.equal(a.stats.deaths, 0);
  assert.equal(deaths.length, 0);
  assert.equal(a.grounded, true, 'the jump landed on safe terrain');
  assert.ok(sawLethalY, 'the trajectory genuinely stayed below sea level for part of the jump');
  // Normal grounded control on dry high ground.
  const b = f.make({ pos: [0, 0, 0] });
  assert.equal(b.superJump(new f.THREE.Vector3(10, 0, 0)), true);
  guard = 0;
  while (b.superJumpState && guard++ < 1200) f.tick(b);
  assert.equal(b.alive, true);
  assert.equal(b.stats.deaths, 0);
  assert.equal(b.grounded, true, 'the normal jump trajectory/landing is preserved');
});

test('#1050 outcomes hold at 30/60/120 Hz fixed-step rendering and for remote-owned actors', async t => {
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
    const f = await boot(); t.after(f.close);
    const deaths = track(f);
    // Lethal admission at this render rate.
    const a = f.make({ pos: [0, -1.46, 0] });
    assert.equal(a.superJump(new f.THREE.Vector3(10, 0, 0)), false, `${1 / dt}Hz lethal admission declined`);
    assert.equal(a.alive, false, `${1 / dt}Hz lethal admission splats`);
    assert.equal(a.stats.deaths, 1, `${1 / dt}Hz exactly one death`);
    assert.equal(waterDeaths(deaths, a).length, 1, `${1 / dt}Hz one water event`);
    f.tick(a, 20, dt);
    assert.equal(waterDeaths(deaths, a).length, 1, `${1 / dt}Hz no repeat splat`);
    // Normal jump at this render rate keeps the same outcome.
    const b = f.make({ pos: [0, 0, 0] });
    assert.equal(b.superJump(new f.THREE.Vector3(10, 0, 0)), true, `${1 / dt}Hz normal admission accepted`);
    let guard = 0;
    while (b.superJumpState && guard++ < 3000) f.tick(b, 1, dt);
    assert.equal(b.alive, true, `${1 / dt}Hz normal jump survives`);
    assert.equal(b.grounded, true, `${1 / dt}Hz normal jump lands`);
    assert.equal(b.stats.deaths, 0, `${1 / dt}Hz normal jump never dies`);
    // Remote-owned actor obeys the identical owner rule.
    const r = f.make({ pos: [4, -1.46, 0], remote: true });
    assert.equal(r.superJump(new f.THREE.Vector3(10, 0, 0)), false, `${1 / dt}Hz remote lethal admission declined`);
    assert.equal(r.alive, false, `${1 / dt}Hz remote lethal admission splats once`);
    assert.equal(r.stats.deaths, 1, `${1 / dt}Hz remote exactly one death`);
    assert.equal(waterDeaths(deaths, r).length, 1, `${1 / dt}Hz remote one water event`);
  }
});
