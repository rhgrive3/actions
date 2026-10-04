// One shared registry feeds menus, actor-local gear copies, bots and HUD.
// Verified base rows: Leanny/splat3@7280ff9c, data/mush/1130/WeaponInfoMain.json.
// Mechanics retain their separately declared calibrations; this maps kit identity.
export const VERIFIED_KITS = Object.freeze({
  shooter: Object.freeze({ main: 'Shooter_Normal_00', sub: 'suction', special: 'trizooka', specialCost: 200 }),
  roller: Object.freeze({ main: 'Roller_Normal_00', sub: 'curling', special: 'bubbler', specialCost: 180 }),
  charger: Object.freeze({ main: 'Charger_Normal_00', sub: 'bomb', special: 'inkVac', specialCost: 190 }),
});
export function selectedSub(actorOrWeapon, SUB) {
  const w = actorOrWeapon?.weapon || actorOrWeapon;
  const sub = SUB[w?.sub || 'bomb'];
  if (!sub) throw new Error(`Unregistered sub ${w?.sub}`);
  return sub;
}
export function selectedSubCost(actor, SUB) {
  const sub = selectedSub(actor, SUB);
  const base = sub.inkCost ?? sub.inkCostFallback;
  if (!Number.isFinite(base) || base < 0) throw new Error(`Unresolved sub cost ${sub.id}`);
  return base * (actor?.s3?.modifiers?.inkSaverSub ?? 1);
}
export function composeKits({ WEAPONS, SUB, SPECIALS }) {
  // Validate the complete set before any assignment; partial registration fails closed.
  for (const [main, kit] of Object.entries(VERIFIED_KITS)) {
    if (!WEAPONS[main] || !SUB[kit.sub] || !SPECIALS[kit.special])
      throw new Error(`Kit registration incomplete: ${main}/${kit.sub}/${kit.special}`);
    const cost = SUB[kit.sub].inkCost ?? SUB[kit.sub].inkCostFallback;
    if (!Number.isFinite(cost)) throw new Error(`Kit cost unresolved: ${kit.sub}`);
  }
  for (const [main, w] of Object.entries(WEAPONS)) {
    const kit = VERIFIED_KITS[main];
    if (kit) Object.assign(w, { sub: kit.sub, special: kit.special, specialCost: kit.specialCost,
      kitReference: kit.main, kitStatus: 'verified-base-kit' });
    else Object.assign(w, { kitReference: null, kitStatus: 'original-inkwave-kit' });
  }
  return WEAPONS;
}
