import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { createBotSpecialContext } from '../runtime/bot-special-context.mjs';
import { captureNav, followNav, specialAllowsMain, specialAllowsSub } from '../runtime/bot-special-movement.mjs';
import { installRankedBots } from '../runtime/ranked/bots.mjs';
import { botWeakWeaponCombat } from '../runtime/bot-weak-weapon-combat.mjs';
import { botApplyTurfPaintMechanics, botApplyTurfCombatPaint } from '../runtime/bot-turf-paint.mjs';
import { botCoverBomb, BOT_COMBAT } from '../runtime/bot-combat-quality.mjs';
import { stabilizeBotForm } from '../runtime/bot-form-stability.mjs';

const EXTRA = `
export { driveRangedSpecial } from './patches/splatoon3/runtime/bot-special-ranged.mjs';
export { driveSupportSpecial } from './patches/splatoon3/runtime/bot-special-support.mjs';
export { driveMeleeSpecial } from './patches/splatoon3/runtime/bot-special-melee.mjs';
`;

let _fxPromise = null;
function getFx() {
  return (_fxPromise ||= fixture({ fullRuntime: true, productionComposition: true, extraExports: EXTRA }));
}

const vec = (x = 0, y = 0, z = 0) => ({
  x, y, z,
  set(nx, ny, nz) { this.x = nx; this.y = ny; this.z = nz; return this; },
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; },
  clone() { return vec(this.x, this.y, this.z); },
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; },
  addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; },
  length() { return Math.hypot(this.x, this.y, this.z); },
  lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; },
  normalize() { const l = this.length() || 1; this.x /= l; this.y /= l; this.z /= l; return this; },
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); },
});

function makeHarness(special, { distance = 18, enemyY = 0, active = true, stateExtra = {} } = {}) {
  const actor = {
    alive: true, isBot: true, remote: false, isLocal: false, team: 0, slot: 0, nid: 1, netLife: 1,
    grounded: true, climbing: false, hp: 100, lastDamage: 10,
    pos: vec(0, 0, 0), vel: vec(0, 0, 0), aimYaw: 0, aimPitch: 0, yaw: 0,
    aimPoint: vec(0, 1.1, distance),
    weapon: { special, range: 14, projSpeed: 30 },
    weaponId: 'shooter',
    specialReady: () => !active,
    specialActive: active ? { id: special, t: 1, duration: 8, phase: 'active', ...stateExtra } : null,
    _s3AllSpecialState: active ? { id: special, t: 1, duration: 8, phase: 'active', held: {}, ...stateExtra } : null,
  };
  const enemy = { alive: true, team: 1, pos: vec(0, enemyY, distance), vel: vec(0, 0, 0), form: 'kid', hp: 100 };
  const intent = { move: vec(0, 0, 1), fire: true, sub: false, jump: false, squid: false, special: false, booyah: false };
  const brain = {
    target: enemy, seeTimer: 1, aimYaw: 0, aimPitch: 0, mode: 'fight', goal: 0,
    _range: () => 14, _nearWater: () => false, _wet: () => false,
  };
  const world = {
    time: 10,
    actors: [actor, enemy],
    nav: { nodes: [vec(0, 0, 20)] },
    level: { groundHeight: () => 0, spawnPads: [vec(-30, 0, 0), vec(30, 0, 0)] },
    physics: {
      los: () => true,
      segment: () => ({ hit: false }),
      raycast: (o, d, _len, out) => { out.hit = true; out.point.set(o.x, 0, o.z); out.normal.set(0, 1, 0); return out; },
    },
    projectiles: { bombs: [], clouds: [], _s3SupportCoolers: [], _s3AllSpecialObjects: [] },
    paint: { regionStats: () => ({ n: 1, own: 0, enemy: 1, empty: 0 }) },
  };
  function makeCtx({ dt = 1 / 60, navMove = [0, 0, 1], target = enemy, see = true } = {}) {
    intent.move.set(navMove[0], navMove[1], navMove[2]);
    brain.target = target;
    brain.seeTimer = see && target ? 1 : 0;
    const ctx = createBotSpecialContext(actor, intent, dt, target, {
      world, brain, move: intent.move, wantYaw: brain.aimYaw, wantPitch: brain.aimPitch, aimDistance: distance,
    });
    return ctx;
  }
  return { actor, enemy, intent, brain, world, makeCtx };
}

