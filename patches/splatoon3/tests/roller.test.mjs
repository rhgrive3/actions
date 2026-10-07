import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture } from './source-fixture.mjs';
import { adaptSource, checkCompatibility } from '../adapter.mjs';
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

import { realCharacter } from './real-character-fixture.mjs';
function start(f, a, vertical, dt = 1 / 60) {
  a.grounded = !vertical;
  a.weaponRunner.update(dt, { fire: true, firePressed: true });
}

// A transformed geometry bounding box is conservative when the drum tilts.
// Floor regression uses only indexed vertices that are actually drawn.
function drumMinimum(c, THREE) {
  let bottom = Infinity;
  const v = new THREE.Vector3();
  c.weapon.drum.traverse(m => {
    if (!m.isMesh || !m.visible) return;
    const p = m.geometry.attributes.position, index = m.geometry.index;
    for (let i = 0; i < (index ? index.count : p.count); i++) {
      v.fromBufferAttribute(p, index ? index.getX(i) : i).applyMatrix4(m.matrixWorld);
      bottom = Math.min(bottom, v.y);
    }
  });
  return bottom;
}
function gripError(c, THREE, name) {
  const target = c.weapon.def[name].pos.clone().applyMatrix4(c.weapon.off.matrixWorld);
  return target.distanceTo(c.bones[name].getWorldPosition(new THREE.Vector3()));
}
function settle(a, c, dt) {
  a.weaponRunner.reset(); c.tr.fill(99);
  c.root.position.set(0, 0, 0); c.rootInit = false; c.replant = true;
  a.pos.set(0, 0, 0); a.vel.set(0, 0, 0); a.grounded = true; a.ink = 100;
  const s = { form: 'kid', grounded: true, speed: 0, vy: 0, firing: false, rolling: false, localMove: { x: 0, z: 0 } };
  for (let i = 0; i < Math.ceil(1.5 / dt); i++) c.update(dt, s);
  c.weapon.drumW = 0;
  c.fidget = -1; c.idleT = 0; c.shufT = 99;
  return s;
}

