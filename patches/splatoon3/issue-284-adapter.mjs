// INKWAVE issue #284: post-splat squid/octopus ghost return trajectory.
// Presentation only. Native ink burst, scoring, life, respawn timers, Squid
// Spawn selection, damage and attribution stay untouched. Exactly one
// build-time hook is installed for the owner death path (Actor.splat) and
// one for the remote death path (NetMatch._remoteSplat). A ghost record is
// created at/just above the splat position, rises briefly, then travels
// deterministically toward the victim team's spawn
// (G.level.spawnPads[victim.team]). Water/fall deaths are excluded.
// This file never edits the shared dispatcher (patches/splatoon3/adapter.mjs)
// or profile.json. REQUIRED WIRING (parent applies; reported, not done here):
//   import { installSplatGhostReturn, updateSplatGhosts } from '../../patches/splatoon3/issue-284-adapter.mjs';
//   installSplatGhostReturn({ Actor, NetMatch });
// and per presentation tick: updateSplatGhosts(G, dt);
// Remote spectators converge via the existing native death path: the owner
// emits authoritative `splatted`, NetMatch forwards `ev/splatted`, the
// remote applies `_remoteSplat`, and each side derives the identical
// deterministic ghost (start pose + victim team + species silhouette) from
// local state. No snapshot/wire/protocol field is added or changed here.
// Species: INKWAVE ships one procedural squidkid rig and the native
// FX.ghost() squid-ghost sprite; no species field exists on Actor/Character
// /style. The adapter resolves the kind from explicit opt-in metadata only
// (actor.species, actor.ghostKind, character.style.species/kind accepting
// 'octo'/'octopus'/'octoling'); otherwise it falls back to 'squid'.
// No gameplay branch depends on this.
export const SPLAT_GHOST_RETURN_CALIBRATION = Object.freeze({
  riseTime: 0.45, riseHeight: 1.1, duration: 2.2, cruiseHeight: 1.6,
  emitEvery: 1 / 30, nearEnd: 0.12,
});
const RISE_TIME = 0.45;
const DURATION = 2.2;
const EMIT_EVERY = 1 / 30;
const OWNER_HOOK = Symbol.for('inkwave.issue-284.splat-ghost.owner.v1');
const REMOTE_HOOK = Symbol.for('inkwave.issue-284.splat-ghost.remote.v1');
const RECORD = Symbol.for('inkwave.issue-284.splat-ghost.record.v1');
const clamp01 = v => (v <= 0 ? 0 : v >= 1 ? 1 : v);
const smooth = u => { u = clamp01(u); return u * u * (3 - 2 * u); };

export function ghostKindFor(actor) {
  const raw = actor?.species ?? actor?.ghostKind
    ?? actor?.character?.style?.species ?? actor?.character?.style?.kind;
  const kind = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (kind === 'octo' || kind === 'octopus' || kind === 'octoling') return 'octopus';
  return 'squid';
}

export function ghostPositionAt(from, target, u, out) {
  const rise = smooth(Math.min(1, u * (DURATION / RISE_TIME)));
  const span = 1 - RISE_TIME / DURATION;
  const travel = smooth(Math.max(0, (u - RISE_TIME / DURATION) / span));
  const x = from.x + (target.x - from.x) * travel;
  const z = from.z + (target.z - from.z) * travel;
  const cruise = (target.y + 1.6) - from.y;
  const land = (target.y + 0.6) - (target.y + 1.6);
  const y = from.y + 1.1 * rise + cruise * travel + land * smooth(Math.max(0, (u - 0.8) / 0.2));
  out.x = x; out.y = y; out.z = z;
  return out;
}

function spawnTarget(G, team) {
  const pad = G?.level?.spawnPads?.[team];
  if (!pad || !Number.isFinite(pad.x + pad.y + pad.z)) return null;
  return pad;
}
export function startSplatGhost(G, victim, cause = 'weapon') {
  if (!victim || victim.alive !== false) return null;
  if (cause === 'water' || cause === 'fall') return null;
  if (victim[RECORD]?.active) return victim[RECORD];
  const target = spawnTarget(G, victim.team);
  if (!target) return null;
  const start = { x: victim.pos.x, y: victim.pos.y + 0.35, z: victim.pos.z };
  if (!Number.isFinite(start.x + start.y + start.z)) return null;
  if (Math.hypot(target.x - start.x, target.z - start.z) < 0.05) return null;
  const record = { active: true, age: 0, emitAcc: 1, kind: ghostKindFor(victim),
    team: victim.team, color: victim.color ?? null,
    from: start, target: { x: target.x, y: target.y, z: target.z } };
  victim[RECORD] = record;
  return record;
}

export function splatGhostSnapshot(victim) {
  const r = victim?.[RECORD];
  return r ? { ...r, from: { ...r.from }, target: { ...r.target } } : null;
}

export function updateSplatGhosts(G, dt, actors) {
  if (!G || !(dt > 0)) return;
  const list = actors ?? G.actors ?? G.match?.actors ?? [];
  const scratch = { x: 0, y: 0, z: 0 };
  for (const actor of list) {
    const r = actor?.[RECORD];
    if (!r?.active) continue;
    if (actor.alive !== false) { r.active = false; continue; }
    if (actor.character?.visible !== false) { r.active = false; continue; }
    r.age += dt;
    const u = clamp01(r.age / DURATION);
    if (u >= 1 - 1e-9 || r.age >= (actor.respawnTimer ?? DURATION)) { r.active = false; continue; }
    r.emitAcc += dt;
    if (r.emitAcc + 1e-9 < EMIT_EVERY) continue;
    r.emitAcc = 0;
    ghostPositionAt(r.from, r.target, u, scratch);
    try { G.fx?.ghost?.({ x: scratch.x, y: scratch.y - 0.35, z: scratch.z }, r.color ?? actor.color); }
    catch { /* presentation must never break simulation */ }
  }
}
function hookOnce(proto, name, slot, wrap) {
  if (!proto || typeof proto[name] !== 'function') throw new Error('Splat ghost return requires native ' + name);
  if (Object.hasOwn(proto, slot)) return;
  const native = proto[name];
  Object.defineProperty(proto, slot, { value: true });
  proto[name] = function (...args) {
    const out = native.apply(this, args);
    wrap(this, args);
    return out;
  };
}

// Install exactly one owner hook (Actor.splat) and, when provided, one
// remote hook (NetMatch._remoteSplat). G (or getG) supplies the presentation
// context lazily: each side derives the identical deterministic record from
// the victim's own splat pose and team, so owner and remote spectators see
// the same path with no new snapshot/wire field. Idempotent.
export function installSplatGhostReturn({ Actor, NetMatch, G = null, getG = null } = {}) {
  if (!Actor?.prototype?.splat) throw new Error('Splat ghost return requires the native Actor death path');
  const ctx = () => (typeof getG === 'function' ? getG() : G);
  hookOnce(Actor.prototype, 'splat', OWNER_HOOK, (victim, args) => {
    startSplatGhost(ctx(), victim, args?.[1] ?? 'weapon');
  });
  if (NetMatch?.prototype?._remoteSplat) {
    hookOnce(NetMatch.prototype, '_remoteSplat', REMOTE_HOOK, (nm, args) => {
      startSplatGhost(ctx() ?? nm?.match?.game?.G ?? null, args?.[0], args?.[2] ?? 'weapon');
    });
  }
  return { ghostKindFor, ghostPositionAt, startSplatGhost, splatGhostSnapshot, updateSplatGhosts };
}
