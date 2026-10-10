// Splatoon 3 Tacticooler drink model (#835), prepped as an optional supported
// kit without silently changing any verified weapon's original main/sub/special.
// Nintendo 2.1.0 leaves drink QR/Saver intact under Respawn Punisher/Haunt.
// S3 11.3.0 documented: stand 15s, drink 17s, pickup radius 7 DU.
// Reference: https://splatoonwiki.org/wiki/Tacticooler
export const TACTICOOLER = Object.freeze({
  id: 'tacticooler', standSeconds: 15, drinkSeconds: 17,
  radiusWorld: 7, specialCost: 190, windupSeconds: 0.35,
  drinkAP: Object.freeze({
    runSpeed: 29, swimSpeed: 29, actionIntensify: 57,
    quickSuperJump: 57, quickRespawn: 57, specialSaver: 57,
    inkResistance: 57,
  }),
});
export function drinkEligible(actor, stand, now) {
  if (!actor?.alive || actor.remote || actor.form !== 'kid' ||
      actor.team !== stand?.team || !actor.pos || !stand.pos ||
      !Number.isFinite(now) || !(stand.expires > now) ||
      stand.taken?.has(actor)) return false;
  const p = actor.pos, s = stand.pos;
  const dx=p.x-s.x,dz=p.z-s.z,dy=p.y-s.y;
  // Tacticooler pickup has wide horizontal and close-enough vertical admission.
  return Number.isFinite(dx) && Number.isFinite(dy) && Number.isFinite(dz) &&
    dx*dx+dz*dz <= TACTICOOLER.radiusWorld ** 2 && Math.abs(dy) <= 2.2;
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
