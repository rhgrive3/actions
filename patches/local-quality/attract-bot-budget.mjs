// Menu-only background BotBrain budget. Keep Match/Actor/Projectiles at their
// original fixed simulation cadence so visible movement, muzzle transforms,
// paint ownership, damage and the menu camera never lose gameplay ticks.
//
// At 60 Hz desktop the demo brains make 30 decisions/s; the already
// 20-Hz touch/LOW menu uses 10 decisions/s. Physics and rendered poses still
// run at their prior rate. Half the bots start on the opposite tick.
// Accumulate elapsed time and pass it to the native brain; do not lose timers.
const INSTALLED = Symbol.for('inkwave.local-quality.attract-bot-budget.v1');
export const ATTRACT_AI_STEP = 1 / 30;
export const ATTRACT_AI_TOUCH_STEP = 1 / 10;
export function attractAiStep(G) {
  const touch = !!(G?.game?.mobile?.touch || G?.mobile?.touch);
  const low = (G?.game?.settings || G?.settings)?.quality === 'low';
  return touch || low ? ATTRACT_AI_TOUCH_STEP : ATTRACT_AI_STEP;
}

export function menuAttractAiEligible(brain, G) {
  const actor = brain?.a, match = G?.match;
  return !!(match?.attract && match.state === 'playing' && !match.paused
    && G.mode === 'menu' && !G.netm && !G.game?.showcase?.fullFrame
    && actor?.isBot === true && actor.bot === brain && actor.alive
    && !actor.superJumpState && !brain._wasDead
    && match.actors?.includes(actor));
}

export function installAttractBotBudget({ BotBrain }, G) {
  const proto = BotBrain?.prototype;
  if (!proto || Object.hasOwn(proto, INSTALLED)) return false;
  Object.defineProperty(proto, INSTALLED, { value: true });
  const nativeUpdate = proto.update;
  proto.update = function menuAttractBotUpdate(dt) {
    if (!menuAttractAiEligible(this, G) || !Number.isFinite(dt) || dt <= 0) {
      // Death/super-jump and scope transitions must clear commands on this
      // very frame via native BotBrain.update, never wait for a menu budget.
      this._menuAttractPending = 0;
      this._menuAttractFirst = undefined;
      this._menuAttractStep = undefined;
      return nativeUpdate.call(this, dt);
    }
    const actor = this.a, step = attractAiStep(G);
    if (this._menuAttractStep !== step) {
      // Device/quality setting changed mid-demo: never carry stale cadence
      // into the new tier or a real match.
      this._menuAttractPending = 0;
      this._menuAttractFirst = undefined;
      this._menuAttractStep = step;
    }
    // Stagger 4+4 brains on alternate 60-Hz or 20-Hz simulation frames.
    const first = this._menuAttractFirst ??
      (((actor.team + actor.slot) & 1) ? step / 2 : step);
    const accumulated = (this._menuAttractPending || 0) + dt;
    if (accumulated + 1e-10 < first) {
      this._menuAttractPending = accumulated;
      this._menuAttractFirst = first;
      return;
    }
    this._menuAttractFirst = step;
    this._menuAttractPending = 0;
    return nativeUpdate.call(this, accumulated);
  };
  return true;
}
