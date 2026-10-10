// C1088 presentation-only Squid Surge transport. This state is intentionally
// separate from Actor.s3.actions: remote snapshots may pose a Character, but
// can never start local movement, armor, damage, ink, or scoring work.
export const C1088_SURGE_TAG = 'inkwave.s3.surge.v1';

const owners = new WeakMap();
const phaseRank = Object.freeze({ charge: 0, burst: 1, end: 2 });
const quantize = value => Math.round(value * 1e6) / 1e6;

function lifeOf(actor) {
  const life = actor?.stats?.deaths;
  return Number.isSafeInteger(life) && life >= 0 ? life : 0;
}

function endState(life, epoch) {
  return { tag: C1088_SURGE_TAG, life, epoch, phase: 'end', charge: 0, time: 0, sampleAge: 0 };
}

// Called only by NetMatch.packActor, whose send loop already excludes proxies.
// The action identity advances once per local action; phase changes keep its epoch.
export function packC1088SurgePresentation(actor) {
  if (!actor || actor.remote) return null;
  const life = lifeOf(actor);
  let state = owners.get(actor);
  if (!state || state.life !== life) {
    state = { life, epoch: 0, action: null };
    owners.set(actor, state);
  }

  const action = actor.s3?.actions?.surge;
  if (action && action !== state.action) {
    state.epoch = state.epoch >= Number.MAX_SAFE_INTEGER ? 1 : state.epoch + 1;
    state.action = action;
  } else if (!action) state.action = null;

  // An untouched actor has no Surge pose to retire. Keep its original 22-column
  // packet. After an action or a life change, retain explicit end markers so
  // remote phase/life watermarks still reject late presentation samples.
  if (!action && state.epoch === 0 && life === 0) return null;

  const phase = action?.phase;
  if (actor.alive && (phase === 'charge' || phase === 'burst')) {
    const charge = action.charge;
    const time = phase === 'burst' ? action.time : 0;
    if (Number.isFinite(charge) && charge >= 0 && charge <= 1 &&
        Number.isFinite(time) && time >= 0) {
      return { tag: C1088_SURGE_TAG, life, epoch: state.epoch, phase,
        charge: quantize(charge), time: quantize(time), sampleAge: 0 };
    }
  }
  return endState(life, state.epoch);
}

export function clearRemoteC1088Surge(actor) {
  const presentation = actor?.s3?.c1088SurgePresentation;
  if (presentation?.tag === C1088_SURGE_TAG) delete actor.s3.c1088SurgePresentation;
}

// Used when a remote stream is discarded or an actor is adopted locally, so a
// reconnect or new owner-side epoch stream cannot inherit stale presentation.
export function resetC1088SurgePresentation(actor) {
  clearRemoteC1088Surge(actor);
  owners.delete(actor);
  if (actor?.net) delete actor.net.c1088SurgeState;
}

function parse(payload) {
  if (!payload || typeof payload !== 'object' || payload.tag !== C1088_SURGE_TAG ||
      !Number.isSafeInteger(payload.life) || payload.life < 0 ||
      !Number.isSafeInteger(payload.epoch) || payload.epoch < 0 ||
      !Object.prototype.hasOwnProperty.call(phaseRank, payload.phase) ||
      !Number.isFinite(payload.charge) || payload.charge < 0 || payload.charge > 1 ||
      !Number.isFinite(payload.time) || payload.time < 0 ||
      !Number.isFinite(payload.sampleAge) || payload.sampleAge < 0) return null;
  if (payload.phase === 'end' && (payload.charge !== 0 || payload.time !== 0)) return null;
  if (payload.phase === 'charge' && payload.time !== 0) return null;
  return payload;
}

// Only the peer admitted by NetMatch._tick may supply this presentation sample.
// `sampleTime` is the owner's NetMatch timestamp; its age is evaluated on the
// same playback cursor used by the remote position, not a guessed local clock.
export function applyRemoteC1088Surge(actor, payload, sampleTime, playbackTime, sampleOwner, actorOwner) {
  if (!actor?.remote || !actor.net || typeof actorOwner !== 'string' || sampleOwner !== actorOwner) {
    clearRemoteC1088Surge(actor);
    return false;
  }

  let state = actor.net.c1088SurgeState;
  if (!state || state.owner !== actorOwner) {
    clearRemoteC1088Surge(actor);
    state = { owner: actorOwner, life: -1, epoch: -1, rank: -1,
      sampleTime: -Infinity, charge: 0, time: Infinity };
    actor.net.c1088SurgeState = state;
  }

  const next = parse(payload);
  if (!next || !Number.isFinite(sampleTime) || !Number.isFinite(playbackTime)) {
    clearRemoteC1088Surge(actor);
    return false;
  }
  if (next.life < state.life || sampleTime < state.sampleTime) return false;
  if (next.life > state.life || next.epoch > state.epoch) {
    clearRemoteC1088Surge(actor);
    state.life = next.life;
    state.epoch = next.epoch;
    state.rank = -1;
    state.sampleTime = -Infinity;
    state.charge = 0;
    state.time = Infinity;
  } else if (next.epoch < state.epoch) return false;

  const rank = phaseRank[next.phase];
  if (rank < state.rank || sampleTime < state.sampleTime) return false;
  if (next.epoch === state.epoch && next.phase === 'charge' &&
      state.rank === rank && next.charge + 1e-9 < state.charge) return false;
  if (next.epoch === state.epoch && next.phase === 'burst' &&
      state.rank === rank && (next.charge + 1e-9 < state.charge || next.time > state.time + 1e-9)) return false;

  const sampleAge = Math.max(0, playbackTime - sampleTime + next.sampleAge);
  state.rank = rank;
  state.sampleTime = sampleTime;
  state.charge = next.charge;
  state.time = next.time;
  state.phase = next.phase;
  // #846: a burst with time 0 is the sustained climb while the owner stays attached
  // to the inked wall; only the owner's end sample (or a timed countdown) retires it.
  if (next.phase === 'end' || next.phase === 'burst' && next.time > 0 && sampleAge >= next.time) {
    clearRemoteC1088Surge(actor);
    return true;
  }

  const s3 = actor.s3 || (actor.s3 = {});
  let presentation = s3.c1088SurgePresentation;
  if (!presentation || presentation.tag !== C1088_SURGE_TAG ||
      presentation.life !== next.life || presentation.epoch !== next.epoch) {
    presentation = s3.c1088SurgePresentation = {
      tag: C1088_SURGE_TAG, life: next.life, epoch: next.epoch,
      phase: next.phase, charge: next.charge, time: next.time, sampleAge,
    };
  } else {
    presentation.phase = next.phase;
    presentation.charge = next.charge;
    presentation.time = next.time;
    presentation.sampleAge = sampleAge;
  }
  return true;
}
