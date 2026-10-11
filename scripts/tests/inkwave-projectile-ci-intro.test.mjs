import test from 'node:test';
import assert from 'node:assert/strict';
import { completeNativeTurfIntro } from '../lib/inkwave-projectile-ci-intro.mjs';

function fixture() {
  const match = { state: 'intro', stateT: 0, time: 180, attract: false,
    paused: false, bossMode: null, controller: {}, local: { isLocal: true } };
  const G = { mode: 'match', match, projectiles: {}, renderer: {} };
  const calls = { frames: 0, freeze: 0, unfreeze: 0, rendersSuppressed: true };
  const game = {
    match, frozen: false, _skipRender: false,
    debug: {
      freeze() { game.frozen = true; calls.freeze++; },
      unfreeze() { game.frozen = false; calls.unfreeze++; },
    },
    _frame(dt) {
      calls.frames++;
      calls.rendersSuppressed &&= game._skipRender === true && game.frozen === true;
      match.stateT += dt;
      if (match.stateT > 4.2) { match.state = 'playing'; match.stateT = 0; }
    },
  };
  return { match, G, game, calls };
}
function invoke(world) {
  const previous = globalThis.window;
  globalThis.window = { __inkwave: world.game, __G: world.G };
  try { return completeNativeTurfIntro(); }
  finally { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; }
}

test('completes native intro with only cinematic renders suppressed', () => {
  const w = fixture();
  const receipt = invoke(w);
  assert.equal(receipt.method, 'native-fixed-60Hz-intro-render-suppressed');
  assert.equal(receipt.after, 'playing');
  assert.ok(receipt.frames >= 252 && receipt.frames <= 255);
  assert.equal(receipt.frames, w.calls.frames);
  assert.ok(w.calls.rendersSuppressed);
  assert.equal(w.calls.freeze, 1);
  assert.equal(w.calls.unfreeze, 1);
  assert.equal(w.game._skipRender, false);
  assert.equal(w.game.frozen, false);
  assert.equal(w.match.time, 180);
});

test('does not alter a genuinely playing match', () => {
  const w = fixture();
  w.match.state = 'playing';
  const receipt = invoke(w);
  assert.equal(receipt.method, 'natural');
  assert.equal(w.calls.frames, 0);
  assert.equal(w.calls.freeze, 0);
});

test('refuses attract, paused and wrong-identity matches', () => {
  for (const invalid of [
    w => { w.match.attract = true; },
    w => { w.match.paused = true; },
    w => { w.game.frozen = true; },
    w => { w.G.match = {}; },
    w => { w.match.bossMode = {}; },
    w => { w.match.controller = null; },
  ]) {
    const w = fixture();
    invalid(w);
    assert.throws(() => invoke(w), /requires|unpaused/);
    assert.equal(w.calls.frames, 0);
  }
});

test('restores original renderer and timer state on native frame exception', () => {
  const w = fixture();
  w.game._skipRender = 'previous';
  w.game._frame = () => { throw new Error('native frame failed'); };
  assert.throws(() => invoke(w), /native frame failed/);
  assert.equal(w.game._skipRender, 'previous');
  assert.equal(w.game.frozen, false);
  assert.equal(w.calls.unfreeze, 1);
});

test('fails closed when native state never advances', () => {
  const w = fixture();
  w.game._frame = () => { w.calls.frames++; };
  assert.throws(() => invoke(w), /Native intro did not transition/);
  assert.equal(w.calls.frames, 360);
  assert.equal(w.game._skipRender, false);
  assert.equal(w.game.frozen, false);
});

test('rejects any loss of match clock during cinematic stepping', () => {
  const w = fixture();
  const originalFrame = w.game._frame;
  w.game._frame = dt => { originalFrame(dt); w.match.time -= dt; };
  assert.throws(() => invoke(w), /without consuming match time/);
  assert.equal(w.game._skipRender, false);
  assert.equal(w.game.frozen, false);
});
