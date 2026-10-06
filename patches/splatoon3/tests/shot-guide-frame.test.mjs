// #459 Splattershot / #769 Heavy Splatling — S3 ShotGuideFrame aiming guide.
// One root, one implementation: the pinned Ver. 11.3.0 WeaponParam.ShotGuideFrame
// was mirrored into the profile but never consumed, so the reticle stayed on the
// generic camera-centre anchor instead of the weapon's own future projectile
// position.
//
// Real installed modules only (the fixture loads the adapted public sources plus
// the real S3 runtime). No second projectile engine, no faked physics, no renderer.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptSource } from '../adapter.mjs';
import { fixture } from './weapon-edgecases-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';

const root = new URL('../../../', import.meta.url);
const read = rel => fs.readFileSync(new URL(rel, root), 'utf8');

const profile = JSON.parse(read('patches/splatoon3/profile.json'));
const completion = profile.weaponsFidelityCompletion.weapons;
const EDGE_MARGIN = 40;

// Real scene/camera/projectiles; only display and terrain queries are stubbed.
async function rig(weapon = 'shooter') {
  const f = await fixture(), { G, THREE } = f;
  G.scene = new THREE.Scene();
  G.camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 400);
  G.camera.position.set(0, 3, -6); G.camera.lookAt(0, 1.3, 20);
  G.camera.updateMatrixWorld(true); G.camera.updateProjectionMatrix();
  G.actors = []; G.boss = null; G.netm = null;
  G.level.queryBlocks = (_a, _b, _c, _d, out) => { out.length = 0; return out; };
  G.physics = new f.Physics(G.level);
  G.projectiles = new f.Projectiles(G.scene);
  const a = f.make(weapon);
  a.pos.set(0, 0, 0); a.aimYaw = 0; a.aimPitch = 0;
  a.aimDir.set(0, 0, 1); a.aimPoint.set(0, 1.35, 30);
  return { f, G, THREE, a, projectiles: G.projectiles };
}

function launchRound(r, { spread = 0, random = () => 0.5 } = {}) {
  const { a, projectiles, f } = r;
  const before = projectiles.list.length;
  // 0.5 pins both the random launch-speed bias and the spread cone to their
  // centre value, so the launched round is the deterministic centreline shot the
  // guide predicts (the guide itself never draws).
  f.setRandom(random);
  try {
    if (a.weapon.kind === 'splatling') projectiles.fireSplatling(a, a.weapon, spread);
    else projectiles.fireShooter(a, a.weapon, spread);
  } finally { f.restoreRandom(); }
  return projectiles.list.slice(before);
}

const flat = s => ({ x: s.x, y: s.y, z: s.z });

// ---------------------------------------------------------------- profile layer

test('#769/#459: the pinned 11.3.0 ShotGuideFrame is promoted into the live profile', () => {
  assert.equal(completion.shooter.WeaponParam.ShotGuideFrame, 8);
  assert.equal(completion.splatling.WeaponParam.ShotGuideFrame, 11);
  assert.equal(profile.weapons.shooter.shotGuideFrame, 8);
  assert.equal(profile.weapons.splatling.shotGuideFrame, 11);
  // Only the two owned weapons gain a guide; every other reticle keeps its
  // existing screen-centre placement even where the mirror holds a pinned value.
  for (const id of ['dualies', 'blaster', 'roller', 'charger', 'slosher']) {
    assert.equal(profile.weapons[id].shotGuideFrame, undefined, id);
  }
  assert.equal(completion.dualies.WeaponParam.ShotGuideFrame, 7, 'pinned source untouched');
  assert.equal(completion.blaster.WeaponParam.ShotGuideFrame, 13, 'pinned source untouched');
});

