// Issue #483 — bounded hair-geometry ownership (narrow adapter, build-only).
// Production build path: these transforms are applied by the site builder alongside `adaptSource`.
// The build composition owns the wire point — parent adds ONE line, `code = adaptIssue483(rel, code)`,
// in scripts/build-inkwave.mjs (`adaptBuildSource`) and scripts/check-inkwave-patches.mjs, immediately
// after `adaptSource(rel, code)` and before the touch-layout / reliability / quality adapters. It is
// deliberately NOT placed inside patches/splatoon3/adapter.mjs: the existing `src/game/character.js`
// branch of adaptSource early-returns, so a wire after that branch would never run, and adaptSource
// itself must stay the untouched shared dispatcher. The focused tests below apply
// `adaptIssue483(rel, ...)` directly after `adaptSource` to mirror that build order. Exact anchors only:
//  character.js —
//  - import the narrow runtime helper + owned native builder (no shared dispatcher/profile edits),
//  - resolve rig meta/rest from the shared game-LOD entry (never a hero build; bone rest
//    positions are lod-independent), skeleton inverses from that same rest,
//  - ref-count rendered tier geometries with per-Character key dedup and release them on
//    dispose / quality rebuild (exactly one dispose per ownership epoch at zero users;
//    live Characters keep shared meshes),
//  character-geo.js —
//  - expose the narrow native owned builder `buildOwnedHairStyle(st, lod)` (real hairKey +
//    buildHair pipeline, zero cache side effects) so ref-counted callers never enter the strong
//    module `_hair` / `_inv` maps. The legacy public `getHairStyle` contract is untouched for
//    non-owned callers; nothing shared is flushed or disposed here.
// Untouched: inkwave-public sources, movement/damage/ink/weapon timing, Practice Range
// isolation, gyro/special readiness.

export function replaceOnce483(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) !== -1) {
    throw new Error(`INKWAVE issue-483 patch conflict (${label}): expected exactly one connection`);
  }
  return code.slice(0, at) + after + code.slice(at + before.length);
}

export const ISSUE_483_REL = 'src/game/character.js';
export const ISSUE_483_HEADER = `// INKWAVE issue-483: bounded hair-geometry ownership (ref-counted; see patches/splatoon3/runtime/hair-cache.mjs).
import { acquireHair as acquireHair483, releaseHairKey as releaseHairKey483, hairKeyFor as hairKeyFor483, getAnatomy as getHairAnatomy483, releaseAnatomy as releaseHairAnatomy483 } from '../../patches/splatoon3/runtime/hair-cache.mjs';
import { HEAD_C as HEAD_C483, HAT_KINDS as HAT_KINDS483, BROW_KINDS as BROW_KINDS483, buildOwnedHairStyle as buildOwnedHairStyle483 } from './character-geo.js';
import { hairQuality as hairQuality483 } from './character-hair.js';
// Owned native builder = buildOwnedHairStyle exposed by adaptIssue483CharacterGeo: same hairKey +
// buildHair pipeline as getHairStyle, but it never enters the strong native _hair/_inv caches, so the
// helper owns the geometry end to end and can drop the last CPU reference at zero users.
// Catalog counts come from the real exports (HAIR_STYLES / HAT_KINDS / BROW_KINDS) — no literals —
// and quality follows the native hairQuality() so rebound keys match the real detail ladder.
const HAIR_NATIVE_483 = () => ({ buildOwnedHairStyle: buildOwnedHairStyle483, hairQuality: hairQuality483, hairStyleCount: HAIR_STYLES, hatKindCount: HAT_KINDS483.length, browKindCount: BROW_KINDS483.length });`;
export const ISSUE_483_RIG_ANCHOR = `  _buildRig() {
    const hair = getHairStyle(this.style);   // keyed on the style object (hair + hat + brows)
    this.hairMeta = hair.meta;
    const rest = getRestPositions(this.style);`;
export const ISSUE_483_RIG_TAIL_ANCHOR = `    this.bones = byName; this.boneList = bones;
    this.rest = rest;
    this.skeleton = new THREE.Skeleton(bones, getBoneInverses(this.style));`;
export const ISSUE_483_TIER_ANCHOR = `    const K = getKidShared(tn), H = getHairStyle(this.style, tn);`;
export const ISSUE_483_QUALITY_ANCHOR = `      if (L.q !== undefined) { for (const X of this.lodSets) if (X) for (const m of X.list) this.kid.remove(m); this.lodSets = [null, null, null]; this._setTier(L.tier); }`;
export const ISSUE_483_DISPOSE_ANCHOR = `  dispose() {
    LIVE.delete(this);`;

