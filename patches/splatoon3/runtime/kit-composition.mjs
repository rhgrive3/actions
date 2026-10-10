// One shared registry feeds menus, actor-local gear copies, bots and HUD.
// Verified base rows: Leanny/splat3@7280ff9c, data/mush/1130/WeaponInfoMain.json.
// Mechanics retain their separately declared calibrations; this maps kit identity.
// PR1188: Splattershot is 200p in 11.3.0. Ver.7.2.0 raised it 200 -> 210 but
// Ver.11.1.0 (official notes) lowered it 210 -> 200 again; the pinned 1110 and
// 1130 WeaponInfoMain rows agree. #1132 had stopped at 7.2.0.
export const VERIFIED_KITS = Object.freeze({
  shooter: Object.freeze({ main: 'Shooter_Normal_00', sub: 'suction', special: 'trizooka', specialCost: 200 }),
  roller: Object.freeze({ main: 'Roller_Normal_00', sub: 'curling', special: 'bubbler', specialCost: 180 }),
  charger: Object.freeze({ main: 'Charger_Normal_00', sub: 'bomb', special: 'inkVac', specialCost: 190 }),
});
// PR1188: kits whose 11.3.0 sub or special already has implemented INKWAVE
// mechanics take that verified slot; the other slot (whose mechanic is not
// implemented: Autobomb, Sprinkler, Wave Breaker, Crab Tank, Triple Inkstrike)
// stays the original INKWAVE one and is labelled. A special cost belongs to the
// special it charges, so it is only adopted together with a verified special.
export const PARTIAL_KITS = Object.freeze({
  blaster: Object.freeze({ main: 'Blaster_Middle_00', sub: 'autobomb', special: 'bubbler',
    specialCost: 190, missing: Object.freeze({}) }),
  dualies: Object.freeze({ main: 'Maneuver_Normal_00', sub: 'suction',
    missing: Object.freeze({ special: 'SpChariot (Crab Tank)', specialCost: 200 }) }),
  slosher: Object.freeze({ main: 'Slosher_Strong_00', sub: 'bomb',
    missing: Object.freeze({ special: 'SpTripleTornado (Triple Inkstrike)', specialCost: 220 }) }),
  splatling: Object.freeze({ main: 'Spinner_Standard_00', sub: 'sprinkler',
    missing: Object.freeze({ special: 'SpShockSonar (Wave Breaker)', specialCost: 210 }) }),
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
  for (const [main, partial] of Object.entries(PARTIAL_KITS)) {
    if (!WEAPONS[main]) continue;
    if ((partial.sub && !SUB[partial.sub]) || (partial.special && !SPECIALS[partial.special]))
      throw new Error(`Kit registration incomplete: ${main}/${partial.sub || '-'}/${partial.special || '-'}`);
  }
  for (const [main, w] of Object.entries(WEAPONS)) {
    const kit = VERIFIED_KITS[main], partial = PARTIAL_KITS[main];
    if (kit) Object.assign(w, { sub: kit.sub, special: kit.special, specialCost: kit.specialCost,
      kitReference: kit.main, kitStatus: 'verified-base-kit' });
    else if (partial && (partial.sub || partial.special)) {
      if (partial.sub) w.sub = partial.sub;
      if (partial.special) Object.assign(w, { special: partial.special, specialCost: partial.specialCost });
      const verified = [partial.sub && 'sub', partial.special && 'special'].filter(Boolean);
      Object.assign(w, { kitReference: partial.main, kitStatus: 'partial-verified-kit', kitVerifiedSlots: verified,
        kitMissing: partial.missing });
      const unsupplied = Object.entries(partial.missing).filter(([key]) => key !== 'specialCost');
      const label = unsupplied.length
        ? `Partial Splatoon 3 kit: ${verified.join(' and ')} verified; ${unsupplied.map(([key]) => key).join(' and ')} original INKWAVE (${unsupplied.map(([, value]) => value).join(', ')} not implemented).`
        : '11.3.0 kit slots installed; certain mechanics retain explicit source-calibration limits.';
      if (!w.blurb?.includes('Partial Splatoon 3 kit')) w.blurb = `${w.blurb || ''} ${label}`.trim();
    } else {
      Object.assign(w, { kitReference: null, kitStatus: 'original-inkwave-kit' });
      const label = 'Original INKWAVE kit (not a verified Splatoon 3 kit).';
      if (!w.blurb?.includes(label)) w.blurb = `${w.blurb || ''} ${label}`.trim();
    }
  }
  return WEAPONS;
}

const icon = body => `<svg class="iw-ico" viewBox="0 0 64 64" aria-hidden="true"><g fill="currentColor" stroke="#15121c" stroke-width="3" stroke-linejoin="round">${body}</g></svg>`;
const subIcons = {
  suction: icon('<ellipse cx="32" cy="49" rx="23" ry="8"/><path d="M18 43V26Q18 12 32 12Q46 12 46 26V43Z"/><rect x="27" y="5" width="10" height="12" rx="3"/>'),
  curling: icon('<ellipse cx="32" cy="40" rx="24" ry="12"/><path d="M10 40V47Q32 61 54 47V40Z"/><path d="M24 29V15H42V22H32V29Z"/>'),
  sprinkler: icon('<path d="M28 8H36V29H28Z"/><circle cx="32" cy="35" r="12"/><path d="M20 33L6 20M44 33L58 20M32 48V60"/>'),
  autobomb: icon('<rect x="18" y="14" width="28" height="30" rx="6"/><circle cx="27" cy="26" r="3"/><circle cx="38" cy="26" r="3"/><path d="M21 44L15 57M43 44L49 57"/>'),
};
const specialMetadata = {
  trizooka: { name:'Trizooka', blurb:'Fire up to three volleys of spiraling ink projectiles.',
    icon:icon('<path d="M8 20H44V40H8Z"/><ellipse cx="45" cy="30" rx="11" ry="12"/><path d="M15 40L12 55H24L28 40Z"/><circle cx="45" cy="30" r="5" fill="#fff"/>') },
  bubbler: { name:'Big Bubbler', blurb:'Deploy a stationary shield. Enemies may enter; the exposed emitter can be destroyed.',
    icon:icon('<path d="M5 52A27 27 0 0 1 59 52Z" fill="none"/><path d="M30 52V15H34V52Z"/><ellipse cx="32" cy="13" rx="10" ry="6"/><ellipse cx="32" cy="52" rx="14" ry="5"/>') },
  inkVac: { name:'Ink Vac', blurb:'Absorb incoming enemy shots, then fire a charge-scaled countershot.',
    icon:icon('<path d="M36 15H54V44H36Z"/><path d="M36 23H22L7 13V47L22 36H36Z"/><path d="M43 44L40 57H50L53 44Z"/><path d="M13 25H28M13 34H28" fill="none"/>') },
};
export function registerKitMetadata({ SUB, SPECIALS, SUB_ICONS, SPECIAL_ICONS }) {
  for (const id of ['suction','curling']) if (!SUB[id]) throw new Error(`Sub mechanics not registered: ${id}`);
  for (const id of Object.keys(specialMetadata))
    if (!SPECIALS[id]) throw new Error(`Special mechanics not registered: ${id}`);
  for (const [id, metadata] of Object.entries(specialMetadata)) {
    const { icon: svg, ...text } = metadata;
    SPECIALS[id] = { ...SPECIALS[id], id, ...text };
    if (SPECIAL_ICONS) SPECIAL_ICONS[id] = svg;
  }
  if (SUB_ICONS) Object.assign(SUB_ICONS, subIcons);
}