test('simultaneous jump and fire go through actual Actor and retain vertical mode on landing', async () => {
  const f = await fixture(), a = f.make('roller');
  a.intent.jump = true; a.intent.fire = true; f.tick(a);
  assert.equal(a.weaponRunner.s3FlickVertical, true);
  assert.equal(a.weaponRunner.s3RollerAttack.elapsed, 0);
  a.grounded = true; a.intent.jump = false;
  f.tick(a, 30); assert.equal(f.shots.length, 0);
  f.tick(a); assert.equal(f.shots.length, 1);
  assert.equal(f.shots[0].windup, 31 / 60);
  assert.equal(a.weaponRunner.s3RollerAttack.vertical, true);
});
test('horizontal/vertical windups release on 21/31 elapsed ticks without an extra float tick', async () => {
  for (const vertical of [false, true]) for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
    const f = await fixture(), a = f.make('roller'); start(f, a, vertical, dt);
    const windup = vertical ? a.weapon.verticalWindup : a.weapon.flickWindup;
    const ticks = Math.ceil(windup / dt - 1e-10);
    for (let i = 0; i < ticks - 1; i++) a.weaponRunner.update(dt, { fire: false });
    assert.equal(f.shots.length, 0);
    a.weaponRunner.update(dt, { fire: false }); assert.equal(f.shots.length, 1);
    assert.ok(Math.abs(a.ink - 91.5) < 1e-9);
    assert.equal(a.weaponRunner.s3RollerAttack.released, true);
    assert.equal(a.weaponRunner.s3RollerAttack.elapsed, windup);
    assert.ok(ticks * dt >= windup - 1e-10 && ticks * dt < windup + dt);
  }
});
test('jump after starting a horizontal attack keeps its selected mode; the next attack reselects', async () => {
  const f = await fixture(), a = f.make('roller'), r = a.weaponRunner;
  start(f, a, false); a.grounded = false;
  for (let i = 0; i < 42; i++) r.update(1 / 60, { fire: false });
  assert.equal(r.s3FlickVertical, false); assert.equal(f.shots.length, 1);
  r.update(1 / 60, { fire: true, firePressed: true });
  assert.equal(r.s3FlickVertical, true); assert.equal(r.s3RollerAttack.vertical, true);
  for (let i = 0; i < 31; i++) r.update(1 / 60, { fire: false });
  assert.equal(f.shots.length, 2);
});
test('a new flick lifts the rolling drum, a held trigger resumes rolling, release stops it', async () => {
  const f = await fixture(), a = f.make('roller'), r = a.weaponRunner;
  a.intent.move.set(0, 0, 1);
  r.rolling = true; r.rollT = 2; start(f, a, false);
  assert.equal(r.rolling, false); assert.equal(r.rollT, 0);
  for (let i = 0; i < 21; i++) r.update(1 / 60, { fire: true });
  assert.equal(f.shots.length, 1);
  for (let i = 0; i < 20; i++) r.update(1 / 60, { fire: true });
  assert.equal(r.rolling, true); assert.equal(f.shots.length, 1);
  r.update(1 / 60, { fire: false }); assert.equal(r.rolling, false);
  r.reset(); assert.equal(r.s3RollerAttack, null); assert.equal(a.character.s3RollerFlick, null);
});
test('dry input does not create a phantom pose or spend ink', async () => {
  const f = await fixture(), a = f.make('roller'); a.ink = 2; start(f, a, true);
  assert.equal(a.weaponRunner.flick, -1); assert.equal(a.weaponRunner.s3RollerAttack, null);
  assert.equal(a.character.s3RollerFlick, null); assert.equal(a.ink, 2);
});
test('actual projectile path retains narrow vertical paint flight and one-attack damage aggregation', async () => {
  const f = await fixture(), a = f.make('roller'), system = new f.Projectiles(new f.THREE.Scene());
  const widths = [];
  for (const vertical of [false, true]) {
    system.list.length = 0; a.weaponRunner.s3FlickVertical = vertical;
    system.fireFlick(a, a.weapon);
    const drops = [...system.list]; assert.equal(drops.length, vertical ? 5 : 13);
    assert.ok(drops.every(p => p.s3Vertical === vertical && p.grav === a.weapon.flickGravity && p.drag === a.weapon.flickDrag));
    assert.ok(drops.every(p => p.trailRadius > 0 && p.radius > 0));
    widths.push(Math.max(...drops.map(p => Math.abs(Math.atan2(p.vel.x, p.vel.z)))));
    const victim = {}, hits = []; system.applyHit = (_owner, _victim, amount) => hits.push(amount);
    for (const p of drops) f.applyProjectileHit(system, p, victim, 999, p.start.clone().add(new f.THREE.Vector3(0, 0, 5.2)));
    assert.equal(hits.length, 1, 'several globs cannot multiply one swing into several maximum hits');
    assert.ok(vertical ? hits[0] === 150 : hits[0] < 150);
  }
  assert.ok(widths[1] < .03, 'vertical launch stays in a narrow forward line');
  assert.ok(widths[0] > .2, 'horizontal launch retains its fan');
});
test('actual bones and weapon rotate vertically and the drum impulse waits for gameplay release', async () => {
  const f = await fixture(), { Character, CHARACTER_CHANNELS: C } = await realCharacter();
  const a = new f.Actor({ team: 0, name: 'actual roller rig', weapon: 'roller', CharacterClass: Character });
  const c = a.character, r = a.weaponRunner; c.actor = a;
  start(f, a, true);
  const frames = [], state = { form: 'kid', grounded: false, speed: 0, vy: 0, firing: true, rolling: false, localMove: { x: 0, z: 0 } };
  for (let i = 0; i < 57; i++) {
    if (i) r.update(1 / 60, { fire: false });
    if (i === 20) { state.grounded = true; c.trigger('land', 7.5); }
    c.update(1 / 60, state); c.root.updateMatrixWorld(true);
    frames.push({ drum: c.weapon.drumW, angle: c.P[C.ANCR + 2], arm: c.bones.handR.getWorldPosition(a.pos.clone()), weapon: c.weapon.drum.getWorldPosition(a.pos.clone()), bottom: drumMinimum(c, f.THREE) });
  }
  assert.ok(frames[18].angle > 1.4, 'drum axis is rotated upright before release');
  assert.equal(frames[30].drum, 0, 'no 0.15s visual impulse during windup');
  assert.ok(frames[31].drum > 30, 'drum spins on the actual 31F release');
  assert.ok(frames[18].weapon.distanceTo(frames[31].weapon) > .35, 'full weapon rig follows the downward swing');
  assert.ok(frames[18].arm.distanceTo(frames[31].arm) > .12, 'arm bones follow the grip IK');
  for (const frame of frames) for (const vec of [frame.arm, frame.weapon]) assert.ok(vec.toArray().every(Number.isFinite));
  assert.ok(frames.slice(31).every(frame => frame.bottom >= -.02), 'the upright drum clears the floor during landed recovery');
  assert.ok(frames[56].angle > .8, 'unheld recovery returns to the tilted shoulder carry');
  a.setWeapon('shooter'); assert.equal(c.s3RollerFlick, null);
  c.dispose();
});

