import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  botEvaluateTurfPaint,
  botStabilizeTurfAim,
  botTurfPitchReady,
  botApplyTurfPaintMechanics,
  botApplyTurfCombatPaint,
  botScorePaintCandidate,
  botRawWeaponFamily,
  botWeaponPaintProfile,
} from '../runtime/bot-turf-paint.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { fixture } from './source-fixture.mjs';
import { adaptSource } from '../adapter.mjs';

test('weapon-family & sub-archetype pitch calibration upgrades Brella, Splatana, Stringer, Roller, and sub-variants', () => {
  const G = { level: { faces: [1, 2] } };
  const brain = { sweep: 0 };

  const brellaActor = { pos: { x: 0, y: 0, z: 0 }, weapon: { catalogRecord: { family: 'brella' } } };
  assert.equal(botRawWeaponFamily(brellaActor.weapon, 'shooter'), 'brella');
  assert.equal(botStabilizeTurfAim(brain, G, brellaActor, 'shooter', 0, 0, -0.42).pitch, -0.12);

  const splatanaActor = { pos: { x: 0, y: 0, z: 0 }, weapon: { catalogRecord: { family: 'splatana' } } };
  assert.equal(botRawWeaponFamily(splatanaActor.weapon, 'splatana'), 'splatana');
  assert.equal(botStabilizeTurfAim(brain, G, splatanaActor, 'splatana', 0, 0, -0.42).pitch, -0.09);

  const stringerActor = { pos: { x: 0, y: 0, z: 0 }, weapon: { catalogRecord: { family: 'stringer' } } };
  assert.equal(botRawWeaponFamily(stringerActor.weapon, 'stringer'), 'stringer');
  assert.equal(botStabilizeTurfAim(brain, G, stringerActor, 'stringer', 0, 0, -0.42).pitch, -0.08);

  const rollerActor = { pos: { x: 0, y: 0, z: 0 }, weapon: { catalogRecord: { family: 'roller' } } };
  assert.equal(botRawWeaponFamily(rollerActor.weapon, 'roller'), 'roller');
  assert.equal(botStabilizeTurfAim(brain, G, rollerActor, 'roller', 0, 0, -0.42).pitch, -0.22);

  // Sub-archetypes: Dynamo Roller, LACT-450, Explosher
  const dynamoProf = botWeaponPaintProfile({ sourceMainActor: 'WeaponRollerHeavy' }, 'roller');
  assert.equal(dynamoProf.pitch, -0.15);
  const lactProf = botWeaponPaintProfile({ sourceMainActor: 'WeaponStringerShort' }, 'stringer');
  assert.equal(lactProf.stringerChargeCap, 0.14);
  assert.equal(lactProf.strafe, 0.40);
  const explosherProf = botWeaponPaintProfile({ sourceMainActor: 'WeaponSlosherLauncher' }, 'slosher');
  assert.equal(explosherProf.pitch, -0.06);
});

test('terrain slope compensation adjusts pitch uphill and downhill along active navigation waypoint', () => {
  const actor = { pos: { x: 0, y: 0, z: 0 }, weapon: { catalogRecord: { family: 'shooter' } } };
  const brain = { path: [0], pi: 0, sweep: 0 };

  const uphillG = { nav: { nodes: [{ x: 0, y: 1.5, z: 4 }] }, level: { faces: [1] } };
  const upAim = botStabilizeTurfAim(brain, uphillG, actor, 'shooter', 0, 0, -0.10);
  assert.ok(upAim.pitch > -0.05, `expected uphill pitch > -0.05, got ${upAim.pitch}`);

  const downhillG = { nav: { nodes: [{ x: 0, y: -1.5, z: 4 }] }, level: { faces: [1] } };
  const downAim = botStabilizeTurfAim(brain, downhillG, actor, 'shooter', 0, 0, -0.10);
  assert.ok(downAim.pitch < -0.15, `expected downhill pitch < -0.15, got ${downAim.pitch}`);
});

