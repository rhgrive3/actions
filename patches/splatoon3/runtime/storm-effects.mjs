// S3 verification wiki, Ink Storm base gauge lock: 480 frames (GP0).
// Distinct from cloud lifetime and the held-device / throw animation lifetime.
export const STORM_GAUGE_LOCK = 480 / 60;
export function isStormHolding(a) { return a.specialActive?.id === 'storm' && a.specialActive.phase === 'hold'; }
// The spent special is displayed from its existing actor-owned lock clock;
// it must never become reusable charge or a second independently ticking gauge.
export function stormGaugeFraction(a) {
  if (a.remote) return null;
  if (isStormHolding(a)) return 1;
  const remaining = a.stormGaugeLock;
  if (!Number.isFinite(remaining) || remaining <= 0) return null;
  const total = a.stormGaugeDuration;
  return Math.min(1, remaining / (Number.isFinite(total) && total > 0 ? total : STORM_GAUGE_LOCK));
}
export function advanceStormLock(a, dt) {
  const remaining = (a.stormGaugeLock || 0) - dt;
  a.stormGaugeLock = remaining <= 1e-10 ? 0 : remaining;
}
export function startStormHold(a) {
  a.specialActive = { id: 'storm', t: 0, phase: 'hold', armor: false, subWasDown: !!a.intent.sub, subArmed: false };
  a.fireBuffer = 0; a.weaponRunner.reset();
}
export function cancelStormPendingInput(a) {
  if (!isStormHolding(a)) return;
  a.specialActive.subWasDown = false; a.specialActive.subArmed = false;
}
export function updateStormHold(a, dt, G) {
  if (!isStormHolding(a)) return;
  const s = a.specialActive;
  if (!a.alive || !G.match?.playing()) { a.specialActive = null; return; }
  s.t += dt;
  const down = !!a.intent.sub;
  if (down && !s.subWasDown) s.subArmed = true;
  if (!down && s.subWasDown && s.subArmed) {
    // Use the game's explicit sub press/release command. No device is spawned
    // on special activation or by a stale sub release. The exact 13F S3 throw
    // startup origin remains unverified; do not invent a new timing constant.
    s.phase = 'throw'; s.t = 0;
    a.form = 'kid'; a._setClimb(false);
    a.stormGaugeLock = STORM_GAUGE_LOCK;
    a.character.trigger('throw');
    G.projectiles.throwStorm(a);
    // Capture after the real throw, whose Special Power wrapper can extend the
    // lock. Actor.reset clears the power snapshot but retains this used gauge.
    a.stormGaugeDuration = a.stormGaugeLock;
  }
  s.subWasDown = down;
}

// Shared INKWAVE rain geometry, copied from the existing native cloud update.
// These growth/fade and world-distance values are not Nintendo calibrations.
export const STORM_RAIN_REACH = 12;
export function stormRainScale(c) {
  const grow = Math.min(1, Math.max(0, c.t / 0.5));
  const fade = Math.min(1, Math.max(0, (c.dur - c.t) / 0.6));
  return (0.3 + 0.7 * (1 - Math.pow(1 - grow, 3))) * (0.2 + 0.8 * fade);
}
export function stormRainContains(c, a, baseRadius, scale = stormRainScale(c)) {
  const p = c.group?.position, point = a?.pos;
  if (!p || !point || !a.alive || !Number.isFinite(c.t) || !Number.isFinite(c.dur) ||
      !Number.isFinite(baseRadius) || baseRadius < 0 || point.y > p.y ||
      point.y + 1.2 < p.y - 0.8 - STORM_RAIN_REACH) return false;
  const radius = baseRadius * scale;
  const dx = point.x - p.x, dz = point.z - p.z;
  return dx * dx + dz * dz <= radius * radius;
}
export function cloudCoversActor(c, a, G, SPECIALS) {
  // An expired record is never a recovery source; the projectile owner removes
  // it after its final damage/paint tick. Do not retain the old 0.3s early cutoff.
  if (!(c.t < c.dur) || !stormRainContains(c, a, SPECIALS.storm.radius)) return false;
  const body = a.pos.clone(); body.y += 1.2;
  const top = a.pos.clone(); top.y = c.group.position.y - .6;
  return !!G.physics.los(body, top);
}
export function stormRecoveryState(a, { G, SPECIALS }) {
  let ally = false, enemy = false;
  for (const c of G.projectiles?.clouds || []) if (cloudCoversActor(c, a, G, SPECIALS)) {
    if (c.team === a.team) ally = true; else enemy = true;
  }
  return { ally, enemy };
}
function ownerKey(owner) {
  // Network nid is unique; offline team+slot is unique. The selected owner is
  // stable when the cloud array is reordered. Other overlapping clouds still
  // paint but do not independently gain damage/assist credit for this tick.
  return Number.isFinite(owner.nid) ? owner.nid : (owner.team || 0) * 16 + (owner.slot || 0);
}
export function collectStormHit(hits, victim, cloud, amount) {
  const previous = hits.get(victim);
  if (!previous || ownerKey(cloud.owner) < ownerKey(previous.owner)) hits.set(victim, { owner: cloud.owner, amount });
}
export function applyStormHits(hits, emit) {
  for (const [victim, hit] of hits) {
    const killed = victim.damage(hit.amount, hit.owner, 'storm');
    if (killed) emit('hit', { attacker: hit.owner, victim, damage: 0, killed: true, weaponId: 'storm' });
  }
}