test('systemic: LOS height aligns with bots.js (1.3 -> 1.0) and safePath handles gentle ramps while rejecting cliffs', () => {
  const h = makeHarness('trizooka', { distance: 15 });
  // Low cover at y = 0.95 blocks 1.1 -> 0.85 but allows 1.3 -> 1.0.
  h.world.physics.los = (a, b) => a.y >= 1.25 && b.y >= 0.95;
  const ctx = h.makeCtx();
  assert.equal(ctx.visible, true, 'aligned LOS height sees over low cover');
  assert.equal(ctx.enemy, h.enemy);

  // Gentle ramp (+0.70 per step) is accepted by relaxed safePath; steep cliff (-2.0) is rejected.
  h.world.physics.los = () => true;
  h.world.level.groundHeight = (_x, z) => Math.min(1.4, Math.max(0, z * 0.35));
  assert.equal(h.makeCtx().safePath(vec(0, 0.7, 2.0)), true, 'gentle ramp accepted');
  h.world.level.groundHeight = (_x, z) => (z > 1 ? -2 : 0);
  assert.equal(h.makeCtx().safePath(vec(0, 0, 3.0)), false, 'steep cliff still rejected');
});

test('systemic: followNav steers look-ahead when !enemy and uses short-step fallback', () => {
  const h = makeHarness('trizooka', { distance: 18 });
  h.brain.aimYaw = 0; h.brain.aimPitch = -0.3;
  // Block 1.5m probe, allow 0.75m fallback.
  h.world.level.groundHeight = (x) => (x > 1.1 ? -5 : 0);
  const ctx = h.makeCtx({ navMove: [1, 0, 0], target: null, see: false });
  captureNav(ctx);
  assert.equal(followNav(ctx, 0.8), true, 'short-step fallback moves along nav');
  assert.ok(ctx.move.x > 0.5, 'moves in nav +X direction');
  assert.ok(Math.abs(ctx.wantYaw - Math.PI / 2) < 0.05, 'steers wantYaw toward movement direction instead of freezing via holdLook');
});

test('systemic: ranked/bots.mjs does not skip driveCanonicalBotSpecial when _nativeTowerBoarding is active with specialActive', () => {
  let baseUpdateCalls = 0;
  let boardingCalls = 0;
  function BotBrain(actor) { this.a = actor; }
  BotBrain.prototype._tail = () => {};
  BotBrain.prototype.update = function () { baseUpdateCalls++; };

  const G = {
    match: {
      playing: () => true,
      ranked: {
        mode: 'tower',
        frame: { actors: [], inputs: {} },
        rule: { botGoal: () => ({ action: 'ride', pos: [0, 0, 5] }) },
      },
    },
  };
  installRankedBots({
    G, BotBrain,
    nativeTower: { update: () => { boardingCalls++; return true; } },
  });

  const actor = { alive: true, pos: vec(0, 0, 0), intent: { move: vec() }, specialActive: { id: 'trizooka' } };
  const brain = new BotBrain(actor);
  brain._nativeTowerBoarding = { active: true };
  brain.update(1 / 60);

  assert.equal(boardingCalls, 0, 'nativeTower boarding yields while specialActive is set');
  assert.equal(baseUpdateCalls, 1, 'base BotBrain.update (and driveCanonicalBotSpecial) runs');
  assert.equal(brain._nativeTowerBoarding, null);
});

