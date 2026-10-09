const EPS = 1e-10;
const INSTALLED = Symbol.for('inkwave.issue-five.hotfix-c');

export function installIssueFiveHotfixC({ PLAYER, WeaponRunner }) {
  const wr = WeaponRunner.prototype;
  if (wr[INSTALLED]) return;
  Object.defineProperty(wr, INSTALLED, { value: true });

  const charger = wr._charger;
  wr._charger = function (dt, input, w) {
    const a = this.a;
    if (w.kind !== 'charger' || !a.grounded || !input?.fire || this.cooldown > 0)
      return charger.call(this, dt, input, w);

    const funded = (this.s3ChargerSpent || 0) + a.ink;
    const min = w.inkMin ?? 0, full = w.inkFull ?? Infinity;
    // #1038 only fills the missing interval: below inkMin the existing runtime
    // already selects emptyChargeRate; at/above inkFull normal speed remains.
    if (funded + EPS < min || funded + EPS >= full)
      return charger.call(this, dt, input, w);

    const rate = w.emptyChargeRate ?? 1 / 3;
    const held = !!a.intent?.fire;
    if (this.charging) {
      const heldBefore = this.s3ChargerHeldTime || 0;
      const result = charger.call(this, dt * rate, input, w);
      // Charge progression is slowed, but real held time still advances at 60Hz.
      if (held && this.charging) this.s3ChargerHeldTime = heldBefore + dt;
      return result;
    }

    // The fresh-start owner consumes its 1F gate and may enter charging in the
    // same call. Let that real-time gate run normally, then reduce only the first
    // charge/payment step to the sourced insufficient-ink rate.
    const beforeT = this.chargeT || 0;
    const beforeSpent = this.s3ChargerSpent || 0;
    const result = charger.call(this, dt, input, w);
    const afterT = this.chargeT || 0;
    if (!this.charging || afterT <= beforeT + EPS) return result;

    const advance = afterT - beforeT;
    const desiredAdvance = advance * rate;
    this.chargeT = beforeT + desiredAdvance;
    // The first active step is in the native linear <20% segment.
    if (advance > EPS) this.charge *= desiredAdvance / advance;

    const paid = Math.max(0, (this.s3ChargerSpent || 0) - beforeSpent);
    const desiredPaid = paid * rate;
    const refund = paid - desiredPaid;
    if (refund > EPS) {
      a.ink = Math.min(PLAYER.inkMax, a.ink + refund);
      this.s3ChargerSpent = beforeSpent + desiredPaid;
    }
    return result;
  };
}
