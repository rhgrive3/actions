// Issue #483 — bounded hair-geometry ownership (narrow adapter, build-only).
// Production build path: this transform is applied to `src/game/character.js` by the site
// builder alongside `adaptSource` — parent integration adds the one wiring line in
// patches/splatoon3/adapter.mjs (`code = adaptIssue483Character(rel, code)` inside the
// existing `if (rel === 'src/game/character.js')` branch); the focused tests below apply
// `adaptIssue483Character` directly after `adaptSource` to mirror that build order. Only
// exact-anchor edits:
//  - import the narrow runtime helper + HEAD_C (no shared dispatcher/profile edits),
//  - resolve rig meta/rest from the shared game-LOD entry (never a hero build; bone rest
//    positions are lod-independent), skeleton inverses from that same rest,
//  - ref-count rendered tier geometries with per-Character key dedup and release them on
//    dispose / quality rebuild (exactly one dispose per ownership epoch at zero users;
//    live Characters keep shared meshes).
// Untouched: inkwave-public sources, movement/damage/ink/weapon timing, Practice Range
// isolation, gyro/special readiness.
import {
  acquireHair as acquireHairGeometry,
  releaseHairKey as releaseHairKeyGeometry,
  hairKeyFor as hairKeyForGeometry,
  getAnatomy as getAnatomyEntry,
  releaseAnatomy as releaseAnatomyEntry,
} from './runtime/hair-cache.mjs';

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
import { HEAD_C as HEAD_C483 } from './character-geo.js';
const HAIR_NATIVE_483 = () => ({ getHairStyle, hairQuality: () => (G.settings?.quality || 'high'), hairStyleCount: HAIR_STYLES, hatKindCount: 4, browKindCount: 4 });`;
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
      const q483 = G.settings?.quality || 'high';
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
  void acquireHairGeometry; void releaseHairKeyGeometry; void hairKeyForGeometry; void getAnatomyEntry; void releaseAnatomyEntry;
  return patched;
}
