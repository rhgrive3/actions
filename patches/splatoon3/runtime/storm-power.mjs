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
export function installStormPower({Actor,Projectiles,G}){
 const tag=Symbol.for('inkwave.s3.storm-power.v1');if(Actor.prototype[tag])return;
 Object.defineProperty(Actor.prototype,tag,{value:true});
 const start=Actor.prototype._startSpecial,reset=Actor.prototype.reset,spawnCloud=Projectiles.prototype._spawnCloud,throwStorm=Projectiles.prototype.throwStorm,clear=Projectiles.prototype.clear;
 Actor.prototype._startSpecial=function(...args){
  if(this.weapon.special==='storm'){this.s3||={};this.s3.stormPowerSnapshot=stormPowerSnapshot(this);}
  const result=start.apply(this,args);
  if(this.specialActive?.id==='storm'&&this.specialActive.phase==='hold')startHeldSpecialGauge(this,G,'storm');
  return result;
 };
 Actor.prototype.reset=function(...args){if(this.s3)delete this.s3.stormPowerSnapshot;clearPreOperationGauge(this);return reset.apply(this,args);};
 Projectiles.prototype.throwStorm=function(actor,...args){
  const before=this.bombs.length,result=throwStorm.call(this,actor,...args);
  if(this.bombs.length>before)startPendingSpecialGauge(actor,G,'storm',this.bombs[this.bombs.length-1],this.bombs);
  return result;
 };
 Projectiles.prototype._spawnCloud=function(b,...args){
  const before=this.clouds.length,result=spawnCloud.call(this,b,...args);
  if(!b.ghost&&!b.owner?.remote&&this.clouds.length>before)startStormCloudGauge(b.owner,this.clouds[this.clouds.length-1],G);
  return result;
 };
 Projectiles.prototype.clear=function(...args){
  for(const c of this.clouds||[])if(!c.ghost&&!c.owner?.remote)c.owner.stormGaugeLock=0;
  return clear.apply(this,args);
 };
}
import { startStormCloudGauge } from './storm-effects.mjs';
import { startHeldSpecialGauge, startPendingSpecialGauge, clearPreOperationGauge } from './tacticooler-gauge.mjs';
