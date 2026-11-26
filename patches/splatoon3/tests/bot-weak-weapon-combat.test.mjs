import test from 'node:test';
import assert from 'node:assert/strict';
import { botWeakWeaponCombat } from '../runtime/bot-weak-weapon-combat.mjs';
import { botApplyTurfPaintMechanics, botApplyTurfCombatPaint } from '../runtime/bot-turf-paint.mjs';

function makeMove() {
  return {
    x: 0, y: 0, z: 1,
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; },
    multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; },
  };
}

test('strong families (shooter, dualies, slosher) are strictly untouched by botWeakWeaponCombat', () => {
  for (const family of ['shooter', 'dualies', 'slosher']) {
    const actor = {
      weapon: { kind: family, id: family, range: 12 },
      intent: { fire: true, squid: false },
      weaponRunner: { cooldown: 0, charging: false, charge: 0 },
      groundTeam: 1,
    };
    const move = makeMove();
    const res = botWeakWeaponCombat(
      { react: 0, strafeS: 0.5 }, {}, actor, 1 / 60, move,
      { family, dist: 8, range: 12, dx: 0, dz: 8, enemyVisible: true, aimed: true, off: 0.01, inkFrac: 0.8, idealYaw: 0, idealPitch: 0, wantYaw: 0, wantPitch: 0 }
    );
    assert.equal(res, null);
    assert.equal(actor.intent.fire, true);
    assert.equal(actor.intent.squid, false);
  }
});

test('brella tap-fires in turf paint mode instead of holding fire and locking canopy open', () => {
  const G = { match: { mode: 'turf', time: 120 } };
  const move = makeMove();
  const brain = { _turfPaintLatch: true, _turfPaintValidated: true, paintPause: 0 };
  const actor = {
    team: 0, pos: { x: 0, y: 0, z: 0 }, groundTeam: 1,
    weapon: { catalogRecord: { family: 'brella' }, id: 's3-shelter-normal', range: 11 },
    intent: { fire: false, squid: false, sub: false, special: false },
    _prevIntent: { fire: false },
    weaponRunner: { cooldown: 0, catalogState: { pending: false } },
  };
  botApplyTurfPaintMechanics(brain, G, actor, 1 / 60, move, true, 0, 0.8);
  assert.equal(actor.intent.fire, true, 'brella fires on fresh edge');

  // Next frame: previous fire was true -> must release so canopy does not lock open
  actor._prevIntent.fire = true;
  actor.intent.fire = true;
  botApplyTurfPaintMechanics(brain, G, actor, 1 / 60, move, true, 0, 0.8);
  assert.equal(actor.intent.fire, false, 'brella releases fire on held frame');
});

test('brella tap-fires in combat approach and foot clearing', () => {
  const G = { match: { mode: 'turf', time: 120 } };
  const move = makeMove();
  const brain = { bombCd: 5 };
  const actor = {
    team: 0, pos: { x: 0, y: 0, z: 0 }, groundTeam: 2,
    weapon: { catalogRecord: { family: 'brella' }, id: 's3-shelter-normal', range: 11 },
    intent: { fire: false, squid: false, sub: false },
    _prevIntent: { fire: true },
    weaponRunner: { cooldown: 0, charging: false, catalogState: { pending: false } },
  };
  botApplyTurfCombatPaint(brain, G, actor, 1 / 60, move, true, 0, 0, 15, 11, 0.8);
  assert.equal(actor.intent.fire, false, 'brella does not hold fire during approach paint');
});

test('charger pre-charges on enemy sighting and holds until aim tightens', () => {
  const actor = {
    weapon: { kind: 'charger', id: 'charger', rangeMax: 24 },
    intent: { fire: false, squid: false },
    weaponRunner: { cooldown: 0, charging: false, charge: 0 },
    groundTeam: 1,
  };
  const move = makeMove();
  const brain = { react: 0.05 };
  // Not aimed yet (off = 0.25) -> still starts pre-charging
  botWeakWeaponCombat(brain, {}, actor, 1 / 60, move, {
    family: 'charger', dist: 18, range: 22, dx: 0, dz: 18,
    enemyVisible: true, aimed: false, off: 0.25, inkFrac: 0.8,
    idealYaw: 0, idealPitch: 0, wantYaw: 0.1, wantPitch: 0,
  });
  assert.equal(actor.intent.fire, true, 'charger begins pre-charge before aim locks');

  // Fully charged (0.96) but aim is slightly off -> holds briefly
  actor.weaponRunner.charging = true;
  actor.weaponRunner.charge = 0.96;
  botWeakWeaponCombat(brain, {}, actor, 1 / 60, move, {
    family: 'charger', dist: 18, range: 22, dx: 0, dz: 18,
    enemyVisible: true, aimed: true, off: 0.09, inkFrac: 0.8,
    idealYaw: 0, idealPitch: 0, wantYaw: 0.08, wantPitch: 0,
  });
  assert.equal(actor.intent.fire, true, 'charger holds full charge while tightening aim');

  // Aim locked squarely on body (off = 0.015) -> releases shot!
  botWeakWeaponCombat(brain, {}, actor, 1 / 60, move, {
    family: 'charger', dist: 18, range: 22, dx: 0, dz: 18,
    enemyVisible: true, aimed: true, off: 0.015, inkFrac: 0.8,
    idealYaw: 0, idealPitch: 0, wantYaw: 0.01, wantPitch: 0,
  });
  assert.equal(actor.intent.fire, false, 'charger releases shot when aim is on target');
});

test('splatana uses rapid tap-slashes at close range and full charge at long range', () => {
  const actor = {
    weapon: { catalogRecord: { family: 'splatana' }, sourceMainActor: 'WeaponSaberLite', id: 's3-saber-lite', range: 16 },
    intent: { fire: false, squid: false },
    _prevIntent: { fire: false },
    weaponRunner: { cooldown: 0, charging: true, charge: 0.05, catalogState: { pending: false, melee: false } },
    groundTeam: 1,
  };
  const move = makeMove();
  // Close range (6m < 9.5m): releases immediately instead of waiting for 0.45
  botWeakWeaponCombat({ react: 0 }, {}, actor, 1 / 60, move, {
    family: 'splatana', dist: 6, range: 16, dx: 0, dz: 6,
    enemyVisible: true, aimed: true, off: 0.02, inkFrac: 0.8,
    idealYaw: 0, idealPitch: 0, wantYaw: 0, wantPitch: 0,
  });
  assert.equal(actor.intent.fire, false, 'splatana releases quick horizontal slash at close range');

  // Long range (13m >= 9.5m): holds charge until 1.0 for true vertical slash
  actor.weaponRunner.charge = 0.6;
  botWeakWeaponCombat({ react: 0 }, {}, actor, 1 / 60, move, {
    family: 'splatana', dist: 13, range: 16, dx: 0, dz: 13,
    enemyVisible: true, aimed: true, off: 0.02, inkFrac: 0.8,
    idealYaw: 0, idealPitch: 0, wantYaw: 0, wantPitch: 0,
  });
  assert.equal(actor.intent.fire, true, 'splatana holds to full charge at long range');
});