test('multi-point paint detection caches per perception epoch and applies Schmitt-trigger hysteresis', () => {
  let calls = 0;
  const G = {
    level: { faces: new Array(12).fill({}) },
    paint: {
      grid: new Uint8Array(64),
      regionStats(_x, _y, _z, _r, _t, out) {
        calls++;
        out.own = 0.78;
        out.enemy = 0.02;
        out.empty = 0.20;
        out.n = 20;
        return out;
      },
    },
  };
  const actor = { pos: { x: 0, y: 0, z: 0 }, team: 1, weapon: { range: 12 } };
  const brain = { _paintObservationEpoch: 1, _turfPaintLatch: true };
  const move = { x: 0, z: 1 };
  const ahead = { own: 0.78, enemy: 0.02, empty: 0.20, n: 20 };

  const keepPainting = botEvaluateTurfPaint(brain, G, actor, move, true, 0, ahead, 0.8);
  assert.equal(keepPainting, true);
  assert.equal(calls, 3);

  const keepPaintingCached = botEvaluateTurfPaint(brain, G, actor, move, true, 0, ahead, 0.8);
  assert.equal(keepPaintingCached, true);
  assert.equal(calls, 3);

  const wellPainted = { own: 0.92, enemy: 0.0, empty: 0.08, n: 20 };
  brain._paintObservationEpoch = 2;
  G.paint.regionStats = (_x, _y, _z, _r, _t, out) => {
    calls++;
    out.own = 0.92;
    out.enemy = 0.0;
    out.empty = 0.08;
    out.n = 20;
    return out;
  };
  const stopPainting = botEvaluateTurfPaint(brain, G, actor, move, true, 0, wellPainted, 0.8);
  assert.equal(stopPainting, false);
  assert.equal(brain._turfPaintLatch, false);
});

test('pitch-readiness gate blocks shooting into the floor immediately after foot-paint / refill puddle', () => {
  const actor = { weapon: { catalogRecord: { family: 'shooter' } } };
  const brain = {
    mode: 'paint',
    _footPaint: false,
    _footPaintCooldown: 1.8,
    aimPitch: -0.68,
    t: 5.0,
    _puddleT: 4.8,
  };
  assert.equal(botTurfPitchReady(brain, actor, 'shooter', -0.10), false);
  brain.aimPitch = -0.20;
  assert.equal(botTurfPitchReady(brain, actor, 'shooter', -0.10), true);
});

test('authentic Splatoon 3 strategy mechanics: strafe painting, special hold/unleash, buzzer-beater sub, and ally deconfliction', () => {
  const shooterActor = {
    id: 1,
    team: 0,
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, z: 4 },
    intent: { fire: true, sub: false, special: true },
    specialReady: () => true,
    weapon: { catalogRecord: { family: 'shooter' }, range: 13 },
  };
  const brain = { t: 1.0, bombCd: 0, _turfMultiCache: { flankBias: 0.25, effOwn: 0.5, effEnemy: 0.2 } };
  const move = { x: 0, z: 1 };
  const G = {
    match: { mode: 'turf', time: 42, duration: 180 },
    paint: { coverage: () => [0.48, 0.36] },
    nav: { nodes: [{ x: 12, y: 0, z: 12 }] },
    level: {
      faces: new Array(12).fill({}),
      spawnPads: [{ x: 0, y: 0, z: -40 }, { x: 0, y: 0, z: 40 }],
    },
    actors: [
      shooterActor,
      { id: 2, team: 0, dead: false, hp: 100, pos: { x: 10, y: 0, z: 10 }, bot: { goal: 0 } },
    ],
  };

  // During 30 < time <= 50s hold window, non-combat paint mode saves Special for final 30s
  botApplyTurfPaintMechanics(brain, G, shooterActor, 1 / 60, move, true, 0, 0.85);
  assert.ok(Math.abs(move.x) > 0.2, `expected lateral strafe in move.x, got ${move.x}`);
  assert.equal(shooterActor.intent.special, false, 'expected special held during 50s..30s window');

  // In final 4s, both Special unleash and buzzer-beater Sub throw activate
  G.match.time = 2.5;
  botApplyTurfPaintMechanics(brain, G, shooterActor, 1 / 60, move, true, 0, 0.85);
  assert.equal(shooterActor.intent.special, true, 'expected special unleashed in final 30s');
  assert.equal(shooterActor.intent.sub, true, 'expected buzzer-beater bomb throw in final 4s');

  // Ally deconfliction supports integer node IDs on other.bot.goal
  const st = { empty: 0.5, enemy: 0.1, own: 0.4 };
  const nearAllyScore = botScorePaintCandidate(brain, G, shooterActor, { x: 12, y: 0, z: 12 }, 10, 0.5, st, 5.0);
  const freeLaneScore = botScorePaintCandidate(brain, G, shooterActor, { x: -20, y: 0, z: 12 }, 10, 0.5, st, 5.0);
  assert.ok(freeLaneScore > nearAllyScore + 1.5, `expected free lane (${freeLaneScore}) > near-ally lane (${nearAllyScore})`);
});

