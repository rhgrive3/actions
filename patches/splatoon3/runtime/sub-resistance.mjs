// The bomb band is classified before networking/armor, but only the victim's
// authoritative Actor applies equipment. A near hit is never inferred from
// its already armor-reduced amount. Native damage events retain cause 'bomb'.
export function finalSubResistanceDamage(victim, amount) {
  if (!victim.s3SubResistanceHit || victim[Symbol.for('inkwave.s3.final-damage.v1')]) return amount;
  // PR321 owns this final boundary when present. Standalone main only rounds
  // this newly modified sub hit, after all defensive multipliers/armor.
  return Math.floor(Math.max(0, amount) * 10 + 1e-9) / 10;
}
export function subResistanceEligible(amount, source) {
  const bomb = source === 'bomb' || source === 'splat-bomb-far';
  return bomb && amount < 100;
}
export function installSubResistance({ Actor }) {
  const damage = Actor.prototype.damage;
  Actor.prototype.damage = function (amount, attacker, source = 'weapon') {
    // #1073: kit composition can resolve Suction/Curling damage from their own
    // bands while an older source tag still reflects Splat Bomb's 3.6 radius.
    // Classify at the victim-authoritative pre-armor damage boundary instead:
    // S3 Sub Resistance applies to eligible sub blasts below 100 damage only.
    const bomb = source === 'bomb' || source === 'splat-bomb-far';
    const weak = subResistanceEligible(amount, source), previous = this.s3SubResistanceHit;
    this.s3SubResistanceHit = weak;
    if (weak) amount *= this.s3?.modifiers?.subResistance ?? 1;
    try { return damage.call(this, amount, attacker, bomb ? 'bomb' : source); }
    finally { this.s3SubResistanceHit = previous; }
  };
}
