// S3 verification wiki, Ink Storm base gauge lock: 480 frames (GP0).
// Distinct from cloud lifetime and the held-device / throw animation lifetime.
export const STORM_GAUGE_LOCK = 480 / 60;
export function isStormHolding(a) { return a.specialActive?.id === 'storm' && a.specialActive.phase === 'hold'; }
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
  }
  s.subWasDown = down;
}

export function cloudCoversActor(c, a, G, SPECIALS) {
  const p = c.group?.position, radius = SPECIALS.storm.radius;
  if (!p || !(c.t < c.dur - .3) || !a.alive || a.pos.y > p.y) return false;
  const dx = a.pos.x - p.x, dz = a.pos.z - p.z;
  if (dx * dx + dz * dz > radius * radius) return false;
  const body = a.pos.clone(); body.y += 1.2;
  const top = a.pos.clone(); top.y = p.y - .6;
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