test('live INKWAVE engine integration: Level + Physics + NavGraph + PaintSystem + BotBrain on Kelpline Dome', async () => {
  const headlessRenderer = () => ({
    capabilities: { getMaxAnisotropy: () => 1 }, target: null,
    getRenderTarget() { return this.target; }, getClearColor(out) { return out.setRGB(0, 0, 0); },
    getClearAlpha() { return 0; }, setRenderTarget(t) { this.target = t; },
    setClearColor() {}, clear() {}, render() {},
  });
  const f = await fixture({
    realProjectiles: true,
    adaptNative: (rel, s) => rel === 'src/game/bots.js' ? adaptBuildSource(rel, s) : adaptSource(rel, s),
    extraExports: `
      export { BotBrain } from './inkwave-public/src/game/bots.js';
      export { NavGraph } from './inkwave-public/src/game/nav.js';
      export { MAP_LAYOUTS } from './inkwave-public/src/world/maps.js';
    `,
  });
  const { G } = f;
  G.level = new f.Level(f.MAP_LAYOUTS.kelpline);
  G.physics = new f.Physics(G.level);
  G.nav = new f.NavGraph(G.level, G.physics);
  G.paint = new f.PaintSystem(headlessRenderer(), G.level, { atlasSize: 1024, maxDensity: 2 });
  G.match.mode = 'turf';
  G.match.time = 155;
  G.match.duration = 180;

  try {
    const a = f.make('shooter');
    a.isBot = true;
    a.pos.set(0, 2, -18);
    a.bot = new f.BotBrain(a);
    for (let i = 0; i < 120; i++) {
      G.match.time -= 1 / 60;
      f.tick(a, 1);
      a.bot.update(1 / 60);
      G.projectiles.update(1 / 60);
    }
    const [cov0] = G.paint.coverage();
    assert.ok(cov0 > 0, `expected live PaintSystem team 0 coverage > 0, got ${cov0}`);
    assert.ok(Number.isFinite(a.bot.aimPitch) && Number.isFinite(a.bot.aimYaw));
  } finally {
    G.paint.dispose?.();
  }
});

test('combat approach path-painting & foot-clearing operates across weapon families', () => {
  const G = { match: { mode: 'turf', time: 60 } };
  const move = { x: 0, z: 1 };

  // Shooter stuck on enemy ink (groundTeam === 2) clears feet with low-look shot
  const stuckShooter = {
    pos: { x: 0, y: 0, z: 0 },
    team: 0,
    groundTeam: 2,
    intent: { fire: false, squid: true },
    weapon: { catalogRecord: { family: 'shooter' }, range: 12 },
    weaponRunner: { cooldown: 0 },
  };
  const stuckBrain = {};
  const pitchOut = botApplyTurfCombatPaint(stuckBrain, G, stuckShooter, 1 / 60, move, true, 0, 0, 8, 12, 0.8);
  assert.equal(stuckShooter.intent.fire, true, 'expected fire to clear feet on enemy ink');
  assert.equal(stuckShooter.intent.squid, false, 'expected squid canceled to shoot feet');
  assert.equal(pitchOut, -0.32, 'expected steep downward pitch to hit ground underfoot');

  // Splatana approaching enemy out of range (dist > range * 1.08) on unpainted ground lays down path
  const approachingSplatana = {
    pos: { x: 0, y: 0, z: 0 },
    team: 0,
    groundTeam: 0,
    intent: { fire: false, squid: true },
    weapon: { catalogRecord: { family: 'splatana' }, range: 10 },
    weaponRunner: { cooldown: 0, charging: false },
  };
  const slashPitch = botApplyTurfCombatPaint(stuckBrain, G, approachingSplatana, 1 / 60, move, true, 0, 0, 15, 10, 0.8);
  assert.equal(approachingSplatana.intent.fire, true, 'expected tap slash to lay path');
  assert.equal(slashPitch, -0.10, 'expected forward slash pitch');

  // Roller on own ink approaching enemy switches to squid swim
  const ownInkRoller = {
    pos: { x: 0, y: 0, z: 0 },
    team: 0,
    groundTeam: 1,
    intent: { fire: true, squid: false },
    weapon: { catalogRecord: { family: 'roller' }, range: 8 },
    weaponRunner: { cooldown: 0, charging: false },
  };
  botApplyTurfCombatPaint(stuckBrain, G, ownInkRoller, 1 / 60, move, true, 0, 0, 12, 8, 0.8);
  assert.equal(ownInkRoller.intent.squid, true, 'expected swim in through own ink');
  assert.equal(ownInkRoller.intent.fire, false, 'expected fire suppressed while swimming in');
});

