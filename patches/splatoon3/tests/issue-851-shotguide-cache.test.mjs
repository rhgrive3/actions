import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from './weapon-edgecases-fixture.mjs';
import { realCharacter } from './real-character-fixture.mjs';
import { adaptSource } from '../adapter.mjs';

function level(THREE, blocks = []) {
  return {
    layout: {}, extra: [], blocks, faces: [], hash: [],
    queryBlocks(_minX, _minZ, _maxX, _maxZ, out) {
      out.length = 0;
      for (let i = 0; i < this.blocks.length; i++) out.push(i);
      return out;
    },
  };
}

function camera(THREE, x = 0) {
  const cam = new THREE.PerspectiveCamera(60, 390 / 844, 0.1, 1000);
  cam.position.set(x, 2, -8); cam.lookAt(0, 1, 5);
  cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
  cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
  return cam;
}

function projected(camera, point, width, height) {
  const v = camera.matrixWorldInverse.elements, p = camera.projectionMatrix.elements;
  const ex = v[0] * point.x + v[4] * point.y + v[8] * point.z + v[12];
  const ey = v[1] * point.x + v[5] * point.y + v[9] * point.z + v[13];
  const ez = v[2] * point.x + v[6] * point.y + v[10] * point.z + v[14];
  const cx = p[0] * ex + p[4] * ey + p[8] * ez + p[12];
  const cy = p[1] * ex + p[5] * ey + p[9] * ez + p[13];
  const cw = p[3] * ex + p[7] * ey + p[11] * ez + p[15];
  return { x: cx / cw * width / 2, y: -cy / cw * height / 2 };
}

function nativeGuideMuzzle(ch, actor, THREE, out, aimOut) {
  ch.getMuzzle(out);
  const ready = typeof ch.aimReady === 'function' ? ch.aimReady() : 1;
  if (ready < 0.98 && ch.getAimMuzzle && ch.getAimMuzzle(aimOut, actor.aimPitch)) out.lerp(aimOut, 1 - ready);
  return out;
}

function expectedGuideSteps(actor, profile) {
  if (actor.weapon.kind === 'blaster') return actor.weapon.shotGuideFrame;
  const guide = actor.weapon.shotGuide;
  const raw = profile.weaponsFidelityCompletion.weapons[actor.weapon.id || actor.weapon.kind];
  const unit = raw?.UnitGroupParam?.Unit?.[guide.unitOrderNum];
  let remaining = Math.max(0, guide.frame / 60 - ((unit.UnitDelayFrame || 0) + guide.bulletOrderNumInUnit * (unit.AfterOffsetDelayFrame || 0)) / 60);
  let steps = 0;
  while (remaining > 1e-10) { const dt = Math.min(1 / 60, remaining); remaining -= dt; steps++; }
  return steps;
}

