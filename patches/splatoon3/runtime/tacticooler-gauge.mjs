import { TACTICOOLER_SOURCE } from './support-cooler.mjs';
import { turfCombatAllowed } from './turf-combat.mjs';
import { activeSpecialGaugeLocked } from './active-special-gauge.mjs';

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
// community-measured: Shock Sonar's individual page reports approximately
// 6.5s (390F), conflicting with the overview's rounded 6s. Prefer that detailed
// measurement; it is NOT an exported SpecialReduce default or an inference from
// WaveEmitFrameArray. Screen 300F is not inferred from TargetSpeedFrame either.
// Firework exports SpecialTotalFrame.
export const SPECIAL_GAUGE_FRAMES = Object.freeze({ tentaMissiles:600, superChump:635,
  waveBreaker:390, splattercolorScreen:300 });
export function rainmakerGaugeException(actor, game) {
  const match=game?.match,carrier=match?.ranked?.rule?.state?.carrier;
  return match?.mode==='rainmaker'&&carrier!=null
    &&String(carrier)===String(actor?.nid??`${actor?.team}:${actor?.slot}`);
}
export function startSpecialGauge(actor, game, id, frames, device = null, displayFrames = frames) {
  if(actor?.s3PreOperationGauge?.id===id)clearPreOperationGauge(actor);
  if (!actor || actor.remote || device?.remote || device?.ghost || !(frames > 0) || !Number.isFinite(game?.time) || rainmakerGaugeException(actor,game)) return null;
  const locks = actor.s3SpecialGaugeLocks ||= new Map();
  actor.special=0;
  // The spent HUD is separate from both reusable charge and the lock deadline.
  // Bubbler stays locked until the actual device dies, while its display drains
  // at the undamaged natural-lifetime rate, unaffected by incoming damage.
  const state = { id, game, match:game.match, device, until:game.time + frames / 60,
    startedAt:game.time, displayDuration:displayFrames / 60 };
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
export const specialGaugeLocked = actor => specialGaugeRemaining(actor)>0||activeSpecialGaugeLocked(actor);
// These held/released devices have not begun depletion yet. Capture the real
// local activation's full cost, then transfer ownership to its native thrown
// record. Its remaining points enter the ordinary death/Saver path; operation
// consumes them and begins the separate deployed lock. HUD is only a reader.
const preOperationLife=actor=>Math.max(Number(actor?.netLife)||0,Number(actor?.net?.lastLife)||0);
export function preOperationGaugeState(actor) {
  const state=actor?.s3PreOperationGauge;
  if(!state||actor.remote||actor.alive===false||state.game.match!==state.match
    ||actor.owner!==state.owner||preOperationLife(actor)!==state.life||rainmakerGaugeException(actor,state.game))return null;
  return state.device?state.device.owner===actor&&!state.device.ghost&&!state.device.remote&&state.list.includes(state.device)?state:null:actor.specialActive===state.token?state:null;
}
export function startHeldSpecialGauge(actor,game,id) {
  if(!actor||actor.remote||actor.alive===false||actor.specialActive?.id!==id||!['storm','tacticooler','waveBreaker','splattercolorScreen'].includes(id)||!Number.isFinite(game?.time)||rainmakerGaugeException(actor,game))return;
  const cost=actor.specialCost?.();
  if(!Number.isFinite(cost)||!(cost>0))return;
  actor.s3PreOperationGauge={id,game,match:game.match,cost,activationCost:cost,owner:actor.owner,life:preOperationLife(actor),token:actor.specialActive};
  actor.special=cost;
}
function syncPreOperationGauge(actor) {
  const state=preOperationGaugeState(actor),cost=actor.specialCost?.();
  // Native conditional gear changes the point denomination while preserving
  // its fraction. A still-full device must follow that same denomination,
  // including immediately before the existing death/Saver wrapper runs.
  if(state&&Number.isFinite(cost)&&cost>0){state.cost=cost;actor.special=cost;}
}
export function startPendingSpecialGauge(actor,game,id,device,list) {
  if(!actor||actor.remote||device?.owner!==actor||device?.ghost||device?.remote||!Array.isArray(list)||!Number.isFinite(game?.time)||rainmakerGaugeException(actor,game))return;
  const state=preOperationGaugeState(actor);
  if(state?.id!==id)return;
  state.device=device;state.list=list;state.token=null;syncPreOperationGauge(actor);
}
export function clearPreOperationGauge(actor,consume=false) {
  if(!actor)return;
  const state=actor.s3PreOperationGauge;
  if(consume&&state&&!actor.remote&&actor.alive!==false&&state.owner===actor.owner&&preOperationLife(actor)===state.life)actor.special=0;
  actor.s3PreOperationGauge=null;
}
function retireInvalidPreOperationGauge(actor) {
  if(actor.s3PreOperationGauge&&!preOperationGaugeState(actor))clearPreOperationGauge(actor,true);
}
export function deployedGaugeFraction(actor) {
  if (!actor || actor.remote) return null;
  let fraction=null;
  const cooler=actor.s3TacticoolerGauge,remaining=tacticoolerGaugeRemaining(actor);
  // A Tower stand disappearing at 450F ends the 600F display early. It does
  // not change the fixed depletion rate before that disappearance.
  if(remaining>0)fraction=Math.min(1,Math.max(0,(cooler.until-cooler.game.time)/(TACTICOOLER_SOURCE.specialReduceFrame/60)));
  for(const state of actor.s3SpecialGaugeLocks?.values?.()||[]) {
    if(state.game.match!==state.match||state.device?.dead||state.device?.s3Retired
      ||!(state.until-state.game.time>1e-10)||!Number.isFinite(state.displayDuration)||!(state.displayDuration>0))continue;
    const value=Math.min(1,Math.max(0,1-(state.game.time-state.startedAt)/state.displayDuration));
    fraction=Math.max(fraction??0,value);
  }
  if(fraction===null&&preOperationGaugeState(actor))return 1;
  return fraction;
}
// Picking up the Rainmaker is the documented exception, and match teardown
// also clears the clocks. Neither action destroys the deployed world devices.
export function clearSpecialGaugeLocks(actor, clearStorm = true) {
  if (!actor) return;
  actor.s3SpecialGaugeLocks?.clear(); actor.s3TacticoolerGauge=null;
  clearPreOperationGauge(actor,true);
  if(clearStorm)actor.stormGaugeLock=0;
}

export function startTacticoolerGauge(stand, game) {
  const actor = stand?.owner;
  if(actor?.s3PreOperationGauge?.id==='tacticooler')clearPreOperationGauge(actor);
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
  const ready = proto.specialReady, turf = proto.addTurf, reset = proto.reset, splat = proto.splat, update = proto.update, start = proto._startSpecial;
  proto._startSpecial=function(...args) {
    retireInvalidPreOperationGauge(this);
    if(preOperationGaugeState(this))return;
    return start.apply(this,args);
  };
  proto.update=function(...args) {
    retireInvalidPreOperationGauge(this);
    const result=update.apply(this,args);
    syncPreOperationGauge(this);
    return result;
  };
  proto.reset=function(...args) {
    clearPreOperationGauge(this);
    return reset.apply(this,args);
  };
  proto.splat=function(...args) {
    syncPreOperationGauge(this);
    const result=splat.apply(this,args);
    if(!this.alive)clearPreOperationGauge(this);
    return result;
  };
  proto.specialReady = function (...args) {
    retireInvalidPreOperationGauge(this);
    return !preOperationGaugeState(this) && !specialGaugeLocked(this) && ready.apply(this, args);
  };
  proto.addTurf = function (area, ...args) {
    retireInvalidPreOperationGauge(this);
    if (preOperationGaugeState(this) || specialGaugeLocked(this)) {
      // Retain native turf scoring and its event without granting charge or
      // announcing readiness. Preserve the installed combat finish gate too.
      if (turfCombatAllowed(G)) return this.addTurfNoSpecial(area);
      return;
    }
    return turf.call(this, area, ...args);
  };
}
