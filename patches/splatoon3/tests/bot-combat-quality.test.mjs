// Bot combat quality rules (2026-11-05): pure decisions plus the composed
// bots.js anchors. Match-level effects are measured with
// scripts/measure-inkwave-bot-duel.mjs / measure-inkwave-bot-combat.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOT_COMBAT, botNoteSighting, botTickAlert, botAlertPitch, botClearShot, botBlasterAimPoint, botFireReach, blasterRadius, botStrafePlan, botCoverBomb } from '../runtime/bot-combat-quality.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

test('alert keeps a painting Bot aim near the horizon for a few seconds after a sighting', () => {
  const b = {};
  assert.equal(botAlertPitch(b, -.42), -.42);
  botNoteSighting(b, { pos: { x: 1, y: 2, z: 3 } }, 10);
  assert.deepEqual(b._s3LastSeen, { x: 1, y: 2, z: 3 });
  assert.equal(botAlertPitch(b, -.42), BOT_COMBAT.alertPitch);
  assert.equal(botAlertPitch(b, .3), .3, 'never lowers an upward paint aim');
  botTickAlert(b, BOT_COMBAT.alertSeconds + .01);
  assert.equal(botAlertPitch(b, -.42), -.42);
});

test('fire only with a line of sight from the latest perception; lobbers exempt', () => {
  const b = {}; botNoteSighting(b, { pos: { x: 0, y: 0, z: 0 } }, 5);
  assert.equal(botClearShot(b, 'shooter', 5.2), true);
  assert.equal(botClearShot(b, 'shooter', 5.31), false);
  assert.equal(botClearShot(b, 'slosher', 99), true);
  assert.equal(botClearShot({}, 'blaster', 0), false);
});

test('Blaster feet aim is off by default (measured worse); its rule and the blast reach stay testable', () => {
  const t = { pos: { x: 0, y: 1, z: 8 }, form: 'kid', grounded: true }, v = { y: 1.85 };
  assert.equal(BOT_COMBAT.blasterFeetAim, false);
  assert.equal(botBlasterAimPoint('blaster', t, 8, 10, v), false); assert.equal(v.y, 1.85, 'body aim kept');
  assert.equal(botBlasterAimPoint('blaster', t, 8, 10, v, true), true); assert.ok(Math.abs(v.y - 1.1) < 1e-12);
  for (const [family, target, dist] of [['shooter', t, 8], ['blaster', t, 2], ['blaster', t, 11], ['blaster', { ...t, grounded: false }, 8], ['blaster', { ...t, form: 'squid' }, 8]]) {
    const w = { y: 1.85 }; assert.equal(botBlasterAimPoint(family, target, dist, 10, w, true), false); assert.equal(w.y, 1.85);
  }
  const catalog = { catalogRecord: { parameters: { BlastParam: { DistanceDamage: [{ Distance: 1 }, { Distance: 3.385 }] } } } };
  assert.equal(blasterRadius(catalog), 3.385);
  assert.equal(blasterRadius({ splashRadius: 2.6 }), 2.6);
  assert.ok(Math.abs(botFireReach('blaster', 10, catalog) - (10 + 3.385 * .7)) < 1e-12);
  assert.ok(Math.abs(botFireReach('shooter', 10, catalog) - 10.8) < 1e-12);
});

test('strafe keeps its direction for at least a second and flips only sometimes', () => {
  // each plan draws: duration, side (first time) or flip, amplitude
  const plan = (b, draws) => { let i = 0; botStrafePlan(b, () => draws[i++]); };
  const b = {};
  plan(b, [.9, .1, .5]); assert.equal(b.strafe, -1); assert.ok(b.strafeT >= BOT_COMBAT.strafeMin && b.strafeT <= BOT_COMBAT.strafeMin + BOT_COMBAT.strafeSpan);
  plan(b, [.9, .9, .5]); assert.equal(b.strafe, -1, 'draw above the flip share keeps the side');
  plan(b, [.9, .2, .5]); assert.equal(b.strafe, 1, 'draw below the flip share flips');
});

test('cover bomb only for a target that just broke line of sight at throwing distance', () => {
  const actor = { grounded: true };
  const base = () => ({ bombCd: 0, seeTimer: 0, target: {}, lostTimer: .5 });
  assert.equal(botCoverBomb(base(), actor, 8, 100, 70, 1, () => 0), BOT_COMBAT.coverBombLift);
  for (const [patch, dist, ink] of [[{ seeTimer: .5 }, 8, 100], [{ lostTimer: 2 }, 8, 100], [{ bombCd: 1 }, 8, 100], [{}, 2, 100], [{}, 20, 100], [{}, 8, 60]])
    assert.equal(botCoverBomb({ ...base(), ...patch }, actor, dist, ink, 70, 1, () => 0), 0);
  const b = base(); botCoverBomb(b, actor, 8, 100, 70, 1, () => 0);
  assert.equal(b._bombAim, true); assert.ok(b.bombCd >= 5);
});

test('composed bots.js wires each rule exactly once', () => {
  const code = adaptBuildSource('src/game/bots.js', fs.readFileSync(new URL('../../../inkwave-public/src/game/bots.js', import.meta.url), 'utf8'));
  for (const call of ['botTickAlert(this, dt)', 'botNoteSighting(this, best, G.time)', 'botBlasterAimPoint(family, t, dist, range, _v)', 'if (this.strafeT <= 0) botStrafePlan(this);',
    'botClearShot(this, family, G.time)', 'botFireReach(family, range, w)', 'botCoverBomb(this, a, dist, a.ink, selectedSubCost(a, SUB), dt)', 'wantPitch = botAlertPitch(this, wantPitch);'])
    assert.equal(code.split(call).length - 1, 1, call);
});
