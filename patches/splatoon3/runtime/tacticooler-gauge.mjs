import { TACTICOOLER_SOURCE } from './support-cooler.mjs';
import { turfCombatAllowed } from './turf-combat.mjs';

// Nintendo 5.0.0: refill resumes 10 seconds after placement. The current
// testing Wiki also documents early unlock when the stand disappears (Tower:
// 450F). Keep this stand-owned clock separate from Ink Storm's actor clock,
// duration denominator and Special Power snapshot.
export function tacticoolerGaugeRemaining(actor) {
  const state = actor?.s3TacticoolerGauge;
  if (!state || actor.remote || state.game.match !== state.match || state.stand.s3Retired) return 0;
  const remaining = Math.min(state.until, state.stand.expires) - state.game.time;
  return remaining > 1e-10 ? remaining : 0;
}
export const tacticoolerGaugeLocked = actor => tacticoolerGaugeRemaining(actor) > 0;

export function startTacticoolerGauge(stand, game) {
  const actor = stand?.owner;
  if (!actor || actor.remote || stand.ghost || !Number.isFinite(game?.time)) return;
  actor.s3TacticoolerGauge = { stand, game, match: game.match,
    until: game.time + TACTICOOLER_SOURCE.specialReduceFrame / 60 };
}
export function endTacticoolerGauge(stand) {
  if (!stand) return;
  stand.s3Retired = true;
  if (stand.owner?.s3TacticoolerGauge?.stand === stand) stand.owner.s3TacticoolerGauge = null;
}

const INSTALL = Symbol.for('inkwave.s3.tacticooler-gauge.v1');
export function installTacticoolerGauge({ Actor, G }) {
  const proto = Actor.prototype;
  if (Object.hasOwn(proto, INSTALL)) return;
  Object.defineProperty(proto, INSTALL, { value: true });
  const ready = proto.specialReady, turf = proto.addTurf;
  proto.specialReady = function (...args) {
    return !tacticoolerGaugeLocked(this) && ready.apply(this, args);
  };
  proto.addTurf = function (area, ...args) {
    if (tacticoolerGaugeLocked(this)) {
      // Retain native turf scoring and its event without granting charge or
      // announcing readiness. Preserve the installed combat finish gate too.
      if (turfCombatAllowed(G)) return this.addTurfNoSpecial(area);
      return;
    }
    return turf.call(this, area, ...args);
  };
}
