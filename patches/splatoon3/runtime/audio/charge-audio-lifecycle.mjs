// Own compound/pending charge handles as well as their admitted mixer voices.
// stopAll must invalidate a cold request before its Promise can start a voice.
const owners = new WeakMap();
const confirmations = new WeakMap();
const INSTALLED = Symbol.for('inkwave.charge-audio-lifecycle.v1');
export const QUIET_CHARGE = Object.freeze({playing:false,set(){},stop(){}});
export function trackChargeHandle(engine, handle, priority=64) {
  let rows=owners.get(engine);
  if(!rows){rows=new Map();owners.set(engine,rows);}
  if(rows.size>=24){
    let victim=null,score=Infinity;
    for(const [h,p] of rows)if(p<score){victim=h;score=p;}
    if(score>priority){handle.stop(.02);return ()=>{};}
    victim?.stop(.02);
  }
  rows.set(handle,priority);
  return ()=>{rows.delete(handle);if(!rows.size)owners.delete(engine);};
}
export function stopChargeHandles(engine, fade=.04) {
  const rows=owners.get(engine);if(!rows)return;
  // handle.stop() deletes its own entry; live Map iteration is safe here.
  for(const handle of rows.keys())handle.stop(fade);
  owners.delete(engine);
}
export function installChargeAudioLifecycle(Engine) {
  const p=Engine.prototype;if(Object.hasOwn(p,INSTALLED))return;
  Object.defineProperty(p,INSTALLED,{value:true});
  const stop=p.stopAll;
  p.stopAll=function(fade=.1){stopChargeHandles(this,fade);return stop?.call(this,fade);};
}
export function prewarmChargeCue(engine) {
  engine.prepareChargeConfirmation?.()?.catch?.(()=>{});
}
export function playChargeCue(engine, actor, pos, volume, stage, delay=0) {
  const ctx=engine.ctx,now=ctx?.currentTime;
  let voices=ctx&&confirmations.get(ctx);
  if(ctx&&!voices){voices=new WeakMap();confirmations.set(ctx,voices);}
  const keyed=actor&&(typeof actor==='object'||typeof actor==='function');
  const previous=keyed&&voices?.get(actor);
  // Multiple fixed ticks may share a single audio time after a slow frame.
  // Do not layer an obsolete first-stage beep over the full confirmation.
  if(stage===2&&previous?.stage===1&&now>=previous.at&&now-previous.at<1/60)
    previous.voice?.v?.kill?.(now+.003);
  const voice=engine.play?.('charge:confirmation',{
    actor,pos:actor?.isLocal?undefined:pos,
    volume:volume*(stage===1?.55:.8),pitch:stage===1?1:1.15,delay,
    priority:actor?.isLocal?93:62,
  });
  if(keyed&&voices)voices.set(actor,{voice,stage,at:now});
  return voice;
}
export function chargeFraction(weapon, family='splatling') {
  const params=family==='stringer'
    ?weapon?.catalogRecord?.parameters?.spl__WeaponStringerParam?.ChargeParam
    :weapon?.catalogRecord?.parameters?.WeaponParam;
  const first=family==='stringer'?params?.ChargeFrameMidCharge:params?.ChargeFrame_First;
  const full=family==='stringer'?params?.ChargeFrameFullCharge:params?.ChargeFrame_Second;
  return Number.isFinite(first)&&Number.isFinite(full)&&first>0&&full>first?first/full:2/3;
}
export const boundedCharge = value => Number.isFinite(value)?Math.max(0,Math.min(1,value)):0;
export const chargeStage = (q,first) => q>=1?2:q+1e-6>=first?1:0;
