import test from 'node:test';
import assert from 'node:assert/strict';
import { FixedClock, installGame, withSeparatedPresentationRandom } from '../runtime/clock.mjs';

// Seeded stand-in for the caller's Math.random (tests and seeded probes).
function seeded(seed) {
  let x = seed >>> 0;
  return () => {
    x = (x + 0x6D2B79F5) >>> 0; let t = x;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A Game whose _frame does per-render-frame presentation draws around the
// fixed-tick gameplay draws, the same shape as the composed Game._frame.
function makeGame() {
  class Game {
    constructor() { this.clock = new FixedClock(); this.gameplay = []; }
    _frame(dt) {
      for (let i = 0; i < 3; i++) Math.random();             // pre-tick FX / net / menus
      this.clock.advance(dt, () => { this.gameplay.push(Math.random()); });
      for (let i = 0; i < 5; i++) Math.random();             // post-tick FX / camera
    }
    _loop() {}
  }
  return Game;
}

function gameplayDraws(Game, dt, seconds = 2) {
  const saved = Math.random;
  Math.random = seeded(1234);
  try {
    const game = new Game();
    for (let i = 0, n = Math.round(seconds / dt); i < n; i++) game._frame(dt);
    return game.gameplay;
  } finally { Math.random = saved; }
}

test('gameplay draws inside fixed ticks do not depend on the number of rendered frames', () => {
  const Game = makeGame();
  installGame(Game);
  const at60 = gameplayDraws(Game, 1 / 60);
  assert.equal(at60.length, 120);
  for (const dt of [1 / 20, 1 / 30, 1 / 120]) assert.deepEqual(gameplayDraws(Game, dt), at60, `dt=${dt}`);
});

test('negative control: a shared stream makes gameplay draws frame-rate dependent', () => {
  const Game = makeGame(); // not installed
  const at60 = gameplayDraws(Game, 1 / 60), at20 = gameplayDraws(Game, 1 / 20);
  assert.equal(at60.length, at20.length);
  assert.notDeepEqual(at20, at60);
});

test('the caller Math.random is restored after a frame and reused by the next frame', () => {
  const caller = seeded(7), saved = Math.random;
  Math.random = caller;
  try {
    let insideTick = null, outsideTick = null;
    withSeparatedPresentationRandom(() => {
      outsideTick = Math.random;
      new FixedClock().advance(1 / 60, () => { insideTick = Math.random; });
    });
    assert.equal(insideTick, caller, 'fixed tick uses the caller generator');
    assert.notEqual(outsideTick, caller, 'presentation uses its own stream');
    assert.equal(Math.random, caller, 'restored after the frame');
    // A generator swapped temporarily inside a tick is respected and restored.
    withSeparatedPresentationRandom(() => new FixedClock().advance(1 / 60, () => {
      const inner = () => 0.5, before = Math.random; Math.random = inner;
      try { assert.equal(Math.random(), 0.5); } finally { Math.random = before; }
    }));
    assert.equal(Math.random, caller);
  } finally { Math.random = saved; }
});

test('a clock advanced outside Game._frame keeps the plain Math.random', () => {
  const caller = seeded(9), saved = Math.random;
  Math.random = caller;
  try {
    let seen = null;
    new FixedClock().advance(1 / 60, () => { seen = Math.random; });
    assert.equal(seen, caller);
  } finally { Math.random = saved; }
});
