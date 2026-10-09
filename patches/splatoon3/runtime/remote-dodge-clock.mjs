const EPS = 1e-9;

function identity(actor, life, tp) {
  return { owner: actor.owner, life, tp };
}

function sameIdentity(a, b) {
  return !!a && !!b && a.owner === b.owner && a.life === b.life && a.tp === b.tp;
}

function newestCounter(...values) {
  return values.reduce((latest, value) => Number.isSafeInteger(value) && value >= 0 ? Math.max(latest, value) : latest, -1);
}

function actionWatermark(actor, key) {
  const net = actor.net || (actor.net = {});
  let mark = net.remoteDodgeWatermark;
  if (!sameIdentity(mark, key)) {
    mark = { ...key, token: 0, epoch: -Infinity };
    net.remoteDodgeWatermark = mark;
  }
  return mark;
}

function candidate(actor, owner, epoch, meta, source, playbackTime) {
  const life = meta?.life, tp = meta?.tp, token = meta?.token;
  const duration = meta?.dur;
  const startupDur = meta?.startupDur;
  const lockDur = meta?.lockDur;
  if (!actor?.remote || actor.owner !== owner || actor.weapon?.kind !== 'dualies' || !actor.alive
    || !Number.isFinite(epoch) || !Number.isSafeInteger(life) || life < 0
    || !Number.isSafeInteger(tp) || tp < 0 || !Number.isSafeInteger(token) || token < 1
    || !Number.isFinite(meta?.start) || Math.abs(meta.start - epoch) > EPS
    || !Number.isFinite(duration) || duration <= 0
    || !Number.isFinite(startupDur) || startupDur < 0
    || !Number.isFinite(lockDur) || lockDur < 0) return null;

  const latest = actor.net?.buf?.at(-1);
  const knownLife = newestCounter(actor.net?.remoteDodgeLife, actor.net?.lastLife, latest?.life);
  const knownTp = newestCounter(actor.net?.remoteDodgeTp, latest?.tp, actor.net?.tp, actor.netTp);
  if (knownLife >= 0 && knownLife !== life) return null;
  if (knownTp >= 0 && knownTp !== tp) return null;
  if (Number.isFinite(actor.weapon.rollTime) && Math.abs(duration - actor.weapon.rollTime) > 0.0011) return null;

  const key = identity(actor, life, tp), mark = actionWatermark(actor, key);
  if (epoch < mark.epoch - EPS || token < mark.token) return null;
  if (epoch <= mark.epoch + EPS || token <= mark.token) return null;

  const end = epoch + startupDur + duration;
  const expires = end + lockDur;
  const now = Number.isFinite(playbackTime) ? playbackTime : epoch;
  if (now < epoch - EPS || now >= expires - EPS) return null;

  const direction = Array.isArray(meta?.dir) && meta.dir.length >= 2
    && Number.isFinite(meta.dir[0]) && Number.isFinite(meta.dir[1])
    ? { x: meta.dir[0], z: meta.dir[1] }
    : Number.isFinite(meta?.x) && Number.isFinite(meta?.z) ? { x: meta.x, z: meta.z } : null;
  return { ...key, token, epoch, duration, startupDur, lockDur, end, expires,
    direction, directionSpace: source === 'snapshot' ? 'world' : 'root', source,
    playbackTime: now };
}

function publish(actor, next) {
  if (!next) return false;
  const mark = actionWatermark(actor, next);
  if (next.epoch < mark.epoch - EPS || next.token < mark.token
    || next.epoch <= mark.epoch + EPS || next.token <= mark.token) return false;
  mark.epoch = next.epoch;
  mark.token = next.token;
  actor.remoteDodgeClock = next;
  return true;
}

export function acceptRemoteDodgeClock(actor, owner, eventTime, data, playbackTime) {
  const next = candidate(actor, owner, eventTime, data, 'event', playbackTime);
  return publish(actor, next);
}

export function interruptRemoteDodgeClock(actor, owner, eventTime) {
  const clock = actor?.remoteDodgeClock;
  if (!clock || clock.owner !== owner || !Number.isFinite(eventTime) || eventTime < clock.epoch - EPS) return false;
  delete actor.remoteDodgeClock;
  return true;
}

export function clearRemoteDodgeClock(actor, resetWatermark = false) {
  if (!actor) return;
  delete actor.remoteDodgeClock;
  if (resetWatermark && actor.net) delete actor.net.remoteDodgeWatermark;
}

export function syncRemoteDodgeClock(actor, playbackTime, sample, hasDodge, interrupted) {
  if (!actor?.remote) { clearRemoteDodgeClock(actor, true); return null; }
  const now = Number.isFinite(playbackTime) ? playbackTime : sample?.t;
  let clock = actor.remoteDodgeClock;
  if (clock) {
    const currentSample = Number.isFinite(sample?.stateAt) && sample.stateAt >= clock.epoch - EPS;
    if (actor.owner !== clock.owner || actor.weapon?.kind !== 'dualies' || !actor.alive
      || currentSample && (sample.life !== clock.life || sample.tp !== clock.tp || interrupted)) {
      clearRemoteDodgeClock(actor);
      clock = null;
    } else if (currentSample && !hasDodge && sample.stateAt < clock.end - EPS && now < clock.end - EPS) {
      // A post-start owner sample with the dodge flag cleared before its known
      // end represents cancellation. A pre-start sample is allowed to stay coarse.
      clearRemoteDodgeClock(actor);
      clock = null;
    }
  }

  const sidecar = sample?.roll;
  if (hasDodge && sidecar && Number.isFinite(sidecar.start)
    && Number.isFinite(sample?.stateAt) && sample.stateAt >= sidecar.start - EPS) {
    const next = candidate(actor, actor.owner, sidecar.start, sidecar, 'snapshot', now);
    if (next && (!clock || next.owner !== clock.owner || next.life !== clock.life || next.tp !== clock.tp
      || next.token > clock.token && next.epoch > clock.epoch + EPS)) {
      if (publish(actor, next)) clock = actor.remoteDodgeClock;
    } else if (clock && sidecar.token === clock.token && sidecar.start === clock.epoch) {
      clock.playbackTime = now;
    }
  }

  clock = actor.remoteDodgeClock;
  if (!clock) return null;
  clock.playbackTime = now;
  if (now >= clock.expires - EPS) {
    clearRemoteDodgeClock(actor);
    return null;
  }
  return clock;
}

export function remoteDodgePresentation(actor) {
  const clock = actor?.remoteDodgeClock;
  if (!clock || !Number.isFinite(clock.playbackTime)) return null;
  const age = Math.max(0, clock.playbackTime - clock.epoch);
  if (age < clock.startupDur) return { clock, phase: 'startup', progress: 0, duration: clock.duration };
  if (age < clock.end) return { clock, phase: 'roll',
    progress: Math.max(0, Math.min(1, (age - clock.startupDur) / clock.duration)), duration: clock.duration };
  if (age < clock.expires) return { clock, phase: 'plant', progress: 1, duration: clock.duration };
  return null;
}
