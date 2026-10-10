const INSTALLED = Symbol.for('inkwave.issue-five.hotfix-a');

export function installIssueFiveHotfixA({ Actor, PLAYER, SUB }, profile) {
  if (Actor.prototype[INSTALLED]) return;
  Object.defineProperty(Actor.prototype, INSTALLED, { value: true });

  // #1064: Suction and Curling both use the verified level-2 Ink Saver (Sub)
  // curve. Keep it per-sub; do not turn this into a universal fallback.
  const curve = profile?.bomb?.inkSaverCurve;
  if (Array.isArray(curve) && curve.length === 3 && curve.every(Number.isFinite)) {
    for (const id of ['suction', 'curling']) if (SUB[id]) SUB[id].inkSaverCurve = [...curve];
  }

  // #1061: ordinary airborne acceleration/braking uses the same S3 baseline
  // as ordinary grounded movement. Action-specific air states remain untouched.
  const horizontal = Actor.prototype._horizontal;
  Actor.prototype._horizontal = function (...args) {
    const r = this.weaponRunner;
    const ordinaryAir = !this.grounded && !this.specialActive && !this.superJumpState &&
      !this.s3?.roll && !this.s3?.surge && !r?.dodge &&
      !r?.busy?.() && !r?.firingPose?.() && !r?.aimingSub && !this.intent?.sub;
    if (!ordinaryAir) return horizontal.apply(this, args);
    const before = PLAYER.airAccel;
    PLAYER.airAccel = PLAYER.s3GroundAccel ?? 36;
    try { return horizontal.apply(this, args); }
    finally { PLAYER.airAccel = before; }
  };
}
