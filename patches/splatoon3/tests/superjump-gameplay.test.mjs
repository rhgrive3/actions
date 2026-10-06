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
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const BUILT = process.env.INKWAVE_SUPERJUMP_SITE;
const SRC = BUILT ? path.resolve(BUILT) : path.join(ROOT, 'inkwave-public');
const STEP = 1 / 60;
const plain = value => JSON.parse(JSON.stringify(value));

// Same source composition and installer as build-inkwave, including all motion
// hooks and native Character/Physics/Runner/Projectiles. With
// INKWAVE_SUPERJUMP_SITE this executes emitted/minified files. No GPU claim.
async function boot({ floor = true, grate = false, wall = false } = {}) {
  const context = vm.createContext({ console, performance, URL, innerHeight: 720 }), modules = new Map();
  const load = requested => {
    let file = requested;
    if (!BUILT && file.startsWith(path.join(SRC, 'patches') + path.sep)) file = path.join(ROOT, path.relative(SRC, file));
    if (!BUILT && file.startsWith(path.join(ROOT, 'src') + path.sep)) file = path.join(SRC, path.relative(ROOT, file));
    if (modules.has(file)) return modules.get(file);
    const raw = fs.readFileSync(file, 'utf8'), rel = path.relative(SRC, file);
    const source = BUILT ? raw : adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, raw))));
    const mod = new vm.SourceTextModule(source, { context, identifier: file, initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; } });
    modules.set(file, mod); return mod;
  };
  const entry = new vm.SourceTextModule(`
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export { FixedClock } from './patches/splatoon3/runtime/clock.mjs';
    export { Level } from './src/world/level.js';
    export { NetMatch, NET_FLAGS } from './src/net/netmatch.js';
  `, { context, identifier: path.join(SRC, 'superjump-test-entry.mjs') });
  await entry.link((spec, from) => load(spec === 'three' ? path.join(SRC, 'vendor/three/build/three.module.js')
    : spec.startsWith('three/addons/') ? path.join(SRC, 'vendor/three/jsm', spec.slice(13)) : path.resolve(path.dirname(from.identifier), spec)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(BUILT ? SRC : ROOT, 'patches/splatoon3/profile.json')));
  const api = { ...entry.namespace.install(profile), ...entry.namespace }, { G, THREE, Physics, Level } = api;
  const single = floor ? [{ kind: 'box', min: [-100, -.5, -100], max: [100, 0, 100], grate }] : [];
  if (wall) single.push({ kind: 'box', min: [2, 0, -10], max: [3, 20, 10] });
  const level = new Level({ bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }, spawnPads: [[-80, 0, 0], [80, 0, 0]], spawnBarrier: 0, single, half: [] });
  Object.assign(G, { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), settings: { quality: 'high' }, actors: [], time: 0,
    level, physics: new Physics(level), mode: 'match', teamColors: [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')],
    match: { playing: () => true, canRespawn: () => false }, paint: { sample: () => 1, splat: () => 0 } });
  G.projectiles = new api.Projectiles(G.scene);
  function make({ pos = [0, 0, 0], weapon = 'shooter', team = 0, isLocal = false, remote = false } = {}) {
    const a = new api.Actor({ team, name: 'superjump regression', weapon, isLocal, CharacterClass: api.Character,
      style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
    a.character.actor = a; G.actors.push(a); G.scene.add(a.character.root);
    a.remote = remote;
    a.spawnAt(new THREE.Vector3(...pos), 0); a.invuln = 0; return a;
  }
  const tick = (a, count = 1) => { for (let i = 0; i < count; i++) { G.time += STEP; a.update(STEP); } };
  const close = () => { for (const a of G.actors) a.character.dispose(); G.projectiles.clear(); };
  return { ...api, profile, make, tick, close };
}

for (const grate of [false, true]) test(`#215 grounded ${grate ? 'grate' : 'floor'} preparation launches at the charge boundary`, async t => {
  const f = await boot({ grate }); t.after(f.close); const a = f.make();
  // A spawned Actor is humanoid, so #708's initial-form term precedes the 80F charge wait.
  const startup = a.s3.jumpStartupHumanoidF;
  assert.equal(a.grounded, true); a.superJump(new f.THREE.Vector3(10, 0, 0));
  f.tick(a, 79 + startup); assert.equal(a.superJumpState.phase, 'charge'); assert.ok(Math.abs(a.pos.y) < 1e-9);
  f.tick(a); assert.equal(a.superJumpState.phase, 'flight'); assert.equal(a.grounded, false);
});

test('#215 falling preparation continues physics, dies over water, or waits for actual support with shortened charge', async t => {
  const f = await boot({ floor: false }); t.after(f.close); const a = f.make({ pos: [0, 30, 0] });
  a.s3.jumpChargeTime = STEP; a.vel.y = -8; a.superJump(new f.THREE.Vector3(10, 0, 0));
  f.tick(a); assert.ok(a.pos.y < 30 && a.vel.y < -8); assert.equal(a.superJumpState.phase, 'charge');
  f.tick(a, 120); assert.equal(a.alive, false); assert.equal(a.superJumpState, null); assert.equal(a.superJumpGround, null);
  const g = await boot(); t.after(g.close); const b = g.make({ pos: [0, 30, 0] });
  b.s3.jumpChargeTime = STEP; b.vel.y = -8; b.superJump(new g.THREE.Vector3(10, 0, 0));
  g.tick(b); assert.equal(b.superJumpState.phase, 'charge');
  let waited = 1; while (b.superJumpState.phase === 'charge' && waited++ < 180) g.tick(b);
  assert.ok(waited > 1 && waited < 180); assert.equal(b.superJumpState.phase, 'flight'); assert.ok(Math.abs(b.superJumpState.from.y) < 1e-9);
});

test('#215 inked wall supports preparation; lost wall ink resumes falling', async t => {
  const f = await boot({ wall: true }); t.after(f.close);
  for (const painted of [true, false]) {
    const a = f.make({ pos: [1.7, 5, 0] }); a.climbing = true; a.wallN.set(-1, 0, 0); a.form = 'squid';
    f.G.paint.sample = () => painted ? 1 : 2; a.s3.jumpChargeTime = STEP;
    a.superJump(new f.THREE.Vector3(-10, 0, 0)); f.tick(a, 1 + a.s3.jumpStartupSwimF);
    assert.equal(a.superJumpState.phase, painted ? 'flight' : 'charge');
    assert.equal(a.pos.y === 5, painted);
  }
});

test('#216 last real ground is retained across wall heights/air motion, updated on landing, and cleared on death/reset', async t => {
  const f = await boot(); t.after(f.close); const target = f.make({ pos: [10, 0, 0] });
  for (const y of [1, 12]) {
    target.pos.set(14, y, 3); target.grounded = false; target.climbing = true;
    const a = f.make(); a.s3.jumpChargeTime = STEP; a.superJump(target); f.tick(a);
    assert.ok(a.superJumpState.to.distanceTo(new f.THREE.Vector3(10, 0, 0)) < 1e-9);
  }
  target.climbing = false; target.pos.set(20, .01, 0); target.vel.y = -1; target._resolve(false, .1, false);
  const a = f.make(); a.s3.jumpChargeTime = STEP; a.superJump(target); f.tick(a);
  assert.ok(a.superJumpState.to.distanceTo(new f.THREE.Vector3(20, 0, 0)) < 1e-9);
  target.splat(null, 'water'); assert.equal(target.superJumpGround, null);
  target.spawnAt(new f.THREE.Vector3(30, 5, 0), 0); assert.equal(target.superJumpGround, null);
  const b = f.make(); b.s3.jumpChargeTime = STEP; b.superJump(target); f.tick(b); assert.equal(b.superJumpState, null);
});

for (const frames of [138, 96]) for (const distance of [2, 70]) test(`#255 flight-only authority rejects every damage source: ${frames}F, ${distance}WU`, async t => {
  const f = await boot(); t.after(f.close); const a = f.make(), enemy = f.make({ team: 1 });
  a.s3.jumpChargeTime = STEP; a.s3.jumpFlightTime = frames / 60; a.superJump(new f.THREE.Vector3(distance, 0, 0));
  f.G.projectiles.applyHit(enemy, a, 36, 'shooter'); assert.equal(a.hp, 64); a.hp = 100;
  f.tick(a, 1 + a.s3.jumpStartupHumanoidF); assert.equal(a.superJumpState.phase, 'flight');
  const nm = Object.create(f.NetMatch.prototype); nm.byNid = new Map([[1, a], [2, enemy]]); nm.peers = new Map(); nm.s = { myId: 'owner' }; nm.myId = 'owner';
  a.owner = enemy.owner = 'owner'; f.G.netm = nm;
  let hitSeq = 0;
  const hit = source => nm._hit({ v: 1, a: 2, d: 36, w: source, l: a.netLife, h: ++hitSeq }, 'owner');
  for (let i = 0; i < frames; i++) {
    for (const source of ['shooter', 'charger', 'bomb', 'storm', 'ink']) hit(source);
    assert.equal(a.hp, 100); f.tick(a);
  }
  assert.equal(a.superJumpState, null); assert.equal(a.invuln, 0);
  hit('shooter'); assert.equal(a.hp, 64);
});

for (const weapon of ['shooter', 'blaster']) test(`#218 ${weapon} fires before landing, respects windup, ink and main-only admission`, async t => {
  const f = await boot(); t.after(f.close); const a = f.make({ weapon });
  a.s3.jumpChargeTime = STEP; a.intent.fire = a.intent.sub = a.intent.special = true; a.special = a.specialCost();
  const shots = []; const native = f.G.projectiles[weapon === 'shooter' ? 'fireShooter' : 'fireBlaster'];
  f.G.projectiles[weapon === 'shooter' ? 'fireShooter' : 'fireBlaster'] = function (...args) { shots.push({ tick: a.superJumpState?.t / STEP, pos: plain(a.pos.toArray()), phase: a.superJumpState?.phase }); return native.apply(this, args); };
  let bombs = 0; f.G.projectiles.throwBomb = () => bombs++;
  a.superJump(new f.THREE.Vector3(20, 0, 0)); f.tick(a, 114 + a.s3.jumpStartupHumanoidF); assert.equal(shots.length, 0);
  f.tick(a, 24); assert.ok(shots.length > 0); assert.equal(shots[0].phase, 'flight'); assert.ok(shots[0].pos[1] > 0);
  if (weapon === 'blaster') assert.ok(shots[0].tick >= 123, 'runner retains native windup');
  assert.equal(bombs, 0); assert.equal(a.specialActive, null);
  const b = f.make({ weapon }); b.ink = 0; b.intent.fire = true; b.s3.jumpChargeTime = STEP;
  const before = shots.length; b.superJump(new f.THREE.Vector3(20, 0, 0)); f.tick(b, 138); assert.equal(shots.length, before);
});

test('30/60/120Hz frames have identical support, flight, damage, shots, landing and post-landing cadence', async t => {
  let expected;
  for (const hz of [30, 60, 120]) {
    const f = await boot(); t.after(f.close); const a = f.make({ pos: [0, 6, 0] });
    a.s3.jumpChargeTime = 20 / 60; a.s3.jumpFlightTime = 96 / 60; a.intent.fire = true;
    a.superJump(new f.THREE.Vector3(20, 0, 0));
    const clock = new f.FixedClock(), rows = []; let shotCount = 0;
    f.G.projectiles.fireShooter = () => shotCount++;
    for (let frame = 0; frame < hz * 4; frame++) clock.advance(1 / hz, dt => {
      f.G.time += dt; a.update(dt);
      rows.push([a.pos.toArray(), a.superJumpState?.phase ?? null, a.grounded, a.hp, a.ink, shotCount, a.weaponRunner.cooldown]);
    });
    const result = plain(rows); if (expected) assert.deepEqual(result, expected); else expected = result;
    assert.ok(shotCount > 2); assert.equal(a.superJumpState, null);
  }
});

for (const mutation of ['move', 'splat', 'reset']) test(`#362 confirmation locks destination before teammate ${mutation}`, async t => {
  const f = await boot(); t.after(f.close); const a = f.make(), target = f.make({pos:[10,0,7]});
  assert.equal(a.superJump(target), true);
  const committed = plain(a.superJumpState.to.toArray());
  assert.ok(a.superJumpState.to.distanceTo(new f.THREE.Vector3(10,0,7)) < 1e-9);
  assert.notEqual(a.superJumpState.target,target);
  if(mutation==='move') target.pos.set(30,0,25);
  if(mutation==='splat') target.splat(null,'water');
  if(mutation==='reset') target.spawnAt(new f.THREE.Vector3(30,0,25),0);
  f.tick(a,80 + a.s3.jumpStartupHumanoidF); assert.equal(a.superJumpState.phase,'flight');
  assert.deepEqual(plain(a.superJumpState.to.toArray()),committed);
});

test('#362 rejects invalid targets before changing actor state or emitting a charge', async t => {
  const f=await boot();t.after(f.close);const a=f.make(),dead=f.make(),enemy=f.make({team:1}),air=f.make({pos:[20,5,0]});
  dead.splat(null,'water');let charges=0;f.on('superjump',({actor,phase})=>{if(actor===a&&phase==='charge')charges++;});
  for(const target of [dead,enemy,air,a,null,{},new f.THREE.Vector3(NaN,0,0)]) {
    assert.equal(a.superJump(target),false);assert.equal(a.superJumpState,null);assert.equal(a.form,'kid');
  }
  assert.equal(charges,0);
});

test('#362 fixed spawn points snapshot immediately; own death still cancels committed jump', async t => {
  const f=await boot();t.after(f.close);const a=f.make(),point=new f.THREE.Vector3(25,0,8);
  assert.equal(a.superJump(point),true);point.set(90,0,90);
  assert.deepEqual(plain(a.superJumpState.to.toArray()),[25,0,8]);
  a.splat(null,'water');assert.equal(a.superJumpState,null);
});

test('#362 30/60/120Hz preserve one committed destination and flight announcement', async t => {
  let expected;
  for(const hz of [30,60,120]) {
    const f=await boot();t.after(f.close);const a=f.make(),target=f.make({pos:[10,0,7]}),clock=new f.FixedClock(),trace=[],events=[];
    f.on('superjump',({actor,phase,to})=>{if(actor===a)events.push([phase,to?plain(to.toArray()):null]);});
    a.superJump(target);const committed=plain(a.superJumpState.to.toArray());
    for(let i=0;i<hz*2;i++)clock.advance(1/hz,dt=>{
      target.pos.x+=.1;if(clock.ticks===20)target.splat(null,'water');
      a.update(dt);trace.push([a.superJumpState?.phase,plain(a.superJumpState?.to.toArray() ?? null),plain(a.pos.toArray())]);
    });
    const result=plain({trace,events});if(expected)assert.deepEqual(result,expected);else expected=result;
    assert.deepEqual(events,[['charge',null],['flight',committed]]);
    assert.ok(new f.THREE.Vector3(...committed).distanceTo(new f.THREE.Vector3(10,0,7)) < 1e-9);
  }
});

test('#645 ordinary landing and special-owned paint controls', async t => {
  const f = await boot(); t.after(f.close);
  for (const { ground, remote } of [
    { ground: 'unpainted', remote: false },
    { ground: 'enemy', remote: false },
    { ground: 'enemy', remote: true },
  ]) {
    await t.test(`${remote ? 'remote Actor' : 'owner path'} lands on ${ground} without paint, turf or SP and retains feedback`, () => {
      const a = f.make({ team: 0, isLocal: false, remote });
      a.s3.jumpChargeTime = STEP; a.s3.jumpFlightTime = 96 * STEP;
      let paintCalls = 0, turfEvents = 0, bursts = 0, lands = 0, shakes = 0;
      f.G.paint.sample = () => ground === 'enemy' ? 2 : 0;
      f.G.paint.splat = () => { paintCalls++; return 10; };
      const previousFx = f.G.fx;
      f.G.fx = { burst: () => bursts++, ring: () => {} };
      const unsubscribe = [f.on('turf', () => turfEvents++),
        f.on('superjump:land', () => lands++), f.on('shake', () => shakes++)];
      const initialTurf = a.stats.turf, initialSpecial = a.special;
      try {
        assert.equal(a.superJump(new f.THREE.Vector3(20, 0, 0)), true);
        // One shortened charge frame plus the existing humanoid startup owns
        // preparation; then this case uses an exact 96F flight.
        f.tick(a, 1 + a.s3.jumpStartupHumanoidF);
        assert.equal(a.superJumpState.phase, 'flight');
        assert.equal(paintCalls, 0);
        f.tick(a, 96);
        assert.equal(a.superJumpState, null, 'landing completes');
        assert.equal(paintCalls, 0, 'ordinary landing paints no ink');
        assert.equal(a.stats.turf, initialTurf, 'no personal turf credit');
        assert.equal(a.special, initialSpecial, 'no special gauge credit');
        assert.equal(turfEvents, 0, 'no turf events');
        assert.ok(bursts > 0, 'landing VFX remains');
        assert.equal(lands, 1, 'exactly one landing event');
        assert.equal(shakes, 0, 'nonlocal Actor does not shake local screen');
        assert.equal(a.form, 'kid');
      } finally { for (const off of unsubscribe) off(); f.G.fx = previousFx; }
    });
  }
  await t.test('special-owned _slamImpact still paints and awards turf without special gain', () => {
    const a = f.make({ team: 0 }); let paintCalls = 0;
    f.G.paint.splat = () => { paintCalls++; return 12; };
    const initialTurf = a.stats.turf, initialSpecial = a.special;
    a._slamImpact({ radius: 4.5 });
    assert.equal(paintCalls, 10, 'one center plus nine radial splats');
    assert.ok(a.stats.turf > initialTurf);
    assert.equal(a.special, initialSpecial);
  });
});

// #744: Super Jump charge stays damageable (#255 protects flight only), so it
// must keep the shared post-movement resource phase. Flight still skips it.
test('#744 charge in enemy ink runs the resource phase exactly once per tick; flight skips it', async t => {
  const f = await boot(); t.after(f.close); f.G.paint.sample = () => 2;
  const a = f.make(), control = f.make({ pos: [0, 0, 30] });
  const dps = 18, cap = 40, recovery = 30;
  f.tick(a); f.tick(control);
  assert.ok(Math.abs(a.s3.enemyInkTime - STEP) < 1e-9 && Math.abs(a.hp - (100 - dps * STEP)) < 1e-9, 'ordinary baseline tick');
  assert.equal(a.superJump(new f.THREE.Vector3(40, 0, 0)), true);
  const chargeFrames = Math.round(a.s3.jumpChargeTime / STEP) + a.s3.jumpStartupHumanoidF;
  for (let charge = 1; charge < chargeFrames; charge++) {
    const before = a.s3.enemyInkTime;
    f.tick(a); f.tick(control);
    assert.equal(a.superJumpState.phase, 'charge');
    assert.ok(Math.abs(a.s3.enemyInkTime - before - STEP) < 1e-9, `charge tick ${charge} advanced exposure exactly once`);
  }
  // Same exposure, damage and cap progression as an ordinary actor standing in the same ink.
  assert.ok(Math.abs(a.s3.enemyInkTime - control.s3.enemyInkTime) < 1e-9);
  assert.ok(Math.abs(a.damageFromInk - control.damageFromInk) < 1e-9);
  assert.ok(Math.abs(a.hp - control.hp) < 1e-9);
  assert.ok(Math.abs(a.damageFromInk - Math.min(cap, chargeFrames * dps * STEP)) < 1e-9, 'current startup plus charge stay vulnerable at 0 AP');
  // Takeoff tick: like an ordinary jump, the airborne actor leaves enemy ink (exposure resets, no damage).
  const hpBefore = a.hp, inkDamage = a.damageFromInk;
  f.tick(a);
  assert.equal(a.superJumpState.phase, 'flight');
  assert.equal(a.hp, hpBefore); assert.equal(a.onEnemy, false);
  assert.ok(Math.abs(a.s3.enemyInkAwayTime - Math.min(f.profile.resources.enemyInkGraceReset || 0, STEP)) < 1e-9,
    'takeoff respects the current contact-grace reset owner');
  assert.ok(Math.abs(a.damageFromInk - (inkDamage - recovery * STEP)) < 1e-9);
  const flightHp = a.hp, flightInkDamage = a.damageFromInk, flightInk = a.ink;
  while (a.superJumpState) {
    f.tick(a);
    if (!a.superJumpState) break;
    assert.equal(a.hp, flightHp); assert.equal(a.damageFromInk, flightInkDamage); assert.equal(a.ink, flightInk);
  }
});

test('#744 charge keeps the invulnerability gate and normal weapon damage admission', async t => {
  const f = await boot(); t.after(f.close); f.G.paint.sample = () => 2;
  const a = f.make(), enemy = f.make({ team: 1, pos: [0, 0, 30] });
  a.invuln = 10; assert.equal(a.superJump(new f.THREE.Vector3(40, 0, 0)), true);
  f.tick(a, 30);
  assert.equal(a.hp, 100, 'invulnerable charge takes no passive ink damage');
  assert.ok(Math.abs(a.s3.enemyInkTime - 30 * STEP) < 1e-9, 'exposure is still tracked');
  a.invuln = 0; f.tick(a);
  assert.ok(a.hp < 100, 'vulnerable charge takes passive ink damage');
  const hp = a.hp; f.G.projectiles.applyHit(enemy, a, 36, 'shooter');
  assert.ok(Math.abs(a.hp - (hp - 36)) < 1e-9, 'weapon hit still admitted during charge');
});

test('#744 30/60/120Hz charge in enemy ink produces identical resource state', async t => {
  let expected;
  for (const hz of [30, 60, 120]) {
    const f = await boot(); t.after(f.close); f.G.paint.sample = () => 2;
    const a = f.make(); a.s3.jumpFlightTime = 96 / 60;
    a.superJump(new f.THREE.Vector3(20, 0, 0));
    const clock = new f.FixedClock(), rows = [];
    for (let frame = 0; frame < hz * 3; frame++) clock.advance(1 / hz, dt => {
      f.G.time += dt; a.update(dt);
      rows.push([a.superJumpState?.phase ?? null, a.hp, a.damageFromInk, a.s3.enemyInkTime, a.ink]);
    });
    const result = plain(rows); if (expected) assert.deepEqual(result, expected); else expected = result;
  }
});

// #728 guard: remote teammates are driven by NetMatch.applyRemote(), not
// Actor.update(). applyRemote() ends in Actor._finishFrame(), which already
// applies the shared support-history rule; keep that contract covered.
function remoteRig(f, pos) {
  const nm = Object.create(f.NetMatch.prototype); nm.byNid = new Map(); nm.peers = new Map(); nm.s = { myId: 'me' }; nm.myId = 'me';
  const b = f.make({ pos }); b.remote = true; b.owner = 'peer';
  b.net = { ready: true, err: new f.THREE.Vector3(), prevGrounded: true, prevVy: 0, buf: [], sjTo: null, sjRing: 0 };
  const F = f.NET_FLAGS;
  let tp = 0;
  const sample = (x, y, z, flags) => {
    b.net.tp = ++tp;
    b.net.cur = { tp, x, y, z, vx: 0, vy: 0, vz: 0, yaw: 0, aimYaw: 0, aimPitch: 0, f: F.alive | flags, hp: 100, ink: 100, sp: 0, turf: 0, ch: 0, lock: 0, life: 0, wx: 1, wy: 0, wz: 0 };
    nm.applyRemote(b, STEP);
  };
  return { nm, b, F, sample };
}

test('#728 remote playback keeps the latest supported point; airborne/climb/flight samples never overwrite it', async t => {
  const f = await boot(); t.after(f.close); const a = f.make(), r = remoteRig(f, [0, 0, 0]);
  r.sample(-30, 0, 5, r.F.grounded); r.sample(25, 0, -12, r.F.grounded);
  r.sample(26, 3, -12, 0); r.sample(26, 6, -12, r.F.climb); r.sample(27, 8, -12, r.F.sjFlight); r.sample(28, 9, -12, 0);
  assert.deepEqual(plain(r.b.superJumpGround.toArray()), [25, 0, -12]);
  assert.equal(a.superJump(r.b), true, 'airborne remote teammate is a valid target');
  assert.deepEqual(plain(a.superJumpState.to.toArray()), [25, 0, -12], 'latest supported point, not spawn or an old selection');
});

test('#728 remote respawn clears support history and the first grounded sample rebuilds it', async t => {
  const f = await boot(); t.after(f.close); const a = f.make(), r = remoteRig(f, [0, 0, 0]);
  r.sample(10, 0, 10, r.F.grounded);
  r.b.net.deathTp = r.b.net.tp; r.nm._remoteRespawn(r.b); assert.equal(r.b.superJumpGround, null);
  r.sample(-5, 4, 0, 0); assert.equal(r.b.superJumpGround, null, 'airborne sample after respawn does not seed history');
  assert.equal(a.superJump(r.b), false, 'a teammate with genuinely no support sample is still rejected');
  r.sample(-6, 0, 2, r.F.grounded); r.sample(-7, 5, 2, 0);
  assert.equal(a.superJump(r.b), true);
  assert.deepEqual(plain(a.superJumpState.to.toArray()), [-6, 0, 2]);
});
