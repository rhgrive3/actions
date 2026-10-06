// Render cadence is independent of the 60 Hz gameplay clock.
export const STEP = 1 / 60;
export class FixedClock {
  constructor() { this.accumulator = 0; this.ticks = 0; }
  advance(elapsed, tick, budget = 240) {
    if (!Number.isFinite(elapsed) || elapsed < 0) throw new RangeError('Invalid frame interval');
    this.accumulator += elapsed;
    let count = 0;
    while (this.accumulator + 1e-10 >= STEP && count < budget) {
      tick(STEP);
      this.accumulator = Math.max(0, this.accumulator - STEP);
      this.ticks++; count++;
    }
    return count; // Unprocessed time remains queued, never silently discarded.
  }
  reset() { this.accumulator = 0; }
}
let context;
export function installClock(api) { context = api; }
export function runSimulation(game, dt) {
  if (!context) throw new Error('INKWAVE patches were not installed');
  const { G } = context;
  const clock = game.s3Clock || (game.s3Clock = new FixedClock());
  // pollPad clears edges. Preserve those collected on a render without a tick.
  const pending = new Set(game.input.padPressed);
  const pendingPadEpoch = game.input._padEpoch;
  game.input.pollPad();
  if (pendingPadEpoch === game.input._padEpoch) {
    for (const key of pending) game.input.padPressed.add(key);
  }
  game._padMenus();
  G.net?.update?.(dt);
  const m = game.match, covered = !!game.showcase?.fullFrame;
  game._s3Ticked = clock.advance(dt, step => {
    G.time += step;
    if (m && !(covered && m.attract)) {
      m.updateController(step);
      m.controller?.computeAim?.();
      m.update(step);
      if (!m.paused) G.projectiles.update(step);
      if (m.attract) game._updateAttract(step);
      else if (m.state === 'playing' && m.local?.alive && (game.rig.mode !== 'follow' || game.rig.target !== m.local)) game.rig.follow(m.local, true);
    }
    game.input.endFrame();
    // Mouse and touch deltas are displacements, not velocities: consume once.
    if (game.input.mobile) game.input.mobile.lookDX = game.input.mobile.lookDY = 0;
    game.input.padPressed.clear();
  });
}
export function installGame(Game) {
  const original = Game.prototype._loop;
  Game.prototype._loop = function () {
    // A hidden tab explicitly suspends local play; it cannot accumulate hours
    // of catch-up. Foreground slow frames retain all their elapsed time.
    if (globalThis.document?.hidden) {
      this.timer.update(); this.s3Clock?.reset();
      requestAnimationFrame(() => this._loop());
      return;
    }
    return original.call(this);
  };
}
