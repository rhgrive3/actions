import { terminalRecoveryRequired, installRecoveryEntryGuards } from './recovery-gate.mjs';
import { simulateMatchInterval } from './turf-finish.mjs';
// Render cadence is independent of the 60 Hz gameplay clock.
import { idleAttractMenuBudget, MENU_ATTRACT_STEP } from '../../local-quality/idle-resources.mjs';
import { beginActorMotionTick } from './actor-motion.mjs';

export const STEP = 1 / 60;

// Gameplay randomness (shot spread, splash scatter, …) is drawn inside fixed
// ticks; presentation (FX, camera shake, menus, net polling) also calls
// Math.random once per rendered frame. Sharing one stream made the gameplay
// draws depend on how many frames were rendered, so the same inputs at 20/30
// vs 60 Hz produced different spread and paint. While Game._frame runs, the
// non-tick part draws from a separate presentation stream and every fixed tick
// restores the caller's Math.random, so tick count alone decides gameplay draws.
// The presentation stream has its own fixed seed and never draws from the
// caller's generator, so a seeded Math.random still reproduces gameplay exactly.
const PRESENTATION_SEED = 0x9E3779B9;
let presentationState = PRESENTATION_SEED, tickRandom = null;
function presentationRandom() {
  let t = (presentationState = (presentationState + 0x6D2B79F5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export function withSeparatedPresentationRandom(run) {
  const base = Math.random;
  if (base === presentationRandom) return run();
  tickRandom = base; Math.random = presentationRandom;
  try { return run(); }
  finally { if (Math.random === presentationRandom) Math.random = base; tickRandom = null; }
}
function runTickWithGameplayRandom(tick, step) {
  if (Math.random !== presentationRandom || !tickRandom) return tick(step);
  Math.random = tickRandom;
  try { return tick(step); }
  finally { if (Math.random === tickRandom) Math.random = presentationRandom; }
}

export class FixedClock {
  constructor() { this.accumulator = 0; this.ticks = 0; this.advancing = false; this.finalTick = true; }
  advance(elapsed, tick, budget = 240) {
    if (!Number.isFinite(elapsed) || elapsed < 0) throw new RangeError('Invalid frame interval');
    this.accumulator += elapsed;
    let count = 0;
    while (this.accumulator + 1e-10 >= STEP && count < budget) {
      // Whether the frame drawn after this advance shows this tick's state (no
      // further tick follows). Presentation-only work may defer earlier ticks.
      this.finalTick = !(Math.max(0, this.accumulator - STEP) + 1e-10 >= STEP && count + 1 < budget);
      this.advancing = true;
      try { runTickWithGameplayRandom(tick, STEP); } finally { this.advancing = false; }
      this.accumulator = Math.max(0, this.accumulator - STEP);
      this.ticks++; count++;
    }
    return count; // Unprocessed time remains queued, never silently discarded.
  }
  reset() { this.accumulator = 0; this._pendingPadEdges?.clear(); }
}
let context;
let hiddenGuestListenerInstalled = false;
export function installClock(api) { context = api; }
export function runSimulation(game, dt) {
  if (terminalRecoveryRequired(game)) { game.s3Clock?.reset(); return; }
  if (!context) throw new Error('INKWAVE patches were not installed');
  const { G } = context;
  const clock = game.s3Clock || (game.s3Clock = new FixedClock());
  // #1111: no gamepad edge => no allocation. Reuse a per-clock snapshot on
  // active edges so 0-tick render frames preserve them across destructive pollPad.
  const edges = game.input.padPressed;
  let pending = null;
  if (edges.size) {
    pending = clock._pendingPadEdges || (clock._pendingPadEdges = new Set());
    pending.clear();
    for (const key of edges) pending.add(key);
  }
  const pendingPadEpoch = game.input._padEpoch;
  game.input.pollPad();
  if (pending) {
    if (pendingPadEpoch === game.input._padEpoch)
      for (const key of pending) game.input.padPressed.add(key);
    // Epoch change never resurrects stale input; no carried snapshot remains.
    pending.clear();
  }
  game._padMenus();
  G.net?.update?.(dt);
  const m = game.match, covered = !!game.showcase?.fullFrame;
  const menuAttractBudget = idleAttractMenuBudget(game, G);
  const menuRenderElapsed = menuAttractBudget ? (game._menuAttractRenderElapsed || 0) + dt : 0;
  game._menuAttractFrame = false;
  game._menuAttractFrameDelta = 0;
  if (!menuAttractBudget) game._menuAttractPresentationElapsed = 0;
  G.paint?.useFixedPaintClock?.();
  game._s3Ticked = clock.advance(dt, step => {
    // Offline pause must freeze the same gameplay clock as actors/projectiles (#707).
    const gameplayPaused = !!(m && m.paused && !m.attract);
    if (!gameplayPaused) G.time += step;
    if (m && !(covered && m.attract)) {
      // The menu budget limits drawing, never the physical integration step.
      // Aggregating three ticks into 50 ms also coarsened collision, facing,
      // spawn trajectories and the Character's spring-driven pose.
      const simDt = step;
      if (menuAttractBudget) {
        game._menuAttractPresentationElapsed = (game._menuAttractPresentationElapsed || 0) + step;
        if (game._menuAttractPresentationElapsed + 1e-10 >= MENU_ATTRACT_STEP) {
          game._menuAttractPresentationElapsed = 0;
          game._menuAttractFrame = true;
        }
      }
      if (simDt > 0) {
        // #1040: capture every actor's start-of-tick pose BEFORE any of them
        // moves this tick. The projectile sweep below runs after m.update, so
        // round segment and actor interval then cover the SAME fixed step.
        beginActorMotionTick(G.actors);
        // Results keep input/presentation/network cadence without advancing local
        // authoritative actor/projectile simulation. Menu attract budgeting remains
        // independent and applies only when that attract match owns the menu backdrop.
        const results = m.state === 'results';
        if (results && G.netm) {
          if (!m.paused) for (const a of m.actors || []) if (a.remote && G.netm.applyRemote) G.netm.applyRemote(a, simDt);
        } else if (!results) {
          simulateMatchInterval(m, simDt, G);
        }
        if (m.attract && !m.paused) game._updateAttract(simDt);
        else if (m.state === 'playing' && m.local?.alive && (game.rig.mode !== 'follow' || game.rig.target !== m.local)) game.rig.follow(m.local, true);
      }
    }
    // Delayed paint owns turf/special credit, so it shares gameplay time.
    // Consume paused clock ticks without accumulating paint debt for resume.
    if (!gameplayPaused) G.paint?.advanceSimulation?.(step);
    game.input.endFrame();
    // Mouse and touch deltas are displacements, not velocities: consume once.
    if (game.input.mobile) game.input.mobile.lookDX = game.input.mobile.lookDY = 0;
    game.input.padPressed.clear();
  });
  if (menuAttractBudget && game._menuAttractFrame) {
    game._menuAttractFrameDelta = menuRenderElapsed;
    game._menuAttractRenderElapsed = 0;
  } else game._menuAttractRenderElapsed = menuRenderElapsed;
}
export function installGame(Game) {
  installRecoveryEntryGuards(Game);
  // #1032: browsers may stop RAF entirely while a tab is hidden. A guest must
  // therefore leave at the visibility edge itself instead of waiting for the
  // next gameplay/network tick. The relay's normal leave event then enters the
  // same #201 disconnect/no-contest policy on every remaining client.
  if (!hiddenGuestListenerInstalled && globalThis.document?.addEventListener) {
    globalThis.document.addEventListener('visibilitychange', () => {
      const G = context?.G, net = G?.net;
      if (!globalThis.document.hidden || !G?.netm || !net || net.isHost || net.state !== 'match' || net._s3HiddenGuestLeft) return;
      net._s3HiddenGuestLeft = true;
      net.leave(true);
      G.game?.netMatchAborted?.('Disconnected while backgrounded');
    });
    hiddenGuestListenerInstalled = true;
  }
  const frame = Game.prototype._frame;
  if (typeof frame === 'function' && !frame.s3SeparatedRandom) {
    const separated = function (dt) {
      if (terminalRecoveryRequired(this)) return;
      return withSeparatedPresentationRandom(() => frame.call(this, dt));
    };
    separated.s3SeparatedRandom = true;
    Game.prototype._frame = separated;
  }
  const original = Game.prototype._loop;
  Game.prototype._loop = function () {
    // A hidden tab explicitly suspends local play; it cannot accumulate hours
    // of catch-up. Foreground slow frames retain all their elapsed time.
    if (terminalRecoveryRequired(this) || globalThis.document?.hidden) {
      this.timer.update(); this.s3Clock?.reset();
      requestAnimationFrame(() => this._loop());
      return;
    }
    return original.call(this);
  };
}
