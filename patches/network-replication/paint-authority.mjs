// The relay authenticates `from`; payload actor ids never authenticate a peer.
// Each stamp is an owner action (identified by the existing match/tick/sequence).
// This does not make an actor owner's simulation server authoritative.
import { deathBlastPlan } from '../splatoon3/runtime/death-blast.mjs';

export const PAINT_AUTHORITY_TAG = 'inkwave-paint-authority-v1';
export const DEATH_PAINT_SPEC = Object.freeze({ paintRadius: 5, paintOffsetY: .1,
  splashAroundCount: 10, splashAroundPaintRadius: 1 });
const sessions = new WeakMap();
const zoneIndexes = new WeakMap();
const safe = n => Number.isSafeInteger(n) && n >= 0;
function state(nm) {
  let matches = sessions.get(nm.s);
  if (!matches) sessions.set(nm.s, matches = new Map());
  const id = nm.cfg?.id;
  let s = matches.get(id);
  if (!s) {
    s = { owners: new Map(), deaths: new Map() }; matches.set(id, s);
    if (matches.size > 8) matches.delete(matches.keys().next().value);
  }
  return s;
}
function generation(nm, actor) {
  const owners = state(nm).owners;
  let record = owners.get(actor.nid);
  if (!record) owners.set(actor.nid, record = { owner: actor.owner, generation: 0 });
  else if (record.owner !== actor.owner) { record.owner = actor.owner; record.generation++; }
  return record.generation;
}
export function transferPaintOwner(nm, actor, owner) {
  generation(nm, actor);
  const record = state(nm).owners.get(actor.nid);
  if (record.owner !== owner) { record.owner = owner; record.generation++; }
}
function owned(nm, from, nid, gen) {
  const a = nm.byNid.get(nid);
  return safe(nid) && safe(gen) && a?.owner === from && generation(nm, a) === gen ? a : null;
}
export function packPaintAuthority(nm, paint, team, opts) {
  const death = opts.paintDeath;
  if (Array.isArray(death)) {
    const victim = nm.byNid.get(death[0]);
    if (victim?.owner !== nm.myId || victim.remote) return null;
    return [PAINT_AUTHORITY_TAG, 'death', victim.nid, generation(nm, victim), ...death.slice(1)];
  }
  if (opts.paintBoss && nm.isHost && nm.match?.boss)
    return [PAINT_AUTHORITY_TAG, 'boss', nm.s.hostId];
  if (Array.isArray(opts.paintZone) && opts.paintZone.length === 2
    && opts.paintZone.every(safe) && nm.isHost && nm.match?.ranked?.mode === 'zones')
    return [PAINT_AUTHORITY_TAG, 'zone', nm.s.hostId, ...opts.paintZone];
  // Credit ownership is already explicit for gameplay producers. Never infer
  // it by colour, nearest actor, or host status. Remote credit is not authority.
  const actor = paint?._paintOwnerContext?.owner ?? opts.claimOwner;
  if (!actor || actor.remote || actor.owner !== nm.myId || actor.team !== team
    || nm.byNid.get(actor.nid) !== actor) return null;
  return [PAINT_AUTHORITY_TAG, 'actor', actor.nid, generation(nm, actor)];
}
function deathPaint(nm, from, e, proof) {
  if (proof.length !== 12 || !owned(nm, from, proof[2], proof[3])
    || !safe(proof[4]) || !safe(proof[5]) || !safe(proof[11]) || proof[11] > 10
    || !proof.slice(6, 10).every(Number.isFinite)) return false;
  const attacker = nm.byNid.get(proof[5]);
  const victim = nm.byNid.get(proof[2]);
  const life = victim.remote ? victim.net?.lastLife ?? victim.netLife ?? 0 : victim.netLife ?? 0;
  if (proof[4] !== life || !attacker || attacker.team !== e[6] || attacker.team === victim.team
    || e[8] !== 0 || e.slice(9, 13).some(n => n !== 0) || e[13] !== -1
    || Array.isArray(e[15])) return false;
  const position = { x: proof[6], y: proof[7], z: proof[8] };
  if (!victim.pos || Math.hypot(position.x-victim.pos.x, position.y-victim.pos.y,
    position.z-victim.pos.z) > 6) return false;
  const row = deathBlastPlan(position, proof[9], DEATH_PAINT_SPEC)[proof[11]];
  // Exact unrounded producer values, including the deterministic droplets.
  if (row.x !== e[2] || row.y !== e[3] || row.z !== e[4]
    || row.radius !== e[5] || row.seed !== e[7] || proof[10] !== e[6]) return false;
  const previous = state(nm).deaths.get(proof[2]);
  const fingerprint = JSON.stringify(proof.slice(3, 11));
  return !previous || previous.generation < proof[3] || previous.generation === proof[3]
    && (previous.life < proof[4] || previous.life === proof[4]
      && previous.fingerprint === fingerprint && !(previous.mask & (1 << proof[11])));
}
function zonePaint(nm, from, e, proof) {
  if (proof.length !== 5 || from !== nm.s.hostId || proof[2] !== from
    || !safe(proof[3]) || !safe(proof[4]) || nm.match?.ranked?.mode !== 'zones') return false;
  const cells = nm.match.rankedWorld?._zoneCells?.[proof[3]];
  if (!Array.isArray(cells)) return false;
  let index = zoneIndexes.get(cells);
  if (!index) { index = new Map(cells.map(entry => [entry.cell, entry])); zoneIndexes.set(cells, index); }
  const entry = index.get(proof[4]);
  if (!entry) return false;
  const {face,center,cell} = entry;
  const radius = Math.max(.08, Math.min(.42, Math.hypot(face.cu, face.cv)*.72));
  return e[2] === center.x && e[3] === center.y && e[4] === center.z && e[5] === radius
    && e[7] === (((proof[3]+1)*0x9e3779b1+(cell+1)*0x85ebca6b)>>>0)
    && e[8] === 'blast' && e.slice(9,13).every(n=>n===0) && e[13] === face.id && e[14][3] === 1;
}
export function admitPaintAuthority(nm, from, e) {
  const proof = e?.[14]?.[4];
  if (!nm.s._members?.has(from) || !Array.isArray(proof) || proof[0] !== PAINT_AUTHORITY_TAG
    || !safe(e._netTick) || !safe(e._netSeq) || e._netSeq === 0) return false;
  switch (proof[1]) {
    case 'actor': return proof.length === 4 && owned(nm, from, proof[2], proof[3])?.team === e[6];
    case 'death': return deathPaint(nm, from, e, proof);
    case 'boss': return proof.length === 3 && from === nm.s.hostId && proof[2] === from && !!nm.match?.boss;
    case 'zone': return zonePaint(nm, from, e, proof);
    default: return false;
  }
}
export function consumePaintAuthority(nm, e) {
  const p = e[14][4];
  if (p[1] !== 'death') return;
  const deaths = state(nm).deaths, previous = deaths.get(p[2]);
  const fingerprint = JSON.stringify(p.slice(3, 11));
  const mask = previous?.fingerprint === fingerprint ? previous.mask : 0;
  deaths.set(p[2], { generation: p[3], life: p[4], fingerprint, mask: mask | (1 << p[11]) });
}
