// Per-main-weapon visual registry. A weapon ID selects its own shell, grips,
// muzzle socket, part animation and pose offsets; its catalogue family
// (modelKind) still selects gameplay, native HOLD data and the animated part
// channels the family runtime drives. Geometry is procedural and built lazily.
import { MAIN_WEAPON_CATALOG } from '../main-weapon-catalog-data.mjs';
import { ALTERNATE_WEAPON_KITS, VARIANT_BASE_WEAPON } from '../alternate-weapon-kits-data.mjs';
import * as SHOOTERS from './shooters.mjs';
import * as SHOOTERS_B from './shooters-b.mjs';
import * as BLASTERS from './blasters.mjs';
import * as DUALIES from './dualies.mjs';
import * as ROLLERS from './rollers.mjs';
import * as BRUSHES from './brushes.mjs';
import * as CHARGERS from './chargers.mjs';
import * as STRINGERS from './stringers.mjs';
import * as SLOSHERS from './sloshers.mjs';
import * as SPLATLINGS from './splatlings.mjs';
import * as BRELLAS from './brellas.mjs';
import * as SPLATANAS from './splatanas.mjs';
import { FOLLOWUP_MODELS as BULBZ_VARIANTS } from './variants-bulbz-followup.mjs';
import { FOLLOWUP_MODELS as SQUIFFER_VARIANTS } from './variants-squiffer-v4-followup.mjs';
import { FOLLOWUP_MODELS as NOCT_VARIANTS } from './variants-dapple-noct-followup.mjs';
import { FOLLOWUP_MODELS as MILK_VARIANTS } from './variants-milk-followup.mjs';
import { FOLLOWUP_MODELS as SORELLA_VARIANTS } from './variants-sorella-followup.mjs';
import { FOLLOWUP_MODELS as EXPLOSHER_VARIANTS } from './custom-explosher-finish.mjs';

const RECORDS = new Map(MAIN_WEAPON_CATALOG.records.map(r => [r.id, r]));
const FAMILIES = Object.freeze([['shooter', SHOOTERS], ['shooter', SHOOTERS_B], ['blaster', BLASTERS], ['dualies', DUALIES],
  ['roller', ROLLERS], ['brush', BRUSHES], ['charger', CHARGERS], ['stringer', STRINGERS], ['slosher', SLOSHERS],
  ['splatling', SPLATLINGS], ['brella', BRELLAS], ['splatana', SPLATANAS]]);
const SPECS = new Map(), FAMILY_POSE = new Map(), FAMILY_TRIGGER = new Map();
for (const [family, mod] of FAMILIES) {
  if (typeof mod.FAMILY_POSE === 'function') {
    if (FAMILY_POSE.has(family)) throw new Error(`Duplicate ${family} family pose layer`);
    FAMILY_POSE.set(family, mod.FAMILY_POSE);
  }
  if (typeof mod.FAMILY_TRIGGER === 'function') {
    if (FAMILY_TRIGGER.has(family)) throw new Error(`Duplicate ${family} family trigger layer`);
    FAMILY_TRIGGER.set(family, mod.FAMILY_TRIGGER);
  }
  for (const [id, spec] of Object.entries(mod.MODELS || {})) {
    const r = RECORDS.get(id);
    if (!r) throw new Error(`Weapon model ${id} has no main-weapon catalogue record`);
    if (r.family !== family) throw new Error(`Weapon model ${id} registered as ${family}, catalogue family ${r.family}`);
    if (typeof spec?.build !== 'function') throw new Error(`Weapon model ${id} needs build(def)`);
    if (SPECS.has(id)) throw new Error(`Duplicate weapon model ${id}`);
    SPECS.set(id, Object.freeze({ ...spec, id, family, modelKind: r.modelKind }));
  }
}
// Explicitly adopted candidates only. Other alternate kits retain their base model.
const VARIANT_SPECS = new Map(), VARIANT_KITS = new Map(), VARIANT_KEYS = new Map();
const KITS_BY_ROW = new Map(ALTERNATE_WEAPON_KITS.map(kit => [kit.main, kit]));
for (const mod of [BULBZ_VARIANTS, SQUIFFER_VARIANTS, NOCT_VARIANTS, MILK_VARIANTS, SORELLA_VARIANTS, EXPLOSHER_VARIANTS]) {
  for (const [key, spec] of Object.entries(mod)) {
    const kit = KITS_BY_ROW.get(key), record = kit && RECORDS.get(kit.baseId);
    if (!kit || !record || spec.sourceRow !== key || spec.baseId !== kit.baseId)
      throw new Error(`Variant model ${key} does not match its official kit`);
    if (typeof spec.build !== 'function' || VARIANT_SPECS.has(key) || SPECS.has(key))
      throw new Error(`Invalid or duplicate variant model ${key}`);
    VARIANT_SPECS.set(key, Object.freeze({ ...SPECS.get(kit.baseId), ...spec,
      id: key, family: record.family, modelKind: record.modelKind }));
    VARIANT_KITS.set(key, kit); VARIANT_KEYS.set(kit.id, key);
  }
}
const variantKey = id => VARIANT_KEYS.get(id) ?? (VARIANT_SPECS.has(id) ? id : null);
const baseWeaponId = id => VARIANT_KITS.get(variantKey(id))?.baseId ?? VARIANT_BASE_WEAPON[id] ?? id;
const ownSpec = key => VARIANT_SPECS.get(variantKey(key)) ?? SPECS.get(key);
/** Explicit variant source-row keys; registeredWeaponModels remains the main-model list. */
export function registeredWeaponVariantModels() { return [...VARIANT_SPECS.keys()]; }

