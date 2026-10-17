// S3 verification wiki, Ink Storm base gauge lock: 480 frames (GP0).
// Distinct from cloud lifetime and the held-device / throw animation lifetime.
export const STORM_GAUGE_LOCK = 480 / 60;
export function isStormHolding(a) { return a.specialActive?.id === 'storm' && a.specialActive.phase === 'hold'; }
// Display projection of the spent special (#469). The gauge is full while the
// device is held, then follows the existing actor-owned lock clock. It is never
// reusable charge: specialFrac, specialReady and the native charge stay unchanged.
// Remote actors have no replicated post-use clock, so they keep the old value.
export function stormGaugeFraction(a) {
  if (a.remote) return null;
  if (isStormHolding(a) && preOperationGaugeState(a)) return 1;
  const remaining = a.stormGaugeLock;
  if (!Number.isFinite(remaining) || remaining <= 0) return null;
  const total = a.stormGaugeDuration;
  return Math.min(1, remaining / (Number.isFinite(total) && total > 0 ? total : STORM_GAUGE_LOCK));
}
// Wiki special-gauge rules: deployed locks keep their spent gauge depleting
// after the actor animation and after death. This projection grants no points
// and does not alter specialFrac, specialReady or remote snapshots.
export function specialGaugeFraction(a) {
  return stormGaugeFraction(a) ?? deployedGaugeFraction(a) ?? activeGaugeFraction(a);
}
// Wiki's general rule is constant automatic depletion, ending immediately on a
// normal early finish. Read the real action clock rather than starting another
// timer in HUD code. Zipcaster is the documented exception: its special ink
// reserve IS the displayed gauge. Crab and native Trizooka/Wail stay untouched.
function activeGaugeFraction(a) {
  if(a.remote||a.alive===false)return null;
  const active=a.specialActive;
  if(active?.id==='inkVac'&&Number.isFinite(active.gaugeFraction))return Math.min(1,Math.max(0,active.gaugeFraction));
  const state=activeSpecialGaugeState(a)?.state;
  if(!active||state?.id!==active.id)return null;
  if(!['inkjet','booyahBomb','ultraStamp','tripleInkstrike','krakenRoyale','zipcaster'].includes(state.id))return null;
  return activeSpecialDepletionFraction(state);
}
export function advanceStormLock(a, dt) {
  const remaining = (a.stormGaugeLock || 0) - dt;
  a.stormGaugeLock = remaining <= 1e-10 ? 0 : remaining;
}
// The canister's release is not cloud operation. Start only when the native
// _spawnCloud has created the authoritative cloud, including after owner death.
export function startStormCloudGauge(a, cloud, game) {
  if(a?.s3PreOperationGauge?.id==='storm')clearPreOperationGauge(a);
  if (!a || a.remote || !Number.isFinite(cloud?.dur) || !(cloud.dur>0) || rainmakerGaugeException(a,game)) return;
  a.special=0;
  a.stormGaugeLock=cloud.dur;a.stormGaugeDuration=cloud.dur;
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
    a.character.trigger('throw');
    G.projectiles.throwStorm(a);
  }
  s.subWasDown = down;
}

// INKWAVE's existing native rain trace reach (the raycast length in weapons.js).
// It is an internal consistency bound, not a verified Splatoon 3 cutoff.
export const STORM_RAIN_REACH = 12;
// Growth/fade envelope copied from the native cloud update. These values are
// INKWAVE's existing rain shape, not Nintendo calibrations.
export function stormRainScale(c) {
  const grow = Math.min(1, Math.max(0, c.t / 0.5));
  const fade = Math.min(1, Math.max(0, (c.dur - c.t) / 0.6));
  return (0.3 + 0.7 * (1 - Math.pow(1 - grow, 3))) * (0.2 + 0.8 * fade);
}
// Shared spatial test for rain contact and allied recovery: horizontal area at
// the cloud's current scale, no contact above the cloud, and no contact below
// the finite rain trace. Line-of-sight is checked by the caller.
export function stormRainContains(c, a, baseRadius, scale = stormRainScale(c)) {
  const p = c.group?.position, point = a?.pos;
  if (!p || !point || !a.alive || !Number.isFinite(c.t) || !Number.isFinite(c.dur) ||
      !Number.isFinite(baseRadius) || baseRadius < 0 || point.y > p.y ||
      point.y + 1.2 < p.y - 0.8 - STORM_RAIN_REACH) return false;
  const radius = baseRadius * scale;
  const dx = point.x - p.x, dz = point.z - p.z;
  return dx * dx + dz * dz <= radius * radius;
}
// Deployed-device point contact for the continuous cloud damage tick. Match
// the actor cylinder's horizontal growth/fade radius and finite vertical trace;
// unlike stormRainContains this accepts world objects without an `alive` flag.
export function stormRainObjectContains(c, object, baseRadius, scale = stormRainScale(c)) {
  const p = c.group?.position, point = object?.pos;
  if (!p || !point || ![p.x,p.y,p.z,point.x,point.y,point.z,baseRadius,scale].every(Number.isFinite) ||
      baseRadius < 0 || point.y > p.y || point.y + 1.2 < p.y - 0.8 - STORM_RAIN_REACH) return false;
  const radius = baseRadius * scale;
  const dx = point.x - p.x, dz = point.z - p.z;
  return dx * dx + dz * dz <= radius * radius;
}
// Recovery follows the same live rain area as native contact until expiry. The
// native damage loop keeps its separate dur-0.3 window (#563 scope).
export function cloudCoversActor(c, a, G, SPECIALS) {
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
import { rainmakerGaugeException, deployedGaugeFraction, clearPreOperationGauge, preOperationGaugeState } from './tacticooler-gauge.mjs';
import { activeSpecialGaugeState, activeSpecialDepletionFraction } from './active-special-gauge.mjs';