test('Dread Wringer & sub-variants are cleanly recognized and calibrated', () => {
  const dreadProf = botWeaponPaintProfile({ catalogRecord: { family: 'slosher' }, id: 's3-slosher-double' }, 'slosher');
  assert.equal(dreadProf.pitch, -0.11);
  assert.equal(dreadProf.sweepAmp, 0.40);
});

test('composed bots.js wires bot-turf-paint hooks exactly once and resets all state variables', () => {
  const raw = fs.readFileSync(new URL('../../../inkwave-public/src/game/bots.js', import.meta.url), 'utf8');
  const composed = adaptBuildSource('src/game/bots.js', raw);
  assert.ok(composed.includes('botEvaluateTurfPaint('));
  assert.ok(composed.includes('botStabilizeTurfAim('));
  assert.ok(composed.includes('botApplyTurfPaintMechanics('));
  assert.ok(composed.includes('botScorePaintCandidate('));
  assert.ok(composed.includes('this._rollerRollTime = 0'));
  assert.ok(composed.includes('this._rollerSwimGap = 0'));
  assert.ok(composed.includes('this._smoothStrafe = null'));
});

test('roller weapon-calibrated rollHold controls rolling cycle per weapon archetype (Carbon vs Big Swig)', () => {
  const G = { match: { mode: 'turf', time: 100 } };
  const move = { x: 0, z: 1 };

  // 1. Carbon Roller (rollHold = 0.15s)
  const carbonActor = {
    weapon: { sourceMainActor: 'WeaponRollerCompact', id: 's3-roller-carbon' },
    weaponRunner: { rolling: true, cooldown: 0 },
    intent: { fire: true, squid: false },
    groundTeam: 1,
  };
  const carbonBrain = { _turfPaintLatch: true, _rollerRollTime: 0.14 };
  botApplyTurfPaintMechanics(carbonBrain, G, carbonActor, 0.02, move, true, 0, 0.8);
  // At 0.14 + 0.02 = 0.16s >= 0.15s, roll time expires and transitions to squid swim recovery
  assert.equal(carbonBrain._rollerRollTime, 0, 'carbon roll time reset');
  assert.equal(carbonBrain._rollerSwimGap, 0.22, 'carbon swim gap set to 0.22');
  assert.equal(carbonActor.intent.fire, false, 'fire dropped');
  assert.equal(carbonActor.intent.squid, true, 'swimming entered');

  // 2. Big Swig Roller (rollHold = 0.36s)
  const bigSwigActor = {
    weapon: { sourceMainActor: 'WeaponRollerWide', id: 's3-roller-wide' },
    weaponRunner: { rolling: true, cooldown: 0 },
    intent: { fire: true, squid: false },
    groundTeam: 1,
  };
  const bigSwigBrain = { _turfPaintLatch: true, _rollerRollTime: 0.20 };
  botApplyTurfPaintMechanics(bigSwigBrain, G, bigSwigActor, 0.05, move, true, 0, 0.8);
  // At 0.20 + 0.05 = 0.25s < 0.36s, Big Swig is STILL rolling!
  assert.ok(Math.abs(bigSwigBrain._rollerRollTime - 0.25) < 1e-6, 'big swig continues rolling past 0.20s');
  assert.equal(bigSwigActor.intent.fire, true, 'big swig maintains fire while rolling');
  assert.equal(bigSwigActor.intent.squid, false, 'not in squid yet');
});

