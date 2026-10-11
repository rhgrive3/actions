// Pinned 11.3.0 misc/params.json, reversed from source [high, mid, low].
export const DIRECT_SUB_RESISTANCE_CURVES = Object.freeze({
  angleShooter:Object.freeze([1,.75,.5]),
  sprinkler:Object.freeze([1,.75,.5]),
});
export const LOW_SUB_RESISTANCE_CURVE = Object.freeze([1,.75,.6]);
const LOW_SUB_CAUSES = new Set(['burst','fizzy','torpedo','torpedo-splash']);
const HIGH_SUB_CAUSES = new Set(['bomb','splat-bomb-far','inkMine']);
export function subResistanceBand(source) { return LOW_SUB_CAUSES.has(source)?'low':HIGH_SUB_CAUSES.has(source)?'high':null; }
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
  return subResistanceBand(source)!==null && amount < 100;
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
    const directKey = source === 'angleShooter' ? 'subLineMarkerResistance' : source === 'sprinkler' ? 'subSprinklerResistance' : null;
    this.s3SubResistanceHit = weak || !!directKey;
    if (weak) {
      const low=subResistanceBand(source)==='low',ratio=this.s3?.modifiers?.[low?'subResistanceLow':'subResistance'];
      amount *= Number.isFinite(ratio)&&ratio>=(low ? .6 : .5)&&ratio<=1 ? ratio : 1;
    }
    else if (directKey) {
      const ratio = this.s3?.modifiers?.[directKey];
      amount *= Number.isFinite(ratio) && ratio >= .5 && ratio <= 1 ? ratio : 1;
    }
    try { return damage.call(this, amount, attacker, bomb ? 'bomb' : source); }
    finally { this.s3SubResistanceHit = previous; }
  };
}
