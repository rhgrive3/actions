// Isolated fixes for verified residual INKWAVE issues. The source snapshot is
// upstream-locked; transform only disposable build artifacts.
export function adaptIssue10Gameplay(rel, code, once) {
  const patch = (before, after, label) => { code = once(code, before, after, 'issue10 ' + label); };
  if (rel === 'src/game/actor.js') {
    // #951: the native away-wall path is distinct from wall Squid Roll.
    // Insert inside the detach body; the later S3 adapter preserves this
    // branch while adding the wall-roll admission condition.
    patch('      this._setClimb(false);\n      this.vel.set(h.normal.x * 3.2, 3.2, h.normal.z * 3.2);',
      '      cancelSurgeOnAway(this);\n      this._setClimb(false);\n      this.vel.set(h.normal.x * 3.2, 3.2, h.normal.z * 3.2);',
      'wall away input retires Surge at ordinary detach');

    // #719: native WeaponRunner.tryDodge already validates weapon, fire, direction,
    // roll counts and ink. The Actor alone had an unconditional grounded gate.
    // On airborne admission, retain its single authoritative dodge token for
    // Dualies motion, and start descending with existing engine gravity/max-fall
    // (NOT an asserted Nintendo vertical velocity).
    patch('    if (this.jumpBuffer > 0 && !isSquid && this.grounded && this.weaponRunner.tryDodge?.(this.intent.move)) this.jumpBuffer = 0;',
      `    if (this.jumpBuffer > 0 && !isSquid && !this.climbing && this.weaponRunner.tryDodge?.(this.intent.move)) {
      if (!this.grounded && this.weaponRunner.dodge) {
        this.weaponRunner.dodge.airborne = true;
        this.vel.y = Math.max(-P.maxFall, Math.min(this.vel.y, -P.gravity * this.weapon.rollTime));
      }
      this.jumpBuffer = 0;
    }`,
      'airborne Dualies dodge action admission');
  }
  if (rel === 'src/game/actor.js') code = "import { cancelSurgeOnAway } from '../../patches/splatoon3/runtime/movement.mjs';\n" + code;
  return code;
}
