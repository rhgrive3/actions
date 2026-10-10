// Splatoon 3 Point Sensor and team-scoped Turf Map marks (#710).
// S3 11.3.0: ink 45%, active field 150F, base mark 480F.
// Source: https://wikiwiki.jp/splatoon3mix/ブキ/サブウェポン/ポイントセンサー
// The scene's metric-to-S3 lobby-line conversion remains uncalibrated. Radius
// is therefore an explicit INKWAVE playable calibration, not an asserted 1:1 DU.
export const POINT_SENSOR = Object.freeze({
  id: 'pointSensor', inkCost: 45, areaSeconds: 150 / 60,
  markSeconds: 480 / 60, radiusWorld: 1.2,
  launchSpeedWorld: 13.5, maxFlightSeconds: 1.8,
});
const finite = value => Number.isFinite(value);
export function pointSensorMark(victim, team, now, seconds = POINT_SENSOR.markSeconds) {
  if (!victim?.alive || !Number.isInteger(team) || team < 0 || team > 1 ||
      victim.team === team || !finite(now) || !finite(seconds) ||
      seconds <= 0 || seconds > 16) return false;
  victim.s3 ||= {};
  const marks = victim.s3.revealedUntil ||= {};
  const before = marks[team];
  const until = now + seconds;
  if (!finite(until) || (finite(before) && before >= until)) return false;
  marks[team] = until;
  return true;
}
export function pointSensorContact(target, center, radius = POINT_SENSOR.radiusWorld) {
  if (!target?.alive || !target?.pos || !center || !finite(radius) || radius <= 0) return false;
  const p = target.pos, dx = p.x - center.x, dy = p.y + 0.7 - center.y, dz = p.z - center.z;
  return finite(dx) && finite(dy) && finite(dz) &&
    dx * dx + dy * dy + dz * dz <= radius * radius + 1e-8;
}
export function clearPointSensorMarks(actor) {
  if (actor?.s3) delete actor.s3.revealedUntil;
}
export function validPointSensorPacket(row) {
  return Array.isArray(row) && row.length >= 5 &&
    Number.isSafeInteger(row[0]) && row[0] >= 0 &&
    Number.isSafeInteger(row[1]) && row[1] > 0 &&
    row.slice(2).every(finite);
}