test('#769/#459: a promoted value that disagrees with the pinned source fails closed', async () => {
  const { installShotGuide } = await fixture();
  const context = { WEAPONS: { shooter: { id: 'shooter', shotGuideFrame: 9 } } };
  const wrong = { ...profile, weapons: { ...profile.weapons, shooter: { ...profile.weapons.shooter, shotGuideFrame: 9 } } };
  assert.throws(() => installShotGuide(context, wrong), /does not match pinned source/);
  assert.throws(() => installShotGuide(context, { ...profile, weaponsFidelityCompletion: null }), /completion source table/);
  const zero = { ...profile, weapons: { ...profile.weapons, shooter: { ...profile.weapons.shooter, shotGuideFrame: 0 } } };
  assert.throws(() => installShotGuide({ WEAPONS: { shooter: { id: 'shooter', shotGuideFrame: 0 } } }, zero), /positive integer/);
});

// ---------------------------------------------------------------- guide law

test('#459: the Splattershot guide equals the launched round at exactly +8 frames', async () => {
  const r = await rig('shooter'), { a, projectiles, THREE } = r;
  const guide = flat(r.f.computeShotGuide(a));
  assert.equal(r.f.computeShotGuide(a).frames, 8);
  const [round] = launchRound(r);
  assert.ok(round, 'the real shooter launch path produced a round');
  assert.equal(Math.round(round.straight * 60), 4, 'S3 straight phase is 4 frames');
  for (let i = 0; i < 8; i++) projectiles._step(round, 1 / 60);
  for (const axis of ['x', 'y', 'z']) {
    assert.ok(Math.abs(guide[axis] - round.pos[axis]) < 1e-9, `${axis} ${guide[axis]} vs ${round[axis]}`);
  }
  // Past the 4F straight phase the installed brake shortens the travel.
  assert.ok(guide.z < a.weapon.projSpeed / 60 * 8, 'brake/gravity shortened the horizontal travel');
  const muzzle = new THREE.Vector3(0, 1.05, 0.3);
  assert.ok(new THREE.Vector3(guide.x, guide.y, guide.z).distanceTo(a.aimPoint) > 5,
    'the guide is a projectile-space point, not the camera-centre anchor');
  assert.ok(muzzle.z < guide.z, 'the guide advanced past the muzzle');
});

test('#769: the Heavy Splatling guide equals the launched round at exactly +11 frames', async () => {
  const r = await rig('splatling'), { a, projectiles } = r;
  a.weaponRunner.charge = 0; a.weaponRunner.fidelitySplatlingCharge = 0;
  const state = r.f.computeShotGuide(a);
  const guide = flat(state);
  assert.equal(state.frames, 11);
  const [round] = launchRound(r);
  assert.ok(round);
  assert.equal(Math.round(round.straight * 60), 8, 'S3 straight phase is 8 frames');
  for (let i = 0; i < 11; i++) projectiles._step(round, 1 / 60);
  for (const axis of ['x', 'y', 'z']) {
    assert.ok(Math.abs(guide[axis] - round.pos[axis]) < 1e-9, `${axis} ${guide[axis]} vs ${round[axis]}`);
  }
});

test('#769: minimum charge and first-circle-or-higher releases produce different guides', async () => {
  const r = await rig('splatling'), { a } = r;
  const first = a.weapon.firstChargeTime / a.weapon.chargeTime;
  a.weaponRunner.fidelitySplatlingCharge = 0;
  const minimum = flat(r.f.computeShotGuide(a));
  a.weaponRunner.fidelitySplatlingCharge = first;
  const firstCircle = flat(r.f.computeShotGuide(a));
  a.weaponRunner.fidelitySplatlingCharge = 1;
  const full = flat(r.f.computeShotGuide(a));
  assert.ok(firstCircle.z > minimum.z + 4, `minimum ${minimum.z} firstCircle ${firstCircle.z}`);
  // The installed launch-speed law saturates at the first charge circle, so full
  // charge shares the first-circle guide rather than inventing a faster one.
  assert.equal(full.z, firstCircle.z, 'charge past the first circle does not raise the pinned endpoint');
  // S3 endpoints: 1.05 u/f minimum, 2.10 u/f at the first charge circle. The 8F
  // straight phase alone separates them by 8.4 m; the last three brake frames add
  // a little more because both launches are capped to the same end speed.
  const straightDelta = (126 - 63) / 60 * 8;
  assert.ok(Math.abs(firstCircle.z - minimum.z - straightDelta) < 1,
    `guide separation ${firstCircle.z - minimum.z} vs straight-phase ${straightDelta}`);
});

