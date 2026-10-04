// #403 fixes only the sourced relative collider size; absolute world scale is
// explicitly provisional. Visual size, field sweep and paint remain independent.
export const playerCollisionRadius = p => p.s3PlayerRadius ?? p.size;

export function installSplatlingRadiusCharge({ Projectiles, WeaponRunner }, profile) {
  const cfg = profile.splatlingPlayerCollision;
  if (!cfg || ![cfg.referenceRadius, cfg.referenceShooterRadius, cfg.shooterWorldRadius]
    .every(value => Number.isFinite(value) && value > 0)) {
    throw new Error('Invalid Heavy Splatling player collision profile');
  }
  const shooterRadius = cfg.shooterWorldRadius;
  const splatlingRadius = shooterRadius * cfg.referenceRadius / cfg.referenceShooterRadius;
  const fresh = Projectiles.prototype._new, push = Projectiles.prototype._push;
  Projectiles.prototype._new = function (...args) {
    const p = fresh.apply(this, args);
    p.s3PlayerRadius = null;
    return p;
  };
  Projectiles.prototype._push = function (p) {
    // Ghosts bypass _push and never gain authoritative collisions. Snapshots
    // cannot change when a live actor switches weapon or charge after firing.
    const kind = p.owner?.weapon?.kind;
    if (!p.ghost && p.type === 'shot') {
      if (kind === 'shooter') p.s3PlayerRadius = shooterRadius;
      if (kind === 'splatling') p.s3PlayerRadius = splatlingRadius;
    }
    return push.call(this, p);
  };
  const moveSpeed = WeaponRunner.prototype.moveSpeed;
  WeaponRunner.prototype.moveSpeed = function () {
    const w = this.a.weapon;
    // Match upstream lock priority, then select a state target. Actor's existing
    // acceleration/deceleration approaches it; no velocity snap is introduced.
    if (this.lockT <= 0 && this.charging && w.kind === 'splatling') return w.moveSpeedCharging;
    return moveSpeed.call(this);
  };
}
