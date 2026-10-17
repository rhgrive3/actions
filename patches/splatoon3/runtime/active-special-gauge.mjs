// S3mix, special-gauge rules: active body specials consume a constant fraction
// of their action clock; Zipcaster instead consumes its special ink reserve.
// Death stops depletion before the ordinary death penalty / Special Saver.
// Normal early completion immediately empties the remainder, and no charge
// source may refill a gauge while it is being consumed.
// https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン
// https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/ナイスダマ#z003a700
const IDS=new Set(['inkjet','booyahBomb','ultraStamp','tripleInkstrike','krakenRoyale','zipcaster','killerWail']);
const gauges=new WeakMap(),owners=new WeakMap();
const life=actor=>Math.max(Number(actor?.netLife)||0,Number(actor?.net?.lastLife)||0);
const clamp=n=>Math.min(1,Math.max(0,n));

export function activeSpecialDepletionFraction(state){
  if(!IDS.has(state?.id))return null;
  if(state.id==='zipcaster')return Number.isFinite(state.inkFuel)?clamp(state.inkFuel/150):null;
  return Number.isFinite(state.t)&&Number.isFinite(state.duration)&&state.duration>0
    ?clamp(1-state.t/state.duration):null;
}
function authoritative(actor,gauge){
  return !!gauge&&actor.alive&&!actor.remote&&actor.owner===gauge.owner&&life(actor)===gauge.life
    &&gauge.game.match===gauge.match;
}
function forget(actor,gauge){
  gauges.delete(actor);owners.get(gauge?.game)?.delete(actor);
}
export function activeSpecialGaugeState(actor){
  const gauge=gauges.get(actor);
  // The native runner temporarily masks specialActive while firing. The
  // private record and exact canonical state, rather than that token, own
  // admission during this synchronous interval.
  if(authoritative(actor,gauge)&&(gauge.jumping?!!actor.superJumpState||gauge.steppingJump:actor._s3AllSpecialState===gauge.state))return gauge;
  if(gauge)forget(actor,gauge);
  return null;
}
export const activeSpecialGaugeLocked=actor=>!!activeSpecialGaugeState(actor);
export function syncActiveSpecialGauge(actor){
  const gauge=activeSpecialGaugeState(actor);
  if(!gauge)return;
  const fraction=activeSpecialDepletionFraction(gauge.state),cost=actor.specialCost?.();
  // Temporary gear can change the engine's point denomination mid-action.
  // Retain the action fraction, just as native gear refresh already does.
  if(fraction!==null&&Number.isFinite(cost)&&cost>0)actor.special=cost*fraction;
}
export function startActiveSpecialGauge(actor,state,game){
  const total=actor.specialCost?.();
  if(!IDS.has(state?.id)||!actor.alive||actor.remote||!game||!(total>0)||!Number.isFinite(total))return;
  const gauge={state,game,match:game.match,owner:actor.owner,life:life(actor),total,jumping:false};
  gauges.set(actor,gauge);
  let list=owners.get(game);if(!list){list=new Set();owners.set(game,list);}list.add(actor);
  state.gaugeTracked=true;syncActiveSpecialGauge(actor);
}
export function endActiveSpecialGauge(actor,{preserve=false,jumping=false}={}){
  const gauge=gauges.get(actor);if(!gauge)return;
  if(jumping&&authoritative(actor,gauge)&&actor.superJumpState){gauge.jumping=true;return;}
  if(authoritative(actor,gauge)){
    const fraction=activeSpecialDepletionFraction(gauge.state),cost=actor.specialCost?.();
    actor.special=preserve&&fraction!==null&&Number.isFinite(cost)&&cost>0?cost*fraction:0;
  }
  forget(actor,gauge);
}
export function clearActiveSpecialGauges(game,retire){
  for(const actor of [...owners.get(game)||[]]){
    const gauge=activeSpecialGaugeState(actor);
    if(gauge)retire?.(actor,gauge.state);
    endActiveSpecialGauge(actor);
  }
}
