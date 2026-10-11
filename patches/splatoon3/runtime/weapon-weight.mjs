import { WEAPON_WEIGHTS } from './weapon-weight-data.mjs';
// Pinned Leanny 11.3.0 misc/params.json; source [high,mid,low] reversed.
// Existing engine uses seconds, with 60 source frames per second.
export const WEIGHT_SPEED_CURVES = Object.freeze({"Mid":{"run":[0.096,0.12,0.144],"swim":[0.192,0.216,0.24]},"Fast":{"run":[0.104,0.124,0.144],"swim":[0.2016,0.2208,0.24]},"Slow":{"run":[0.088,0.116,0.144],"swim":[0.1728,0.216,0.24]}});
export function weaponAccelerationClass(id) { return WEAPON_WEIGHTS[id]?.acceleration || 'Mid'; }
export function weaponWeight(id) { return WEAPON_WEIGHTS[id]?.speed || 'Mid'; }
export function weightSpeedCurve(id, form) { return WEIGHT_SPEED_CURVES[weaponWeight(id)][form]; }
export function resolveWeaponGearCurve(setting, stem, defaults) {
  return ['Low','Mid','High'].map((key,i)=>{
    const value=setting?.[stem+key];
    return Number.isFinite(value)&&value>=0?value:defaults[i];
  });
}