test('macro-plaza 6.5m paint evaluation caches across nearby candidates and cross-team bots with TTL expiry', () => {
  let statsCalls = 0;
  const mockPaint = {
    grid: new Uint8Array(64),
    regionStats(x, y, z, r, team, out) {
      statsCalls++;
      out.empty = 0.40;
      out.own = 0.50; // for team 0, own is team 0
      out.enemy = 0.10;
      out.n = 64;
      return out;
    },
  };
  const G = {
    level: { faces: new Array(12).fill({}) },
    match: { mode: 'turf', time: 100 },
    paint: mockPaint,
  };
  const brain = { t: 10 };
  const team0Actor = { id: 1, team: 0, weapon: { range: 12 } };
  const team1Actor = { id: 2, team: 1, weapon: { range: 12 } };
  const nodeA = { x: 10.0, y: 0, z: 10.0 };
  const nodeB = { x: 11.0, y: 0, z: 10.5 }; // within 2.5m plaza bucket of nodeA
  const st = { empty: 0.4, enemy: 0.1, own: 0.5 };

  // First call computes macro stats
  const scoreA = botScorePaintCandidate(brain, G, team0Actor, nodeA, 10, 0.5, st, 10);
  assert.equal(statsCalls, 1, 'first candidate calls regionStats');

  // Candidate B in same plaza hits cache within 0.5s window
  const scoreB = botScorePaintCandidate(brain, G, team0Actor, nodeB, 10, 0.5, st, 10);
  assert.equal(statsCalls, 1, 'nearby candidate within 2.5m bucket hits plaza cache');
  assert.ok(Number.isFinite(scoreB));

  // Enemy bot (Team 1) in same plaza also hits cache and inverts own/enemy
  const scoreEnemy = botScorePaintCandidate(brain, G, team1Actor, nodeA, 10, 0.5, st, 10);
  assert.equal(statsCalls, 1, 'cross-team candidate hits plaza cache without regionStats re-query');
  assert.ok(Number.isFinite(scoreEnemy));

  // Advancing time past 0.5s expires cache and triggers fresh query
  G.match.time = 99.2; // 0.8s elapsed
  const scoreAExpired = botScorePaintCandidate(brain, G, team0Actor, nodeA, 10, 0.5, st, 10);
  assert.equal(statsCalls, 2, 'expired TTL recalculates macro plaza stats');
  assert.ok(Number.isFinite(scoreAExpired));
});

test('validated aim-pitch gate (_turfPaintValidated) prevents firing even when unvalidated paint latch is true', () => {
  const G = { match: { mode: 'turf', time: 100 } };
  const move = { x: 0, z: 1 };
  const actor = {
    weapon: { catalogRecord: { family: 'shooter' }, id: 's3-shooter-normal' },
    weaponRunner: { cooldown: 0 },
    intent: { fire: false, squid: false },
    groundTeam: 1,
  };
  const brain = { _turfPaintLatch: true, _turfPaintValidated: false };

  // 1. With _turfPaintValidated = false, fire is suppressed despite latch = true
  botApplyTurfPaintMechanics(brain, G, actor, 0.02, move, true, 0, 0.8);
  assert.equal(actor.intent.fire, false, 'fire must be gated off when _turfPaintValidated is false');

  // 2. Once aim pitch stabilizes and _turfPaintValidated becomes true, firing is allowed
  brain._turfPaintValidated = true;
  botApplyTurfPaintMechanics(brain, G, actor, 0.02, move, true, 0, 0.8);
  assert.equal(actor.intent.fire, true, 'fire enabled when _turfPaintValidated is true');
});

test('LACT-450 charge cap honors configured 0.14 threshold without being clamped to 0.18', () => {
  const G = { match: { mode: 'turf', time: 100 } };
  const move = { x: 0, z: 1 };
  const actor = {
    weapon: { sourceMainActor: 'WeaponStringerShort', catalogRecord: { family: 'stringer' }, id: 's3-stringer-short' },
    weaponRunner: { charging: true, charge: 0.15, cooldown: 0 },
    intent: { fire: true, squid: false },
    groundTeam: 1,
  };
  const brain = { _turfPaintLatch: true, _turfPaintValidated: true };

  // Profile specifies 0.14
  const profile = botWeaponPaintProfile(actor.weapon, 'stringer');
  assert.equal(profile.stringerChargeCap, 0.14);

  // At charge = 0.15 >= 0.14, stringer releases fire (stops holding fire)
  botApplyTurfPaintMechanics(brain, G, actor, 0.02, move, true, 0, 0.8);
  assert.equal(actor.intent.fire, false, 'LACT-450 releases charge at 0.15 >= 0.14');

  // At charge = 0.12 < 0.14, stringer continues charging (holds fire)
  actor.weaponRunner.charge = 0.12;
  actor.intent.fire = false;
  botApplyTurfPaintMechanics(brain, G, actor, 0.02, move, true, 0, 0.8);
  assert.equal(actor.intent.fire, true, 'LACT-450 continues charging at 0.12 < 0.14');
});

