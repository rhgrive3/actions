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