test('Trizooka: strafes in [12, 28], roams with look-ahead when !enemy, and stops firing after 3 shots', async () => {
  const { driveRangedSpecial } = await getFx();
  const h = makeHarness('trizooka', { distance: 20 });
  h.actor.s3Trizooka = { id: 'trizooka', shots: 1, t: 1, phase: 'active' };
  const ctxMid = h.makeCtx();
  driveRangedSpecial(ctxMid);
  assert.ok(Math.abs(ctxMid.move.x) > 0.2, 'strafes laterally in [12, 28] instead of dead-stopping');
  assert.equal(h.intent.fire, true, 'fires when aligned with shots < 3');

  // After 3 shots (post-shot end-delay), must release fire cleanly while still moving.
  h.actor.s3Trizooka.shots = 3;
  const ctxDone = h.makeCtx();
  driveRangedSpecial(ctxDone);
  assert.equal(h.intent.fire, false, 'stops holding fire after 3 shots during post-shot end-delay');
  assert.ok(ctxDone.move.lengthSq() > 0, 'keeps moving cleanly during end-delay');

  // When !enemy (and sighting expired), roams along nav and steers look-ahead.
  h.world.time += 5;
  const ctxRoam = h.makeCtx({ navMove: [1, 0, 0], target: null, see: false });
  driveRangedSpecial(ctxRoam);
  assert.ok(ctxRoam.move.x > 0.5, 'roams smoothly when !enemy');
  assert.ok(Math.abs(ctxRoam.wantYaw - Math.PI / 2) < 0.05, 'steers look-ahead while roaming');
});

test('Ink Vac: never freezes when !enemy, strafes in band, and holds suction across brief LOS flicker', async () => {
  const { driveRangedSpecial } = await getFx();
  const h = makeHarness('inkVac', { distance: 12, stateExtra: { phase: 'inhale', t: 0.5, fireHeld: true } });
  const c1 = h.makeCtx({ dt: 1 / 60 });
  driveRangedSpecial(c1);
  assert.equal(h.intent.fire, true, 'inhales when enemy visible');
  assert.ok(Math.abs(c1.move.x) > 0.2, 'strafes in [7, 18] during inhale');

  // Brief LOS flicker (~0.2s <= 0.45s): keeps suction active instead of resetting intakeWarmup.
  const cFlicker = h.makeCtx({ dt: 0.2, see: false });
  driveRangedSpecial(cFlicker);
  assert.equal(h.intent.fire, true, 'maintains inhale suction across brief LOS flicker');
  assert.ok(cFlicker.move.lengthSq() > 0, 'keeps moving during LOS flicker');

  // Extended loss (> 0.45s): roams instead of freezing.
  const cLost = h.makeCtx({ dt: 0.4, navMove: [1, 0, 0], target: null, see: false });
  driveRangedSpecial(cLost);
  assert.equal(h.intent.fire, false);
  assert.ok(cLost.move.lengthSq() > 0, 'roams instead of freezing when !enemy in inhale');

  // Exhale phase with !enemy: preserves held fireHeld and roams instead of freezing.
  h.actor.specialActive.phase = 'exhale';
  h.actor._s3AllSpecialState.phase = 'exhale';
  h.actor._s3AllSpecialState.fireHeld = true;
  const cExhaleLost = h.makeCtx({ dt: 1 / 60, navMove: [0, 0, 1], target: null, see: false });
  driveRangedSpecial(cExhaleLost);
  assert.equal(h.intent.fire, true, 'exhale preserves held countershot when !enemy');
  assert.ok(cExhaleLost.move.lengthSq() > 0, 'exhale roams instead of freezing when !enemy');
});

test('Tenta Missiles: roams when LOS breaks and strafes while locking instead of freezing', async () => {
  const { driveRangedSpecial } = await getFx();
  const h = makeHarness('tentaMissiles', { distance: 20, stateExtra: { phase: 'aim', t: 1 } });
  const cLost = h.makeCtx({ navMove: [1, 0, 0], target: null, see: false });
  driveRangedSpecial(cLost);
  assert.ok(cLost.move.x > 0.5, 'roams to reposition when !enemy instead of freezing');

  const cLock = h.makeCtx();
  driveRangedSpecial(cLock);
  assert.ok(Math.abs(cLock.move.x) > 0.2, 'strafes gently while locking in [14, 30]');
});

