// Build-only, after the Brella guard branch. The composed Actor._face aim branch
// (movement-physics, then brella guard) gains the held FIRE trigger as one more
// admission, so the existing aim-facing computation is reused. Fail-closed: the
// exact composed branch must exist once.
export function adaptFireHoldFacing(rel, code, replaceOnce) {
  if (rel !== 'src/game/actor.js') return code;
  const before = '|| this.intent.sub || heldBrellaGuardFacing(this))) {';
  const after = '|| this.intent.sub || heldBrellaGuardFacing(this) || heldFireAimFacing(this, isSquid))) {';
  if (code.split(before).length !== 2)
    throw new Error('INKWAVE patch conflict (held FIRE aim-facing): expected exactly one composed Actor._face aim branch.');
  code = replaceOnce(code, before, after, 'held FIRE aim-facing');
  return "import { heldFireAimFacing } from '../../patches/splatoon3/runtime/fire-hold-facing.mjs';\n" + code;
}
