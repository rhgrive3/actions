// 11.3.0 misc/params.json MoveDownRt_PoisonMist, low/mid/high order.
// This scales the reduction, not the remaining movement speed. The existing
// cloud slowScale is still a calibrated base, not a recovered retail value.
export const MIST_RESISTANCE_CURVE = Object.freeze([1, .75, .5]);
let context;
export function configureToxicMist(api) { context = api; }
export function toxicMistContains(actor, cloud) {
  const G=context?.G;
  if (!G || !actor?.alive || actor.remote || !cloud || cloud.dead || cloud.subId!=='toxicMist' ||
      cloud.phase!=='deployed' || cloud.team===actor.team || (G.time||0)>=cloud.expireAt ||
      !(cloud.spec?.radius>0) || !actor.pos || !cloud.pos) return false;
  const dx=actor.pos.x-cloud.pos.x,dy=actor.pos.y+.7-cloud.pos.y,dz=actor.pos.z-cloud.pos.z;
  return dx*dx+dy*dy+dz*dz<=cloud.spec.radius**2 && (!G.physics?.los || G.physics.los(cloud.pos,actor.pos));
}
export function toxicMistScale(actor) {
  if (!actor?.alive || actor.remote) return 1;
  let base=1;
  // Reuse the bounded live-object list. No lease can outlive a cloud, match
  // clear, departure from its volume, or a death/respawn transition.
  for (const cloud of context?.G.projectiles?._s3SubObjects || []) {
    if (toxicMistContains(actor,cloud)) base=Math.min(base,cloud.spec.slowScale);
  }
  const rate=actor.s3?.modifiers?.subMistResistance;
  return 1-(1-base)*(Number.isFinite(rate)?Math.max(.5,Math.min(1,rate)):1);
}
