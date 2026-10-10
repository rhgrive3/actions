import { canStageSuperJumpSub, chargerPostShotBlocksSub } from './weapon-gates.mjs';
export function subThrowSpec(a, base) { return { ...base, throwSpeed: base.throwSpeed * (a.s3?.modifiers?.subPower ?? 1) }; }
export function subInkSpec(a, base) { return { ...base, inkCost: base.inkCost * (a.s3?.modifiers?.inkSaverSub ?? 1) }; }
export function selectedSubReadyCost(a, SUB) {
  const selected = SUB[a?.weapon?.sub || 'bomb'] || SUB.bomb;
  const baseCost = selected?.inkCost ?? selected?.inkCostFallback ?? SUB.bomb.inkCost;
  return baseCost * (a?.s3?.modifiers?.inkSaverSub ?? 1);
}
const EPS=1e-10;
// Captured cancellation→trajectory-start interval (v10.0.1 FC/NC table).
// Separate from emitted-shot15F and from the bomb's own preparation time.
const CHARGER_CANCEL_SUB = 5 / 60;
export function installSubReady({Actor,WeaponRunner,SUB},profile){
 const tag=Symbol.for('inkwave.s3.sub-ready.v1'),wr=WeaponRunner.prototype;
 if(wr[tag])return;Object.defineProperty(wr,tag,{value:true});
 const cancel=r=>{r.s3ClearSplatlingSubInterrupt?.();r.s3SubReady=null;r.s3SubFromSquid=false;r.aimingSub=false;};
 const cancelInput=wr.cancelPendingInput;
 wr.cancelPendingInput=function(...args){this.s3ChargerCancelSubRemaining=0;cancel(this);return cancelInput?.apply(this,args);};
 const reset=wr.reset,busy=wr.busy,update=wr.update;
 wr.reset=function(...args){this.s3ChargerCancelSubRemaining=0;cancel(this);return reset.apply(this,args);};
 wr.busy=function(){return this.s3ChargerCancelSubRemaining>EPS||!!this.s3SubReady?.pending||busy.call(this);};
 const actorUpdate=Actor.prototype.update,start=Actor.prototype._startSpecial;
 Actor.prototype.update=function(dt,...args){
  const r=this.weaponRunner;
  if(!this.alive||this.specialActive||this.superJumpState&&!canStageSuperJumpSub(this)){r.s3ChargerCancelSubRemaining=0;cancel(r);}
  else {
   if(!this.superJumpState&&!r.s3SubReady&&this.intent.sub&&this.form==='squid')r.s3SubFromSquid=true;
   if(r.s3SubReady&&this._prevIntent.sub&&!this.intent.sub){
    if(this.intent.squid)cancel(r);
    else if(!this.superJumpState)r.s3SubReady.pending=true;
   }
  }
  return actorUpdate.call(this,dt,...args);
 };
 Actor.prototype._startSpecial=function(...args){this.weaponRunner.s3ChargerCancelSubRemaining=0;cancel(this.weaponRunner);return start.apply(this,args);};
 wr.update=function(dt,input){
  const a=this.a;
  if(!a.alive||a.specialActive||a.superJumpState&&!canStageSuperJumpSub(a)){this.s3ChargerCancelSubRemaining=0;cancel(this);return update.call(this,dt,{...input,sub:false,subReleased:false});}
  if(a.superJumpState){
   // #528 may prepare/aim in humanoid descent, never release a projectile.
   // Evaluate after native trajectory advancement: a release on the actual
   // landing tick reaches the unchanged preparation + 1F use-startup below.
   // Earlier releases cancel rather than becoming deferred airborne throws.
   if(!input.sub){cancel(this);return update.call(this,dt,{...input,sub:false,subReleased:false});}
   if(input.subReleased)input={...input,subReleased:false};
  }
  this.s3ChargerCancelSubRemaining=Math.max(0,(this.s3ChargerCancelSubRemaining||0)-Math.max(0,dt));
  const splatlingSub=this.s3StepSplatlingSubInterrupt?.(dt,input);
  if(splatlingSub==='wait'){
   const next={...input,sub:false,subReleased:false};
   // Releasing ZR alongside R must not turn the still-cancelable charge into
   // a paid stream during the five-frame sub interruption window.
   if(this.charging)next.fire=true;
   return update.call(this,dt,next);
  }
  if(splatlingSub==='cancelled')return update.call(this,dt,{...input,sub:false,subReleased:false});
  if(a.weapon.kind==='charger'&&input.sub&&this.charging&&!this.s3Stored&&dt>0){
   // Use the existing main cancellation owner; paid ink is not refunded.
   this.cancelMainForSub();cancel(this);
   this.s3ChargerCancelSubRemaining=CHARGER_CANCEL_SUB;
  }
  if(this.s3ChargerCancelSubRemaining>EPS){
   cancel(this);
   return update.call(this,dt,{...input,fire:input.sub?false:input.fire,sub:false,subReleased:false});
  }
  if(chargerPostShotBlocksSub(this)){
   cancel(this);return update.call(this,dt,{...input,sub:false,subReleased:false});
  }
  // The Roller action owner discards presses/releases inside its post-flick
  // lock. Do not let the outer preparation owner retain a rejected release.
  if(a.weapon.kind==='roller'&&(this.s3FlickPostSub||0)>EPS){
   cancel(this);return update.call(this,dt,{...input,sub:false,subReleased:false});
  }
  let s=this.s3SubReady;
  if(s)s.age+=Math.max(0,dt);
  if(!s&&input.sub&&!(this.s3PostShotRemaining>EPS)){
   s=this.s3SubReady={age:0,pending:false,minimum:this.s3SubFromSquid?profile.bomb.readyTimeSquid:profile.bomb.readyTimeKid,useStartup:null};
   this.s3SubFromSquid=false;
  }
  // #1000: Curling/Suction readiness uses the equipped sub's resolved cost.
  const cost=selectedSubReadyCost(a,SUB);
  if(s&&input.subReleased){
   if(a.ink+EPS<cost){this.s3SubReady=null;s=null;}
   else s.pending=true;
  }
  let next=input;
  if(s?.pending){
   if(s.age+EPS>=s.minimum){
    // #1037: after the 5F/10F preparation owner admits release, S3 still
    // has one independent fixed use-startup frame before the bomb exists.
    if(s.useStartup===null){
     s.useStartup=1/60;
     next={...input,sub:true,subReleased:false};
    }else{
     s.useStartup=Math.max(0,s.useStartup-Math.max(0,dt));
     if(s.useStartup<=EPS){next={...input,sub:false,subReleased:true};this.s3SubReady=null;}
     else next={...input,sub:true,subReleased:false};
    }
   }else next={...input,sub:true,subReleased:false};
  }else if(s&&!input.sub&&!input.subReleased){cancel(this);s=null;}
  const result=update.call(this,dt,next);
  // A main shot can create a post-shot gate inside the nested update. Never
  // replay an R release that the action owner rejected on that same tick.
  if(this.s3PostShotRemaining>EPS||chargerPostShotBlocksSub(this))cancel(this);
  else if(!this.s3SubReady&&this.aimingSub&&next.sub&&!next.subReleased){
   // A nested action clock can expire during update and admit aim for the
   // first time. Capture that admission so next tick's release cannot bypass
   // the preparation/use owner merely because the outer precheck was locked.
   this.s3SubReady={age:0,pending:false,minimum:this.s3SubFromSquid?profile.bomb.readyTimeSquid:profile.bomb.readyTimeKid,useStartup:null};
   this.s3SubFromSquid=false;
  }
  return result;
 };
}