test('actual moving roller geometry and both grips stay synchronized through lift, landing, held roll and restart at 30/60/120Hz', async () => {
  const f = await fixture(), { Character, THREE, CHARACTER_CHANNELS: C } = await realCharacter();
  const a = new f.Actor({ team: 0, name: 'moving roller rig', weapon: 'roller', CharacterClass: Character });
  const c = a.character, r = a.weaponRunner; c.actor = a;
  a.intent.move.set(0, 0, 1);
  for (const hz of [30, 60, 120]) for (const vertical of [false, true]) for (const held of [false, true]) for (const landAt of vertical ? [20 / 60, 40 / 60] : [Infinity]) {
    const dt = 1 / hz, s = settle(a, c, dt), rows = [];
    c.root.updateMatrixWorld(true);
    const readyDrum = c.weapon.drum.getWorldPosition(new THREE.Vector3());
    const readyAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(c.weapon.drum.getWorldQuaternion(new THREE.Quaternion()));
    assert.ok(readyDrum.y > .9 && readyDrum.y < 1.4 && readyDrum.z < -.2, 'idle drum is behind the shoulder, below an overhead windup');
    assert.ok(Math.abs(readyAxis.y) > .6 && Math.abs(readyAxis.x) > .3, 'carry stays tilted across the back');
    s.grounded = !vertical; start(f, a, vertical, dt);
    for (let i = 0; i < Math.ceil(2.3 * hz); i++) {
      const t = i * dt, restart = held && i === Math.round(1.52 * hz), fire = held && (t < 1.25 || t >= 1.5);
      // Exercise landing before and after release at every update frequency.
      const land = vertical && i === Math.round(landAt * hz);
      if (land) { s.grounded = true; a.grounded = true; c.trigger('land', 7.5); }
      if (i) r.update(dt, { fire, firePressed: restart });
      s.rolling = r.rolling; s.firing = fire;
      s.speed = r.rolling ? a.weapon.rollSpeed : 2; s.localMove = { x: 0, z: 1 };
      c.root.position.z += s.speed * dt; a.pos.copy(c.root.position); a.vel.z = s.speed;
      c.update(dt, s); c.root.updateMatrixWorld(true);
      rows.push({ t, bottom: drumMinimum(c, THREE), gripL: gripError(c, THREE, 'handL'), gripR: gripError(c, THREE, 'handR'), rolling: r.rolling, roll: c.wRoll, axis: c.P[C.ANCR + 2] });
      if (vertical && r.s3RollerAttack && !restart && t < .78) assert.equal(r.s3RollerAttack.vertical, true);
      if (t + 1e-10 < (vertical ? 31 : 21) / 60) assert.equal(c.weapon.drumW, 0, 'lift does not spin the drum before release');
    }
    const label = `${hz}Hz ${vertical ? `vertical land ${landAt}s` : 'horizontal'} ${held ? 'held/restart' : 'released'}`;
    assert.ok(rows.every(x => x.bottom >= -.006), `${label}: actual vertices clear the floor (${Math.min(...rows.map(x => x.bottom))})`);
    assert.ok(rows.every(x => x.gripL < .02 && x.gripR < .002), `${label}: arms reach the weapon grips (${Math.max(...rows.map(x => x.gripL))})`);
    if (held) {
      // Allow the late landing at 40F and the lowering spring to finish before
      // checking sustained contact at the end of the held interval; the current vertical
      // roll admission is31+22F, and all earlier transition vertices are checked above.
      const roll = rows.filter(x => x.t >= 1.2 && x.t < 1.25);
      assert.ok(roll.length > 0, 'the final held interval is actually sampled');
      assert.ok(roll.every(x => x.rolling && x.roll > .9 && Math.abs(x.axis) < .15));
      assert.ok(roll.every(x => x.bottom < .055), `${label}: rolling drum stays near the floor (${Math.max(...roll.map(x => x.bottom))})`);
      assert.ok(rows.some(x => x.t > 1.52 && !x.rolling), 'pressing again lifts the drum');
    } else assert.ok(rows.at(-1).axis > .8, 'release returns to tilted carry');
  }
  c.dispose();
});

