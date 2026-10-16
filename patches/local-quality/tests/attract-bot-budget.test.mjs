// The menu demonstration is decorative, but still plays through real
// BotBrain/Actor/WeaponRunner. Only its expensive *thinking* is budgeted;
// gameplay, NPC life-cycle, projectile clocks and renderer stay untouched.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { installAttractBotBudget, menuAttractAiEligible, attractAiStep, ATTRACT_AI_STEP, ATTRACT_AI_TOUCH_STEP } from '../offline-offscreen-budget.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { qualityIdentity } from '../adapter.mjs';

function brainFixture() {
  class Brain {
    constructor(a) { this.a = a; a.bot = this; this.calls = []; }
    update(dt) {
      this.calls.push(dt);
      if (!this.a.alive) this.a.intent.fire = false;
    }
  }
  const actors = Array.from({ length: 8 }, (_, i) => ({
    team: Math.floor(i / 4), slot: i % 4, alive: true, isBot: true,
    intent: { fire: true },
  }));
  const G = {
    mode: 'menu', netm: null, game: { showcase: { fullFrame: false } },
    match: { attract: true, state: 'playing', paused: false, actors },
  };
  const brains = actors.map(a => new Brain(a));
  assert.equal(installAttractBotBudget({ BotBrain: Brain }, G), true);
  assert.equal(installAttractBotBudget({ BotBrain: Brain }, G), false, 'installer must be idempotent');
  return { actors, G, brains };
}

test('eight menu bots split thinking across alternating 60 Hz frames without losing elapsed time', () => {
  const f = brainFixture(), counts = [];
  for (let frame = 0; frame < 60; frame++) {
    let changed = 0;
    for (const brain of f.brains) {
      const before = brain.calls.length;
      brain.update(1 / 60);
      changed += brain.calls.length - before;
    }
    counts.push(changed);
  }
  assert.deepEqual(counts, Array(60).fill(4), 'avoid 8 brains waking on a single frame');
  assert.equal(f.brains.reduce((n, b) => n + b.calls.length, 0), 240,
    '8 × 30 decisions versus 8 × 60 in the unbudgeted menu');
  for (const b of f.brains) {
    const observed = b.calls.reduce((a, t) => a + t, 0) + (b._menuAttractPending || 0);
    assert.ok(Math.abs(observed - 1) < 1e-9, 'all elapsed demo AI time remains accounted for');
    assert.ok(b.calls.every(dt => dt > 0 && dt <= ATTRACT_AI_STEP + 1e-9));
  }
});

test('touch and LOW menu budget bot thinking to staggered 30 Hz over 60-Hz physics', () => {
  for (const tier of ['touch','low']) {
    const f = brainFixture();
    if (tier === 'touch') f.G.game.mobile = { touch: true };
    else f.G.game.settings = { quality: 'low' };
    assert.equal(attractAiStep(f.G), ATTRACT_AI_TOUCH_STEP);
    const decisions = [];
    for (let i = 0; i < 60; i++) {
      let count = 0;
      for (const b of f.brains) { const before = b.calls.length; b.update(1 / 60); count += b.calls.length - before; }
      decisions.push(count);
    }
    assert.deepEqual(decisions, Array(60).fill(4), tier + ': no all-bot CPU spikes');
    for (const b of f.brains) {
      assert.equal(b.calls.length, 30, tier + ': half as many decisions');
      assert.ok(Math.abs(b.calls.reduce((a, t) => a + t, 0) + (b._menuAttractPending || 0) - 1) < 1e-9);
    }
  }
});

test('real rounds, other modes, death, jump and full-frame lobby always reach native brain immediately', () => {
  const { G, brains, actors } = brainFixture(), b = brains[0], a = actors[0];
  assert.equal(menuAttractAiEligible(b, G), true);
  b.update(1 / 60); // even phase: deferred
  assert.equal(b.calls.length, 0);
  a.alive = false;
  b.update(1 / 60);
  assert.equal(a.intent.fire, false, 'death clears held input on the same frame');
  assert.equal(b.calls.length, 1);
  assert.equal(b._menuAttractPending, 0);
  a.alive = true;
  a.superJumpState = {};
  b.update(1 / 60);
  assert.equal(b.calls.length, 2, 'super-jump is never deferred');
  a.superJumpState = null;
  G.game.showcase.fullFrame = true;
  b.update(1 / 60);
  assert.equal(b.calls.length, 3);
  G.game.showcase.fullFrame = false;
  G.match.attract = false;
  G.mode = 'match';
  for (let i = 0; i < 60; i++) b.update(1 / 60);
  assert.equal(b.calls.length, 63, 'real 60 Hz bot decision cadence unchanged');
  G.mode = 'menu'; G.match.attract = true; G.netm = { online: true };
  b.update(1 / 60); assert.equal(b.calls.length, 64, 'online matches never inherit demo throttling');
  G.netm = null; G.match.state = 'finish';
  b.update(1 / 60); assert.equal(b.calls.length, 65, 'state transitions are immediate');
  G.match.state = 'playing'; G.match.paused = true;
  b.update(1 / 60); assert.equal(b.calls.length, 66, 'paused state retains native cleanup');
});

const read = rel => fs.readFileSync(new URL('../../../inkwave-public/' + rel, import.meta.url), 'utf8');

test('production composition checks demo turf coverage only twice a second, never during live play', () => {
  const raw = read('src/main.js'), composed = adaptBuildSource('src/main.js', raw);
  assert.match(raw, /const cov = G\.paint\.coverage\(\);\n    if \(this\.attractT > 110/);
  assert.match(composed, /this\._attractCoverageElapsed = 0\.5;/);
  assert.match(composed, /const inspect = this\._attractCoverageElapsed >= 0\.5;/);
  assert.match(composed, /const cov = inspect && this\.attractT <= 110 \? G\.paint\.coverage\(\) : null;/);
  const start = composed.indexOf('  _updateAttract(dt) {');
  const end = composed.indexOf('\n  // ---------------------------------------------------------------------------------------- match flow', start);
  assert.ok(start >= 0 && end > start, 'actual production demo method extracted');
  let scans = 0, resets = 0, coverage = [0.3, 0.2];
  const G = { time: 1, paint: { coverage() { scans++; return coverage; } } };
  const Game = new Function('G', 'THREE', 'return class Game {' + composed.slice(start, end) + '\n}')(G, {});
  const g = new Game();
  Object.assign(g, {
    attractT: 0, shotT: 100, _attractCoverageElapsed: 0.5,
    rig: { mode: 'orbit' }, menus: { current: 'main' },
    _attractShot() { throw Error('unexpected camera cut'); },
    _fade() { resets++; return { then() {} }; },
  });
  for (let i = 0; i < 60; i++) g._updateAttract(1 / 60);
  assert.equal(scans, 2, '60 menu simulation frames require 2 coverage reads, not 60');
  assert.equal(resets, 0);
  coverage = [0.74, 0.01];
  g._updateAttract(0.5);
  assert.equal(resets, 1, 'unchanged 72% coverage threshold is still enforced');
  const before = scans;
  g.attractT = 110.01; g._attractCoverageElapsed = 0;
  g._updateAttract(1 / 60);
  assert.equal(resets, 2, '110 second hard cap is checked every frame');
  assert.equal(scans, before, 'hard cap never needs a grid scan');
  assert.ok(qualityIdentity()['offline-offscreen-budget.mjs'], 'runtime source integrity is pinned');
});