test('Killer Wail 5.1: post-40F allows turf painting/roaming and simultaneous-main modules', async () => {
  const { driveRangedSpecial } = await getFx();
  const h = makeHarness('killerWail', { distance: 20, stateExtra: { t: 1.0, beams: 3 } });
  h.brain.mode = 'paint';
  h.intent.fire = true;
  const ctx = h.makeCtx({ navMove: [1, 0, 0], target: null, see: false });
  driveRangedSpecial(ctx);
  assert.equal(h.intent.fire, true, 'post-40F Killer Wail preserves main-weapon turf painting when !enemy');
  assert.ok(ctx.move.x > 0.5, 'post-40F Killer Wail continues navigating');

  // Simultaneous-main helper contract:
  assert.equal(specialAllowsMain({ specialActive: { id: 'killerWail', t: 0.2 } }), false, 'pre-40F blocks main');
  assert.equal(specialAllowsMain({ specialActive: { id: 'killerWail', t: 1.0 } }), true, 'post-40F allows main');
  assert.equal(specialAllowsSub({ specialActive: { id: 'killerWail', t: 1.0 } }), true, 'post-40F allows sub');

  // botCoverBomb allows Killer Wail post-40F:
  const cbActor = {
    alive: true, grounded: true, specialActive: { id: 'killerWail', t: 1.0 },
    intent: { special: false }, weapon: { sub: 'splatBomb' }, weaponRunner: {},
  };
  const cbBrain = { bombCd: 0, seeTimer: 0, lostTimer: 0.5, target: h.enemy };
  assert.equal(botCoverBomb(cbBrain, cbActor, 8, 100, 60, 0.1, () => 0), BOT_COMBAT.coverBombLift);

  // botApplyTurfPaintMechanics runs during Killer Wail post-40F:
  const tpActor = {
    alive: true, team: 0, pos: vec(0, 0, 0), groundTeam: 2,
    specialActive: { id: 'killerWail', t: 1.0 },
    weapon: { id: 'shooter', family: 'shooter', sub: 'splatBomb' },
    weaponRunner: { cooldown: 0, charging: false },
    intent: { fire: false, sub: false, squid: false, special: false },
  };
  const tpBrain = { t: 1, _turfPaintLatch: true, _turfPaintValidated: true, paintPause: 0, aimPitch: -0.1 };
  botApplyTurfPaintMechanics(tpBrain, { match: { mode: 'turf', time: 60 } }, tpActor, 1 / 60, vec(0, 0, 1), true, 0, 0.8);
  assert.equal(tpActor.intent.fire, true, 'turf paint mechanics fire during post-40F Killer Wail');

  // botApplyTurfCombatPaint clears enemy ink underfoot during post-40F Killer Wail:
  tpActor.intent.fire = false;
  botApplyTurfCombatPaint(tpBrain, { match: { mode: 'turf', time: 60 } }, tpActor, 1 / 60, vec(0, 0, 1), true, 0, 0, 10, 12, 0.8);
  assert.equal(tpActor.intent.fire, true, 'combat foot-clearing runs during post-40F Killer Wail');

  // stabilizeBotForm holds form during post-40F Killer Wail:
  const fsActor = { alive: true, specialActive: { id: 'killerWail', t: 1.0 }, intent: { squid: false, fire: false } };
  stabilizeBotForm(fsActor, 1);
  fsActor.intent.squid = true; stabilizeBotForm(fsActor, 1 / 60);
  assert.equal(fsActor.intent.squid, true);
  fsActor.intent.squid = false; stabilizeBotForm(fsActor, 1 / 60);
  assert.equal(fsActor.intent.squid, true, 'form stability holds squid form during post-40F Killer Wail');

  // botWeakWeaponCombat passes specialActive gate during post-40F Killer Wail:
  const wwActor = {
    alive: true, team: 0, pos: vec(0, 0, 0), grounded: true,
    specialActive: { id: 'killerWail', t: 1.0 },
    weapon: { id: 's3-charger-normal', family: 'charger' },
    weaponRunner: { cooldown: 0, charging: false, charge: 0 },
    intent: { fire: false, squid: false, sub: false },
  };
  const wwRes = botWeakWeaponCombat({ _chargerState: null }, {}, wwActor, 1 / 60, vec(0, 0, 1), {
    family: 'charger', dist: 16, range: 22, dx: 0, dz: 16,
    enemyVisible: true, aimed: true, off: 0.02, inkFrac: 0.8,
    idealYaw: 0, idealPitch: 0, wantYaw: 0, wantPitch: 0,
  });
  assert.notEqual(wwRes, undefined, 'botWeakWeaponCombat passes specialActive gate during post-40F Killer Wail');
});