/** Family-level pose layer (brush / splatana / brella / stringer …): fn(character, dt, animState). */
export function weaponFamilyPose(id) { return FAMILY_POSE.get(weaponBehaviorFamily(id)) ?? null; }
/** Family one-shot handler: fn(character, name, arg) → true when it replaces the native one-shot
 *  (e.g. a Brush swing instead of the Roller flick, a Splatana slash instead of Shooter recoil). */
export function weaponFamilyTrigger(id) { return FAMILY_TRIGGER.get(weaponBehaviorFamily(id)) ?? null; }

/** Native visual family (HOLD key / part channels) for a weapon ID or family kind. */
export function weaponModelFamily(id) { const base = baseWeaponId(id); return RECORDS.get(base)?.modelKind ?? base; }
/** Catalogue behaviour family (brush, brella, stringer, splatana …) for a weapon ID. */
export function weaponBehaviorFamily(id) { const base = baseWeaponId(id); return RECORDS.get(base)?.family ?? base; }
/** Cache key for getWeaponDef: the weapon ID when it owns a model, else its shared family model. */
export function weaponModelKey(id) { const key = variantKey(id); if (key) return key; const base = baseWeaponId(id); return SPECS.has(base) ? base : weaponModelFamily(base); }
export function weaponModelSpec(id) { return VARIANT_SPECS.get(variantKey(id)) ?? SPECS.get(baseWeaponId(id)) ?? null; }
export function registeredWeaponModels() { return [...SPECS.keys()]; }

/** Apply the weapon's own model to a freshly built family def (before finishParts). */
export function buildWeaponModel(key, base) {
  const spec = ownSpec(key);
  if (!spec) return base;
  const family = base.kind;
  const d = spec.build(base) || base;
  const baseId = baseWeaponId(key);
  d.kind = family; d.modelId = baseId; d.referenceWeapon = RECORDS.get(baseId).names.en;
  const selected = variantKey(key);
  if (selected) { d.modelVariantId = selected; d.appearanceName = spec.name; }
  d.referenceModelName = spec.sourceModel ?? null;
  if (spec.animate) d.animate = spec.animate;
  return d;
}

// Hold = native family HOLD entry deep-merged with the weapon's overrides. Stable
// identity per (weapon, base) so per-hold caches (carry/detail overlays) stay valid.
const holds = new WeakMap();
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
function merge(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = isObj(v) && isObj(base?.[k]) ? merge(base[k], v) : v;
  return out;
}
export function weaponHold(key, base) {
  key = variantKey(key) ?? key;
  const spec = ownSpec(key);
  if (!spec?.hold || !base) return base;
  let byKey = holds.get(base);
  if (!byKey) { byKey = new Map(); holds.set(base, byKey); }
  let h = byKey.get(key);
  if (!h) { h = merge(base, spec.hold); byKey.set(key, h); }
  return h;
}

// The Wii U source bank has no Brella / Splatana / Stringer / Brush upper-body
// clips; those families (and any model asking for it) keep the native hold.
const NATIVE_CARRY = new Set(['brella', 'splatana', 'stringer', 'brush']);
export function weaponNeedsNativeCarry(id) {
  return !!id && (NATIVE_CARRY.has(weaponBehaviorFamily(id)) || !!weaponModelSpec(id)?.nativeCarry);
}
