import { catalogChargeStage } from './catalog-charge-stages.mjs';
const INSTALLED=Symbol.for('inkwave.stringer-charge-hud.v1');
const unit=n=>Math.max(0,Math.min(1,n));

// Keep the native Charger circle and track geometry. A Stringer fills that
// same circle twice, using its actual first/full clocks. Its native track and
// arc styling remain authoritative; completing a lap adds no persistent color.
// This is stage feedback, not an asserted Nintendo layout or pixel replica.
export function updateStringerChargeHud(hud, weapon, charge) {
  const phase=catalogChargeStage(weapon, charge), old=hud._stringerChargeHud;
  if (!phase) {
    if (old) {
      hud.ret.classList.remove('iw-ret--stringer-charge');
      delete hud.ret.dataset.chargeStage;
      hud._stringerChargeHud=null;
    }
    return;
  }
  const circle=hud._chargeEl, track=hud.ret.querySelector('.iw-ret__track');
  if (!circle || !track) return;
  let state=old;
  if (!state || state.circle!==circle || state.track!==track) {
    state=hud._stringerChargeHud={circle,track,stage:0};
    hud.ret.classList.add('iw-ret--stringer-charge');
  }
  // Native code writes total-charge progress. Present the current lap without
  // changing the gameplay coordinate, scope, guides or circle dimensions.
  const offset=(hud._chargeC*(1-unit(phase.progress))).toFixed(2);
  if(circle.style.strokeDashoffset!==offset)circle.style.strokeDashoffset=offset;
  if(state.stage!==phase.stage){
    if(phase.stage===1&&state.stage===0)hud._restart?.(hud.ret,'is-flash');
    state.stage=phase.stage;
  }
  hud.ret.dataset.chargeStage=phase.stage===0?'first':phase.stage===1?'second':'full';
  hud.ret.classList.toggle('is-full',phase.stage===2);
}

export function installStringerChargeHud(HUD, weapons) {
  const P=HUD.prototype;
  if(Object.hasOwn(P,INSTALLED))return;
  Object.defineProperty(P,INSTALLED,{value:true});
  const native=P._updCrosshair;
  P._updCrosshair=function(frame,dt){
    const result=native.call(this,frame,dt);
    updateStringerChargeHud(this,weapons[frame.weapon],frame.charge);
    return result;
  };
}
