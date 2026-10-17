import { turfCombatAllowed } from './turf-combat.mjs';
import { tacticoolerGaugeLocked } from './tacticooler-gauge.mjs';
// Head-only MinorityUp in pinned 11.3.0 GearSkillTraitsParam.
// 3.24 points/s per living-player deficit is the post-5.0.0 community
// measurement (gear/gear-power/part3); Nintendo confirms the 5.0.0 rate buff.
// This is not an extracted Nintendo scalar or a territory-paint award.
export const TENACITY_POINTS_PER_SECOND = 3.24;
export function advanceTenacity(actor, dt, api) {
  const match=api.G.match;
  if(!(dt>0)||!Number.isFinite(dt)||!actor?.alive||actor.remote||actor.specialActive||actor.stormGaugeLock>0||tacticoolerGaugeLocked(actor)||actor.s3TidalSlamGaugeFinish||
    (match?.mode==='turf'&&match[Symbol.for('inkwave.tenacity.match-owner.v1')]===true)||
    actor.s3?.loadout?.[0]?.main!=='tenacity'||!match||match.attract||match.paused||match.bossMode||match.range||match.opts?.range||
    !match.playing?.()||!turfCombatAllowed(api.G))return 0;
  const roster=match.actors||api.G.actors;
  if(!Array.isArray(roster)||!roster.includes(actor))return 0;
  let own=0,enemy=0;
  for(const a of roster){if(!a?.alive||a.s3Disconnected)continue;if(a.team===actor.team)own++;else if(a.team===0||a.team===1)enemy++;}
  const deficit=Math.max(0,enemy-own);
  if(!deficit)return 0;
  const charge=actor.s3?.modifiers?.specialCharge??1,cap=actor.specialCost();
  if(!(charge>0)||!(cap>0))return 0;
  const before=actor.special,ready=actor.specialReady();
  // This engine stores SCU as a reduced cost. Divide passive points by that
  // same multiplier so SCU cannot amplify Tenacity's fraction of the gauge.
  actor.special=Math.min(cap,before+TENACITY_POINTS_PER_SECOND*deficit*dt/charge);
  if(!ready&&actor.specialReady())api.emit('special:ready',{actor});
  return actor.special-before;
}
