// Build-only, after movement physics has installed authoritative roller heading.
export function adaptBrellaGuardFacing(rel, code, replaceOnce) {
  if (rel !== 'src/game/actor.js') return code;
  // The movement adapter runs first. It may wrap this exact branch in the
  // source-backed reverse-shot-release guard; preserve that guard while
  // appending the Brella guard-facing admission. Both variants remain fail-closed.
  const original = '    } else if (this.weaponRunner.firingPose() || this.fireFacing > 0 || this.intent.sub) {';
  const backpedal = '    } else if (!reverseShotRelease(this) && (this.weaponRunner.firingPose() || this.fireFacing > 0 || this.intent.sub)) {';
  const hasOriginal = code.includes(original), hasBackpedal = code.includes(backpedal);
  if (Number(hasOriginal) + Number(hasBackpedal) !== 1)
    throw new Error('INKWAVE patch conflict (selected live Brella guard aim-facing): expected exactly one source branch variant.');
  code = replaceOnce(code,
    hasBackpedal ? backpedal : original,
    hasBackpedal
      ? '    } else if (!reverseShotRelease(this) && (this.weaponRunner.firingPose() || this.fireFacing > 0 || this.intent.sub || heldBrellaGuardFacing(this))) {'
      : '    } else if (this.weaponRunner.firingPose() || this.fireFacing > 0 || this.intent.sub || heldBrellaGuardFacing(this)) {',
    'selected live Brella guard aim-facing');
  return "import { heldBrellaGuardFacing } from '../../patches/splatoon3/runtime/brella-guard-facing.mjs';\n" + code;
}
