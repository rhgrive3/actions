import { hauntTrackingRecord } from './haunt.mjs';
import { installPrivateTrackingRenderer } from './private-tracking-render.mjs';
const INSTALL = Symbol.for('inkwave.s3.private-tracking.v1');
let world, config, weapons, records = new WeakMap();
const generations = new WeakMap();
let directContext = null, ackContext = null;
const epoch = a => `${a?.netLife ?? 0}:${generations.get(a) || 0}`;
export const thermalInkEquipped = a => !a?.remote && a?.s3?.loadout?.[1]?.main === 'thermalInk';
export function withMainDirectDamage(attacker, victim, run) {
  const previous = directContext; directContext = { attacker, victim };
  try { return run(); } finally { directContext = previous; }
}
export function applyMainDirectHit(system, attacker, victim, amount, weapon, group) {
  return withMainDirectDamage(attacker, victim, () => system.applyHit(attacker, victim, amount, weapon, group));
}
function directMain(attacker, victim, source) {
  const kind = weapons?.[source]?.kind;
  // Blaster/Slosher splash and Roller contact share an ID with direct pellets;
  // only the main projectile solver may explicitly qualify those families.
  return !!kind && (['shooter', 'dualies', 'charger', 'splatling'].includes(kind) ||
    directContext?.attacker === attacker && directContext?.victim === victim);
}
function stamp(owner, victim, now) {
  if (!thermalInkEquipped(owner) || !owner.alive || !victim?.alive || owner === victim ||
      owner.team === victim.team || !Number.isFinite(now) || world?.match?.attract || world?.match?.state && world.match.state !== 'playing') return;
  const map = records.get(owner) || new Map();
  map.set(victim, { until: now + (config?.thermalInk?.duration ?? 16), match: world?.match,
    ownerEpoch: epoch(owner), victimEpoch: epoch(victim), ownerId: owner.owner, victimId: victim.owner });
  records.set(owner, map);
}
export function thermalTrackingRecord(victim, owner, now = world?.time || 0) {
  const map = records.get(owner), r = map?.get(victim);
  const roster = world?.match?.actors;
  if (!r) return null;
  if (!victim?.alive || !owner?.alive || !thermalInkEquipped(owner) || r.match !== world?.match ||
      r.ownerEpoch !== epoch(owner) || r.victimEpoch !== epoch(victim) ||
      r.ownerId !== owner.owner || r.victimId !== victim.owner || r.until <= now + 1e-10 ||
      Array.isArray(roster) && (!roster.includes(owner) || !roster.includes(victim))) {
    map.delete(victim); return null;
  }
  return r;
}
export function trackingFade(victim, owner) {
  // Explicit visual calibration, not a claim about S3's unverified minimum DU.
  const c = config?.trackingVisual || {}, lo = c.nearStart ?? 6, hi = c.nearFull ?? 8;
  const d = victim?.pos?.distanceTo?.(owner?.pos);
  return Number.isFinite(d) && hi > lo ? Math.max(0, Math.min(1, (d - lo) / (hi - lo))) : 0;
}
export function privateTrackingOpacity(victim, owner, now = world?.time || 0) {
  if (!thermalTrackingRecord(victim, owner, now) && !hauntTrackingRecord(victim, owner)) return 0;
  // Swimming in own ink is hidden; wall climbing is explicitly eligible.
  if (victim.submerged && !victim.climbing || victim.anim?.form === 'swim' && !victim.climbing) return 0;
  return trackingFade(victim, owner);
}
export function installThermalTracking(api, tuning) {
  const { Actor, NetMatch, G, on } = api;
  if (!Actor || Object.hasOwn(Actor.prototype, INSTALL)) return;
  Object.defineProperty(Actor.prototype, INSTALL, { value: true });
  world = G; config = tuning.clothingGear; weapons = api.WEAPONS;
  const ensureRenderer = installPrivateTrackingRenderer(api, privateTrackingOpacity);
  const reset = Actor.prototype.reset, update = Actor.prototype.update;
  Actor.prototype.reset = function (...args) {
    records.delete(this); generations.set(this, (generations.get(this) || 0) + 1);
    return reset.apply(this, args);
  };
  Actor.prototype.update = function (...args) { ensureRenderer(); return update.apply(this, args); };
  on('match:state', ({ state }) => {
    ensureRenderer();
    if (state === 'intro' || state === 'finish' || state === 'results') records = new WeakMap();
  });
  for (const name of ['respawn', 'combat:respawn']) on(name, ({ actor }) => {
    if (actor) { records.delete(actor); generations.set(actor, (generations.get(actor) || 0) + 1); }
  });
  on('damage', ({ victim, attacker, amount, source }) => {
    if (amount > 0 && directMain(attacker, victim, source)) stamp(attacker, victim, G.time);
  });
  // A predicted local hit is not accepted HP damage. Capture only local pending
  // request metadata, then consume it inside the existing validated ACK path.
  if (NetMatch?.prototype.sendHit && NetMatch.prototype._hitAck) {
    const send = NetMatch.prototype.sendHit, ack = NetMatch.prototype._hitAck;
    NetMatch.prototype.sendHit = function (attacker, victim, damage, source, ...rest) {
      const qualified = thermalInkEquipped(attacker) && directMain(attacker, victim, source);
      const before = this._hitSeq, result = send.call(this, attacker, victim, damage, source, ...rest);
      const pending = this._hitSeq !== before && this._pendingHits?.get(this._hitSeq);
      if (pending && qualified) pending.privateThermal = { attacker, victim, match: G.match,
        ownerEpoch: epoch(attacker), victimEpoch: epoch(victim), source };
      return result;
    };
    NetMatch.prototype._hitAck = function (receipt, ...args) {
      const previous = ackContext;
      const metadata = this._pendingHits?.get(receipt?.h)?.privateThermal;
      ackContext = metadata && { ...metadata, receiptOwner: args[0] };
      try { return ack.call(this, receipt, ...args); } finally { ackContext = previous; }
    };
    on('combat:confirmed', ({ attacker, victim, damage }) => {
      const r = ackContext;
      if (damage > 0 && r?.attacker === attacker && r.victim === victim && r.match === G.match &&
          r.ownerEpoch === epoch(attacker) && r.victimEpoch === epoch(victim) &&
          r.receiptOwner === victim.owner) stamp(attacker, victim, G.time);
    });
  }
  ensureRenderer();
}