export function adaptIssue483Character(rel, code) {
  if (rel !== ISSUE_483_REL) return code;
  let patched = code;
  patched = replaceOnce483(
    patched,
    ISSUE_483_RIG_ANCHOR,
    `  _buildRig() {
    const anatomy483 = getHairAnatomy483(HAIR_NATIVE_483(), this.style);
    this.hairAnatomy483 = anatomy483;
    this.hairMeta = anatomy483.meta;
    const rest = (() => { const o = {}; for (const n of BONE_NAMES) o[n] = (REST[n] || anatomy483.rest[n] || HEAD_C483).clone(); return o; })();`,
    'rig anatomy without hero build',
  );
  patched = replaceOnce483(
    patched,
    ISSUE_483_RIG_TAIL_ANCHOR,
    `    this.bones = byName; this.boneList = bones;
    this.rest = rest;
    this.skeleton = new THREE.Skeleton(bones, BONE_NAMES.map((n) => new THREE.Matrix4().makeTranslation(-rest[n].x, -rest[n].y, -rest[n].z)));`,
    'skeleton inverses from local rest',
  );
  patched = replaceOnce483(
    patched,
    ISSUE_483_TIER_ANCHOR,
    `    const K = getKidShared(tn), H = (() => {
      const held483 = this.hairKeys483 || (this.hairKeys483 = []);
      const q483 = hairQuality483();
      const key483 = hairKeyFor483(HAIR_NATIVE_483(), this.style, tn, q483);
      for (const r of held483) if (r.key === key483) return r.entry;
      const entry483 = acquireHair483(HAIR_NATIVE_483(), this.style, tn, q483);
      held483.push({ key: key483, lod: tn, entry: entry483 });
      return entry483;
    })();`,
    'tier geometry acquire with per-character dedup',
  );
  patched = replaceOnce483(
    patched,
    ISSUE_483_QUALITY_ANCHOR,
    `      if (L.q !== undefined) { for (const r of (this.hairKeys483 || [])) releaseHairKey483(r.key); this.hairKeys483 = []; if (this.hairAnatomy483) { releaseHairAnatomy483(this.hairAnatomy483); this.hairAnatomy483 = null; } for (const X of this.lodSets) if (X) for (const m of X.list) this.kid.remove(m); this.lodSets = [null, null, null]; this._setTier(L.tier); }`,
    'quality rebuild releases old keys',
  );
  patched = replaceOnce483(
    patched,
    ISSUE_483_DISPOSE_ANCHOR,
    `  dispose() {
    for (const r of (this.hairKeys483 || [])) releaseHairKey483(r.key);
    this.hairKeys483 = [];
    if (this.hairAnatomy483) { releaseHairAnatomy483(this.hairAnatomy483); this.hairAnatomy483 = null; }
    LIVE.delete(this);`,
    'teardown releases every hair key',
  );
  if (!patched.includes('runtime/hair-cache.mjs')) patched = `${ISSUE_483_HEADER}\n${patched}`;
  return patched;
}

// ------------------------------------------------------------------------------------------------
// src/game/character-geo.js — narrow native owned builder (the CPU-retention root fix)
// ------------------------------------------------------------------------------------------------
export const ISSUE_483_GEO_REL = 'src/game/character-geo.js';
// Anchors the closing body of the native caching getter: unique in character-geo.js, backtick-free,
// and it does not touch the getter's public contract (which stays byte-identical above it).
export const ISSUE_483_GEO_ANCHOR = `  if (!_hair.has(ks)) _hair.set(ks, buildHair(k.hair, k.hat, k.brows, lod));
  return _hair.get(ks);
}`;
export const ISSUE_483_GEO_APPEND = `

// INKWAVE issue-483: narrow owned builder for ref-counted callers. Same hairKey + buildHair pipeline
// as getHairStyle, but it never reads or writes the module-level hair cache (_hair) and never
// populates the inverse cache (_inv), so the caller owns the returned geometry and disposes it at
// zero users. getHairStyle above keeps its legacy caching contract for non-owned callers; no shared
// cache is flushed or disposed here (live shared geometry must survive).
export function buildOwnedHairStyle(st, lod = 'hero') {
  const k = hairKey(st);
  return buildHair(k.hair, k.hat, k.brows, lod);
}`;

export function adaptIssue483CharacterGeo(rel, code) {
  if (rel !== ISSUE_483_GEO_REL) return code;
  if (code.includes('export function buildOwnedHairStyle(')) return code;   // already adapted
  return replaceOnce483(
    code,
    ISSUE_483_GEO_ANCHOR,
    ISSUE_483_GEO_ANCHOR + ISSUE_483_GEO_APPEND,
    'owned native hair builder',
  );
}

/** Single build-composition entry point: parent wires `code = adaptIssue483(rel, code)` after adaptSource. */
export function adaptIssue483(rel, code) {
  if (rel === ISSUE_483_REL) return adaptIssue483Character(rel, code);
  if (rel === ISSUE_483_GEO_REL) return adaptIssue483CharacterGeo(rel, code);
  return code;
}
