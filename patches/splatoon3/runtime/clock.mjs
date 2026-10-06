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
let activeVisibilityGame = null;
let pendingHiddenAt = null;
const visibilityDocuments = new WeakSet();
const hiddenIntervals = new WeakMap();

export function installClock(api) { context = api; }

function monotonicNow() {
  try {
    const value = globalThis.performance?.now?.();
    return Number.isFinite(value) ? value : null;
  } catch { return null; }
}

function captureHiddenInterval(game, at = pendingHiddenAt) {
  if (!game || hiddenIntervals.has(game)) return;
  at ??= monotonicNow();
  if (!Number.isFinite(at)) return;
  const match = game.match, netm = context?.G?.netm;
  const session = netm?.s;
  hiddenIntervals.set(game, { at, match, netm, session, hostId: session?.hostId, myId: session?.myId,
    wasHost: netm ? !!netm.isHost : null });
}

function resumeHiddenInterval(game, now = monotonicNow()) {
  const hidden = game && hiddenIntervals.get(game);
  if (!hidden) return;
  hiddenIntervals.delete(game);
  const elapsed = (now - hidden.at) / 1000;
  const netm = context?.G?.netm, match = hidden.match;
  if (!Number.isFinite(elapsed) || elapsed <= 0 || !match || game.match !== match ||
      !hidden.netm || netm !== hidden.netm || netm.match !== match || hidden.wasHost !== !!netm.isHost ||
      netm.s !== hidden.session || netm.s?.hostId !== hidden.hostId || netm.s?.myId !== hidden.myId ||
      typeof match._s3AdvanceClock !== 'function') return;
  // Reconcile only Match's authoritative timer. No fixed-step actor/projectile
  // simulation or NetMatch tick backlog runs for the hidden interval.
  match._s3AdvanceClock(elapsed);
}

function watchVisibility() {
  const doc = globalThis.document;
  if (!doc?.addEventListener || visibilityDocuments.has(doc)) return;
  visibilityDocuments.add(doc);
  if (doc.hidden && pendingHiddenAt === null) pendingHiddenAt = monotonicNow();
  doc.addEventListener('visibilitychange', () => {
    const now = monotonicNow();
    if (doc.hidden) {
      if (pendingHiddenAt === null) pendingHiddenAt = now;
      captureHiddenInterval(activeVisibilityGame, pendingHiddenAt);
    } else {
      resumeHiddenInterval(activeVisibilityGame, now);
      pendingHiddenAt = null;
    }
  });
}

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
  watchVisibility();
  const original = Game.prototype._loop;
  Game.prototype._loop = function () {
    activeVisibilityGame = this;
    // A hidden tab explicitly suspends local play; it cannot accumulate hours
    // of catch-up. Foreground slow frames retain all their elapsed time.
    if (globalThis.document?.hidden) {
      if (pendingHiddenAt === null) pendingHiddenAt = monotonicNow();
      captureHiddenInterval(this, pendingHiddenAt);
      this.timer.update(); this.s3Clock?.reset();
      requestAnimationFrame(() => this._loop());
      return;
    }
    resumeHiddenInterval(this);
    return original.call(this);
  };
}
