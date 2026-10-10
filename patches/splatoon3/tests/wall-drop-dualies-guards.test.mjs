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
const SRC = path.join(ROOT, 'inkwave-public');
const STEP = 1 / 60;
const close = (actual, expected, label, eps = 1e-9) => assert.ok(Math.abs(actual - expected) <= eps, `${label}: ${actual} != ${expected}`);

// #604 plus the already-composed rows #770 #777 #638/#637 #644/#643 #556.
// Same composition and installer as build-inkwave (native Actor, Projectiles,
// Physics, Level); only display/audio objects are headless. No GPU claim.
async function boot({ wall = false } = {}) {
  const context = vm.createContext({ console, performance, URL, innerHeight: 720 }), modules = new Map();
  const load = requested => {
    let file = requested;
    if (file.startsWith(path.join(SRC, 'patches') + path.sep)) file = path.join(ROOT, path.relative(SRC, file));
    if (file.startsWith(path.join(ROOT, 'src') + path.sep)) file = path.join(SRC, path.relative(ROOT, file));
    if (modules.has(file)) return modules.get(file);
    const raw = fs.readFileSync(file, 'utf8'), rel = path.relative(SRC, file);
    const source = adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, raw))));
    const mod = new vm.SourceTextModule(source, { context, identifier: file, initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; } });
    modules.set(file, mod); return mod;
  };
  const entry = new vm.SourceTextModule(`
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export { fidelityDamage } from './patches/splatoon3/runtime/weapons-fidelity.mjs';
    export { Level } from './src/world/level.js';
  `, { context, identifier: path.join(SRC, 'wall-drop-guards-entry.mjs') });
  await entry.link((spec, from) => load(spec === 'three' ? path.join(SRC, 'vendor/three/build/three.module.js')
    : spec.startsWith('three/addons/') ? path.join(SRC, 'vendor/three/jsm', spec.slice(13)) : path.resolve(path.dirname(from.identifier), spec)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json')));
  const api = { ...entry.namespace.install(profile), ...entry.namespace }, { G, THREE, Physics, Level } = api;
  const single = [{ kind: 'box', min: [-100, -.5, -100], max: [100, 0, 100] }];
  if (wall) single.push({ kind: 'box', min: [-10, 0, 6], max: [10, 20, 7] });
  const level = new Level({ bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }, spawnPads: [[-80, 0, 0], [80, 0, 0]], spawnBarrier: 0, single, half: [] });
  const painted = [];
  Object.assign(G, { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), settings: { quality: 'high' }, actors: [], time: 0,
    level, physics: new Physics(level), mode: 'match', teamColors: [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')],
    match: { playing: () => true, canRespawn: () => false },
    paint: { sample: () => 1, splat: (point, radius) => { painted.push({ y: point.y, radius }); return 1; } } });
  G.projectiles = new api.Projectiles(G.scene);
  function make({ pos = [0, 0, 0], weapon = 'shooter', team = 0 } = {}) {
    const a = new api.Actor({ team, name: 'wall-drop guard', weapon, CharacterClass: api.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
    a.character.actor = a; G.actors.push(a); G.scene.add(a.character.root);
    a.spawnAt(new THREE.Vector3(...pos), 0); a.invuln = 0; return a;
  }
  const tick = (a, count = 1) => { for (let i = 0; i < count; i++) { G.time += STEP; a.update(STEP); G.projectiles.update(STEP); } };
  const closeAll = () => { for (const a of G.actors) a.character.dispose(); G.projectiles.clear(); };
  return { ...api, profile, make, tick, painted, close: closeAll };
}

// Fire one round straight at the wall face (z=6) and step the shared fixed clock.
function shootWall(f, weapon, fire) {
  const a = f.make({ weapon }); f.tick(a); a.aimYaw = 0; a.aimPitch = 0;
  const ps = f.G.projectiles; let impacts = 0;
  const impact = ps._impact; ps._impact = function (p, hit) { impacts++; return impact.call(this, p, hit); };
  fire(ps, a); const p = ps.list.at(-1);
  let drop = null;
  for (let i = 0; i < 90 && ps.list.includes(p) && !drop; i++) { ps.update(STEP); drop = p.fidelityWallDrop; }
  return { a, ps, p, drop, impacts: () => impacts };
}

for (const hand of [0, 1]) test(`#604 Splat Dualies hand ${hand} wall contact enters the pinned wall-drop state`, async t => {
  const f = await boot({ wall: true }); t.after(f.close);
  const raw = f.profile.weaponsFidelityCompletion.weapons.dualies, move = raw.WallDropMoveParam, paint = raw.WallDropCollisionPaintParam;
  const shot = shootWall(f, 'dualies', (ps, a) => ps.fireDualies(a, a.weapon, 0, hand));
  assert.ok(shot.drop, 'wall contact retains the round as a falling wall-drop');
  assert.equal(shot.impacts(), 0, 'no generic terminal impact on the wall-contact frame');
  close(shot.p.pos.z, 6 - .025, 'drop starts on the wall face', 1e-6);
  const d = shot.drop;
  close(d.shockRadius, paint.PaintRadiusShock, 'shock radius'); close(d.fallRadius, paint.PaintRadiusFall, 'fall radius');
  close(d.groundRadius, paint.PaintRadiusGround, 'ground radius');
  close(d.firstSpeed, move.FallPeriodFirstTargetSpeed, 'first target speed'); close(d.secondSpeed, move.FallPeriodSecondTargetSpeed, 'second target speed');
  assert.ok(d.firstFrames >= move.FallPeriodFirstFrameMin && d.firstFrames <= move.FallPeriodFirstFrameMax);
  assert.equal(d.secondFrames, move.FallPeriodSecondFrame);
  assert.ok(d.lastFrames >= move.FallPeriodLastFrameMin && d.lastFrames <= move.FallPeriodLastFrameMax);
  assert.ok(f.painted.some(s => s.radius === paint.PaintRadiusShock), 'sourced shock paint at contact');
  const startY = shot.p.pos.y;
  for (let i = 0; i < d.totalFrames + 2 && shot.ps.list.includes(shot.p); i++) shot.ps.update(STEP);
  assert.equal(d.done, true, 'sourced fall duration completes');
  assert.ok(!shot.ps.list.includes(shot.p), 'retained round is released after the drop');
  assert.ok(shot.p.pos.y < startY, 'round slides down the wall');
  assert.equal(shot.impacts(), 0, 'the drop never adds a second generic impact');
  assert.ok(f.painted.some(s => s.radius === paint.PaintRadiusFall), 'fall trail uses the sourced fall radius');
});

test('#604 floor contact and the already-routed families keep their prior behaviour', async t => {
  const f = await boot(); t.after(f.close);
  const a = f.make({ weapon: 'dualies' }); f.tick(a); a.aimYaw = 0; a.aimPitch = -.6;
  const ps = f.G.projectiles; let impacts = 0; const impact = ps._impact; ps._impact = function (p, h) { impacts++; return impact.call(this, p, h); };
  const inkImpact=ps.inkFlight.impact;ps.inkFlight.impact=function(p,h){impacts++;return inkImpact.call(this,p,h);};
  ps.fireDualies(a, a.weapon, 0, 0); const p = ps.list.at(-1);
  for (let i = 0; i < 90 && ps.list.includes(p); i++) ps.update(STEP);
  assert.equal(p.fidelityWallDrop ?? null, null, 'a floor hit is not a wall-drop');
  assert.equal(impacts, 1, 'floor stays one native terminal impact');
  const g = await boot({ wall: true }); t.after(g.close);
  const splat = shootWall(g, 'splatling', (s, actor) => s.fireSplatling(actor, actor.weapon, 0));
  assert.ok(splat.drop, 'Splatling wall-drop is unchanged');
});

test('#770 Super Jump landing leaves no invulnerability tail; flight still rejects hits', async t => {
  const f = await boot(); t.after(f.close);
  const a = f.make(), enemy = f.make({ team: 1, pos: [30, 0, 0] });
  a.s3.jumpChargeTime = STEP;
  // #770 owns flight/landing protection, not the independent 22F/1F startup.
  a.s3.jumpStartupHumanoidF = 0; a.s3.jumpStartupSwimF = 0;
  a.superJump(new f.THREE.Vector3(10, 0, 0));
  f.tick(a); assert.equal(a.superJumpState.phase, 'flight');
  f.G.projectiles.applyHit(enemy, a, 30, 'shooter'); assert.equal(a.hp, 100, 'flight is protected (#255)');
  let ticks = 0; while (a.superJumpState && ticks++ < 400) f.tick(a);
  assert.equal(a.superJumpState, null); assert.equal(a.invuln, 0, 'no landing shield remains');
  f.G.projectiles.applyHit(enemy, a, 30, 'shooter'); assert.equal(a.hp, 70, 'a hit on the landing tick deals damage');
});

test('#777 Splat Dualies apply the pinned 7F→15F 30→15 projectile-age falloff', async t => {
  const f = await boot(); t.after(f.close);
  const a = f.make({ weapon: 'dualies' }), w = a.weapon, raw = f.profile.weaponsFidelityCompletion.weapons.dualies.DamageParam;
  close(w.damageReduceStart * 60, raw.ReduceStartFrame, 'start frame', 1e-9); close(w.damageReduceEnd * 60, raw.ReduceEndFrame, 'end frame', 1e-9);
  close(w.damage, raw.ValueMax / 10, 'max'); close(w.damageMin, raw.ValueMin / 10, 'min');
  const at = frame => f.fidelityDamage({ s3Weapon: w, owner: a, damage: w.damage, age: frame / 60, fidelityPrevAge: frame / 60, fidelityImpactT: 1 }, new f.THREE.Vector3());
  for (const [frame, expected] of [[0, 30], [7, 30], [8, 28.125], [12, 20.625], [15, 15], [24, 15]]) close(at(frame), expected, `${frame}F`, 1e-9);
  // Actual flight: a target past the 7F boundary takes less than the 30 maximum.
  const v = f.make({ team: 1, pos: [0, 0, 12] }); f.tick(a); a.aimYaw = 0; a.aimPitch = 0;
  f.G.projectiles.fireDualies(a, w, 0, 0); const p = f.G.projectiles.list.at(-1);
  for (let i = 0; i < 60 && f.G.projectiles.list.includes(p); i++) f.G.projectiles.update(STEP);
  assert.ok(v.hp > 70 && v.hp < 100, `falloff reaches the hit (${100 - v.hp})`);
});

test('#638/#637 live Splat Bomb flight and its preview both integrate the profile gravity', async t => {
  const f = await boot(); t.after(f.close);
  const a = f.make(); f.tick(a);
  close(f.SUB.bomb.gravity, 57.6, 'profile gravity', 1e-9);
  const ps = f.G.projectiles; ps.throwBomb(a); const b = ps.bombs.at(-1), vy = b.vel.y;
  ps._updateBombs(STEP); close((vy - b.vel.y) / STEP, f.SUB.bomb.gravity, 'live gravity', 1e-6);
  const source = fs.readFileSync(path.join(SRC, 'src/game/weapons.js'), 'utf8');
  const composed = adaptSource('src/game/weapons.js', source);
  assert.equal((composed.match(/\b24 \* (dt|stepDt)\b/g) || []).length, 0, 'no hard-coded 24 remains in composed bomb flight or preview');
  assert.ok(/vel\.y -= SUB\.bomb\.gravity \* dt;/.test(composed), 'preview integrates SUB.bomb.gravity');
});

for (const weapon of ['shooter', 'charger', 'roller']) test(`#644/#643 ${weapon}: Splat Bomb release holds refill for its own 1.0 s stop`, async t => {
  const f = await boot(); t.after(f.close);
  const a = f.make({ weapon }); f.tick(a); a.weapon={...a.weapon,sub:'bomb'}; a.ink = 100; // named Splat Bomb test, not the weapon's later verified Kit
  a.intent.sub = true; f.tick(a, 20); a.intent.sub = false; f.tick(a);
  assert.equal(f.G.projectiles.bombs.length, 0, 'release starts the independent 1F use gate'); f.tick(a);
  assert.equal(f.G.projectiles.bombs.length, 1, 'bomb thrown after the 1F use gate');
  const after = a.ink; let first = null;
  for (let i = 1; i <= 90 && first === null; i++) { f.tick(a); if (a.ink > after + 1e-9) first = i; }
  assert.equal(first, Math.round(f.SUB.bomb.inkRecoverStop * 60), 'refill begins at the bomb stop, not the main-weapon stop');
  assert.ok(f.SUB.bomb.inkRecoverStop > a.weapon.inkRecoverStop);
});

test('#556 grounded Blaster shots use spreadGround = 0; an admitted jump uses spreadAir', async t => {
  const f = await boot(); t.after(f.close);
  const a = f.make({ weapon: 'blaster' }); f.tick(a);
  assert.equal(a.grounded, true); assert.equal(a.weapon.spreadGround, 0);
  assert.equal(a.weaponRunner._spreadDeg(a.weapon), 0, 'grounded cone half-angle');
  a.aimYaw = 0; a.aimPitch = 0; a.updateMatrixWorld?.();
  const dirs = [];
  for (let i = 0; i < 6; i++) { f.G.projectiles.fireBlaster(a, a.weapon, a.weaponRunner._spreadDeg(a.weapon)); dirs.push(f.G.projectiles.list.at(-1).vel.clone().normalize()); }
  for (const d of dirs) close(d.angleTo(dirs[0]), 0, 'grounded shots share one direction', 1e-9);
  a.grounded = false; assert.equal(a.weaponRunner._spreadDeg(a.weapon), 0, 'ledge fall retains the normal endpoint');
  a.s3JumpSerial = (a.s3JumpSerial || 0) + 1;
  a.weaponRunner.update(1 / 60, { fire: false });
  assert.equal(a.weaponRunner._spreadDeg(a.weapon), a.weapon.spreadAir);
});
