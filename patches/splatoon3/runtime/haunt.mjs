// #351 Haunt (DeathMarking): private per-owner tracking plus the verified
// Respawn Punisher-style finish penalty.  Online state is proven by the Haunt
// owner's event stream and bound to both actors' owner/life identities; the
// victim owner remains authoritative for the actual death penalty.
import { tacticoolerDrinkActive } from './clothing-gear.mjs';
const INSTALL = Symbol.for('inkwave.s3.haunt.v1');
let G, cfg, tuningRef, curve, marks = new WeakMap();
const generation = new WeakMap(), reviving = new WeakSet();
export const HAUNT_FORWARD = Object.freeze(['haunt:mark', 'haunt:arm']);
const isNetworkLife = n => Number.isSafeInteger(n) && n >= 0;
const renderedLife = a => isNetworkLife(a?.netLife) ? a.netLife : null;
const networkLife = a => {
  // Owner ticks authenticate this epoch before event replay; Actor.netLife is
  // only updated later by applyRemote, and even cur.life can still be older.
  const accepted = a?.remote ? a.net?.lastLife : null;
  return isNetworkLife(accepted) ? accepted : renderedLife(a);
};
const recordEpoch = r => r?.ownerLife?.startsWith('net:') ? Number(r.ownerLife.slice(4)) : null;
const life = a => networkLife(a) === null ? `local:${generation.get(a) || 0}` : `net:${networkLife(a)}`;
const wireLife = a => networkLife(a);
const environment = cause => ['water','fall','out','bounds','void','drown','outOfBounds','oob'].includes(cause);
export const hauntEquipped = a => !a?.remote && a?.s3?.loadout?.[1]?.main === 'haunt';

function validRecord(target, owner) {
  const map = marks.get(owner), r = map?.get(target);
  if (!r) return null;
  const roster = G?.match?.actors;
  const ownerAuthorized = r.proven === true || hauntEquipped(owner);
  if (!target?.alive || !ownerAuthorized || r.match !== G?.match ||
      r.owner !== owner.owner || r.targetOwner !== target.owner ||
      r.targetLife !== life(target) ||
      Array.isArray(roster) && (!roster.includes(owner) || !roster.includes(target))) {
    map.delete(target); return null;
  }
  if (r.ownerLife !== life(owner)) {
    // A newer accepted owner life may precede its queued arm. Do not expose
    // the old penalty, but preserve the proven mark for that arm to refresh.
    const epoch = recordEpoch(r);
    if (!(owner.remote && r.proven && isNetworkLife(epoch) && epoch < networkLife(owner))) map.delete(target);
    return null;
  }
  return r;
}
function putRecord(owner, target, { armed = false, proven = false, ownerLife = life(owner), targetLife = life(target) } = {}) {
  const map = marks.get(owner) || new Map();
  const record = { match: G?.match, owner: owner.owner, targetOwner: target.owner,
    ownerLife, targetLife, armed: !!armed, proven: !!proven };
  map.set(target, record); marks.set(owner, map); return record;
}
function armOwner(owner, emit) {
  if (!owner?.alive || G?.netm && owner.remote) return;
  for (const [target, r] of marks.get(owner)?.entries() || []) {
    // Target death/owner reuse between our death and respawn invalidates the mark.
    if (!target?.alive || r.targetOwner !== target.owner || r.targetLife !== life(target)) continue;
    r.ownerLife = life(owner); r.armed = true;
    emitState(emit, 'haunt:arm', owner, target);
  }
}
function emitState(emit, name, owner, target) {
  if (!G?.netm || owner?.remote) return;
  const ol = wireLife(owner), tl = wireLife(target);
  if (ol === null || tl === null || owner?.nid === undefined || target?.nid === undefined) return;
  emit(name, { actor: owner, target, ownerOwner: owner.owner, targetOwner: target.owner,
    ownerLife: ol, targetLife: tl });
}
function acceptRemoteState(name, e, from, netmatch) {
  if (!HAUNT_FORWARD.includes(name)) return false;
  const owner = e?.actor, target = e?.target;
  // Consume malformed Haunt messages rather than falling through to the generic
  // event bus. The sender may only speak for its own remote actor.
  if (!owner || !target || !owner.remote || owner.owner !== from || owner === target || owner.team === target.team ||
      netmatch?.byNid?.get(owner.nid) !== owner || netmatch?.byNid?.get(target.nid) !== target ||
      e.ownerOwner !== owner.owner || e.targetOwner !== target.owner ||
      !Number.isSafeInteger(e.ownerLife) || e.ownerLife < 0 || !Number.isSafeInteger(e.targetLife) || e.targetLife < 0 ||
      e.targetLife !== (networkLife(target) ?? 0)) return true;
  const accepted = networkLife(owner) ?? 0;
  // A replay backlog may span multiple deaths/respawns. Its historical marks
  // are valid within the rendered-to-accepted interval; only the latest life
  // can arm a penalty. The ordered owner event stream supplies the chronology.
  if (name === 'haunt:mark'
    ? e.ownerLife < (renderedLife(owner) ?? 0) || e.ownerLife > accepted
    : e.ownerLife !== accepted) return true;
  const record = marks.get(owner)?.get(target);
  if (recordEpoch(record) > e.ownerLife) return true;
  if (name === 'haunt:mark') {
    putRecord(owner, target, { armed: false, proven: true,
      ownerLife: `net:${e.ownerLife}`, targetLife: `net:${e.targetLife}` });
    return true;
  }
  if (!record || record.match !== G?.match || record.owner !== owner.owner || record.targetOwner !== target.owner ||
      record.targetLife !== `net:${e.targetLife}`) return true;
  record.ownerLife = `net:${e.ownerLife}`; record.armed = true; record.proven = true;
  return true;
}

