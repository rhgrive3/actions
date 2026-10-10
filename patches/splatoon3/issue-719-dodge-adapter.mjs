// #719: a Splat Dualies dodge roll may start while airborne.
// WeaponRunner.tryDodge already owns the weapon, fire, direction, roll-count and
// ink admission. The only blocker on main was the Actor's unconditional grounded
// gate. The admitted airborne roll keeps its single authoritative dodge token
// (airborne = true, for presentation) and starts the descent with INKWAVE's own
// gravity and max-fall. The Splatoon 3 airborne vertical velocity/acceleration
// is not pinned (未確認), so no Nintendo vertical constant is encoded here.
// A jump inside the coyote window after leaving a ledge keeps the ordinary jump.
export function adaptIssue719Dodge(rel, code, replaceOnce) {
  if (rel !== 'src/game/actor.js') return code;
  return replaceOnce(code,
    '    if (this.jumpBuffer > 0 && !isSquid && this.grounded && this.weaponRunner.tryDodge?.(this.intent.move)) this.jumpBuffer = 0;',
    `    // #719: airborne admission only outside the coyote window (an ordinary coyote jump keeps priority).
    if (this.jumpBuffer > 0 && !isSquid && !this.climbing && (this.grounded || this.coyote <= 0) && this.weaponRunner.tryDodge?.(this.intent.move)) {
      if (!this.grounded && this.weaponRunner.dodge) {
        this.weaponRunner.dodge.airborne = true;
        this.vel.y = Math.max(-P.maxFall, Math.min(this.vel.y, -P.gravity * this.weapon.rollTime));
      }
      this.jumpBuffer = 0;
    }`,
    'issue719 airborne Dualies dodge admission');
}
