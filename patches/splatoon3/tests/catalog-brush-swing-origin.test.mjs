import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

// Mashed brush swings (owner review 2026-10-18): the 1F follow-up swings start
// from the low sweep pose, and the rendered bristles used to set every birth,
// dropping it from 1.6 m (first, overhead windup) to 0.36 m on later swings.
// Real Actor -> WeaponRunner -> catalogue swing -> Projectiles, with the real Character.
test('every mashed brush swing is born at the same body-relative height', async () => {
  const f = await fixture({ fullRuntime: true, productionComposition: true, includeCharacter: true, realProjectiles: true, vmMathRandom: () => .5,
    extraExports: "export { installMainWeaponCatalogRuntime } from './patches/splatoon3/runtime/main-weapon-catalog.mjs';" });
  f.installMainWeaponCatalogRuntime(f.installedRuntime, f.profile);
  const { G, THREE } = f; G.scene = new THREE.Scene(); G.camera = new THREE.PerspectiveCamera(45, 1, .1, 100);
  for (const id of ['s3-brush-mini', 's3-brush-normal', 's3-brush-heavy']) for (const hz of [30, 60, 120]) {
    const a = new f.Actor({ team: 0, name: 'brush', weapon: id, isLocal: true, CharacterClass: f.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
    a.ink = 100; a.grounded = a.ground.hit = true; a.character.actor = a; a.character.onEvent = null; a._nearCamera = () => false;
    a._integrate = () => {}; a._spawnBarrier = () => {}; G.scene.add(a.character.root); G.actors = [a]; G.projectiles.list.length = 0;
    const seen = new Set(), births = [], period = Math.round(hz * .3);
    for (let frame = 0; frame < period * 10; frame++) {
      a.ink = 100; a.aimPitch = 0; a.aimYaw = 0; a.yaw = 0; a.aimDir.set(0, 0, 1); a.aimPoint.set(0, 1, 40);
      a.intent.fire = frame % period === 0;
      G.time += 1 / hz; a.update(1 / hz);
      for (const p of G.projectiles.list) if (p.owner === a && !seen.has(p)) {
        seen.add(p); births.push({ frame, y: p.start.y - a.pos.y, pitch: Math.atan2(p.vel.y, Math.hypot(p.vel.x, p.vel.z)) });
      }
    }
    const swings = new Set(births.map(b => b.frame)).size;
    assert.ok(swings >= 6, `${id} ${hz} Hz: ${swings} swings emitted`);
    const ys = births.map(b => b.y), pitches = births.map(b => b.pitch);
    assert.ok(Math.max(...ys) - Math.min(...ys) < 1e-6, `${id} ${hz} Hz: birth height ${Math.min(...ys).toFixed(3)}..${Math.max(...ys).toFixed(3)} m`);
    assert.ok(Math.min(...ys) > 1, `${id} ${hz} Hz: born above the waist (${Math.min(...ys).toFixed(3)} m)`);
    assert.ok(Math.max(...pitches) - Math.min(...pitches) < 1e-6, `${id} ${hz} Hz: launch pitch does not drift down`);
    a.character.dispose();
  }
});
