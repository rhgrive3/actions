// Menu-only background BotBrain budget. Keep Match/Actor/Projectiles at their
// original fixed simulation cadence so visible movement, muzzle transforms,
// paint ownership, damage and the menu camera never lose gameplay ticks.
//
// At 60 Hz the eight non-interactive demo brains need only 30 decisions/s.
// Half the bots start on the opposite tick, avoiding an eight-brain CPU spike.
// Browser/touch configurations already budgeted to 20 Hz keep all decisions.
// Accumulate elapsed time and pass it to the native brain; do not lose timers.
const INSTALLED = Symbol.for('inkwave.local-quality.attract-bot-budget.v1');
export const ATTRACT_AI_STEP = 1 / 30;

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
      return nativeUpdate.call(this, dt);
    }
    const actor = this.a;
    // Stagger 4+4 bots at fixed 60 Hz without advancing anyone's clock early.
    const first = this._menuAttractFirst ??
      (((actor.team + actor.slot) & 1) ? 1 / 60 : ATTRACT_AI_STEP);
    const accumulated = (this._menuAttractPending || 0) + dt;
    if (accumulated + 1e-10 < first) {
      this._menuAttractPending = accumulated;
      this._menuAttractFirst = first;
      return;
    }
    this._menuAttractFirst = ATTRACT_AI_STEP;
    this._menuAttractPending = 0;
    return nativeUpdate.call(this, accumulated);
  };
  return true;
}