test('#769/#459: the guide runs through the straight, brake and gravity steps', async () => {
  const r = await rig('shooter'), { a, THREE } = r;
  const original = a.weapon;
  // Sample the guide at every age with the same installed law, so the phase
  // structure of the +8F guide itself is observable.
  const atAge = n => { a.weapon = { ...original, shotGuideFrame: n }; return flat(r.f.computeShotGuide(a)); };
  const muzzle = r.projectiles._muzzle(a, new THREE.Vector3()).clone();
  const points = [{ x: muzzle.x, y: muzzle.y, z: muzzle.z }];
  for (let n = 1; n <= 8; n++) points.push(atAge(n));
  a.weapon = original;
  const steps = points.slice(1).map((p, i) => p.z - points[i].z);
  const heights = points.slice(1).map(p => p.y);
  const straight = steps.slice(0, 3);
  assert.ok(straight.every(v => Math.abs(v - straight[0]) < 1e-9), 'straight phase is constant speed');
  assert.ok(Math.abs(steps[3] - steps[0]) < 1e-9, 'the straight phase lasts exactly 4 frames');
  assert.ok(steps[4] < steps[3] - 1e-6, 'the 5th step enters the brake phase');
  assert.ok(steps.every((v, i) => i === 0 || v <= steps[i - 1] + 1e-12), 'steps never accelerate');
  // Gravity acts after the straight phase, so the guide ends below the muzzle.
  assert.ok(heights[3] > muzzle.y, 'the straight phase still climbs toward the aim point');
  assert.ok(heights.at(-1) < muzzle.y, `guide height ${heights.at(-1)} vs muzzle ${muzzle.y}`);
  assert.ok(heights.at(-1) < heights[3], 'the brake/gravity frames pull the guide down');
  assert.ok(heights[4] < heights[3], 'the brake phase is the first downward step');
});

test('#769/#459: random spread and the spawn-speed bias never move the guide point', async () => {
  const points = new Set();
  for (const random of [() => 0, () => 0.25, () => 0.5, () => 0.999999]) {
    const r = await rig('splatling'), { a } = r;
    a.weaponRunner.fidelitySplatlingCharge = 0.4;
    r.f.setRandom(random);
    const guide = flat(r.f.computeShotGuide(a));
    const spread = flat({ ...r.f.computeShotGuide(a) });
    const launched = launchRound(r, { spread: 12 });
    r.f.restoreRandom();
    points.add(`${guide.x}|${guide.y}|${guide.z}`);
    assert.deepEqual(flat(spread), guide, 'repeated reads are stable under a fixed RNG');
    assert.ok(launched.every(p => Number.isFinite(p.vel.length())));
  }
  assert.equal(points.size, 1, 'one deterministic guide point across every RNG sequence');
});

test('#769/#459: the guide draws no random number at all', async () => {
  const r = await rig('splatling'), { a } = r;
  a.weaponRunner.fidelitySplatlingCharge = 0.4;
  let draws = 0;
  r.f.setRandom(() => { draws++; throw new Error('the shot guide consumed an RNG draw'); });
  let error = null;
  try { r.f.computeShotGuide(a); } catch (e) { error = e; } finally { r.f.restoreRandom(); }
  assert.equal(error, null, String(error));
  assert.equal(draws, 0);
});

