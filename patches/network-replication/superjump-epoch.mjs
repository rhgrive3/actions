const validEpoch = value => Number.isSafeInteger(value) && value >= 0;
const finiteAge = value => Number.isFinite(value) ? Math.max(0, value) : 0;

export function endRemoteSuperJumpEpoch(actor) {
  const current = actor._s3RemoteSuperJumpState;
  const knownEpoch = validEpoch(actor._s3SuperJumpEpoch) ? actor._s3SuperJumpEpoch : null;
  const activeEpoch = validEpoch(current?.sjEpoch) ? current.sjEpoch : null;
  const endedEpoch = validEpoch(actor._s3SuperJumpEndedEpoch) ? actor._s3SuperJumpEndedEpoch : null;
  if (knownEpoch !== null || activeEpoch !== null) {
    actor._s3SuperJumpEndedEpoch = Math.max(endedEpoch ?? 0, knownEpoch ?? activeEpoch);
  }
  actor._s3RemoteSuperJumpState = null;
  actor.superJumpState = null;
}

const isDestination = value => !!value?.isVector3
  && Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);

// Apply owner-authored Super Jump presentation state. The optional snapshot
// sidecar is additive; older senders fall back to their existing sjT field.
// `destination` is the owner's committed landing point from this same sample
// (#412), so it is only ever paired with the sender epoch that carried it.
export function applyRemoteSuperJumpEpoch(actor, sample, phase, destination = null) {
  const saved = actor._s3RemoteSuperJumpState;
  const current = saved?.net ? saved : actor.superJumpState?.net ? actor.superJumpState : null;
  const incomingEpoch = validEpoch(sample?.sjEpoch) ? sample.sjEpoch : null;
  const knownEpoch = validEpoch(actor._s3SuperJumpEpoch) ? actor._s3SuperJumpEpoch : null;
  const endedEpoch = validEpoch(actor._s3SuperJumpEndedEpoch) ? actor._s3SuperJumpEndedEpoch : null;

  // A timeline resync or delayed packet may revisit an older sender action.
  // Adoption snapshots are restored earlier in applyRemote, so restore our
  // last accepted network state if the sample would rewind it.
  if (incomingEpoch !== null && (knownEpoch !== null && incomingEpoch < knownEpoch
    || endedEpoch !== null && incomingEpoch <= endedEpoch && phase !== null)) {
    actor.superJumpState = current;
    return current;
  }
  if (incomingEpoch !== null) actor._s3SuperJumpEpoch = incomingEpoch;

  if (phase !== 'charge' && phase !== 'flight') {
    if (incomingEpoch !== null) actor._s3SuperJumpEpoch = incomingEpoch;
    endRemoteSuperJumpEpoch(actor);
    return null;
  }

  const age = finiteAge(sample?.sjT);
  const currentEpoch = validEpoch(current?.sjEpoch) ? current.sjEpoch : null;
  const newAction = !current || !current.net || current.phase !== phase
    || incomingEpoch !== null && currentEpoch !== incomingEpoch;
  // A new action takes only the point its own sample carries (never the previous
  // action's); a continuing action keeps the point it already accepted.
  const to = isDestination(destination) ? destination : !newAction && isDestination(current.to) ? current.to : null;
  if (newAction) {
    const state = { phase, net: true, t: age };
    if (incomingEpoch !== null) state.sjEpoch = incomingEpoch;
    if (to) state.to = to;
    actor.superJumpState = actor._s3RemoteSuperJumpState = state;
    return actor.superJumpState;
  }

  current.t = Math.max(finiteAge(current.t), age);
  if (incomingEpoch !== null) current.sjEpoch = incomingEpoch;
  if (to) current.to = to;
  actor.superJumpState = actor._s3RemoteSuperJumpState = current;
  return actor.superJumpState;
}
