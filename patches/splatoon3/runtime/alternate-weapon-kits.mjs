// Data-only playable Splatoon 3 alternate weapon kits (Ver.11.3.0).
// Do not create alternate meshes: every variant deliberately shares its base
// weapon's gameplay configuration, procedural model, animation and caches.
import { ALTERNATE_WEAPON_KITS } from './alternate-weapon-kits-data.mjs';

export function registerAlternateWeaponKits({ WEAPONS, WEAPON_ORDER, SUB, SPECIALS, LANG }) {
  const groups = new Map(), ids = new Set(WEAPON_ORDER);
  // Fail before changing any live registry, including the weapon order.
  for (const kit of ALTERNATE_WEAPON_KITS) {
    if (!WEAPONS[kit.baseId] || !ids.has(kit.baseId))
      throw new Error('Alternate kit has no registered base: ' + kit.main);
    if (WEAPONS[kit.id] || ids.has(kit.id))
      throw new Error('Duplicate alternate weapon: ' + kit.id);
    if (!SUB[kit.sub] || !SPECIALS[kit.special] || !Number.isInteger(kit.specialCost))
      throw new Error('Unresolved alternate kit slots: ' + kit.main);
    if (!groups.has(kit.baseId)) groups.set(kit.baseId, []);
    groups.get(kit.baseId).push(kit);
    ids.add(kit.id);
  }
  const lang = LANG === 'ja' ? 'ja' : 'en';
  for (const kit of ALTERNATE_WEAPON_KITS) {
    const base = WEAPONS[kit.baseId];
    // Inherit the exact source actor, movement, projectile logic, and source
    // record. Only the displayed identity and the sourced kit slots differ.
    WEAPONS[kit.id] = {
      ...base,
      id: kit.id,
      variantOf: kit.baseId,
      variantIndex: Number(kit.main.slice(-2)),
      variantVisualStatus: 'shared-base-model',
      name: kit.names[lang],
      referenceNames: kit.names,
      sourceRow: kit.main,
      main: kit.main,
      sub: kit.sub,
      special: kit.special,
      specialCost: kit.specialCost,
      kitReference: kit.main,
      kitStatus: 'verified-variant-kit',
      kitVerifiedSlots: ['sub', 'special'],
      kitMissingSlots: {},
      blurb: base.blurb,
    };
  }
  // Keep every established base ID in relative order, with its variants
  // directly adjacent. Existing IDs and online packet shape do not change.
  for (const [baseId, kits] of groups) {
    const at = WEAPON_ORDER.indexOf(baseId);
    WEAPON_ORDER.splice(at + 1, 0, ...kits.sort((a, b) =>
      Number(a.main.slice(-2)) - Number(b.main.slice(-2))).map(kit => kit.id));
  }
  return ALTERNATE_WEAPON_KITS.length;
}