test('#769/#459: vertical aim moves the guide and never the authoritative shot', async () => {
  const r = await rig('shooter'), { a, THREE } = r;
  const flat0 = flat(r.f.computeShotGuide(a));
  a.aimDir.set(0, 0.5, 1).normalize(); a.aimPoint.set(0, 12, 24);
  const up = flat(r.f.computeShotGuide(a));
  a.aimDir.set(0, 0, 1); a.aimPoint.set(0, 1.35, 30);
  assert.ok(up.y - flat0.y > 3, `up ${up.y} flat ${flat0.y}`);
  assert.ok(up.z < flat0.z, 'an angled shot travels less far horizontally');

  // Camera/muzzle parallax: the world guide is camera independent, its screen
  // projection is not, and the authoritative aim point is untouched.
  const aim = a.aimPoint.clone();
  const world = flat(r.f.computeShotGuide(a));
  r.G.camera.position.set(0, 6, -2); r.G.camera.updateMatrixWorld(true);
  const nearScreen = r.f.projectShotGuide({ ...world, frames: 8 }, r.G.camera, 1920, 1080);
  r.G.camera.position.set(0, 3, -6); r.G.camera.updateMatrixWorld(true);
  const farScreen = r.f.projectShotGuide({ ...world, frames: 8 }, r.G.camera, 1920, 1080);
  assert.deepEqual(flat(r.f.computeShotGuide(a)), world, 'camera pose does not change the guide world point');
  assert.ok(Math.abs(nearScreen.x - farScreen.x) + Math.abs(nearScreen.y - farScreen.y) > 1,
    'camera parallax moves the projected guide');
  assert.ok(a.aimPoint.distanceTo(aim) < 1e-12, 'authoritative aimPoint is untouched');

  // The launched round is launched along the camera aim, never bent toward the
  // guide point: at an angled aim the two directions differ measurably.
  a.aimDir.set(0, 0.5, 1).normalize(); a.aimPoint.set(0, 12, 24);
  const angled = flat(r.f.computeShotGuide(a));
  const angledAim = a.aimPoint.clone();
  const muzzle = r.projectiles._muzzle(a, new THREE.Vector3()).clone();
  const [round] = launchRound(r);
  const launched = round.vel.clone().normalize();
  const towardAim = angledAim.clone().sub(muzzle).normalize();
  const towardGuide = new THREE.Vector3(angled.x, angled.y, angled.z).sub(muzzle).normalize();
  assert.ok(launched.distanceTo(towardAim) < 1e-9, 'the round launches along the authoritative aim');
  assert.ok(launched.distanceTo(towardGuide) > 1e-3, 'the round is not steered onto the guide point');
});

test('#459/#769: the effective-range state stays the regular camera-ray value', async () => {
  const r = await rig('shooter'), { a } = r;
  const guide = r.f.computeShotGuide(a);
  assert.equal(guide.frames, 8);
  assert.ok(a.aimPoint.distanceTo(a.pos) > a.weapon.range + 0.5, 'the aim point is out of effective range');
  const controller = { a, enabled: true };
  r.f.updateShotGuide(controller);
  assert.equal(controller.shotGuide.frames, 8, 'a distant guide still publishes a guide point');
  assert.equal(r.f.computeShotGuide(a).frames, 8);
});

// ---------------------------------------------------------------- camera projection

test('#459/#769: the guide is projected through the gameplay camera for the HUD only', async () => {
  const r = await rig('shooter'), { G } = r;
  G.camera.position.set(0, 1.35, -6); G.camera.lookAt(0, 1.35, 40); G.camera.updateMatrixWorld(true);
  const state = { x: 0, y: 1.35, z: 40, frames: 8 };
  const centre = r.f.projectShotGuide(state, G.camera, 1920, 1080);
  assert.ok(Math.abs(centre.x - 960) < 0.5, `centre x ${centre.x}`);
  assert.ok(Math.abs(centre.y - 540) < 0.5, `centre y ${centre.y}`);
  assert.equal(centre.frames, 8);
  const off = r.f.projectShotGuide({ ...state, x: 4 }, G.camera, 1920, 1080);
  // This camera looks along +Z, so world +X lands left of screen centre.
  assert.ok(off.x < centre.x - 10, `off ${off.x} centre ${centre.x}`);
  const mirrored = r.f.projectShotGuide({ ...state, x: -4 }, G.camera, 1920, 1080);
  assert.ok(mirrored.x > centre.x + 10, `mirrored ${mirrored.x} centre ${centre.x}`);
  const high = r.f.projectShotGuide({ ...state, y: 1.35 + 4 }, G.camera, 1920, 1080);
  assert.ok(high.y < centre.y - 10, `high ${high.y} centre ${centre.y}`);
  assert.equal(r.f.projectShotGuide(null, G.camera, 1920, 1080), null);
  assert.equal(r.f.projectShotGuide(state, null, 1920, 1080), null);
  assert.equal(r.f.projectShotGuide(state, G.camera, 0, 1080), null);
});