test('combat foot-clearing leaves pitch untouched when weapon cannot clear ink', () => {
  const G = { match: { mode: 'turf', time: 100 } };
  const move = { x: 0, z: 1 };
  const brain = {};

  // 1. Charger cannot foot-clear: pitch must remain untouched at 0.05
  const chargerActor = {
    team: 0,
    groundTeam: 2,
    intent: { fire: false, squid: false },
    weapon: { catalogRecord: { family: 'charger' }, range: 14 },
    weaponRunner: { charging: false, cooldown: 0 },
  };
  const chargerPitch = botApplyTurfCombatPaint(brain, G, chargerActor, 1 / 60, move, true, 0, 0.05, 8, 14, 0.8);
  assert.equal(chargerActor.intent.fire, false, 'charger does not fire foot clear');
  assert.equal(chargerPitch, 0.05, 'charger pitch is preserved instead of being forced downward');

  // 2. Weapon on cooldown cannot foot-clear: pitch must remain untouched
  const shooterCooldownActor = {
    team: 0,
    groundTeam: 2,
    intent: { fire: false, squid: false },
    weapon: { catalogRecord: { family: 'shooter' }, range: 12 },
    weaponRunner: { charging: false, cooldown: 0.15 },
  };
  const shooterPitch = botApplyTurfCombatPaint(brain, G, shooterCooldownActor, 1 / 60, move, true, 0, 0.08, 8, 12, 0.8);
  assert.equal(shooterCooldownActor.intent.fire, false, 'shooter on cooldown cannot fire');
  assert.equal(shooterPitch, 0.08, 'pitch preserved when weapon is on cooldown');
});

test('macro-plaza cache uses 31-bit integer SMI keys and mutates entries in-place on refresh', () => {
  const mockPaint = {
    grid: new Uint8Array(64),
    regionStats(x, y, z, r, team, out) {
      out.empty = 0.50;
      out.own = 0.30;
      out.enemy = 0.20;
      out.n = 32;
      return out;
    },
  };
  const G = {
    level: { faces: new Array(12).fill({}) },
    match: { mode: 'turf', time: 100 },
    paint: mockPaint,
  };
  const brain = { t: 0 };
  const actor = { id: 1, team: 0, weapon: { range: 12 } };
  const node = { x: 5.0, y: 0, z: 5.0 };
  const st = { empty: 0.5, enemy: 0.2, own: 0.3 };

  // First candidate call initializes cache
  botScorePaintCandidate(brain, G, actor, node, 10, 0.5, st, 10);
  assert.ok(mockPaint._macroPlazaCache instanceof Map);
  assert.equal(mockPaint._macroPlazaCache.size, 1);

  // Check that key is a number (31-bit SMI integer, not a string)
  const [key, entry] = Array.from(mockPaint._macroPlazaCache.entries())[0];
  assert.equal(typeof key, 'number', 'plaza cache key must be a 31-bit integer to prevent heap string allocation');
  assert.ok(Number.isSafeInteger(key));

  // Expire TTL (0.8s later) and re-query same plaza node
  G.match.time = 99.2;
  botScorePaintCandidate(brain, G, actor, node, 10, 0.5, st, 10);
  const refreshedEntry = mockPaint._macroPlazaCache.get(key);

  // Entry object must be identical reference (in-place mutation, no new heap object allocated)
  assert.equal(refreshedEntry, entry, 'cache entry must be mutated in-place on refresh to prevent GC churn');
  assert.equal(refreshedEntry.t, 99.2, 'timestamp updated in-place');
});

