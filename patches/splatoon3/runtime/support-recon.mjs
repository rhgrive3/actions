// Splatoon 3 Point Sensor and team-scoped Turf Map marks (#710).
// Extracted from the pinned 11.3.0 source, not guessed from another weapon:
// Splatoon3-resources/splat3/data/parameter/1130/weapon/
// WeaponPointSensor.game__GameParameterTable.json
// SHA256 57d0ab596ccdc9cd2e8da079ba4a169fc87aee36aeba079aafd81894d78bac03
// The raw engine distance 6.0 is provisionally mapped to 6 INKWAVE world units;
// player-collision and field durations still require real-console comparison.
export const POINT_SENSOR_SOURCE = Object.freeze({
  areaDistance: Object.freeze([6, 6, 6]),
  markingFrames: Object.freeze([480, 720, 960]),
  spawnSpeedZ: Object.freeze([1.38, 1.64, 1.87]),
  spawnSpeedY: 0.24, spawnSpeedYWorldMin: -0.4,
  inheritedVelocity: Object.freeze({ xRate: 1.6, yPlusRate: 4, yMax: .32 }),
  inkConsume: .45, inkRecoverStopFrames: 75,
});
export const POINT_SENSOR = Object.freeze({
  id: 'pointSensor', inkCost: POINT_SENSOR_SOURCE.inkConsume * 100,
  areaSeconds: 150 / 60, markSeconds: POINT_SENSOR_SOURCE.markingFrames[0] / 60,
  radiusWorld: POINT_SENSOR_SOURCE.areaDistance[0],
  launchSpeedWorld: POINT_SENSOR_SOURCE.spawnSpeedZ[0] * 60,
  maxFlightSeconds: 1.8,
});
export function pointSensorMarkFrames(ap, gearCurve) {
  return typeof gearCurve === 'function'
    ? Math.round(gearCurve(ap || 0, ...POINT_SENSOR_SOURCE.markingFrames))
    : POINT_SENSOR_SOURCE.markingFrames[0];
}
export function pointSensorThrowSpeed(ap, gearCurve) {
  return (typeof gearCurve === 'function'
    ? gearCurve(ap || 0, ...POINT_SENSOR_SOURCE.spawnSpeedZ)
    : POINT_SENSOR_SOURCE.spawnSpeedZ[0]) * 60;
}
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