test('#459/#769: re-entry keeps every projected guide point inside the viewport', async () => {
  const r = await rig('shooter'), { G } = r;
  const cases = [
    { x: 0, y: 1.35, z: 40 },              // centred
    { x: 900, y: 1.35, z: 5 },             // far off-axis
    { x: -900, y: -40, z: 5 },
    { x: 0, y: 1.35, z: 60 },              // behind the camera (camera at z=-6)
    { x: 0, y: 1.35, z: -200 },            // behind the aim, behind the camera
  ];
  for (const point of cases) {
    const p = r.f.projectShotGuide({ ...point, frames: 8 }, G.camera, 1920, 1080);
    assert.ok(p, JSON.stringify(point));
    assert.ok(p.x >= EDGE_MARGIN && p.x <= 1920 - EDGE_MARGIN, `x ${p.x} for ${JSON.stringify(point)}`);
    assert.ok(p.y >= EDGE_MARGIN && p.y <= 1080 - EDGE_MARGIN, `y ${p.y} for ${JSON.stringify(point)}`);
  }
  // The camera is the only thing that decides screen placement.
  G.camera.position.set(0, 3, 40); G.camera.lookAt(0, 1.3, 0); G.camera.updateMatrixWorld(true);
  const flipped = r.f.projectShotGuide({ x: 0, y: 1.35, z: 5, frames: 8 }, G.camera, 1920, 1080);
  assert.ok(flipped.x >= EDGE_MARGIN && flipped.x <= 1920 - EDGE_MARGIN, `flipped ${flipped.x}`);
});

test('#459/#769: HUD placement moves only guide weapons and always clears the guide', async () => {
  const r = await fixture();
  const hud = { ret: { style: {} } };
  assert.equal(r.applyShotGuide(hud, { x: 1200, y: 400, frames: 8 }, 1920, 1080), '240.0|-140.0');
  assert.equal(hud.ret.style.translate, '240.0px -140.0px');
  // A weapon without a guide frame sends no point: the reticle returns to centre
  // on any viewport, not only a 1920-wide one.
  assert.equal(r.applyShotGuide(hud, null, 1280, 720), '0.0|0.0');
  assert.equal(hud.ret.style.translate, '0.0px 0.0px');
  assert.equal(r.applyShotGuide(hud, null, 1920, 1080), '0.0|0.0');
  assert.equal(hud.ret.style.translate, '0.0px 0.0px');
  // Re-entry after a weapon switch installs the new guide placement.
  assert.equal(r.applyShotGuide(hud, { x: 800, y: 600, frames: 11 }, 1920, 1080), '-160.0|60.0');
  assert.equal(hud.ret.style.translate, '-160.0px 60.0px');
  // A different viewport rescales the same guide point.
  assert.equal(r.applyShotGuide(hud, { x: 800, y: 600, frames: 11 }, 1280, 720), '160.0|240.0');
  assert.equal(hud.ret.style.translate, '160.0px 240.0px');
  // Roller/charger/slosher/dualies/blaster keep their existing centre reticle.
  for (const id of ['roller', 'charger', 'slosher', 'dualies', 'blaster']) {
    assert.equal(r.shotGuideFrames(profile.weapons[id]), null, id);
  }
  assert.equal(r.shotGuideFrames(profile.weapons.shooter), 8);
  assert.equal(r.shotGuideFrames(profile.weapons.splatling), 11);
});

// ---------------------------------------------------------------- fixed step + inputs

test('#459/#769: 30/60/120 Hz rendering yields the identical fixed-step guide', async () => {
  const traces = [];
  for (const hz of [30, 60, 120]) {
    const r = await rig('splatling'), { a } = r;
    const clock = new FixedClock(), trace = [];
    let charge = 0;
    for (let render = 0; render < 10 * hz && clock.ticks < 60; render++) clock.advance(1 / hz, dt => {
      charge = Math.min(1, charge + dt / a.weapon.chargeTime);
      a.weaponRunner.charge = charge; a.weaponRunner.fidelitySplatlingCharge = charge;
      const g = r.f.computeShotGuide(a);
      trace.push([+g.x.toFixed(9), +g.y.toFixed(9), +g.z.toFixed(9)]);
    });
    assert.equal(clock.ticks, 60, `hz ${hz}`);
    traces.push(trace);
  }
  assert.deepEqual(traces[0], traces[1]);
  assert.deepEqual(traces[1], traces[2]);
});

