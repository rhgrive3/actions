// #403 collision ownership moved to the canonical continuous fidelity solver.
// Its raw Shooter .285 / Heavy .225 radii retain the sourced relative ratio;
// no old world-scale snapshot overrides that owner. #470 charge walking remains.
export function installSplatlingRadiusCharge({ WeaponRunner }) {
  const moveSpeed = WeaponRunner.prototype.moveSpeed;
  WeaponRunner.prototype.moveSpeed = function () {
    const w = this.a.weapon;
    // Match upstream lock priority, then select a state target. Actor's existing
    // acceleration/deceleration approaches it; no velocity snap is introduced.
    if (this.lockT <= 0 && this.charging && w.kind === 'splatling') return w.moveSpeedCharging;
    return moveSpeed.call(this);
  };
}
