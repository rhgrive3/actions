import { FOLLOWUP_MODELS as ACCEPTED_LIGHTLONG } from './variants-accepted-lightlong-followup.mjs';
import { FOLLOWUP_MODELS as LUNA_VARIANTS } from './variants-accepted-luna-followup.mjs';
import { FOLLOWUP_MODELS as ACCEPTED_CARBON } from './variants-accepted-carbon-followup.mjs';
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
import { VARIANT_MODELS as SHOOTER_VARIANTS } from './shooter-blaster-variants.mjs';
import { VARIANT_MODELS as MELEE_VARIANTS } from './variants-melee.mjs';
import { VARIANT_MODELS as RANGED_VARIANTS } from './variants-ranged-defense.mjs';
import { FOLLOWUP_MODELS as BULBZ_VARIANTS } from './variants-bulbz-followup.mjs';
import { FOLLOWUP_MODELS as SQUIFFER_VARIANTS } from './variants-squiffer-v4-followup.mjs';
import { FOLLOWUP_MODELS as NOCT_VARIANTS } from './variants-dapple-noct-followup.mjs';
import { FOLLOWUP_MODELS as MILK_VARIANTS } from './variants-milk-followup.mjs';
import { FOLLOWUP_MODELS as SORELLA_VARIANTS } from './variants-sorella-followup.mjs';
import { FOLLOWUP_MODELS as EXPLOSHER_VARIANTS } from './custom-explosher-finish.mjs';
import { FOLLOWUP_MODELS as SECOND_BRELLA } from './variants-brella-palette-followup.mjs';
import { FOLLOWUP_MODELS as SECOND_REEF } from './variants-reef-deco-followup.mjs';
import { FOLLOWUP_MODELS as SECOND_INKLINE } from './variants-inkline-followup.mjs';
import { FOLLOWUP_MODELS as SECOND_WELLSTRING } from './variants-custom-wellstring-followup.mjs';
import { FOLLOWUP_MODELS as SECOND_C } from './variants-c-palette-followup.mjs';
import { FOLLOWUP_MODELS as THIRD_SHOOTERS } from './variants-fixed-shooter-finish.mjs';
import { FOLLOWUP_MODELS as THIRD_NEO } from './variants-neo-marker-finish.mjs';
import { FOLLOWUP_MODELS as THIRD_CHARCOAL } from './variants-charcoal-followup.mjs';
import { FOLLOWUP_MODELS as THIRD_NOUVEAU } from './variants-stamper-nouveau-followup.mjs';
import { FOLLOWUP_MODELS as THIRD_RUST } from './variants-wiper-rust-followup.mjs';
import { FOLLOWUP_MODELS as THIRD_STICKERZ } from './variants-stickerz-followup.mjs';
import { FOLLOWUP_MODELS as THIRD_C } from './variants-c-third-followup.mjs';
import { FOLLOWUP_MODELS as FOURTH_NOZZLE } from './variants-nozzlenose-d-finish.mjs';
import { FOLLOWUP_MODELS as FOURTH_DUALIE_FIXED } from './variants-dualie-fixed-finish.mjs';
import { FOLLOWUP_MODELS as FOURTH_BLASTER_FIXED } from './variants-blaster-fixed-finish.mjs';
import { FOLLOWUP_MODELS as FOURTH_DUALIE_LIGHT } from './variants-dualie-light-finish.mjs';
import { FOLLOWUP_MODELS as FOURTH_BLASTER_DECO } from './variants-blaster-deco-finish.mjs';
import { FOLLOWUP_MODELS as NEXT_C } from './variants-c-next-followup.mjs';
import { FOLLOWUP_MODELS as FIFTH_CHARGERS } from './variants-charger-followups.mjs';
import { FOLLOWUP_MODELS as ACCEPTED_SPINNER } from './variants-accepted-spinner-followup.mjs';
import { FOLLOWUP_MODELS as ACCEPTED_SHOOTER } from './variants-accepted-shooter-followup.mjs';
import { FOLLOWUP_MODELS as MINI_VARIANTS } from './variants-mini-followup.mjs';
import { FOLLOWUP_MODELS as ACCEPTED_HEAVY02 } from './variants-accepted-heavy02-followup.mjs';
import { FOLLOWUP_MODELS as ACCEPTED_MANUAL_THREE } from './variants-accepted-manual-three-followup.mjs';
import { FOLLOWUP_MODELS as ACCEPTED_RANGED } from './variants-accepted-ranged-followup.mjs';

