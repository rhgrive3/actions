import { getPlatformLifecycle } from './platform-lifecycle.mjs';
const pendingStarts = new WeakMap();
const liveMobile = game => game.input?.mobile;
function owned(game, r) {
  return pendingStarts.get(game) === r && liveMobile(game) === r.mob && !r.mob._destroyed &&
    game.settings?.gyro && r.mob._gyroIntent === r.intent && r.owner.epoch === r.epoch && r.owner.active;
}
function eligible(game, G, r) {
  return owned(game, r) && game.match === r.match && G.mode === 'match' &&
    !!r.match && !r.match.paused && !game.menus?.current && ['intro','countdown','playing'].includes(r.match.state);
}
function retire(game, r) {
  if (pendingStarts.get(game) !== r) return;
  pendingStarts.delete(game);
  if (r.requested && r.mob._gyroIntent === r.intent && !r.mob._destroyed) r.mob.gyro.stop();
}
function activate(game, G, r) {
  if (r.activation) return r.activation;
  if (!r.allowed || !eligible(game, G, r)) { retire(game, r); return Promise.resolve(false); }
  // setGyro reuses the already-granted session; it cannot issue a second prompt.
  const activation = r.mob.setGyro(true, () =>
    liveMobile(game) === r.mob && game.settings?.gyro && game.match === r.match &&
    r.owner.active && r.owner.epoch === r.epoch && G.mode === 'match' && !r.match.paused && !game.menus?.current
  );
  r.intent = r.mob._gyroIntent;
  r.activation = Promise.resolve(activation).finally(() => { if (pendingStarts.get(game) === r) pendingStarts.delete(game); });
  return r.activation;
}
export function prepareGyroStartup(game, G, env = globalThis) {
  const mob = liveMobile(game);
  if (!mob || mob._destroyed || !game.settings?.gyro) return Promise.resolve(false);
  const prior = pendingStarts.get(game); if (prior) retire(game, prior);
  const owner = getPlatformLifecycle(env);
  const r = { mob, owner, epoch: owner.epoch, intent: mob._gyroIntent, requested: mob.gyro.needsPermission,
    armed: false, settled: false, allowed: false, match: null, activation: null };
  pendingStarts.set(game, r);
  // This call happens synchronously on the original START activation stack.
  const request = r.requested ? mob.gyro.request() : Promise.resolve(mob.gyro.supported);
  r.promise = Promise.resolve(request).then(ok => {
    r.settled = true; r.allowed = !!ok;
    if (!owned(game, r)) { retire(game, r); return false; }
    if (r.armed) return activate(game, G, r);
    // Permission-only preparation must not create a resume-time sensor intent.
    if (r.requested) mob.gyro.stop();
    return r.allowed;
  });
  return r.promise;
}
export function startGyroStartup(game, G, env = globalThis) {
  const mob = liveMobile(game);
  if (!mob || mob._destroyed || !game.settings?.gyro) {
    const prior = pendingStarts.get(game); if (prior) retire(game, prior);
    return Promise.resolve(false);
  }
  let r = pendingStarts.get(game);
  if (r && !owned(game, r)) { retire(game, r); return Promise.resolve(false); }
  if (!r) {
    if (mob.gyro.needsPermission) { mob.toast(mob.gyro.statusMessage(), 2.4); return Promise.resolve(false); }
    if (mob.gyro.enabled && mob._gyroWanted) return Promise.resolve(true);
    const owner = getPlatformLifecycle(env);
    r = { mob, owner, epoch: owner.epoch, intent: mob._gyroIntent, requested: false,
      settled: true, allowed: mob.gyro.supported, activation: null };
    pendingStarts.set(game, r);
  }
  if (r.armed && r.match !== game.match) { retire(game, r); return Promise.resolve(false); }
  r.armed = true; r.match = game.match;
  return r.settled ? activate(game, G, r) : r.promise;
}
