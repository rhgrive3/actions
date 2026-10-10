// Splatoon 3 Tacticooler drink model (#835). Nintendo Ver.2.1.0 preserves
// drink Quick Respawn/Special Saver under Respawn Punisher/Haunt.
// S3 11.3.0 extracted source:
// Splatoon3-resources/splat3/data/parameter/1130/weapon/
// WeaponSpEnergyStand.game__GameParameterTable.json
// SHA256 4222305b40620e1d269ce9119299419c4141e496ebf9e0cba069534932306c7d
export const TACTICOOLER_SOURCE = Object.freeze({
  putFrame:900, putFrameOnYagura:450,
  powerUpFrames:Object.freeze([1020,1290,1500]),
  serveAreaRadius:7, serveAreaHeightDown:0, serveAreaHeightUp:3,
  vanishDistance:1.8, specialReduceFrame:600,
  spawnSpeedY:.07, spawnSpeedZ:.4,
});
export const TACTICOOLER = Object.freeze({
  id: 'tacticooler', standSeconds: TACTICOOLER_SOURCE.putFrame / 60,
  drinkSeconds: TACTICOOLER_SOURCE.powerUpFrames[0] / 60,
  radiusWorld: TACTICOOLER_SOURCE.serveAreaRadius,
  specialCost: 190, windupSeconds: 0.35,
  drinkAP: Object.freeze({
    runSpeed: 29, swimSpeed: 29, actionIntensify: 57,
    quickSuperJump: 57, quickRespawn: 57, specialSaver: 57,
    inkResistance: 57,
  }),
});
export function tacticoolerDrinkFrames(ap, gearCurve) {
  return typeof gearCurve === 'function'
    ? Math.round(gearCurve(ap || 0, ...TACTICOOLER_SOURCE.powerUpFrames))
    : TACTICOOLER_SOURCE.powerUpFrames[0];
}
export function drinkEligible(actor, stand, now) {
  if (!actor?.alive || actor.remote || actor.form !== 'kid' ||
      actor.team !== stand?.team || !actor.pos || !stand.pos ||
      !Number.isFinite(now) || !(stand.expires > now) ||
      stand.taken?.has(actor)) return false;
  const p = actor.pos, s = stand.pos;
  const dx=p.x-s.x,dz=p.z-s.z,dy=p.y-s.y;
  // The pinned 11.3.0 serve cylinder extends 0 down and 3 up from the stand.
  // No symmetric below-floor pickup through a stage/deck.
  return Number.isFinite(dx) && Number.isFinite(dy) && Number.isFinite(dz) &&
    dx*dx+dz*dz <= TACTICOOLER.radiusWorld ** 2 &&
    dy >= -TACTICOOLER_SOURCE.serveAreaHeightDown &&
    dy <= TACTICOOLER_SOURCE.serveAreaHeightUp;
}
export function giveDrink(actor, now, seconds = TACTICOOLER.drinkSeconds) {
  if (!actor?.alive || actor.remote || !Number.isFinite(now) ||
      !Number.isFinite(seconds) || seconds <= 0 || seconds > 25) return false;
  actor.s3 ||= {};
  // New drinks may extend a current drink but never stack AP beyond the cap.
  actor.s3.drink = true;
  actor.s3.drinkUntil = Math.max(actor.s3.drinkUntil || 0, now + seconds);
  actor.s3RefreshGear?.();
  return true;
}
export function retireDrink(actor, now, force = false) {
  if (!actor?.s3?.drink || !force && (actor.s3.drinkUntil || 0) > now) return false;
  actor.s3.drink = false;
  actor.s3.drinkUntil = 0;
  actor.s3RefreshGear?.();
  return true;
}
export function drinkGearPoints(points, actor) {
  if (!actor?.s3?.drink) return points;
  const next = { ...points };
  for (const [id, ap] of Object.entries(TACTICOOLER.drinkAP))
    next[id] = Math.max(next[id] || 0, ap);
  return next;
}