test('reset during a real Character windup cancels the legacy pose and drum impulse; form transitions do not invent an attack', async () => {
  const f = await fixture(), { Character, CHARACTER_TIMERS: T } = await realCharacter();
  const a = new f.Actor({ team: 0, name: 'cancelled roller rig', weapon: 'roller', CharacterClass: Character });
  const c = a.character, r = a.weaponRunner; c.actor = a;
  const s = settle(a, c, 1 / 60); start(f, a, true); s.grounded = false;
  for (let i = 0; i < 7; i++) { if (i) r.update(1 / 60, { fire: false }); c.update(1 / 60, s); }
  r.reset();
  assert.equal(c.s3RollerFlick, null); assert.ok(c.tr[T.T_FLICK] > 1);
  for (const form of ['squid', 'kid']) {
    s.form = form; s.grounded = true; a.grounded = true;
    for (let i = 0; i < 70; i++) { r.update(1 / 60, { fire: false }); c.update(1 / 60, s); }
    assert.equal(c.s3RollerFlick, null); assert.equal(c.weapon.drumW, 0);
  }
  assert.equal(f.shots.length, 0);
  assert.ok(Array.from(c.P).every(Number.isFinite));
  c.dispose();
  const b = f.make('roller'); start(f, b, false); b.intent.squid = true;
  f.tick(b, 10); assert.equal(b.form, 'kid', 'Actor keeps the windup in kid form');
  f.tick(b, 60); assert.equal(b.form, 'squid');
  assert.equal(b.weaponRunner.s3RollerAttack, null);
  b.intent.squid = false; f.tick(b, 5); assert.equal(b.form, 'kid');
  assert.equal(f.shots.length, 1, 'emerging without fire does not create another flick');
});
test('Character channel/drum hooks are hash locked and fail closed', () => {
  assert.doesNotThrow(() => checkCompatibility(path.join(ROOT, 'inkwave-public')));
  for (const name of ['character.js', 'character-weapons.js']) assert.throws(() => adaptSource('src/game/' + name, ''), /conflict/);
});

