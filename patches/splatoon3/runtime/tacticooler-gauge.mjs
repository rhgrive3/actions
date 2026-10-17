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

// Fixed lock windows documented by the individual specials / testing Wiki.
// These are NOT their world-effect lifetimes. Missing raw defaults stay
// community-measured: Shock Sonar 360F and Screen 300F are not inferred from
// WaveEmitFrameArray or TargetSpeedFrame. Firework exports SpecialTotalFrame.
export const SPECIAL_GAUGE_FRAMES = Object.freeze({ tentaMissiles:600, superChump:635,
  waveBreaker:360, splattercolorScreen:300 });
export function rainmakerGaugeException(actor, game) {
  const match=game?.match,carrier=match?.ranked?.rule?.state?.carrier;
  return match?.mode==='rainmaker'&&carrier!=null
    &&String(carrier)===String(actor?.nid??`${actor?.team}:${actor?.slot}`);
}
export function startSpecialGauge(actor, game, id, frames, device = null) {
  if (!actor || actor.remote || device?.remote || device?.ghost || !(frames > 0) || !Number.isFinite(game?.time) || rainmakerGaugeException(actor,game)) return null;
  const locks = actor.s3SpecialGaugeLocks ||= new Map();
  actor.special=0;
  const state = { id, game, match:game.match, device, until:game.time + frames / 60 };
  locks.set(id,state); return state;
}
export function endSpecialGauge(actor, id, device) {
  const locks=actor?.s3SpecialGaugeLocks,state=locks?.get(id);
  if (state && (device === undefined || state.device === device)) locks.delete(id);
}
export function specialGaugeRemaining(actor) {
  if (!actor || actor.remote) return 0;
  let remaining=Math.max(0,actor.stormGaugeLock||0,tacticoolerGaugeRemaining(actor));
  for(const [id,state] of actor.s3SpecialGaugeLocks||[]) {
    const value=state.game.match===state.match&&!state.device?.dead&&!state.device?.s3Retired
      ? state.until-state.game.time : 0;
    if(value>1e-10)remaining=Math.max(remaining,value);
    else actor.s3SpecialGaugeLocks.delete(id);
  }
  return remaining;
}
export const specialGaugeLocked = actor => specialGaugeRemaining(actor)>0;
// Picking up the Rainmaker is the documented exception, and match teardown
// also clears the clocks. Neither action destroys the deployed world devices.
export function clearSpecialGaugeLocks(actor, clearStorm = true) {
  if (!actor) return;
  actor.s3SpecialGaugeLocks?.clear(); actor.s3TacticoolerGauge=null;
  if(clearStorm)actor.stormGaugeLock=0;
}

export function startTacticoolerGauge(stand, game) {
  const actor = stand?.owner;
  if (!actor || actor.remote || stand.ghost || !Number.isFinite(game?.time) || rainmakerGaugeException(actor,game)) return;
  actor.special=0;
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
    return !specialGaugeLocked(this) && ready.apply(this, args);
  };
  proto.addTurf = function (area, ...args) {
    if (specialGaugeLocked(this)) {
      // Retain native turf scoring and its event without granting charge or
      // announcing readiness. Preserve the installed combat finish gate too.
      if (turfCombatAllowed(G)) return this.addTurfNoSpecial(area);
      return;
    }
    return turf.call(this, area, ...args);
  };
}
