import { subMarkScale } from './sub-resistance.mjs';
// Leanny 11.3.0 misc/params.json stores these as [high, mid, low].
// Raw attack duration stays on the wire; each receiver applies its victim's
// locally derived gear once, at contact, rather than trusting a multiplier.
export const SUB_MARK_RESISTANCE_CURVES = Object.freeze({
  normal: Object.freeze([1, .43, .1]),
  trap: Object.freeze([1, .55, .1]),
});
export function subMarkSeconds(victim, seconds, subId = 'pointSensor') {
  const key = subId === 'inkMine' ? 'subMineMarkResistance' : 'subMarkResistance';
  const ratio = victim?.s3?.modifiers?.[key];
  return seconds * (Number.isFinite(ratio) && ratio >= .1 && ratio <= 1 ? ratio : subMarkScale(victim,subId==='inkMine'?'trap':'normal'));
}