test('#851 idle ShotGuide cache preserves the world point, pose controls, geometry and camera projection', async () => {
  const f = await fixture(), characterApi = await realCharacter();
  const { G, THREE } = f, V = (...v) => new THREE.Vector3(...v);
  G.scene = new THREE.Scene(); G.boss = null; G.netm = null; G.actors = [];
  G.level = level(THREE); G.physics = new f.Physics(G.level);
  let losCalls = 0, replaySteps = 0;
  const physicsPrototype = Object.getPrototypeOf(G.physics), nativeLos = physicsPrototype.los;
  physicsPrototype.los = function (...args) { losCalls++; return nativeLos.apply(this, args); };

  const player = f.make('blaster');
  player.grounded = true; player.form = 'kid'; player.aimPitch = 0;
  player.aimDir.set(0, 0, 1); player.aimPoint.set(0, 1.05, 100);
  const ch = new characterApi.Character({ name: 'Issue 851 idle trace', weapon: 'blaster', style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  ch.onEvent = null; player.character = ch; G.actors = [player];
  const ps = G.projectiles = new f.Projectiles(G.scene), cam = camera(THREE);
  const state = { form: 'kid', grounded: true, speed: 0, localMove: { x: 0, z: 0 }, firing: false, charge: 0, ink: 1, hp: 1, vy: 0, aimPitch: 0 };
  const pose = V(), aimPose = V(), rawPose = V();
  let priorPose = null, priorRawPose = null, resolvedPoseChanges = 0, rawPoseChanges = 0;
  const idle = {};

  try {
    for (const kind of ['blaster', 'slosher']) {
      if (kind === 'slosher') {
        ch.setWeapon('slosher'); player.weapon = f.WEAPONS.slosher; player.weaponRunner.reset();
      }
      const stepsPerGuide = expectedGuideSteps(player, f.profile), losBefore = losCalls, stepsBefore = replaySteps;
      const rawPoseChangesBefore = rawPoseChanges, resolvedPoseChangesBefore = resolvedPoseChanges;
      let initialSteps = 0;
      for (let frame = 0; frame < 60; frame++) {
        ch.update(1 / 60, state); ch.root.updateMatrixWorld(true);
        ch.getMuzzle(rawPose);
        const rawNow = [rawPose.x, rawPose.y, rawPose.z];
        if (priorRawPose && rawNow.some((n, i) => n !== priorRawPose[i])) rawPoseChanges++;
        priorRawPose = rawNow;
        nativeGuideMuzzle(ch, player, THREE, pose, aimPose);
        const now = [pose.x, pose.y, pose.z];
        if (priorPose && now.some((n, i) => n !== priorPose[i])) resolvedPoseChanges++;
        priorPose = now;
        const point = ps.s3WeaponGuide(player, player.weapon, cam, 390, 844);
        assert.ok(point && [point.x, point.y, point.z].every(Number.isFinite));
        if (frame === 0) {
          const projectile = kind === 'blaster' ? ps._s3BlasterGuideProjectile : ps._s3SlosherGuideProjectile;
          initialSteps = projectile.age > 0 ? Math.round(projectile.age * 60) : 0;
          const add = projectile.pos.addScaledVector;
          projectile.pos.addScaledVector = function (vector, dt) {
            if (vector === projectile.vel && dt <= 1 / 60 + 1e-12) replaySteps++;
            return add.call(this, vector, dt);
          };
        }
      }
      const measuredSteps = initialSteps + (replaySteps - stepsBefore);
      idle[kind] = { frames: 60, rawPoseChanges: rawPoseChanges - rawPoseChangesBefore,
        resolvedPoseChanges: resolvedPoseChanges - resolvedPoseChangesBefore,
        losCalls: losCalls - losBefore, replaySteps: measuredSteps, stepsPerGuide };
      assert.equal(initialSteps, stepsPerGuide, `${kind} retains its sourced guide replay age`);
      assert.ok(idle[kind].losCalls <= 30, `${kind} idle LOS work is materially below HUD frames (${idle[kind].losCalls}/60)`);
      assert.ok(measuredSteps <= 30 * stepsPerGuide, `${kind} idle replay work is materially below HUD frames (${measuredSteps}/${60 * stepsPerGuide})`);
    }
    assert.ok(rawPoseChanges > 90, `native getMuzzle pose changed on ${rawPoseChanges} idle frame transitions`);

    const guideWeapon = player.weapon, expectedSteps = expectedGuideSteps(player, f.profile);
    const cached = ps.s3WeaponGuide(player, guideWeapon, cam, 390, 844);
    const beforeScreen = projected(cam, cached, 390, 844), beforeLos = losCalls, beforeReplay = replaySteps;
    const movedCam = camera(THREE, 1.25);
    const afterCameraPoint = ps.s3WeaponGuide(player, guideWeapon, movedCam, 390, 844);
    assert.strictEqual(afterCameraPoint, cached, 'camera changes reuse the world point');
    assert.notDeepEqual(projected(movedCam, afterCameraPoint, 390, 844), beforeScreen, 'the current camera still changes the projected HUD offset');
    assert.equal(losCalls, beforeLos); assert.equal(replaySteps, beforeReplay);

    const nativeGetAimMuzzle = ch.getAimMuzzle; let jitter = 0;
    ch.getAimMuzzle = function (out, pitch) {
      const available = nativeGetAimMuzzle.call(this, out, pitch);
      if (available) out.x += jitter;
      return available;
    };
    ps.s3WeaponGuide(player, player.weapon, movedCam, 390, 844); // prime the changed pose accessor exactly
    let presentationReuse = false, previousJitter = 0;
    for (const delta of [1e-5, 1e-6, 1e-7, 1e-8, 1e-9]) {
      const oldLos = losCalls, oldSteps = replaySteps; jitter = previousJitter + delta;
      ps.s3WeaponGuide(player, player.weapon, movedCam, 390, 844);
      if (losCalls === oldLos && replaySteps === oldSteps) { presentationReuse = true; break; }
      previousJitter = jitter;
    }
    assert.ok(presentationReuse, 'pose motion reuses only when the projection bound stays within the CSS rounding cell');

    function expectRecompute(label, mutate) {
      const oldLos = losCalls, oldSteps = replaySteps;
      mutate();
      assert.ok(ps.s3WeaponGuide(player, player.weapon, movedCam, 390, 844), `${label} still has a guide`);
      assert.equal(losCalls, oldLos + 1, `${label} invalidates the muzzle LOS result`);
      assert.equal(replaySteps, oldSteps + expectedSteps, `${label} replays the exact guide age`);
    }
    expectRecompute('native muzzle motion / actor movement', () => {
      player.pos.x += 0.1; ch.root.position.x += 0.1; ch.root.updateMatrixWorld(true);
    });
    expectRecompute('aim input', () => { player.aimPoint.x += 0.4; player.aimDir.set(0.02, 0, Math.sqrt(1 - 0.02 ** 2)); });
    expectRecompute('weapon modifier', () => { player.weapon.projSpeed += 0.5; });
    expectRecompute('weapon charge state', () => { player.weaponRunner.charge += 0.125; });

    const blockedPose = nativeGuideMuzzle(ch, player, THREE, pose, aimPose);
    const base = player.pos.clone(); base.y += 1.05;
    const center = V((base.x + blockedPose.x) / 2, (base.y + blockedPose.y) / 2, (base.z + blockedPose.z) / 2);
    const block = { id: 0, solid: true, grate: false, center, half: V(0.06, 0.06, 0.06),
      axes: [V(1, 0, 0), V(0, 1, 0), V(0, 0, 1)], faces: [-1, -1, -1, -1, -1, -1] };
    const blockedLevel = level(THREE, [block]); G.level = blockedLevel; G.physics = new f.Physics(blockedLevel);
    expectRecompute('stage/physics geometry generation', () => {});
    const losAfterBlocked = losCalls, stepsAfterBlocked = replaySteps;
    ch.root.position.y += 0.001; ch.root.updateMatrixWorld(true);
    ps.s3WeaponGuide(player, player.weapon, movedCam, 390, 844);
    assert.equal(losCalls, losAfterBlocked + 1, 'a blocked muzzle segment never uses the clear-LOS subpixel certificate');
    assert.equal(replaySteps, stepsAfterBlocked + expectedSteps);

    const reentry = f.make('slosher'); reentry.grounded = true; reentry.form = 'kid'; reentry.aimPitch = 0;
    reentry.aimDir.copy(player.aimDir); reentry.aimPoint.copy(player.aimPoint);
    reentry.character = new characterApi.Character({ name: 'Issue 851 reentry', weapon: 'slosher', style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
    reentry.character.onEvent = null; G.actors = [reentry];
    const reentrySteps = expectedGuideSteps(reentry, f.profile), reentryLos = losCalls, reentryReplay = replaySteps;
    reentry.character.update(1 / 60, state); reentry.character.root.updateMatrixWorld(true);
    ps.s3WeaponGuide(reentry, reentry.weapon, movedCam, 390, 844);
    assert.equal(losCalls, reentryLos + 1, 'new match actor identity invalidates the previous guide');
    assert.equal(replaySteps, reentryReplay + reentrySteps);

    const root = new URL('../../../', import.meta.url);
    const hud = fs.readFileSync(new URL('inkwave-public/src/ui/hud.js', root), 'utf8');
    const adaptedHud = adaptSource('src/ui/hud.js', hud);
    assert.match(adaptedHud, /s3WeaponGuide\?\.\(me, me\.weapon, cam, innerWidth, innerHeight\)/);
    assert.match(adaptedHud, /this\._project\(cam, point\.x, point\.y, point\.z\)/, 'HUD projection continues to read the current camera every frame');
    console.log(JSON.stringify({ idle, rawNativePoseChanges: rawPoseChanges, resolvedMuzzlePoseChanges: resolvedPoseChanges, presentationReuse,
      finalLosCalls: losCalls, finalReplaySteps: replaySteps }));
  } finally {
    physicsPrototype.los = nativeLos;
    ch.dispose();
  }
});
