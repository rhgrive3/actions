import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FixedClock, installClock, runSimulation } from '../runtime/clock.mjs';
for (const hz of [20, 24, 30, 60, 90, 120, 144]) {
  test(`180 seconds has 10800 simulation ticks at ${hz} Hz`, () => {
    const clock = new FixedClock(); let elapsed = 0;
    for (let i = 0; i < 180 * hz; i++) clock.advance(1 / hz, dt => elapsed += dt);
    assert.equal(clock.ticks, 10800); assert.ok(Math.abs(elapsed - 180) < 1e-8);
  });
}
test('a hitch retains the time beyond the catch-up budget', () => {
  const clock = new FixedClock(); clock.advance(5, () => {}, 3);
  assert.equal(clock.ticks, 3); assert.ok(clock.accumulator > 4.9);
  clock.advance(0, () => {}, 400); assert.equal(clock.ticks, 300);
});
test('mouse displacement and press edges survive a render without a tick and are consumed once', () => {
  const G = { time: 0, projectiles: { update() {} } }; installClock({ G });
  const input = { padPressed: new Set([1]), mouse: { dx: 20 }, pressed: new Set(['KeyF']), mobile: { lookDX: 2, lookDY: 1 },
    pollPad() { this.padPressed.clear(); }, endFrame() { this.mouse.dx = 0; this.pressed.clear(); } };
  let mouseTotal = 0, edges = 0;
  const game = { input, _padMenus() {}, match: { paused: false,
    updateController() { mouseTotal += input.mouse.dx; if (input.pressed.has('KeyF')) edges++; }, update() {} }, rig: {} };
  runSimulation(game, 1 / 120); assert.equal(input.mouse.dx, 20); assert.ok(input.padPressed.has(1));
  runSimulation(game, 5 / 120); assert.equal(mouseTotal, 20); assert.equal(edges, 1); assert.equal(game.s3Clock.ticks, 3);
});

// #707: offline pause freezes Match/projectiles, so gameplay time (Roller
// contact/Boss grouping, Flow assist windows) must not age during the menu.
function pausedGame(G, { attract = false } = {}) {
  installClock({ G });
  const input = { padPressed: new Set(), mouse: {}, pollPad() {}, endFrame() {} };
  const seen = [];
  const match = { paused: false, attract, state: 'playing', updateController() {}, update() { if (!this.paused) seen.push(G.time); } };
  return { game: { input, _padMenus() {}, match, rig: {}, _updateAttract() {} }, match, seen };
}
for (const hz of [30, 60, 120]) test(`#707 offline pause freezes gameplay time at ${hz} Hz for any pause length`, () => {
  let expected;
  for (const pauseSeconds of [0.1, 1, 10]) {
    const G = { time: 0, projectiles: { update() {} } }, { game, match, seen } = pausedGame(G);
    for (let i = 0; i < hz; i++) runSimulation(game, 1 / hz);
    const atPause = G.time; match.paused = true;
    for (let i = 0; i < Math.round(pauseSeconds * hz); i++) runSimulation(game, 1 / hz);
    assert.equal(G.time, atPause, 'pause menu time is not gameplay time');
    match.paused = false;
    for (let i = 0; i < hz; i++) runSimulation(game, 1 / hz);
    const result = { time: G.time, ticks: seen.length, last: seen.at(-1) };
    assert.ok(Math.abs(G.time - 2) < 1e-9, `${G.time} != 2s of unpaused simulation`);
    if (expected) assert.deepEqual(result, expected); else expected = result;
  }
});
test('#707 a gate that needs 0.5s of gameplay time cannot expire during offline pause', () => {
  const G = { time: 0, projectiles: { update() {} } }, { game, match } = pausedGame(G);
  for (let i = 0; i < 6; i++) runSimulation(game, 1 / 60);
  const lastHit = G.time; match.paused = true;
  for (let i = 0; i < 600; i++) runSimulation(game, 1 / 60);
  match.paused = false; runSimulation(game, 1 / 60);
  assert.equal(G.time - lastHit > 0.5, false, 'Roller contact gate stays closed after a 10s pause');
  for (let i = 0; i < 30; i++) runSimulation(game, 1 / 60);
  assert.equal(G.time - lastHit > 0.5, true, '0.5s of real unpaused contact reopens it');
});
test('#707 unpaused, online-pause (never sets paused) and attract matches keep advancing gameplay time', () => {
  for (const attract of [false, true]) {
    const G = { time: 0, projectiles: { update() {} } }, { game } = pausedGame(G, { attract });
    for (let i = 0; i < 60; i++) runSimulation(game, 1 / 60);
    assert.ok(Math.abs(G.time - 1) < 1e-9);
  }
  const G = { time: 0, projectiles: { update() {} } }, { game } = pausedGame(G); game.match = null;
  for (let i = 0; i < 60; i++) runSimulation(game, 1 / 60);
  assert.ok(Math.abs(G.time - 1) < 1e-9, 'menu/boot without a match still advances');
});