test('Zipcaster: moves/strafes during ready phase combat, roams if origin path blocked, and allows main (not sub)', async () => {
  const { driveRangedSpecial } = await getFx();
  const h = makeHarness('zipcaster', { distance: 10, stateExtra: { phase: 'ready', origin: vec(0, 0, -10), inkFuel: 100 } });
  const cFight = h.makeCtx();
  driveRangedSpecial(cFight);
  assert.ok(Math.abs(cFight.move.x) > 0.2, 'strafes while shooting main weapon in ready phase');
  assert.equal(h.intent.fire, true);

  // When !enemy (sighting expired) and safePath(s.origin) fails (cliff toward -Z), falls back to roaming along +X nav.
  h.world.time += 5;
  h.world.level.groundHeight = (_x, z) => (z < -0.5 ? -5 : 0);
  const cRoam = h.makeCtx({ navMove: [1, 0, 0], target: null, see: false });
  driveRangedSpecial(cRoam);
  assert.ok(cRoam.move.x > 0.3, 'falls back to roaming when origin path is blocked');

  assert.equal(specialAllowsMain({ specialActive: { id: 'zipcaster', phase: 'ready' } }), true);
  assert.equal(specialAllowsMain({ specialActive: { id: 'zipcaster', phase: 'zip' } }), false);
  assert.equal(specialAllowsSub({ specialActive: { id: 'zipcaster', phase: 'ready' } }), false);
});

test('Crab Tank and Inkjet: strafe inside engagement band instead of dead-stopping', async () => {
  const { driveRangedSpecial } = await getFx();
  const crab = makeHarness('crabTank', { distance: 20 });
  const cCrab = crab.makeCtx();
  driveRangedSpecial(cCrab);
  assert.ok(Math.abs(cCrab.move.x) > 0.2, 'Crab Tank strafes in [16, 26]');

  const jet = makeHarness('inkjet', { distance: 20 });
  jet.actor.pos.y = 5;
  const cJet = jet.makeCtx();
  driveRangedSpecial(cJet);
  assert.ok(Math.abs(cJet.move.x) > 0.2, 'Inkjet hover-strafes in [16, 24]');
});

test('Booyah Bomb: throws toward last-seen or nav goal when fully charged and !enemy', async () => {
  const { driveRangedSpecial } = await getFx();
  const h = makeHarness('booyahBomb', { distance: 15, stateExtra: { phase: 'ready', charge: 1, held: { sub: false } } });
  // First observe enemy, then lose enemy.
  driveRangedSpecial(h.makeCtx());
  h.brain.aimYaw = 0; h.brain.aimPitch = 0;
  let held = false, released = false;
  for (let i = 0; i < 10; i++) {
    const c = h.makeCtx({ target: null, see: false });
    driveRangedSpecial(c);
    h.brain.aimYaw = c.wantYaw; h.brain.aimPitch = c.wantPitch;
    if (h.intent.sub) { held = true; h.actor._s3AllSpecialState.held.sub = true; }
    else if (held) { released = true; break; }
  }
  assert.equal(held, true, 'presses R to throw at last-seen/nav target when !enemy');
  assert.equal(released, true, 'releases R to throw instead of holding until 10s timeout');
});

