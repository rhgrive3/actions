import test from 'node:test';
import assert from 'node:assert/strict';
import { S3_RETICLE_CSS } from '../runtime/s3-reticle-look.mjs';
import { boot, STEP } from './full-install-fixture.mjs';

test('shooter reticle CSS hides the smaller black muzzle-blocked second reticle', () => {
  assert.match(S3_RETICLE_CSS, /\.iw-xh\.is-muzzle-blocked::after\s*\{\s*display:\s*none;\s*\}/);
});

test('composed computeAim + projectiles: Shooter and Dualies stay inRange (and targetable) at max hit range even with open sky behind enemy', async () => {
  const f = await boot();
  const { G, THREE, PlayerController } = f;
  const origSpread = G.projectiles._spread;
  const origRand = Math.random;
  G.projectiles._spread = (d) => d;
  Math.random = () => 0.5;
  try {
    function setupPair(weaponId, enemyZ, { turret = false } = {}) {
      G.actors.length = 0;
      G.projectiles.clear();
      const a = f.make({ pos: [0, 0, 0], weapon: weaponId, team: 0 });
      const e = f.make({ pos: [0, 0, enemyZ], weapon: 'shooter', team: 1 });
      a.yaw = 0; a.aimYaw = 0; a.aimPitch = 0; a.aimDir.set(0, 0, 1); a.grounded = true; a.ink = 100; a.form = 'kid';
      e.hp = 100; e.alive = true; e.form = 'kid';
      a.character.update(0.2, { pos: a.pos, yaw: 0, aimYaw: 0, aimPitch: 0, aimDir: a.aimDir, form: 'kid', grounded: true, firing: true });
      a.weaponRunner.reset();
      if (turret) {
        if (a.weapon.catalogRecord) {
          a.weaponRunner.update(0, { fire: false });
          a.weaponRunner.catalogState.turret = 0.5;
          a.weaponRunner.catalogState.turretHeld = true;
        } else {
          a.weaponRunner.s3Turret = true;
        }
      }
      // Camera positioned behind player looking horizontally at +Z (chest height y=0.96 -> passes through enemy into 70m sky)
      const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 200);
      cam.position.set(0, 0.96, -3);
      cam.lookAt(0, 0.96, 50);
      cam.updateMatrixWorld(true);
      G.camera = cam;
      const rig = { gameCam: cam, yaw: 0, pitch: 0 };
      G.rig = rig;
      const ctrl = new PlayerController(a, { down: () => false, wasPressed: () => false, padPressed: new Set() }, rig);
      ctrl.computeAim(false);
      // Fire an actual shot to confirm real hit/miss at this exact distance
      for (let t = 0; t < 8; t++) {
        a.weaponRunner.update(STEP, { fire: true, firePressed: t === 0 });
        if (G.projectiles.list.length) break;
      }
      for (let t = 0; t < 90; t++) {
        G.projectiles.update(STEP);
        if (e.hp < 100) break;
      }
      return { ctrl, a, e, hit: e.hp < 100 };
    }

    // Splattershot: hits at 12.6m (was previously false beyond 11.56m AND false whenever sky was behind enemy)
    const ssHit = setupPair('shooter', 12.6);
    assert.equal(ssHit.hit, true, 'Splattershot actually hits enemy at 12.6m');
    assert.equal(ssHit.ctrl.onTarget, ssHit.e, 'Splattershot targets enemy at 12.6m');
    assert.equal(ssHit.ctrl.inRange, true, 'Splattershot stays inRange at 12.6m even with open sky behind enemy');
    assert.ok(ssHit.a.aimPoint.z > 50, 'bullet magnetism stays off (aimPoint remains on background ray)');

    // Splattershot: misses at 14.0m -> out of range
    const ssMiss = setupPair('shooter', 14.0);
    assert.equal(ssMiss.hit, false, 'Splattershot misses enemy at 14.0m');
    assert.equal(ssMiss.ctrl.inRange, false, 'Splattershot is out of range at 14.0m');

    // Splat Dualies: hits at 12.0m -> inRange even with open sky behind enemy
    const duHit = setupPair('dualies', 12.0);
    assert.equal(duHit.hit, true, 'Splat Dualies actually hits enemy at 12.0m');
    assert.equal(duHit.ctrl.onTarget, duHit.e, 'Splat Dualies targets enemy at 12.0m');
    assert.equal(duHit.ctrl.inRange, true, 'Splat Dualies stays inRange at 12.0m');

    // Splat Dualies: misses at 13.5m -> out of range
    const duMiss = setupPair('dualies', 13.5);
    assert.equal(duMiss.hit, false, 'Splat Dualies misses enemy at 13.5m');
    assert.equal(duMiss.ctrl.inRange, false, 'Splat Dualies is out of range at 13.5m');

    // Catalog Shooter (L-3 Nozzlenose): hits at 15.0m -> inRange
    const l3Hit = setupPair('s3-shooter-triplequick', 15.0);
    assert.equal(l3Hit.hit, true, 'L-3 Nozzlenose actually hits enemy at 15.0m');
    assert.equal(l3Hit.ctrl.inRange, true, 'L-3 Nozzlenose stays inRange at 15.0m');

    // Catalog Dualies (Douser Dualies FF): standing reaches 19.6m; turret mode is shorter
    const ffStand = setupPair('s3-maneuver-long', 19.6, { turret: false });
    assert.equal(ffStand.hit, true, 'Douser Dualies FF standing hits at 19.6m');
    assert.equal(ffStand.ctrl.inRange, true, 'Douser Dualies FF standing stays inRange at 19.6m');
    const ffTurretFar = setupPair('s3-maneuver-long', 19.6, { turret: true });
    assert.equal(ffTurretFar.ctrl.inRange, false, 'Douser Dualies FF turret mode is out of range at 19.6m');

    // Catalog Dualies (Glooga Dualies): turret mode extends reach beyond standing
    const gloogaStand = setupPair('s3-maneuver-gallon', 15.5, { turret: false });
    const gloogaTurret = setupPair('s3-maneuver-gallon', 15.5, { turret: true });
    assert.equal(gloogaStand.ctrl.inRange, false, 'Glooga Dualies standing is out of range at 15.5m');
    assert.equal(gloogaTurret.ctrl.inRange, true, 'Glooga Dualies turret mode is inRange at 15.5m');
  } finally {
    G.projectiles._spread = origSpread;
    Math.random = origRand;
    f.close();
  }
});
