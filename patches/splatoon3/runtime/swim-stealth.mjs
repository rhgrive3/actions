let api, profile;
export function configureSwimStealth(context, tuning) { api = context; profile = tuning; }
export function swimSpeedMultiplier(a) {
  const m = a.s3?.modifiers || {};
  return (m.swimSpeed ?? 1) * (a.s3?.flow?.active ? profile.flow.swimMultiplier : 1) *
    (m.ninjaSquid ? profile.stealth.ninjaSwimMultiplier : 1);
}
export function updateSwimStealth(a) {
  a.s3 ||= {};
  const squid = a.form === 'squid';
  const state = a.s3.swimStealth || (a.s3.swimStealth = { squid: false, since: null });
  if (squid !== state.squid) { state.squid = squid; state.since = squid ? api.G.time : null; }
}
export function sneaking(a) {
  if (!profile || a.form !== 'squid' || !a.submerged || a.climbing) return false;
  const top = profile.player.swimSpeed * swimSpeedMultiplier(a);
  return Math.hypot(a.vel.x, a.vel.z) <= top * profile.stealth.sneakRatio + 1e-10;
}
export function swimTrailVisible(a) {
  if (a.remote && a.s3?.netSwimVisibility) return a.s3.netSwimVisibility.trail;
  return !sneaking(a);
}
export function swimSplashVisible(a) {
  if (a.remote && a.s3?.netSwimVisibility) return a.s3.netSwimVisibility.splash;
  if (sneaking(a)) return false;
  if (!profile || a.form !== 'squid' || !a.submerged || a.climbing || !a.s3?.modifiers?.ninjaSquid) return true;
  const since = a.s3.swimStealth?.since;
  return since == null || api.G.time - since + 1e-10 < profile.stealth.ninjaDelay;
}