test('charging weapons hold charge and do not release when pitchReady is false, and long charger fallback respects pitchReady', () => {
  const G = { match: { mode: 'turf', time: 100 } };
  const move = { x: 0, z: 1 };

  // 1. Charger with pitchReady = false holds charge at threshold instead of releasing shot
  const chargerActor = {
    weapon: { catalogRecord: { family: 'charger' }, id: 's3-charger-std' },
    weaponRunner: { charging: true, charge: 0.75, cooldown: 0 },
    intent: { fire: true, squid: false },
    groundTeam: 1,
  };
  const chargerBrain = { _turfPaintLatch: true, _turfPaintValidated: false };
  botApplyTurfPaintMechanics(chargerBrain, G, chargerActor, 0.02, move, true, 0, 0.8);
  assert.equal(chargerActor.intent.fire, true, 'charger must hold charge (fire=true) when pitch is not ready');

  // Once pitch stabilizes (_turfPaintValidated = true), charger releases shot (fire=false)
  chargerBrain._turfPaintValidated = true;
  botApplyTurfPaintMechanics(chargerBrain, G, chargerActor, 0.02, move, true, 0, 0.8);
  assert.equal(chargerActor.intent.fire, false, 'charger releases shot once pitch is ready');

  // Non-charging long charger fallback must not fire when pitchReady = false
  const longChargerActor = {
    weapon: { catalogRecord: { family: 'charger' }, chargeTime: 1.5, id: 's3-eliter' },
    weaponRunner: { charging: false, cooldown: 0 },
    intent: { fire: false, squid: false },
    groundTeam: 1,
  };
  const longChargerBrain = { _turfPaintLatch: true, _turfPaintValidated: false };
  botApplyTurfPaintMechanics(longChargerBrain, G, longChargerActor, 0.02, move, true, 0, 0.8);
  assert.equal(longChargerActor.intent.fire, false, 'long charger fallback must not fire when pitch is not validated');

  // 2. Stringer holds charge when pitchReady = false
  const stringerActor = {
    weapon: { catalogRecord: { family: 'stringer' }, id: 's3-stringer-std' },
    weaponRunner: { charging: true, charge: 0.25, cooldown: 0 },
    intent: { fire: true, squid: false },
    groundTeam: 1,
  };
  const stringerBrain = { _turfPaintLatch: true, _turfPaintValidated: false };
  botApplyTurfPaintMechanics(stringerBrain, G, stringerActor, 0.02, move, true, 0, 0.8);
  assert.equal(stringerActor.intent.fire, true, 'stringer holds charge when pitch is not ready');

  // 3. Splatana holds charge when pitchReady = false
  const splatanaActor = {
    weapon: { catalogRecord: { family: 'splatana' }, id: 's3-wiper-std' },
    weaponRunner: { charging: true, charge: 0.15, cooldown: 0 },
    intent: { fire: true, squid: false },
    groundTeam: 1,
  };
  const splatanaBrain = { _turfPaintLatch: true, _turfPaintValidated: false };
  botApplyTurfPaintMechanics(splatanaBrain, G, splatanaActor, 0.02, move, true, 0, 0.8);
  assert.equal(splatanaActor.intent.fire, true, 'splatana holds charge when pitch is not ready');

  // 4. Splatling holds spin when pitchReady = false
  const splatlingActor = {
    weapon: { catalogRecord: { family: 'splatling' }, id: 's3-splatling-std' },
    weaponRunner: { charging: true, charge: 0.95, cooldown: 0 },
    intent: { fire: true, squid: false },
    groundTeam: 1,
  };
  const splatlingBrain = { _turfPaintLatch: true, _turfPaintValidated: false };
  botApplyTurfPaintMechanics(splatlingBrain, G, splatlingActor, 0.02, move, true, 0, 0.8);
  assert.equal(splatlingActor.intent.fire, true, 'splatling holds spin when pitch is not ready');
});

test('shooter family firing branch requires wantPaintNow (suppresses fire on low ink or active paintPause)', () => {
  const G = { match: { mode: 'turf', time: 100 } };
  const move = { x: 0, z: 1 };
  const actor = {
    weapon: { catalogRecord: { family: 'shooter' }, id: 's3-shooter-normal' },
    weaponRunner: { cooldown: 0 },
    intent: { fire: false, squid: false },
    groundTeam: 1,
  };

  // Case 1: inkFrac <= 0.10 suppresses firing even if latch and validation are true
  const lowInkBrain = { _turfPaintLatch: true, _turfPaintValidated: true, paintPause: 0 };
  botApplyTurfPaintMechanics(lowInkBrain, G, actor, 0.02, move, true, 0, 0.08);
  assert.equal(actor.intent.fire, false, 'shooter must not fire when inkFrac <= 0.10');

  // Case 2: paintPause > 0 suppresses firing
  const pauseBrain = { _turfPaintLatch: true, _turfPaintValidated: true, paintPause: 0.05 };
  botApplyTurfPaintMechanics(pauseBrain, G, actor, 0.02, move, true, 0, 0.8);
  assert.equal(actor.intent.fire, false, 'shooter must not fire when paintPause > 0');
});

