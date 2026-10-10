import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, STEP } from './full-install-fixture.mjs';

// #933: the finite-flight Charger must build the victim capsule from the gameplay position (actor.pos) only.
// actor.smoothY is a render-only step-easing offset (actor.visualPos). Logic-only: real composed Actor/Projectiles on the VM;
// not a browser run and not a Splatoon 3 real-device comparison.
function shoot(f, victimY, smoothY) {
  const { G } = f; G.actors.length = 0; const a = f.make({ weapon: 'charger' }); f.tick(a); a.aimYaw = 0; a.aimPitch = 0;
  const ps = G.projectiles; ps.clear();
  ps.fireCharger(a, a.weapon, 1);
  const job = ps._fidelityChargerFlights.at(-1), origin = job.origin.clone(), dir = job.dir.clone();
  const target = f.make({ team: 1, pos: [origin.x + dir.x * 6, origin.y + victimY, origin.z + dir.z * 6] });
  target.smoothY = smoothY; target.hp = 100;
  for (let i = 0; i < 60 && ps._fidelityChargerFlights.length; i++) ps.update(STEP);
  return 100 - target.hp;
}

test('#933 Charger hit admission does not depend on smoothY (muzzle high on the body, ledge snap down)', async t => {
  const f = await boot(); t.after(f.close);
  // Muzzle sits 1.2 above the victim's feet: inside the authoritative capsule. smoothY only changes the rendered height.
  const damages = [-.7, -.35, 0, .35, .7].map(smooth => shoot(f, -1.2, smooth));
  assert.ok(damages[2] > 0, 'baseline: the shot hits the authoritative body');
  assert.deepEqual(damages, damages.map(() => damages[2]), `smoothY must not change the hit: ${damages}`);
});

test('#933 Charger hit admission does not depend on smoothY (muzzle low on the body, ledge snap up)', async t => {
  const f = await boot(); t.after(f.close);
  const damages = [-.7, 0, .7].map(smooth => shoot(f, -.3, smooth));
  assert.ok(damages[1] > 0, 'baseline hit');
  assert.deepEqual(damages, damages.map(() => damages[1]), `smoothY must not change the hit: ${damages}`);
});