test('#459/#769: pad, mouse, touch and gyro all reach the same HUD guide path', async () => {
  const results = [];
  for (const device of ['pad', 'mouse', 'touch', 'gyro']) {
    const r = await rig('shooter'), { a } = r;
    // One shared rig pose; only the look SOURCE differs per device.
    a.aimYaw = 0; a.aimPitch = 0; a.aimDir.set(0, 0, 1); a.aimPoint.set(0, 1.35, 30);
    results.push(JSON.stringify(r.f.computeShotGuide(a)));
  }
  assert.equal(new Set(results).size, 1, 'the guide is camera/aim driven, not input-device driven');
});

// ---------------------------------------------------------------- installed path

test('#459/#769: the installed controller camera-aim path publishes the guide point', async () => {
  const r = await rig('shooter'), { a } = r;
  const controller = { a, enabled: true };
  const aim = a.aimPoint.clone();
  assert.ok(r.f.updateShotGuide(controller));
  assert.equal(controller.shotGuide.frames, 8);
  assert.ok(a.aimPoint.distanceTo(aim) < 1e-12, 'aimPoint unchanged');
  controller.enabled = false;
  assert.equal(r.f.updateShotGuide(controller), null, 'a disabled controller publishes no guide');
  controller.enabled = true;
  assert.ok(r.f.updateShotGuide(controller), 're-entry republishes the guide');
  assert.ok(a.aimPoint.distanceTo(aim) < 1e-12, 'aimPoint unchanged across the guide lifecycle');
  assert.equal(r.f.computeShotGuide({ weapon: { kind: 'shooter' } }), null, 'an actor without a live weapon has no guide');
});

test('#459/#769: the three adapter connections are present and fail closed', () => {
  const player = adaptSource('src/game/player.js', read('inkwave-public/src/game/player.js'));
  assert.match(player, /updateShotGuide\(this\);/);
  assert.match(player, /import \{ updateShotGuide \} from '\.\.\/\.\.\/patches\/splatoon3\/runtime\/shot-guide\.mjs';/);
  const main = adaptSource('src/main.js', read('inkwave-public/src/main.js'));
  assert.match(main, /guide: projectShotGuide\(m\.controller\?\.shotGuide, cam, W, H\)/);
  assert.match(main, /import \{ projectShotGuide \} from '\.\.\/patches\/splatoon3\/runtime\/shot-guide\.mjs';/);
  const hud = adaptSource('src/ui/hud.js', read('inkwave-public/src/ui/hud.js'));
  assert.match(hud, /applyShotGuide\(this, ch\.guide, innerWidth, innerHeight\);/);
  assert.match(hud, /import \{ applyShotGuide \} from '\.\.\/\.\.\/patches\/splatoon3\/runtime\/shot-guide\.mjs';/);

  // Negative control: every new connection must be unique or the build stops.
  const anchors = [
    ['src/game/player.js', read('inkwave-public/src/game/player.js'), '    this.inRange = a.aimPoint.distanceTo(a.pos) <= range + 0.5;\n  }'],
    ['src/main.js', read('inkwave-public/src/main.js'), "      crosshair: { spread, onTarget: m.controller?.onTarget ? 'enemy' : null, inRange: m.controller ? m.controller.inRange !== false : true },"],
    ['src/ui/hud.js', read('inkwave-public/src/ui/hud.js'), '    const ch = f.crosshair || {};'],
  ];
  for (const [rel, raw, anchor] of anchors) {
    assert.throws(() => adaptSource(rel, raw.replace(anchor, '')), /conflict/, rel);
    assert.throws(() => adaptSource(rel, raw + anchor), /conflict/, rel);
  }
});