export function hauntTrackingRecord(target, owner) {
  const r = validRecord(target, owner);
  // The private silhouette is useful only to a living owner. The ledger itself
  // survives death so the same marked target can be armed on that owner's respawn.
  return owner?.alive && r?.armed ? r : null;
}
export function hauntBasicPenalty(victim, attacker, cause = 'weapon') {
  const record = validRecord(victim, attacker);
  if (!victim?.alive || attacker === victim || attacker?.team === victim.team || environment(cause) || !record?.armed) return null;
  // Online, a remote attacker must have a mark proven by that actor's owner
  // stream. Local/offline records originate from the equipped Actor.splat path.
  if (G?.netm && attacker.remote && !record.proven) return null;
  const ap = victim.s3?.abilityPoints || {};
  const cooler = tacticoolerDrinkActive(victim);
  const selfPunisher = victim.s3?.loadout?.[1]?.main === 'respawnPunisher';
  const gearSaver = (ap.specialSaver || 0) * (tuningRef?.clothingGear?.respawnPunisher?.specialSaverAPScale ?? .7);
  // Haunt follows the same post-2.1.0 exception as Respawn Punisher:
  // keep the independent drink's 57 AP, still apply the penalty loss.
  const saverAP = cooler ? Math.max(57, gearSaver) : gearSaver;
  const saver = curve ? curve(saverAP, ...tuningRef.gear.specialSaver) : (victim.s3?.modifiers?.specialSaver ?? .5);
  return {
    frames: cfg?.targetFrames ?? 45,
    loss: cfg?.targetSpecialLoss ?? .15,
    saverAP, saver, cooler, selfPunisher,
    selfLoss: selfPunisher ? tuningRef.clothingGear.respawnPunisher.selfSpecialLoss : 0,
  };
}
export function installHaunt(api, tuning, helpers = {}) {
  const { Actor, NetMatch, on, emit } = api;
  if (!Actor || Object.hasOwn(Actor.prototype, INSTALL)) return;
  Object.defineProperty(Actor.prototype, INSTALL, { value: true });
  G = api.G; cfg = tuning.clothingGear.haunt; tuningRef = tuning; curve = helpers.gearCurve;
  if (NetMatch && !NetMatch.prototype.replayHauntEvent) {
    NetMatch.prototype.replayHauntEvent = function (name, event, from) {
      return acceptRemoteState(name, event, from, this);
    };
  }
  const reset = Actor.prototype.reset, respawn = Actor.prototype.respawn, splat = Actor.prototype.splat;
  Actor.prototype.reset = function (...args) {
    // Turf Squid Spawn revives through spawnAt/reset rather than the legacy
    // Actor.respawn wrapper. Preserve the dead owner's ledger across that
    // reset too; the respawn event below arms it only after the new life exists.
    const respawnReset = !!this._respawnLifecycle?.wasDead;
    const saved = (reviving.has(this) || respawnReset) ? marks.get(this) : null;
    const result = reset.apply(this, args);
    if (this.s3) delete this.s3.lastHauntPenalty;
    generation.set(this, (generation.get(this) || 0) + 1);
    if (saved && hauntEquipped(this)) {
      marks.set(this, saved);
      for (const r of saved.values()) { r.ownerLife = life(this); r.armed = false; }
    } else marks.delete(this);
    return result;
  };
  Actor.prototype.respawn = function (...args) {
    const nested = reviving.has(this); reviving.add(this);
    try {
      const result = respawn.apply(this, args);
      armOwner(this, emit);
      return result;
    } finally { if (!nested) reviving.delete(this); }
  };
  Actor.prototype.splat = function (attacker, cause = 'weapon', ...args) {
    const alive = this.alive, special = this.special, penalty = hauntBasicPenalty(this, attacker, cause);
    const result = splat.call(this, attacker, cause, ...args);
    if (!alive || this.alive) return result;
    if (penalty) {
      this.respawnTimer += penalty.frames / 60;
      // Recompute the final gauge from the pre-death amount: the inner gear
      // wrapper has already applied the ordinary/self-RP death calculation,
      // while Haunt uses the incoming-RP Special Saver cancellation rule.
      this.special = Math.max(0, Math.max(0, special) * (penalty.saver - penalty.loss - penalty.selfLoss));
      this.s3.lastHauntPenalty = { ...penalty };
    } else if (this.s3) delete this.s3.lastHauntPenalty;
    if (hauntEquipped(this) && attacker?.alive && attacker !== this && attacker.team !== this.team &&
        !environment(cause) && !G.match?.attract) {
      putRecord(this, attacker, { armed: false, proven: !G.netm });
      emitState(emit, 'haunt:mark', this, attacker);
    }
    return result;
  };
  // Respawn Lifecycle emits this after a Turf Squid Spawn has created the new
  // local life. This is the production path that bypasses the legacy wrapper.
  on('respawn', ({ actor }) => armOwner(actor, emit));
  on('combat:respawn', ({ actor }) => { if (actor) generation.set(actor, (generation.get(actor) || 0) + 1); });
  on('match:state', ({ state }) => { if (['intro','finish','results'].includes(state)) marks = new WeakMap(); });
}
