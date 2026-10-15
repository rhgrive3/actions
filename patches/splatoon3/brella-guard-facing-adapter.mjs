// Build-only, after movement physics has installed authoritative roller heading.
export function adaptBrellaGuardFacing(rel, code, replaceOnce) {
  if (rel !== 'src/game/actor.js') return code;
  code = replaceOnce(code,
    '    } else if (this.weaponRunner.firingPose() || this.fireFacing > 0 || this.intent.sub) {',
    '    } else if (this.weaponRunner.firingPose() || this.fireFacing > 0 || this.intent.sub || heldBrellaGuardFacing(this)) {',
    'selected live Brella guard aim-facing');
  return "import { heldBrellaGuardFacing } from '../../patches/splatoon3/runtime/brella-guard-facing.mjs';\n" + code;
}
