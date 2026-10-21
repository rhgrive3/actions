// Research-only contract. Not imported by the production game.
// Source: Leanny/splat3@7280ff9cde8bb1c5dcef46c700c326471584d2e6,
// data/parameter/1130/weapon/WeaponSpCastle.game__GameParameterTable.json.
// No base force, blast scaling, charge interpolation or movement integrator is inferred.
export const KRAKEN_KNOCKBACK_RECORD = Object.freeze({
  standard:3,chargeStart:3,chargeEnd:1,chargeEndFrame:30,dash:0
});
export function knownKrakenKnockbackFactor(phase,chargeFrames=0){
  if(phase==='active')return KRAKEN_KNOCKBACK_RECORD.standard;
  if(phase==='dash')return KRAKEN_KNOCKBACK_RECORD.dash;
  if(phase!=='charge'||!Number.isFinite(chargeFrames)||chargeFrames<0)return null;
  if(chargeFrames===0)return KRAKEN_KNOCKBACK_RECORD.chargeStart;
  if(chargeFrames>=KRAKEN_KNOCKBACK_RECORD.chargeEndFrame)return KRAKEN_KNOCKBACK_RECORD.chargeEnd;
  return null; // Public endpoint values do not establish the interpolation law.
}