test('roller drum proportions follow the kid and its painted stripe; a pushed drum rests on the floor with both grips held', async () => {
  const { Character, THREE } = await realCharacter(), f = await fixture();
  const c = new Character({ name: 'roller proportions', weapon: 'roller', style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  const s = { form: 'kid', grounded: true, speed: 0, vy: 0, firing: false, rolling: false, localMove: { x: 0, z: 0 }, charge: 0, ink: 1, hp: 1 };
  for (let i = 0; i < 90; i++) c.update(1 / 60, s);
  c.root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  c.kid.traverse(m => { if (m.isSkinnedMesh && m.visible) box.expandByObject(m, true); });
  const kid = box.max.y, def = c.weapon.def;
  const drum = new THREE.Box3().setFromBufferAttribute(def.drum.getAttribute('position'));
  const body = new THREE.Box3().setFromBufferAttribute(def.body.getAttribute('position'));
  const width = drum.max.x - drum.min.x, diameter = drum.max.y - drum.min.y;
  // Bands are INKWAVE regression bounds around public-footage estimates, not
  // Nintendo measurements: drum about the kid's height long, a quarter across.
  assert.ok(width > .8 * kid && width < f.WEAPONS.roller.rollWidth, `drum width ${width} vs kid ${kid}`);
  assert.ok(diameter > .22 * kid && diameter < .32 * kid, `drum diameter ${diameter} vs kid ${kid}`);
  assert.ok(body.max.x > width / 2 && body.min.x < -width / 2, 'yoke arms reach both drum ends');
  assert.ok(def.drumAt.z - def.drumR >= .84 - .1 - 1e-6, 'the axle moves out so the hub keeps its upstream clearance');
  s.rolling = true; s.firing = true;
  let bottom = Infinity, top = -Infinity, grip = 0;
  for (let i = 0; i < 90; i++) {
    c.root.position.z += 7.92 / 60; s.speed = 7.92; s.localMove.z = 1; c.update(1 / 60, s); c.root.updateMatrixWorld(true);
    if (i < 45) continue;
    const y = drumMinimum(c, THREE); bottom = Math.min(bottom, y); top = Math.max(top, y);
    grip = Math.max(grip, gripError(c, THREE, 'handL'), gripError(c, THREE, 'handR'));
  }
  assert.ok(bottom >= -.006 && top < .05, `pushed drum rests on the floor (${bottom}..${top})`);
  assert.ok(grip < .02, `both hands stay on the handle while pushing (${grip})`);
  c.dispose();
});

test('post-release roll admission separates horizontal 7F vs vertical 22F at 60Hz (#517)', async () => {
  const f = await fixture();
  // 1. Horizontal flick: 21F windup -> 7F roll admission (enters rolling at tick 28)
  const aH = f.make('roller'), rH = aH.weaponRunner;
  start(f, aH, false, 1 / 60);
  for (let i = 0; i < 20; i++) rH.update(1 / 60, { fire: true });
  assert.equal(f.shots.length, 0);
  rH.update(1 / 60, { fire: true }); // tick 21 (from start, 0-indexed after start is tick 21): release!
  assert.equal(f.shots.length, 1);
  assert.equal(rH.rolling, false, 'no rolling on release tick');
  for (let i = 1; i <= 6; i++) {
    rH.update(1 / 60, { fire: true });
    assert.equal(rH.rolling, false, `horizontal post-release tick ${i} must not roll before 7F`);
  }
  rH.update(1 / 60, { fire: true }); // tick 7 post-release
  assert.equal(rH.rolling, true, 'horizontal reaches authoritative rolling on tick 7 post-release');

  // 2. Vertical flick: 31F windup -> 22F roll admission (enters rolling at tick 53)
  const aV = f.make('roller'), rV = aV.weaponRunner;
  start(f, aV, true, 1 / 60);
  for (let i = 0; i < 30; i++) rV.update(1 / 60, { fire: true });
  assert.equal(f.shots.length, 1);
  rV.update(1 / 60, { fire: true }); // tick 31: release!
  assert.equal(f.shots.length, 2);
  assert.equal(rV.rolling, false, 'no rolling on vertical release tick');
  aV.grounded = true; // landed immediately upon release
  for (let i = 1; i <= 21; i++) {
    rV.update(1 / 60, { fire: true });
    assert.equal(rV.rolling, false, `vertical post-release tick ${i} must not roll before 22F (horizontal 7F was tick 7)`);
  }
  rV.update(1 / 60, { fire: true }); // tick 22 post-release
  assert.equal(rV.rolling, true, 'vertical reaches authoritative rolling on tick 22 post-release');
});

test('vertical flick does not deal roll contact damage or produce roll paint during the 22F admission delay (#517)', async () => {
  const f = await fixture(), a = f.make('roller'), r = a.weaponRunner;
  const enemy = f.make('shooter');
  enemy.team = 1; enemy.alive = true; enemy.pos.set(0, 0, 2.5);
  f.G.actors = [a, enemy];
  const splats = [], hits = [];
  f.G.paint.splat = (...args) => { splats.push(args); return 0.5; };
  f.G.projectiles.applyHit = (...args) => hits.push(args);

  start(f, a, true, 1 / 60);
  for (let i = 0; i < 31; i++) r.update(1 / 60, { fire: true });
  assert.equal(f.shots.length, 1);
  a.grounded = true;
  a.pos.set(0, 0, 0); a.vel.set(0, 0, 6);

  // During ticks 1..21 post-release: grounded with held fire and forward speed, but rolling is not admitted
  for (let i = 1; i <= 21; i++) {
    a.pos.z += 0.1;
    r.update(1 / 60, { fire: true });
    assert.equal(r.rolling, false);
    assert.equal(hits.length, 0, `no roll contact damage on post-release tick ${i}`);
    assert.equal(splats.filter(s => s[3]?.kind === 'roll').length, 0, `no roll paint stripe on post-release tick ${i}`);
  }

  // On tick 22 post-release: rolling is admitted and contact hit occurs
  a.pos.z += 0.1;
  r.update(1 / 60, { fire: true });
  assert.equal(r.rolling, true, 'rolling admitted on tick 22 post-release');
  assert.ok(hits.length > 0, 'roll contact damage applies once admitted');

  // On tick 23 post-release: movement produces paint stripe
  a.pos.z += 0.35;
  r.update(1 / 60, { fire: true });
  const rollSplats = splats.filter(s => s[3]?.kind === 'roll');
  assert.ok(rollSplats.length > 0, 'roll paint stripe produced once admitted and moved');
});

test('release input before roll admission cancels transition, and runner reset cancels rolling (#517)', async () => {
  const f = await fixture(), a = f.make('roller'), r = a.weaponRunner;
  start(f, a, true, 1 / 60);
  for (let i = 0; i < 31; i++) r.update(1 / 60, { fire: true });
  a.grounded = true;
  for (let i = 1; i <= 10; i++) r.update(1 / 60, { fire: true });
  // Release fire at tick 10 post-release
  for (let i = 11; i <= 30; i++) r.update(1 / 60, { fire: false });
  assert.equal(r.rolling, false, 'unheld fire does not enter rolling');

  // Reset clears state cleanly
  start(f, a, true, 1 / 60);
  for (let i = 0; i < 15; i++) r.update(1 / 60, { fire: true });
  r.reset();
  assert.equal(r.s3RollerAttack, null);
  assert.equal(r.rolling, false);
});

test('post-release roll admission timing maintains parity across 30Hz, 60Hz, and 120Hz (#517)', async () => {
  for (const hz of [30, 60, 120]) {
    const dt = 1 / hz;
    const f = await fixture();

    // Horizontal: 0.35s windup + 7/60s roll delay
    const aH = f.make('roller'), rH = aH.weaponRunner;
    start(f, aH, false, dt);
    const hReleaseTicks = Math.ceil(0.35 / dt - 1e-9);
    for (let i = 0; i < hReleaseTicks - 1; i++) rH.update(dt, { fire: true });
    assert.equal(rH.rolling, false);
    rH.update(dt, { fire: true }); // release tick
    assert.equal(rH.rolling, false);
    const hAdmitTicks = Math.ceil((7 / 60) / dt - 1e-9);
    for (let i = 1; i < hAdmitTicks; i++) {
      rH.update(dt, { fire: true });
      assert.equal(rH.rolling, false, `${hz}Hz horizontal tick ${i} should not roll before ${hAdmitTicks}`);
    }
    rH.update(dt, { fire: true });
    assert.equal(rH.rolling, true, `${hz}Hz horizontal rolls at tick ${hAdmitTicks} post-release`);

    // Vertical: current profile windup + 22/60s roll delay
    const aV = f.make('roller'), rV = aV.weaponRunner;
    start(f, aV, true, dt);
    const vReleaseTicks = Math.ceil(aV.weapon.verticalWindup / dt - 1e-9);
    for (let i = 0; i < vReleaseTicks - 1; i++) rV.update(dt, { fire: true });
    assert.equal(rV.rolling, false);
    rV.update(dt, { fire: true }); // release tick
    assert.equal(rV.rolling, false);
    aV.grounded = true;
    const vAdmitTicks = Math.ceil((22 / 60) / dt - 1e-9);
    for (let i = 1; i < vAdmitTicks; i++) {
      rV.update(dt, { fire: true });
      assert.equal(rV.rolling, false, `${hz}Hz vertical tick ${i} should not roll before ${vAdmitTicks}`);
    }
    rV.update(dt, { fire: true });
    assert.equal(rV.rolling, true, `${hz}Hz vertical rolls at tick ${vAdmitTicks} post-release`);
  }
});

test('procedural vertical follow-through hands off to roll push pose on the exact admission tick (#517)', async () => {
  const f = await fixture(), { Character } = await realCharacter();
  const a = new f.Actor({ team: 0, name: 'pose handoff rig', weapon: 'roller', CharacterClass: Character });
  const c = a.character, r = a.weaponRunner; c.actor = a;
  settle(a, c, 1 / 60);
  start(f, a, true, 1 / 60);
  const state = { form: 'kid', grounded: false, speed: 0, vy: 0, firing: true, rolling: false, localMove: { x: 0, z: 0 } };
  for (let i = 0; i < 31; i++) {
    r.update(1 / 60, { fire: true });
    c.update(1 / 60, state);
  }
  // Land at release
  state.grounded = true; a.grounded = true; c.trigger('land', 7.5);
  for (let i = 1; i <= 21; i++) {
    r.update(1 / 60, { fire: true });
    state.rolling = r.rolling;
    c.update(1 / 60, state);
    assert.equal(r.rolling, false);
    assert.ok(c.wRoll < 0.05, `wRoll must not ramp before admission (post-release tick ${i})`);
  }
  // Tick 22 post-release (tick 48 from start)
  r.update(1 / 60, { fire: true });
  assert.equal(r.rolling, true, 'rolling begins on tick 22 post-release');
  state.rolling = r.rolling;
  c.update(1 / 60, state);
  assert.ok(c.wRoll > 0.1, 'wRoll begins blending immediately on the exact admission tick');
  // Over next 15 ticks, wRoll ramps smoothly to > 0.9 without popping
  for (let i = 0; i < 15; i++) {
    r.update(1 / 60, { fire: true });
    state.rolling = r.rolling;
    c.update(1 / 60, state);
  }
  assert.ok(c.wRoll > 0.9, 'wRoll completes transition into rolling push pose');
  c.dispose();
});
