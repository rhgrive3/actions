const ROLLER_PRESENTATION_TAG = 'inkwave.roller-presentation.v1';

function nonnegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function bounded(value, min, max) {
  return Number.isFinite(value) && value >= min && value <= max;
}

export function packRollerPresentation(actor, match, simulationTick) {
  if (!actor || !Number.isSafeInteger(actor.nid)) return null;
  const tracks = match._rollerPresentationTracks || (match._rollerPresentationTracks = new Map());
  const tick = nonnegativeInteger(simulationTick) ? simulationTick : 0;
  const life = nonnegativeInteger(actor.stats?.deaths) ? actor.stats.deaths : 0;
  const runner = actor.weaponRunner;
  const attack = actor.weapon?.kind === 'roller' ? runner?.s3RollerAttack : null;
  let track = tracks.get(actor.nid);

  if (track && life !== track.life) {
    track = { life, epoch: Math.max(tick, track.epoch + 1), attack: null,
      suppressed: attack || track.attack || track.suppressed || null };
  } else if (!track && attack) {
    track = { life, epoch: Math.max(1, tick), attack, suppressed: null };
  }

  if (!track) return null;
  if (actor.alive === false) {
    track.suppressed = attack || track.attack || track.suppressed || null;
    track.attack = null;
  } else if (track.suppressed && attack && attack !== track.suppressed) track.suppressed = null;
  if (attack && !track.suppressed && attack !== track.attack) {
    track = { life, epoch: Math.max(tick, track.epoch + 1), attack, suppressed: null };
  } else if (!attack) track.attack = null;
  tracks.set(actor.nid, track);

  const active = !!attack && attack === track.attack && !track.suppressed && actor.alive !== false;
  const elapsed = active && bounded(attack.elapsed, 0, 5) ? attack.elapsed : 0;
  const windup = active && bounded(attack.windup, 0.001, 2) ? attack.windup : 0;
  const interval = active && bounded(attack.interval, 0.001, 5) ? attack.interval : 0;
  if (active && (!windup || interval < windup || elapsed > interval + 0.5
      || typeof attack.vertical !== 'boolean')) return null;
  return [ROLLER_PRESENTATION_TAG, life, track.epoch, active ? 1 : 0,
    active && attack.vertical ? 1 : 0, elapsed, windup, interval,
    active && attack.released ? 1 : 0, active && attack.rolling ? 1 : 0, tick];
}

export function readRollerPresentation(value) {
  if (!Array.isArray(value) || value.length !== 11 || value[0] !== ROLLER_PRESENTATION_TAG
      || !nonnegativeInteger(value[1]) || !nonnegativeInteger(value[2])
      || (value[3] !== 0 && value[3] !== 1) || (value[4] !== 0 && value[4] !== 1)
      || !bounded(value[5], 0, 5) || !bounded(value[6], 0, 2)
      || !bounded(value[7], 0, 5) || (value[8] !== 0 && value[8] !== 1)
      || (value[9] !== 0 && value[9] !== 1) || !nonnegativeInteger(value[10])) return null;
  const active = value[3] === 1;
  if (active && (value[6] <= 0 || value[7] < value[6] || value[5] > value[7] + 0.5)) return null;
  return { life: value[1], epoch: value[2], active, vertical: value[4] === 1,
    elapsed: value[5], windup: value[6], interval: value[7], released: value[8] === 1,
    rolling: value[9] === 1, tick: value[10] };
}

function clearRemoteRollerPose(actor) {
  if (actor.character) actor.character.s3RollerFlick = null;
  const runner = actor.weaponRunner;
  if (runner?.s3RollerAttack?.networkRemote) runner.s3RollerAttack = null;
  if (runner) runner.s3FlickVertical = false;
}

export function applyRemoteRollerPresentation(actor, presentation, dt, snapshotAlive = true) {
  if (!actor?.remote || !actor.character) return false;
  const net = actor.net || (actor.net = {});
  let previous = net._rollerPresentationState;
  const owner = actor.owner ?? null;
  const ownerChanged = previous && owner !== previous.owner;
  if (ownerChanged) {
    clearRemoteRollerPose(actor);
    net._rollerPresentationState = { owner, life: -1, epoch: -1, tick: -1, active: false };
    previous = net._rollerPresentationState;
  }
  if (!presentation) {
    clearRemoteRollerPose(actor);
    if (!previous) net._rollerPresentationState = { owner, life: -1, epoch: -1, tick: -1, active: false };
    else net._rollerPresentationState = { ...previous, owner, active: false };
    return true;
  }
  if (presentation.owner !== owner) {
    clearRemoteRollerPose(actor);
    return false;
  }
  if (previous && presentation.life < previous.life) return false;
  if (previous && (presentation.epoch < previous.epoch || presentation.tick < previous.tick)) return false;
  if (previous && previous.owner === owner && presentation.life === previous.life
      && presentation.active && !previous.active && presentation.epoch <= previous.epoch) return false;

  const character = actor.character;
  const old = character.s3RollerFlick;
  const sameAction = previous?.owner === owner && previous.active && old?.networkRemote === true
    && old.owner === owner && old.epoch === presentation.epoch && old.life === presentation.life;
  net._rollerPresentationState = { owner: presentation.owner, life: presentation.life,
    epoch: presentation.epoch, tick: presentation.tick, active: presentation.active };

  const runner = actor.weaponRunner;
  if (!snapshotAlive || !actor.alive || !presentation.active || actor.weapon?.kind !== 'roller') {
    clearRemoteRollerPose(actor);
    net._rollerPresentationState.active = false;
    return true;
  }

  const elapsed = sameAction
    ? Math.min(presentation.interval, Math.max(presentation.elapsed,
      old.elapsed + (Number.isFinite(dt) ? Math.max(0, dt) : 0)))
    : presentation.elapsed;
  const pose = sameAction ? old : { networkRemote: true };
  Object.assign(pose, { networkRemote: true, owner: presentation.owner, life: presentation.life,
    epoch: presentation.epoch, vertical: presentation.vertical, windup: presentation.windup,
    interval: presentation.interval, elapsed, released: presentation.released, rolling: presentation.rolling });
  character.s3RollerFlick = pose;
  // NetMatch pose metadata never becomes a simulated WeaponRunner action.
  if (runner?.s3RollerAttack?.networkRemote) runner.s3RollerAttack = null;
  if (runner) runner.s3FlickVertical = false;
  return true;
}

export function clearRemoteRollerPresentation(actor) {
  if (!actor?.remote || !actor.character) return false;
  clearRemoteRollerPose(actor);
  const net = actor.net || (actor.net = {});
  const previous = net._rollerPresentationState;
  const owner = actor.owner ?? null;
  net._rollerPresentationState = previous && previous.owner === owner
    ? { ...previous, active: false }
    : { owner, life: -1, epoch: -1, tick: -1, active: false };
  return true;
}
