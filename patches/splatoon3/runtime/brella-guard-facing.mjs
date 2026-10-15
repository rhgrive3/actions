// The three reviewed held shields keep aim-facing after the shot pose expires.
// Read-only admission: no firing/resource clocks, shield state or yaw are written.
export function heldBrellaGuardFacing(a) {
  const id = a?.weaponId;
  if (id !== 's3-shelter-normal' && id !== 's3-shelter-wide' && id !== 's3-shelter-focus') return false;
  if (a.alive !== true || a.remote || a.form !== 'kid' || a.specialActive || a.superJumpState) return false;
  const r = a.weaponRunner, s = r?.catalogState, c = s?.canopy;
  if (a.intent?.sub || r?.aimingSub || s?.id !== id) return false;
  return !!c && c.launched === false && c.hp > 0 &&
    (c.open === true || (c.preparing === true && a.intent?.fire === true && s.pressed === true));
}