test('roller catalogState.pending suppresses firing without being overwritten by following roll branches', () => {
  const G = { match: { mode: 'turf', time: 100 } };
  const move = { x: 0, z: 1 };
  const actor = {
    weapon: { catalogRecord: { family: 'roller' }, id: 's3-roller-normal' },
    weaponRunner: { catalogState: { pending: true }, cooldown: 0 },
    intent: { fire: true, squid: false },
    groundTeam: 1,
  };
  const brain = { _turfPaintLatch: true, _turfPaintValidated: true, _rollerRollTime: 0, _rollerSwimGap: 0 };
  botApplyTurfPaintMechanics(brain, G, actor, 0.02, move, true, 0, 0.8);
  assert.equal(actor.intent.fire, false, 'roller with catalogState.pending must set fire=false and not be overwritten');
});

test('brush weapons require a fresh edge when moving on enemy ink and in combat foot clearing', () => {
  const G = { match: { mode: 'turf', time: 100 } };
  const move = { x: 0, z: 1 };
  const actor = {
    weapon: { catalogRecord: { family: 'brush' }, id: 's3-inkbrush' },
    weaponRunner: { cooldown: 0 },
    intent: { fire: false, squid: false },
    _prevIntent: { fire: false },
    groundTeam: 2, // Enemy ink
  };
  const brain = { _turfPaintLatch: false, _turfPaintValidated: false };

  // 1. Paint mode on enemy ink: first tick with _prevIntent.fire=false fires
  botApplyTurfPaintMechanics(brain, G, actor, 0.02, move, true, 0, 0.8);
  assert.equal(actor.intent.fire, true, 'brush fires fresh press on enemy ink');

  // Next tick with _prevIntent.fire=true releases trigger
  actor._prevIntent.fire = true;
  botApplyTurfPaintMechanics(brain, G, actor, 0.02, move, true, 0, 0.8);
  assert.equal(actor.intent.fire, false, 'brush releases trigger on held state to enforce edge');

  // 2. Combat foot-clearing: edge-triggered check
  actor.intent.fire = false;
  actor._prevIntent.fire = false;
  actor.team = 0;
  const combatPitch1 = botApplyTurfCombatPaint(brain, G, actor, 1 / 60, move, true, 0, 0, 5, 8, 0.8);
  assert.equal(actor.intent.fire, true, 'combat foot clearing fires fresh brush press');
  assert.equal(combatPitch1, -0.32);

  // If already firing in prevIntent, combat foot-clearing does not hold trigger
  actor.intent.fire = false;
  actor._prevIntent.fire = true;
  const combatPitch2 = botApplyTurfCombatPaint(brain, G, actor, 1 / 60, move, true, 0, 0, 5, 8, 0.8);
  assert.equal(actor.intent.fire, false, 'combat foot clearing releases held brush trigger');
  assert.equal(combatPitch2, 0);
});

test('allied Tacticooler drink pickup intent is preserved and prevents subsequent squid form overrides', () => {
  const cooler = {
    pos: { x: 2, y: 0, z: 2 },
    team: 1,
    expires: 120,
    taken: new Set(),
  };
  const G = {
    time: 10,
    match: { mode: 'turf', time: 100 },
    projectiles: { _s3SupportCoolers: [cooler] },
  };
  const move = { x: 0, z: 1 };
  const actor = {
    pos: { x: 3, y: 0, z: 3 }, // 1.41m away (< 6.8m)
    team: 1,
    groundTeam: 1, // On friendly ink
    weapon: { catalogRecord: { family: 'roller' }, id: 's3-roller-normal' },
    weaponRunner: { cooldown: 0.15 }, // Would normally trigger squid=true
    intent: { fire: false, squid: true },
  };
  const brain = { _turfPaintLatch: false, _turfPaintValidated: false, _pathRemaining: () => 10 };

  // 1. Paint mechanics maintains kid form near cooler despite roller cooldown on friendly ink
  botApplyTurfPaintMechanics(brain, G, actor, 0.02, move, true, 0, 0.8);
  assert.equal(brain._coolerPickupPending, true);
  assert.equal(actor.intent.squid, false, 'roller near cooler must stay in kid form');

  // 2. Combat paint helper preserves cooler pickup intent
  actor.intent.squid = true;
  botApplyTurfCombatPaint(brain, G, actor, 1 / 60, move, true, 0, 0, 15, 10, 0.8);
  assert.equal(brain._coolerPickupPending, true);
  assert.equal(actor.intent.squid, false, 'combat helper preserves kid form near cooler');
});