import { FOLLOWUP_MODELS as ACCEPTED_A4 } from './variants-accepted-a4-followup.mjs';
import { FOLLOWUP_MODELS as ACCEPTED_BRUSH_SLOSHER } from './variants-accepted-brush-slosher-followup.mjs';

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
// Alternate appearance IDs never enter the gameplay catalogue. Only implemented
// rows are selectable; retain base IDs for direct family animation table lookups.
const VARIANTS = new Map();
for (const group of [SHOOTER_VARIANTS, MELEE_VARIANTS, RANGED_VARIANTS]) {
  for (const [id, spec] of Object.entries(group)) {
    if (SPECS.has(id) || VARIANTS.has(id)) throw new Error(`Duplicate weapon appearance ${id}`);
    const base = SPECS.get(spec.baseId);
    if (!base || typeof spec.build !== 'function' || spec.sourceRow !== id) throw new Error(`Invalid weapon appearance ${id}`);
    VARIANTS.set(id, Object.freeze({ ...spec, id, family: base.family, modelKind: base.modelKind }));
  }
}
const VARIANT_SPECS = new Map(), VARIANT_KITS = new Map(), VARIANT_KEYS = new Map();
const KITS_BY_ROW = new Map(ALTERNATE_WEAPON_KITS.map(kit => [kit.main, kit]));
for (const mod of [BULBZ_VARIANTS, SQUIFFER_VARIANTS, NOCT_VARIANTS, MILK_VARIANTS, SORELLA_VARIANTS, EXPLOSHER_VARIANTS, SECOND_BRELLA, SECOND_REEF, SECOND_INKLINE, SECOND_WELLSTRING, SECOND_C, THIRD_SHOOTERS, THIRD_NEO, THIRD_CHARCOAL, THIRD_NOUVEAU, THIRD_RUST, THIRD_STICKERZ, THIRD_C, FOURTH_NOZZLE, FOURTH_DUALIE_FIXED, FOURTH_BLASTER_FIXED, FOURTH_DUALIE_LIGHT, FOURTH_BLASTER_DECO, FIFTH_CHARGERS, NEXT_C, ACCEPTED_SPINNER, ACCEPTED_SHOOTER, ACCEPTED_RANGED, ACCEPTED_HEAVY02, MINI_VARIANTS, ACCEPTED_MANUAL_THREE, ACCEPTED_BRUSH_SLOSHER, ACCEPTED_A4, LUNA_VARIANTS, ACCEPTED_CARBON, ACCEPTED_LIGHTLONG]) {
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
const baseWeaponId = id => weaponBaseModelId(id);
const ownSpec = key => VARIANTS.get(variantKey(key) ?? key) ?? SPECS.get(baseWeaponId(key));
/** Explicit variant source-row keys; registeredWeaponModels remains the main-model list. */
export function registeredWeaponVariantModels() { return [...VARIANT_SPECS.keys()]; }

for (const [id, spec] of VARIANT_SPECS) VARIANTS.set(id, spec);

const KIT_ROWS = new Map(ALTERNATE_WEAPON_KITS.map(kit => [kit.id, kit.main]));
export function weaponBaseModelId(id) { return VARIANTS.get(id)?.baseId ?? VARIANT_BASE_WEAPON[id] ?? id; }
/** Official kit appearance, independently of the device-local override. */
export function weaponDefaultAppearance(id) {
  const base = weaponBaseModelId(id), row = KIT_ROWS.get(id);
  return VARIANT_SPECS.get(row)?.baseId === base ? row : weaponModelKey(base);
}
export function weaponVariantSpec(id) { return VARIANTS.get(id) ?? null; }
export function registeredWeaponVariants(baseId) {
  return [...VARIANTS.keys()].filter(id => baseId === undefined || VARIANTS.get(id).baseId === weaponBaseModelId(baseId));
}
export function weaponAppearanceKey(baseId, variantId) {
  baseId = weaponBaseModelId(baseId);
  return VARIANTS.get(variantId)?.baseId === baseId ? variantId : weaponModelKey(baseId);
}
/** Family-level pose layer (brush / splatana / brella / stringer …): fn(character, dt, animState). */
export function weaponFamilyPose(id) { return FAMILY_POSE.get(weaponBehaviorFamily(id)) ?? null; }
/** Family one-shot handler: fn(character, name, arg) → true when it replaces the native one-shot
 *  (e.g. a Brush swing instead of the Roller flick, a Splatana slash instead of Shooter recoil). */
export function weaponFamilyTrigger(id) { return FAMILY_TRIGGER.get(weaponBehaviorFamily(id)) ?? null; }

/** Native visual family (HOLD key / part channels) for a weapon ID or family kind. */
export function weaponModelFamily(id) { return RECORDS.get(weaponBaseModelId(id))?.modelKind ?? id; }
/** Catalogue behaviour family (brush, brella, stringer, splatana …) for a weapon ID. */
export function weaponBehaviorFamily(id) { return RECORDS.get(weaponBaseModelId(id))?.family ?? id; }
/** Cache key for getWeaponDef: the weapon ID when it owns a model, else its shared family model. */
export function weaponModelKey(id) { const selected = variantKey(id); if (selected) return selected; const base = weaponBaseModelId(id); return VARIANTS.has(id) ? id : SPECS.has(base) ? base : weaponModelFamily(base); }
export function weaponModelSpec(id) { return ownSpec(id) ?? null; }
export function registeredWeaponModels() { return [...SPECS.keys()]; }

/** Apply the weapon's own model to a freshly built family def (before finishParts). */
export function buildWeaponModel(key, base) {
  const spec = ownSpec(key);
  if (!spec) return base;
  const family = base.kind;
  const d = spec.build(base) || base;
  const baseId = weaponBaseModelId(key);
  d.kind = family; d.modelId = baseId; d.referenceWeapon = RECORDS.get(baseId).names.en;
  const selected = variantKey(key) ?? (VARIANTS.has(key) ? key : null);
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
  key = weaponBaseModelId(key);
  const spec = SPECS.get(key);
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
  return !!id && (NATIVE_CARRY.has(weaponBehaviorFamily(id)) || !!SPECS.get(weaponBaseModelId(id))?.nativeCarry);
}
