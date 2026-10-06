export function stormPowerSnapshot(a){
 const m=a.s3?.modifiers||{};
 return Object.freeze({duration:m.stormDuration??8,throwScale:m.stormThrowScale??1});
}
export function stormLaunchSpec(a,base){
 a.s3||={};a.s3.stormPowerSnapshot||=stormPowerSnapshot(a);
 const s=a.s3.stormPowerSnapshot;
 return {...base,duration:s.duration,throwSpeed:base.throwSpeed*s.throwScale};
}
export function stormCloudSpec(b,base){
 const duration=Number.isFinite(b.s3StormDuration)?b.s3StormDuration:base.duration;
 return {...base,duration};
}
export function installStormPower({Actor,Projectiles}){
 const tag=Symbol.for('inkwave.s3.storm-power.v1');if(Actor.prototype[tag])return;
 Object.defineProperty(Actor.prototype,tag,{value:true});
 const start=Actor.prototype._startSpecial,reset=Actor.prototype.reset,throwStorm=Projectiles.prototype.throwStorm;
 Actor.prototype._startSpecial=function(...args){
  if(this.weapon.special==='storm'){this.s3||={};this.s3.stormPowerSnapshot=stormPowerSnapshot(this);}
  return start.apply(this,args);
 };
 Actor.prototype.reset=function(...args){if(this.s3)delete this.s3.stormPowerSnapshot;return reset.apply(this,args);};
 Projectiles.prototype.throwStorm=function(a,...args){
  const result=throwStorm.call(this,a,...args);
  // PR #322 owns the lock clock/hold state. Extend its existing lock only;
  // do not create a second timer or silently duplicate that pending feature.
  if(!a.remote&&Number.isFinite(a.stormGaugeLock)&&a.stormGaugeLock>0)
   a.stormGaugeLock=Math.max(a.stormGaugeLock,a.s3?.stormPowerSnapshot?.duration??8);
  return result;
 };
}
