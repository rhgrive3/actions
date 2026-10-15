// Device-local visual preference; gameplay kit IDs and network packets stay intact.
import { registeredWeaponVariants, weaponAppearanceKey, weaponVariantSpec, weaponBaseModelId, weaponDefaultAppearance, weaponModelSpec } from './weapon-models/registry.mjs';
export const WEAPON_APPEARANCE_STORAGE_KEY = 'inkwave.weapon-appearances.v1';
let session = Object.create(null);
const failedWrites = new WeakMap();
function localStore() { try { return globalThis.localStorage; } catch { return null; } }
function read(storage) {
  if (!storage) return session;
  if (failedWrites.has(storage)) return failedWrites.get(storage);
  try {
    const value = JSON.parse(storage.getItem(WEAPON_APPEARANCE_STORAGE_KEY));
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  } catch { /* Corrupt/blocked storage falls back to the official kit appearance. */ }
  return Object.create(null);
}
function valid(base, value) { return value === base && !!weaponModelSpec(base) || weaponVariantSpec(value)?.baseId === base; }
/** null means no local override; an explicit base ID is a distinct preference. */
export function weaponAppearancePreference(id, storage = localStore()) {
  const base = weaponBaseModelId(id), saved = read(storage);
  return Object.hasOwn(saved, base) && valid(base, saved[base]) ? saved[base] : null;
}
export function selectedWeaponAppearance(id, storage = localStore()) {
  return weaponAppearancePreference(id, storage) ?? weaponDefaultAppearance(id);
}
export function setWeaponAppearance(id, variantId, storage = localStore()) {
  const base = weaponBaseModelId(id), next = Object.create(null);
  for (const [key, value] of Object.entries(read(storage)))
    if (key === weaponBaseModelId(key) && valid(key, value)) next[key] = value;
  if (valid(base, variantId)) next[base] = weaponAppearanceKey(base, variantId);
  else delete next[base]; // empty/invalid value resets to the official kit default
  session = next;
  try { storage?.setItem(WEAPON_APPEARANCE_STORAGE_KEY, JSON.stringify(next)); if (storage) failedWrites.delete(storage); }
  catch { if (storage && (typeof storage === 'object' || typeof storage === 'function')) failedWrites.set(storage, next); }
  return next[base] ?? weaponDefaultAppearance(id);
}
export function weaponAppearanceOptions(id) {
  const base = weaponBaseModelId(id);
  return [{ id: '', name: 'Kit default / キット標準' }, { id: base, name: 'Base / 基本モデル' },
    ...registeredWeaponVariants(base).map(key => ({ id: key, name: weaponVariantSpec(key).name }))];
}
