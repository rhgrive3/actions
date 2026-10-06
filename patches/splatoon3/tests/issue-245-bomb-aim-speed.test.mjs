// Issue #245: S3 pins bomb-aiming ground humanoid speed to a fixed 0.72 DU/f,
// which is 0.75 of the 0.96 medium walk, and Run Speed Up gear does not apply
// while the throw button is held. Before the fix, WeaponRunner.moveSpeed had no
// aimingSub branch and the gear wrapper omitted it from lockedMode, so aiming
// kept full normal-walk speed and Human Speed gear still multiplied it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installGear } from '../runtime/gear.mjs';

// Minimal context: installGear only needs these members to exist at wrap time.
// weaponSpeed is what upstream moveSpeed returns; runSpeed is PLAYER.runSpeed,
// the reference the bomb-aiming cap is measured against. They are independent.
function boot(weaponSpeed = 6.0, runSpeed = 6.0) {
  class Actor {}
  Actor.prototype.reset = function () {};
  Actor.prototype.setWeapon = function () {};
  Actor.prototype.splat = function () {};
  Actor.prototype._horizontal = function () {};
  class WeaponRunner {}
  // Upstream moveSpeed: a plain humanoid walk returns PLAYER.runSpeed.
  WeaponRunner.prototype.moveSpeed = function () { return weaponSpeed; };
  WeaponRunner.prototype.update = function () {};
  const api = {
    Actor, WeaponRunner, G: {}, PLAYER: { runSpeed, swimSpeed: 1, enemyInkSpeed: 1 },
    WEAPONS: {}, SUB: { bomb: { inkCost: 1, throwSpeed: 1 } }, on() {},
  };
  installGear(api, {});
  return { api, runner: Object.create(WeaponRunner.prototype) };
}

const RUNSPEED_GEAR = 1.5; // 57AP Human Speed, the value from the issue

function aiming(setup = {}) {
  const r = boot(setup.weaponSpeed ?? 6.0, setup.runSpeed ?? 6.0);
  r.runner.a = { weapon: { kind: 'splatling' }, s3: { modifiers: { runSpeed: setup.gear ?? 1 } } };
  r.runner.aimingSub = !!setup.aimingSub;
  r.runner.rolling = !!setup.rolling;
  r.runner.charging = !!setup.charging;
  r.runner.firingT = 0;
  r.runner.streaming = false;
  return r.runner.moveSpeed();
}

test('#245 bomb aiming caps ground humanoid speed at 0.75 of normal walk', () => {
  const walk = aiming({}), aim = aiming({ aimingSub: true });
  assert.equal(walk, 6.0, 'uncharged walk is the unmodified runSpeed');
  assert.ok(Math.abs(aim / walk - 0.75) < 1e-12, `ratio ${aim / walk} must be 0.75`);
});

test('#245 Human Speed gear does not apply while the throw button is held', () => {
  const zero = aiming({ aimingSub: true, gear: 1 });
  const maxed = aiming({ aimingSub: true, gear: RUNSPEED_GEAR });
  // S3: the bomb-aiming speed is fixed, so 57AP/0AP must stay 1.00, not 1.50.
  assert.ok(Math.abs(maxed / zero - 1.00) < 1e-12, `57AP/0AP ratio ${maxed / zero} must be 1.00`);
  // Gear is untouched the rest of the time.
  assert.ok(Math.abs(aiming({ gear: RUNSPEED_GEAR }) / 6.0 - RUNSPEED_GEAR) < 1e-12);
});

test('#245 the cap never raises a weapon speed that is already lower', () => {
  // A weapon-specific speed below the cap keeps its authoritative value.
  assert.equal(aiming({ aimingSub: true, weaponSpeed: 3.0 }), 3.0,
    'a weapon speed already below the cap keeps its authoritative value');
  assert.equal(aiming({ aimingSub: true, weaponSpeed: 9.0 }), 4.5,
    'a weapon speed above the cap is pulled down to the S3 bomb-aiming speed');
});

test('#245 rolling and charger charge stay gear-locked exactly as before', () => {
  assert.equal(aiming({ rolling: true, gear: RUNSPEED_GEAR }), 6.0);
  assert.equal(aiming({ charging: true, gear: RUNSPEED_GEAR }), 6.0);
});