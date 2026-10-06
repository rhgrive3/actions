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
    export { NetMatch } from './src/net/netmatch.js';
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
  function make({ pos = [0, 0, 0], weapon = 'shooter', team = 0 } = {}) {
    const a = new api.Actor({ team, name: 'superjump regression', weapon, CharacterClass: api.Character,
      style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
    a.character.actor = a; G.actors.push(a); G.scene.add(a.character.root);
    a.spawnAt(new THREE.Vector3(...pos), 0); a.invuln = 0; return a;
  }
  const tick = (a, count = 1) => { for (let i = 0; i < count; i++) { G.time += STEP; a.update(STEP); } };
  const close = () => { for (const a of G.actors) a.character.dispose(); G.projectiles.clear(); };
  return { ...api, make, tick, close };
}

for (const grate of [false, true]) test(`#215 grounded ${grate ? 'grate' : 'floor'} preparation launches at 80F`, async t => {
  const f = await boot({ grate }); t.after(f.close); const a = f.make();
  assert.equal(a.grounded, true); a.superJump(new f.THREE.Vector3(10, 0, 0));
  f.tick(a, 79); assert.equal(a.superJumpState.phase, 'charge'); assert.ok(Math.abs(a.pos.y) < 1e-9);
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
    a.superJump(new f.THREE.Vector3(-10, 0, 0)); f.tick(a);
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
  f.tick(a); assert.equal(a.superJumpState.phase, 'flight');
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
  a.superJump(new f.THREE.Vector3(20, 0, 0)); f.tick(a, 114); assert.equal(shots.length, 0);
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
  f.tick(a,80); assert.equal(a.superJumpState.phase,'flight');
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

test('#842 Super Jump ages the Squid Roll chain on fixed simulation ticks at 30/60/120Hz render cadence', async t => {
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json'), 'utf8'));
  const window = profile.movement.roll.chainReset, speed = profile.movement.roll.minimumSpeed;
  let expectedElapsed;
  for (const hz of [30, 60, 120]) {
    const f = await boot(); t.after(f.close); const a = f.make();
    a.s3.actions = { chain: 1, chainTimer: window, chainSpeed: speed, roll: null, surge: null };
    const state = a.s3.actions;
    assert.equal(a.superJump(new f.THREE.Vector3(10, 0, 0)), true);
    const clock = new f.FixedClock(); let elapsed = 0, renders = 0, checkedLiveWindow = false;
    while (a.superJumpState && renders < hz * 10) {
      clock.advance(1 / hz, dt => {
        f.G.time += dt; a.update(dt); elapsed += dt;
        if (!checkedLiveWindow && elapsed + 1e-10 >= window / 2) {
          assert.ok(a.superJumpState, 'Super Jump remains active inside the roll window');
          assert.equal(state.chain, 1, 'a still-valid consecutive roll is retained');
          assert.ok(state.chainTimer > 0 && state.chainTimer < window);
          assert.ok(Math.abs(state.chainTimer - (window - elapsed)) < 1e-9);
          assert.equal(state.chainSpeed, speed, 'the prior launch speed remains available only inside the window');
          checkedLiveWindow = true;
        }
      });
      renders++;
    }
    assert.equal(a.superJumpState, null, `${hz}Hz render schedule completes the native Super Jump`);
    assert.ok(checkedLiveWindow);
    assert.ok(elapsed > window, 'the composed Super Jump lasts longer than the configured chain window');
    assert.equal(state.chain, 0); assert.equal(state.chainTimer, 0); assert.equal(state.chainSpeed, 0);
    if (expectedElapsed === undefined) expectedElapsed = elapsed;
    else assert.equal(elapsed, expectedElapsed, 'render cadence does not change fixed-step chain time');
  }
});
