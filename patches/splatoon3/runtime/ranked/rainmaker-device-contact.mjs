import { validRainmakerShotOrigin, rainmakerShotOwnerMatches } from './rainmaker-shot-origin.mjs';
import { flushNativeDeviceHits } from '../../../network-replication/device-hit-pending.mjs';

// Rainmaker releases belong to the ranked host, outside the ordinary main/sub/
// special birth stream. Bind a host-admitted release to contacts computed by
// the existing receiver projectile and device geometry. Wire hit coordinates
// and damage fields never manufacture a release or a contact.
const events = new WeakMap(), sources = new WeakMap(), tickets = new WeakMap(), states = new WeakMap();
const now = () => performance.now() / 1000;
const life = a => Math.max(a?.netLife || 0, a?.net?.lastLife || 0);
const causes = new Set(['Gachihoko_Bullet', 'Gachihoko_BombCore']);
const MAX_AGE = 4.5, MAX_SHOTS = 128, MAX_CONTACTS = 128;
function live(nm, s) {
  return s && !nm._disposed && nm.s === s.session && nm.match === s.match && nm.cfg?.id === s.id
    && nm.s?.hostId === s.host && nm._rankedAPI?.G.netm === nm && s.match?.state === 'playing';
}
function state(nm) {
  let s = states.get(nm);
  if (!live(nm, s)) {
    s = { session:nm.s, match:nm.match, id:nm.cfg?.id, host:nm.s?.hostId, lastShot:-1, shots:[] };
    states.set(nm, s);
  }
  return s;
}
function current(r) {
  const nm = r.nm, a = r.actor, age = now() - r.receivedAt;
  return live(nm, r.state) && nm.byNid?.get(a.nid) === a && a.net === r.net && a.owner === r.owner
    && life(a) === r.life && nm.s?._members?.has(r.owner) && age >= 0 && age <= MAX_AGE;
}

// Called only at the existing host event boundaries: local rule draining, or
// the validated, sequenced rkevent consumer. The exact event object is sealed;
// a copied or edited JSON event cannot enroll itself at the presentation API.
export function admitRainmakerHostEvents(nm, match, rows, from) {
  if (!nm || nm.match !== match || nm._disposed || nm._rankedAPI?.G.netm !== nm
      || from !== nm.s?.hostId || nm.isHost && from !== nm.myId || !Array.isArray(rows)) return;
  const s = state(nm);
  if (!live(nm, s)) return;
  for (const e of rows) {
    if (e?.kind !== 'rainmaker-shot' || !Number.isSafeInteger(e.id) || e.id < 0 || e.id <= s.lastShot
        || !Number.isFinite(e.at) || !validRainmakerShotOrigin(e.shotOrigin, e)) continue;
    const a = match.actors.find(a => String(a.nid ?? `${a.team}:${a.slot}`) === String(e.actorId ?? e.carrier ?? e.id));
    if (!a || !rainmakerShotOwnerMatches(e.shotOrigin, a) || nm.byNid?.get(a.nid) !== a) continue;
    s.lastShot = e.id;
    events.set(e, { nm, state:s, actor:a, net:a.net, owner:a.owner, life:life(a), id:e.id, at:e.at,
      receivedAt:now(), signature:JSON.stringify(e), contacts:[] });
  }
}
export function beginRainmakerDeviceShot(nm, match, event) {
  const r = events.get(event); events.delete(event);
  if (!r || r.nm !== nm || r.state.match !== match || !current(r) || r.signature !== JSON.stringify(event)) return null;
  const token = Object.freeze({}); tickets.set(token, r);
  const shots = r.state.shots;
  for (let i = shots.length - 1; i >= 0; i--) if (!current(shots[i])) shots.splice(i, 1);
  shots.push(r); if (shots.length > MAX_SHOTS) shots.splice(0, shots.length - MAX_SHOTS);
  return token;
}
export function bindRainmakerDeviceSource(token, source) {
  const r = tickets.get(token);
  if (r && source && current(r)) sources.set(source, r);
  return source;
}
export function rainmakerDeviceIdentity(source) {
  const r = source && sources.get(source);
  return r && current(r) ? { sourceRankedShot:r.id, sourceRankedAt:r.at } : null;
}
export function recordRainmakerDeviceContact(token, target, damage, cause) {
  const r = tickets.get(token);
  if (!r || !current(r) || !r.actor.remote || !target || target.dead || target.ghost || target.owner?.remote
      || target.team === r.actor.team || !Number.isFinite(damage) || !(damage > 0) || !causes.has(cause)) return;
  if (r.contacts.length >= MAX_CONTACTS || r.contacts.some(c => c.target === target && c.cause === cause)) return;
  r.contacts.push({ target, owner:target.owner, ownerLife:life(target.owner), damage, cause, used:false });
  flushNativeDeviceHits(r.nm, r.owner);
}
export function recordRainmakerDeviceBurst(token, system, attack, center, radius, nearRadius, nearDamage, farDamage) {
  if (!token) return;
  const damageAt = distance => distance <= nearRadius ? nearDamage : farDamage;
  for (const target of [...system?._s3SubObjects || [], ...system?._s3AllSpecialObjects || [],
      ...(system?.nativeSprinklerDeviceTargets?.() || [])]) {
    const amount = system.nativeSubDeviceAreaContact?.(attack, target, center, radius, damageAt)
      ?? system.nativeSpecialDeviceAreaContact?.(attack, target, center, radius, damageAt);
    if (amount > 0) recordRainmakerDeviceContact(token, target, amount, 'Gachihoko_BombCore');
  }
}
export function consumeRainmakerDeviceContact(nm, actor, target, damage, cause, payload, receipt) {
  const s = states.get(nm);
  if (!receipt || !payload || !live(nm, s) || !actor.remote || !causes.has(cause)
      || receipt.actor !== actor || receipt.net !== actor.net || receipt.session !== nm.s || receipt.match !== nm.match
      || receipt.from !== actor.owner || receipt.peer !== nm.peers?.get(actor.owner)
      || !Number.isSafeInteger(payload.sourceRankedShot) || !Number.isFinite(payload.sourceRankedAt)) return null;
  for (const r of s.shots) {
    if (r.actor !== actor || !current(r) || r.id !== payload.sourceRankedShot || r.at !== payload.sourceRankedAt) continue;
    const hit = r.contacts.find(c => !c.used && c.target === target && c.owner === target.owner
      && c.ownerLife === life(target.owner) && c.cause === cause && Math.abs(c.damage - damage) <= .011);
    if (!hit) continue;
    hit.used = true;
    return { damage:hit.damage, cause:hit.cause };
  }
  return null;
}
