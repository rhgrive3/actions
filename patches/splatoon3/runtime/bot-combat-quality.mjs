// Bot combat quality (owner request 2026-11-05). Bots are an INKWAVE feature
// with no Splatoon 3 counterpart; every value here is an INKWAVE calibration
// checked with scripts/measure-inkwave-bot-combat.mjs (headless logic runs),
// not a retail measurement. The rules mirror how a person uses each weapon:
//
//  - Alert pitch: after seeing an enemy, a painting Bot keeps its aim near the
//    horizon (not on the floor) for a few seconds, so a re-acquired target is
//    not shot at from below its feet while the aim spring climbs back.
//  - Blasters use their blast: a shell past its range bursts in the air at
//    range end, so a Blaster may fire out to range + most of the blast radius.
//    Aiming at the feet (a ground burst) was tried and measured worse against a
//    strafing target (scripts/measure-inkwave-bot-duel.mjs --target strafe:
//    Blaster kills 7 -> 3 of 9, hits per shell .88 -> .64), so it is off
//    (blasterFeetAim) and the body stays the aim point.
//  - No shots into walls: a Bot opens fire only with a line of sight confirmed
//    by its latest perception tick (Sloshers lob over cover and are exempt).
//  - Purposeful strafing: keep one strafe direction for 1-2.2 s and flip it
//    only some of the time, instead of a coin flip every 0.6-1.8 s.
//  - Cover bomb: a target that just broke line of sight within throwing range
//    gets a lobbed bomb at its last seen position instead of nothing.

export const BOT_COMBAT = Object.freeze({
  alertSeconds: 2.5, alertPitch: -0.12,
  blasterFeetAim: false, blasterDirectRange: 2.5, blasterFeetHeight: .1, blasterReachRadiusShare: .7, blasterDefaultRadius: 2.2,
  strafeMin: 1.0, strafeSpan: 1.2, strafeFlip: .35,
  coverBombMin: 4, coverBombMax: 13, coverBombLost: 1.4, coverBombChancePerSecond: .9, coverBombLift: .35,
});
const LOB_FAMILIES = new Set(['slosher']);

export function botNoteSighting(brain, target, now) {
  brain._s3Alert = BOT_COMBAT.alertSeconds;
  brain._s3SeenAt = now;
  const last = brain._s3LastSeen || (brain._s3LastSeen = { x: 0, y: 0, z: 0 });
  last.x = target.pos.x; last.y = target.pos.y; last.z = target.pos.z;
}
export function botTickAlert(brain, dt) { brain._s3Alert = Math.max(0, (brain._s3Alert || 0) - dt); }
export function botAlertPitch(brain, wantPitch) {
  return brain._s3Alert > 0 ? Math.max(wantPitch, BOT_COMBAT.alertPitch) : wantPitch;
}

/**
 * Line of sight confirmed by the latest perception tick (lob families exempt).
 * Native perception sets seeTimer = 1.2 on a sighting and lowers it by 0.2 on
 * every tick without one, so seeTimer > 1 means the last tick saw the target.
 */
export function botClearShot(brain, family) {
  if (LOB_FAMILIES.has(family)) return true;
  return brain.seeTimer > 1 + 1e-9;
}

export function blasterRadius(w) {
  const p = w?.catalogRecord?.parameters?.BlastParam;
  const r = p?.DistanceDamage?.at?.(-1)?.Distance ?? w?.splashRadius;
  return Number.isFinite(r) && r > 0 ? r : BOT_COMBAT.blasterDefaultRadius;
}
/** Blaster feet aim (off by default, see header): the target's feet inside range, else unchanged. */
export function botBlasterAimPoint(family, target, dist, range, out, enabled = BOT_COMBAT.blasterFeetAim) {
  if (!enabled || family !== 'blaster' || !target || !out) return false;
  if (dist <= BOT_COMBAT.blasterDirectRange || dist > range || target.form === 'squid' || target.grounded === false) return false;
  out.y = target.pos.y + BOT_COMBAT.blasterFeetHeight;
  return true;
}
export function botFireReach(family, range, w) {
  if (family === 'blaster') return range + blasterRadius(w) * BOT_COMBAT.blasterReachRadiusShare;
  return range * 1.08;
}

export function botStrafePlan(brain, random = Math.random) {
  brain.strafeT = BOT_COMBAT.strafeMin + random() * BOT_COMBAT.strafeSpan;
  const keep = brain.strafe === 1 || brain.strafe === -1;
  brain.strafe = !keep ? (random() < .5 ? -1 : 1) : random() < BOT_COMBAT.strafeFlip ? -brain.strafe : brain.strafe;
  brain.strafeAmp = .55 + random() * .45;
}

/**
 * Cover bomb: a target lost behind cover moments ago, at throwing distance.
 * Sets brain._bombAim (the existing release path) and returns the extra pitch.
 */
export function botCoverBomb(brain, actor, dist, ink, cost, dt, random = Math.random) {
  if (brain.bombCd > 0 || !actor.grounded || brain.seeTimer > 0 || !brain.target) return 0;
  if (!(brain.lostTimer > 0 && brain.lostTimer < BOT_COMBAT.coverBombLost)) return 0;
  if (dist < BOT_COMBAT.coverBombMin || dist > BOT_COMBAT.coverBombMax || !(ink > cost + 8)) return 0;
  if (random() >= BOT_COMBAT.coverBombChancePerSecond * dt) return 0;
  brain._bombAim = true;
  brain.bombCd = 5 + random() * 5;
  return BOT_COMBAT.coverBombLift;
}