test('Support hold specials: move when blocked and release via bounded 1.5s fallback timeout', async () => {
  const { driveSupportSpecial } = await getFx();
  for (const special of ['storm', 'tacticooler', 'waveBreaker', 'splattercolorScreen', 'tripleInkstrike', 'superChump']) {
    const h = makeHarness(special, { distance: 20, stateExtra: { phase: 'active', t: 1, shots: 0, nextMarkerStart: 0 } });
    // Force !point by returning -Infinity groundHeight (blocks normal aimPlan).
    h.world.level.groundHeight = () => -Infinity;
    let moved = false, threw = false, held = false;
    for (let i = 0; i < 130; i++) {
      const c = h.makeCtx({ dt: 1 / 60, navMove: [1, 0, 0], target: null, see: false });
      c.safePath = () => true;
      driveSupportSpecial(c);
      if (c.move.lengthSq() > 0.01) moved = true;
      if (special === 'superChump') {
        if (h.intent.fire) { threw = true; break; }
      } else {
        if (h.intent.sub) held = true;
        else if (held) { threw = true; break; }
      }
    }
    assert.equal(moved, true, `${special}: moves while blocked instead of freezing`);
    assert.equal(threw, true, `${special}: releases via bounded ~1.5s fallback timeout`);
  }
});

test('Kraken Royale: breaks out of charge-hold freeze after >0.65s and chases when remaining<=1.3 or |height|>2', async () => {
  const { driveMeleeSpecial } = await getFx();
  const h = makeHarness('krakenRoyale', {
    distance: 8,
    stateExtra: { phase: 'charge', t: 2, duration: 8, chargeT: 1.0 },
  });
  // First 0.5s after target loss stays in charge (existing contract).
  for (let i = 0; i < 25; i++) {
    driveMeleeSpecial(h.makeCtx({ dt: 1 / 60, target: null, see: false }));
  }
  assert.equal(h.intent.fire, true, 'briefly holds charge right after target loss');

  // After >0.65s, releases safe dash (or roams if blocked) instead of freezing forever.
  let released = false;
  for (let i = 0; i < 25; i++) {
    driveMeleeSpecial(h.makeCtx({ dt: 1 / 60, target: null, see: false }));
    if (!h.intent.fire) { released = true; break; }
  }
  assert.equal(released, true, 'releases charge-hold freeze after timeout');

  // Active swim phase with remaining <= 1.3 and |height| > 2 still moves instead of freezing.
  h.actor._s3AllSpecialState.phase = 'swim';
  h.actor._s3AllSpecialState.t = 7.2; // remaining = 0.8 <= 1.3
  h.enemy.pos.set(0, 3.5, 10); // |height| = 3.5 > 2
  const cLate = h.makeCtx();
  driveMeleeSpecial(cLate);
  assert.ok(cLate.move.lengthSq() > 0.1, 'chases/roams when remaining <= 1.3 and |height| > 2');
});

test('Ultra Stamp: strafes and times out cleanly when stampAimThrow is stuck on !valid/!isAimed', async () => {
  const { driveMeleeSpecial } = await getFx();
  const h = makeHarness('ultraStamp', {
    distance: 10, enemyY: 1.6,
    stateExtra: { phase: 'active', t: 2, duration: 8 },
  });
  // Put bot into stampAimThrow state, then make aim never converge (isAimed = false).
  const c0 = h.makeCtx();
  c0.memory.stampAimThrow = true;
  c0.memory.stampAimHoldT = 0;
  let moved = false, released = false;
  for (let i = 0; i < 90; i++) {
    const c = h.makeCtx({ dt: 1 / 60 });
    c.isAimed = () => false;
    driveMeleeSpecial(c);
    if (c.move.lengthSq() > 0.05) moved = true;
    if (!h.intent.sub && !c.memory.stampAimThrow) { released = true; break; }
  }
  assert.equal(moved, true, 'strafes instead of freezing while stampAimThrow waits on !isAimed');
  assert.equal(released, true, 'times out stampAimThrow cleanly after ~1.2s');
});
