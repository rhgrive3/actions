// #914: real composed BotBrain + Actor + WeaponRunner + S3 resources (navigation / perception / stage stubbed). Logic-only: it
// checks the fire/charge/refill liveness cycle, not bot skill in a browser and not an S3 comparison.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource, replaceOnce } from '../adapter.mjs';
import { adaptBotRefillRelease } from '../bot-refill-release-adapter.mjs';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';

const composed = (rel, code) => adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code))));
const heldFireControl = (rel, code) => {
  code = composed(rel, code);
  if (rel === 'src/game/bots.js') {
    assert.equal(code.split('this._puddleFire(dt)').length - 1, 2);
    code = code.replaceAll('this._puddleFire(dt)', 'true');
  }
  return code;
};

async function world(weapon, ink, { baseline, hz = 60 }) {
  const f = await fixture({ adapt: baseline ? heldFireControl : composed, extraExports: "export * from './inkwave-public/src/game/bots.js';" });
  const a = f.make(weapon); a.ink = ink; a.hp = f.PLAYER.hp; a.lastFire = 99; a.lastDamage = 99;
  let puddle = false;                                     // the paint a released shot / stream leaves under the bot
  f.G.paint.sample = () => puddle ? 1 : 0;                // team 0 owns "1" once painted; otherwise bare dry ground
  f.G.paint.regionStats = (_x, _y, _z, _r, _t, out) => Object.assign(out, { own: 0, enemy: 0, empty: 1, n: 1 });
  for (const kind of ['fireCharger', 'fireSplatling']) { const orig = f.G.projectiles[kind]; f.G.projectiles[kind] = (...args) => { puddle = true; return orig(...args); }; }
  f.G.projectiles.fireSlosh = () => f.shots.push({ kind: 'slosher' });
  const brain = new f.BotBrain(a, 'normal'); a.bot = brain;
  brain._perceive = () => {}; brain._pickRefill = () => { brain.path = null; brain.repath = 1; }; brain._steer = () => new f.THREE.Vector3(); brain._pickPaintGoal = () => { brain.path = null; brain.goalTimer = 1; };
  const dt = 1 / hz, log = [];
  const step = () => { f.G.time += dt; brain.update(dt); a.update(dt); log.push({ mode: brain.mode, charging: a.weaponRunner.charging, streaming: a.weaponRunner.streaming, ink: a.ink, shots: f.shots.length, fire: a.intent.fire }); };
  return { f, a, brain, step, log, get puddle() { return puddle; } };
}
const longestRun = (log, pred) => { let best = 0, run = 0; for (const e of log) { run = pred(e) ? run + 1 : 0; best = Math.max(best, run); } return best; };

for (const [weapon, ink] of [['charger', 4.0], ['splatling', 3.2]]) for (const hz of [30, 60, 120]) {
  test(`#914 baseline ${weapon} ${hz}Hz: refill fallback charges forever (negative control)`, async () => {
    const w = await world(weapon, ink, { baseline: true, hz });
    for (let i = 0; i < hz * 6; i++) w.step();
    const last = w.log.at(-1);
    assert.equal(last.mode, 'refill'); assert.equal(last.charging, true); assert.equal(last.shots, 0);
    assert.equal(w.puddle, false, 'held-fire negative control never creates its refill puddle');
    assert.ok(longestRun(w.log, e => e.charging) >= hz * 5, 'charging is continuous');
  });

  test(`#914 patched ${weapon} ${hz}Hz: releases a bounded charge, paints the puddle, refills and leaves refill mode`, async () => {
    const w = await world(weapon, ink, { baseline: false, hz });
    for (let i = 0; i < hz * 25; i++) w.step();
    assert.ok(w.log.some(e => e.shots > 0), 'a paint-producing shot / stream was released');
    const held = longestRun(w.log, e => e.charging && e.mode === 'refill');
    assert.ok(held <= hz * 0.4, `no refill-mode charge is held past the bounded hold (${held} ticks)`);
    assert.equal(w.puddle, true);
    assert.notEqual(w.log.at(-1).mode, 'refill', 'the bot recovers ink and leaves refill mode');
    assert.ok(Math.max(...w.log.map(e => e.ink)) > ink, 'kid/swim refill made progress');
  });
}

test('#914 starting below the charge-start threshold still progresses once kid refill crosses it (no charge lock)', async () => {
  for (const [weapon, ink] of [['charger', 3.1], ['splatling', 3.05]]) {
    const w = await world(weapon, ink, { baseline: false });
    for (let i = 0; i < 60 * 25; i++) w.step();
    assert.ok(longestRun(w.log, e => e.charging && e.mode === 'refill') <= 60 * 0.4, weapon);
    assert.ok(w.log.some(e => e.shots > 0), weapon);
    assert.notEqual(w.log.at(-1).mode, 'refill', weapon);
  }
});

test('#914 shooter / blaster / slosher / roller keep holding Fire for the refill puddle (unchanged)', async () => {
  for (const weapon of ['shooter', 'blaster', 'slosher', 'roller', 'dualies']) {
    const before = await world(weapon, 6, { baseline: true }), after = await world(weapon, 6, { baseline: false });
    for (let i = 0; i < 60; i++) { before.step(); after.step(); }
    assert.deepEqual(after.log.map(e => e.fire), before.log.map(e => e.fire), weapon);
    assert.equal(after.log[10].fire, true, weapon);
  }
});

test('#914 own-ink refill path is untouched: standing in own ink never fires for the puddle', async () => {
  const w = await world('charger', 4.0, { baseline: false });
  w.f.G.paint.sample = () => 1;
  for (let i = 0; i < 120; i++) w.step();   // the first tick still sees the pre-integration surface
  assert.equal(w.log.slice(2).some(e => e.fire), false); assert.equal(w.log.slice(2).some(e => e.charging), false);
});

test('#914 adapter connects each refill fallback once and fails closed on drift', () => {
  const raw = fs.readFileSync('inkwave-public/src/game/bots.js', 'utf8');
  const out = adaptBotRefillRelease('src/game/bots.js', raw, replaceOnce);
  assert.equal((out.match(/this\._puddleFire\(dt\)/g) || []).length, 2);
  assert.equal(adaptBotRefillRelease('src/game/match.js', 'x', replaceOnce), 'x');
  assert.throws(() => adaptBotRefillRelease('src/game/bots.js', out, replaceOnce));
  assert.throws(() => adaptBotRefillRelease('src/game/bots.js', raw.replace('{ it.squid = false; it.fire = true; wantPitch = -1.0; }', '{ it.fire = true; }'), replaceOnce));
});
