import { chargerPostShotBlocksSub } from './weapon-gates.mjs';
export function subThrowSpec(a, base) { return { ...base, throwSpeed: base.throwSpeed * (a.s3?.modifiers?.subPower ?? 1) }; }
export function subInkSpec(a, base) { return { ...base, inkCost: base.inkCost * (a.s3?.modifiers?.inkSaverSub ?? 1) }; }
const EPS=1e-10;
export function installSubReady({Actor,WeaponRunner,SUB},profile){
 const tag=Symbol.for('inkwave.s3.sub-ready.v1'),wr=WeaponRunner.prototype;
 if(wr[tag])return;Object.defineProperty(wr,tag,{value:true});
 const cancel=r=>{r.s3SubReady=null;r.s3SubFromSquid=false;r.aimingSub=false;};
 const reset=wr.reset,busy=wr.busy,update=wr.update;
 wr.reset=function(...args){cancel(this);return reset.apply(this,args);};
 wr.busy=function(){return !!this.s3SubReady?.pending||busy.call(this);};
 const actorUpdate=Actor.prototype.update,start=Actor.prototype._startSpecial;
 Actor.prototype.update=function(dt,...args){
  const r=this.weaponRunner;
  if(!this.alive||this.specialActive||this.superJumpState)cancel(r);
  else {
   if(!r.s3SubReady&&this.intent.sub&&this.form==='squid')r.s3SubFromSquid=true;
   if(r.s3SubReady&&this._prevIntent.sub&&!this.intent.sub){
    if(this.intent.squid)cancel(r);
    else r.s3SubReady.pending=true;
   }
  }
  return actorUpdate.call(this,dt,...args);
 };
 Actor.prototype._startSpecial=function(...args){cancel(this.weaponRunner);return start.apply(this,args);};
 wr.update=function(dt,input){
  const a=this.a;
  if(!a.alive||a.specialActive||a.superJumpState){cancel(this);return update.call(this,dt,{...input,sub:false,subReleased:false});}
  if(chargerPostShotBlocksSub(this)){
   cancel(this);return update.call(this,dt,{...input,sub:false,subReleased:false});
  }
  let s=this.s3SubReady;
  if(s)s.age+=Math.max(0,dt);
  if(!s&&input.sub&&!(this.s3PostShotRemaining>EPS)){
   s=this.s3SubReady={age:0,pending:false,minimum:this.s3SubFromSquid?profile.bomb.readyTimeSquid:profile.bomb.readyTimeKid};
   this.s3SubFromSquid=false;
  }
  const cost=SUB.bomb.inkCost*(a.s3?.modifiers?.inkSaverSub??1);
  if(s&&input.subReleased){
   if(a.ink+EPS<cost){this.s3SubReady=null;s=null;}
   else s.pending=true;
  }
  let next=input;
  if(s?.pending){
   if(s.age+EPS>=s.minimum){next={...input,sub:false,subReleased:true};this.s3SubReady=null;}
   else next={...input,sub:true,subReleased:false};
  }else if(s&&!input.sub&&!input.subReleased){cancel(this);s=null;}
  const result=update.call(this,dt,next);
  // A main shot can create a post-shot gate inside the nested update. Never
  // replay an R release that the action owner rejected on that same tick.
  if(this.s3PostShotRemaining>EPS||chargerPostShotBlocksSub(this))cancel(this);
  return result;
 };
}
