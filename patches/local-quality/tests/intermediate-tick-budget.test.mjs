import test from 'node:test';
import assert from 'node:assert/strict';
import { FixedClock, STEP } from '../../splatoon3/runtime/clock.mjs';
import { installIntermediateTickBudget, intermediateTickDeferred } from '../intermediate-tick-budget.mjs';

const finals = (hz, frames) => {
  const c = new FixedClock(), rows = [];
  for (let i = 0; i < frames; i++) {
    const row = [];
    c.advance(1 / hz, () => { assert.equal(c.advancing, true); row.push(c.finalTick); });
    assert.equal(c.advancing, false);
    rows.push(row);
  }
  return rows;
};

test('the fixed clock marks only the last tick of each advance as drawn', () => {
  for (const row of finals(60, 30)) assert.deepEqual(row, [true], '60 fps: every tick is drawn');
  for (const row of finals(30, 30)) assert.deepEqual(row, [false, true], '30 fps: first of two is never drawn');
  for (const row of finals(120, 30)) assert.ok(row.length === 0 || (row.length === 1 && row[0] === true));
  for (const row of finals(24, 48)) { assert.equal(row.at(-1), true); assert.ok(row.slice(0, -1).every((f) => f === false)); }
  // the tick budget cut also counts as the last tick of the advance
  const c = new FixedClock(), seen = [];
  c.advance(10 * STEP, () => seen.push(c.finalTick), 3);
  assert.deepEqual(seen, [false, false, true]);
});

function harness() {
  class Character {
    constructor(isLocal = false) { this.isLocal = isLocal; this.inWorld = true; this.calls = []; }
    update(dt, s) { this.calls.push(dt); return 'native'; }
  }
  const G = { game: { s3Clock: new FixedClock() }, match: { local: null, opts: {} } };
  assert.equal(installIntermediateTickBudget({ Character }, G), true);
  assert.equal(installIntermediateTickBudget({ Character }, G), false, 'installs once');
  return { Character, G };
}

test('bots and replicas defer visual updates to the drawn tick with the summed dt; everyone else is per tick', () => {
  const { Character, G } = harness();
  const bot = new Character(), replica = new Character(), local = new Character(true), human = new Character();
  const sBot = { isBot: true }, sReplica = { remote: true }, sLocal = { isLocal: true, isBot: false }, sHuman = {};
  G.match.local = sLocal;
  const step = (hz) => G.game.s3Clock.advance(1 / hz, (dt) => {
    bot.update(dt, sBot); replica.update(dt, sReplica); local.update(dt, sLocal); human.update(dt, sHuman);
  });
  for (let i = 0; i < 10; i++) step(30);
  for (const ch of [bot, replica]) {
    assert.equal(ch.calls.length, 10, 'one native update per drawn frame');
    for (const dt of ch.calls) assert.ok(Math.abs(dt - 2 / 60) < 1e-12, 'with both ticks of time');
  }
  for (const ch of [local, human]) assert.equal(ch.calls.length, 20, 'local player and non-bots keep every tick');
  // at 60 fps nothing is deferred
  bot.calls.length = 0; for (let i = 0; i < 10; i++) step(60);
  assert.equal(bot.calls.length, 10); for (const dt of bot.calls) assert.ok(Math.abs(dt - 1 / 60) < 1e-12);
  // total simulated time is conserved
  const total = bot.calls.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 10 / 60) < 1e-9);
});

test('outside the clock, in the range, out of the world or opted out: full per-call update', () => {
  const { Character, G } = harness();
  const ch = new Character(), s = { isBot: true };
  const clock = G.game.s3Clock;
  clock.advancing = true; clock.finalTick = false;
  assert.equal(intermediateTickDeferred(ch, s, G), true);
  assert.equal(intermediateTickDeferred(ch, s, { ...G, match: { opts: { range: true } } }), false);
  assert.equal(intermediateTickDeferred(ch, s, { ...G, match: null }), false);
  assert.equal(intermediateTickDeferred({ ...ch, inWorld: false }, s, G), false);
  assert.equal(intermediateTickDeferred({ ...ch, s3IntermediateTickBudget: false }, s, G), false);
  clock.advancing = false;
  assert.equal(intermediateTickDeferred(ch, s, G), false, 'showcase/menu callers outside the clock');
  // owed time from a deferred tick is paid by the next real call, once
  clock.advancing = true;
  ch.update(1 / 60, s);
  clock.finalTick = true;
  ch.update(1 / 60, s);
  ch.update(1 / 60, s);
  assert.deepEqual(ch.calls.map((x) => Math.round(x * 600)), [20, 10]);
  clock.advancing = false;
});
