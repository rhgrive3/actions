// Slosher unit schedule and per-volley snapshots. Native geometry/paint and
// integration are retained; absolute world calibration remains explicitly open.
const TAU=Math.PI*2;
export const wrapSloshAngle=value=>((value+Math.PI)%TAU+TAU)%TAU-Math.PI;
export function slosherFallDamage(w,drop,head=true){
  if(!head)return w.damageTail;
  const k=Math.max(0,Math.min(1,(drop-w.fallReduceStart)/(w.fallReduceEnd-w.fallReduceStart)));
  return w.damageHead+(w.damageHeadMin-w.damageHead)*k;
}
export function slosherUnits(w){
  const units=[];let angle=0;
  for(let group=0;group<w.unitGroups.length;group++){
    const g=w.unitGroups[group];
    for(let i=0;i<g.count;i++){
      if(units.length)angle+=g.intervalFrames;
      units.push({group,index:i,delay:(g.delayFrames+i*g.intervalFrames)/60,angle});
    }
  }
  return units;
}
export function slosherPlayerCollisionRadius(p){
 const c=p.s3SloshPlayerCollision;
 if(!c)return p.size;
 const t=Math.max(0,Math.min(1,p.age/c.changeTime));
 return c.initRadius+(c.endRadius-c.initRadius)*t;
}
export function installSlosher({WeaponRunner,Projectiles,G,THREE},profile){
 const tag=Symbol.for('inkwave.s3.slosher-units.v1'),wr=WeaponRunner.prototype;
 if(wr[tag])return;Object.defineProperty(wr,tag,{value:true});
 const slosh=wr._slosher,reset=wr.reset;
 wr.reset=function(...args){this.s3SloshPreviousYaw=null;this.s3SloshSweep=0;return reset.apply(this,args);};
 wr._slosher=function(dt,input,w){
  const yaw=Number.isFinite(this.a.aimYaw)?this.a.aimYaw:Math.atan2(this.a.aimDir.x,this.a.aimDir.z);
  if(dt>0){
   const limit=w.sweepMaxDegrees*Math.PI/180;
   this.s3SloshSweep=this.s3SloshPreviousYaw==null?0:Math.max(-limit,Math.min(limit,wrapSloshAngle(yaw-this.s3SloshPreviousYaw)));
  }
  try{return slosh.call(this,dt,input,w);}
  finally{if(dt>0)this.s3SloshPreviousYaw=yaw;}
 };
 const fire=Projectiles.prototype.fireSlosh,push=Projectiles.prototype._push;
 Projectiles.prototype.fireSlosh=function(a,w){
  const previous=this.s3SloshEmission;
  this.s3SloshEmission={a,w,units:slosherUnits(w),index:0,sweep:a.weaponRunner.s3SloshSweep||0};
  try{return fire.call(this,a,{...w,drops:this.s3SloshEmission.units.length});}
  finally{this.s3SloshEmission=previous;}
 };
 Projectiles.prototype._push=function(p){
  const s=this.s3SloshEmission;
  if(s&&p.type==='slosh'&&p.owner===s.a){
   const u=s.units[s.index++],g=s.w.unitGroups[u.group],root=s.w.unitGroups[0];
   if(!s.base){
    const y=p.vel.y-p.grav/120;
    s.base={speed:Math.hypot(p.vel.x,y,p.vel.z),pitch:Math.atan2(y,Math.hypot(p.vel.x,p.vel.z)),yaw:Math.atan2(p.vel.x,p.vel.z),size:p.size};
   }
   const raw=(s.a.grounded?g.speedGround:g.speedAir)+u.index*g.speedOffset;
   // Ratio-calibrated to the retained native first-glob launch solution.
   // Do not present this as pinned absolute Splatoon speed or range.
   const speed=s.base.speed*raw/root.speedGround,yaw=s.base.yaw+u.angle*s.sweep;
   const cp=Math.cos(s.base.pitch);
   p.vel.set(Math.sin(yaw)*cp*speed,Math.sin(s.base.pitch)*speed+p.grav/120,Math.cos(yaw)*cp*speed);
   p.delay=u.delay;p.damage=u.group===0?s.w.damageHead:s.w.damageTail;p.head=u.group===0;
   p.s3SloshGroup=u.group;p.s3SloshIndex=u.index;
   const scale=profile.calibration.distanceScale.factor;
   p.s3SloshPlayerCollision=Object.freeze({
    initRadius:(g.playerRadiusInit+u.index*g.playerRadiusInitOffset)*scale,
    endRadius:(g.playerRadius+u.index*g.playerRadiusOffset)*scale,
    changeTime:g.playerRadiusFrames/60,
   });
   // Shared descriptor contract with PR64, whose swept actor chronology reads
   // this slot. Slosher field/visual size remains separate and unchanged.
   p.fidelityPlayerCollision=p.s3SloshPlayerCollision;
   p.size=s.base.size*(g.playerRadius+u.index*g.playerRadiusOffset)/root.playerRadius;
  }
  return push.call(this,p);
 };
 // This callback is invoked after native impact paint. Keep landing feedback
 // but remove the invented radial damage to players AND bosses, not 26->50.
 Projectiles.prototype._sloshSplash=function(p,at){
  const w=p.s3Weapon||p.owner.weapon;
  if(p.owner.isLocal||G.camera?.position.distanceToSquared(at)<26*26){
   const up=new THREE.Vector3(0,1,0);
   G.fx?.burst(at,up,p.owner.color,{count:16,speed:4.2,size:.09});
   G.fx?.ring(at,up,p.owner.color,{radius:w.splashRadius,life:.32});
   G.audio?.play('slosh_land',{pos:at,volume:p.owner.isLocal ? .75 : .6});
  }
 };
}
