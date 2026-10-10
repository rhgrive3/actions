// Splatoon 3 v11.3.0 Autobomb on the native Projectiles bomb record.
// Extracted: Leanny/splat3@7280ff9c WeaponBombRobot.game__GameParameterTable.
// Tracking/path angles remain calibrated, not Nintendo decompiled source.
// https://wikiwiki.jp/splatoon3mix/ブキ/サブウェポン/ロボットボム
const FRAME=1/60;
export const AUTOBOMB=Object.freeze({
 id:'autobomb', name:'Autobomb', mode:'chase', chargeable:false,
 inkCost:55, inkCostStatus:'extracted', inkRecoverStop:85*FRAME,
 throwSpeed:1.12*60, throwSpeedStatus:'extracted',
 flyGravity:.016*3600, guideRadius:.5,
 rotateFrames:30, findRotateFrames:10, chaseFrames:150, approachDistance:.65,
 acquireRadius:2.5, groundMaxSpeed:.09*60, groundAcceleration:.003*60,
 chaseBurstDelayFrames:60, noTargetBurstDelayFrames:180, lostTargetBurstDelayFrames:60,
 damageMax:180, damageMin:30, damageInnerDistance:2.85, damageOuterDistance:6.5,
 radius:6.5, paintRadius:1.75, crossPaintRadius:1.75, splashSatellites:10,
 splashSatelliteRadius:.7, knockback:{accel:470,bias:.8,distance:9},
 status:'S3-extracted+community-verified+calibrated-target-acquisition',
});
export function startAutobomb(b,spec=AUTOBOMB){
 if(!b||b.s3Auto)return;
 b.s3Auto={startAge:b.age,lastAge:b.age,phase:'scanning',target:null,elapsedFrames:0,speed:0};
}
export function autobombTarget(actor,b,G,spec=AUTOBOMB){
 if(!actor?.pos||!G?.actors)return null;
 let nearest=null,dist=spec.acquireRadius;
 for(const e of G.actors){
  if(!e?.alive||e.team===b.team||e===actor||!e.pos)continue;
  if(Math.abs(e.pos.y-b.pos.y)>3)continue;
  const d=Math.hypot(e.pos.x-b.pos.x,e.pos.z-b.pos.z);
  if(d<=dist){nearest=e;dist=d;}
 }
 return nearest;
}
export function stepAutobomb(b,G){
 const st=b?.s3Auto,r=b?.s3Resolved??b?.s3GhostResolved;
 if(!st||r?.spec?.mode!=='chase'||!G)return null;
 const spec=r.spec,elapsed=Math.max(0,b.age-st.startAge),f=elapsed/FRAME;
 const dt=Math.max(0,Math.min(.25,b.age-st.lastAge));st.lastAge=b.age;
 st.elapsedFrames=f;
 if(b.fuse>=0)return st.phase;
 if(!st.target){
  if(f>=spec.findRotateFrames){
   st.target=autobombTarget(b.owner,b,G,spec);
   if(st.target)st.phase='targeted';
   else if(st.phase!=='waiting'){
    st.phase='waiting';b.fuse=spec.noTargetBurstDelayFrames*FRAME;
    b.vel.set(0,0,0);
   }
  }
  return st.phase;
 }
 if(f<spec.rotateFrames){b.vel.x=b.vel.z=0;return st.phase;}
 if(f>=spec.rotateFrames+spec.chaseFrames||!st.target.alive){
  st.phase='countdown';b.fuse=spec.lostTargetBurstDelayFrames*FRAME;
  b.vel.set(0,0,0);return st.phase;
 }
 const dx=st.target.pos.x-b.pos.x,dz=st.target.pos.z-b.pos.z,d=Math.hypot(dx,dz);
 if(d<=spec.approachDistance){
  st.phase='countdown';b.fuse=spec.chaseBurstDelayFrames*FRAME;
  b.vel.set(0,0,0);return st.phase;
 }
 st.phase='chasing';
 st.speed=Math.min(spec.groundMaxSpeed,st.speed+spec.groundAcceleration*dt/FRAME);
 b.vel.x=dx/d*st.speed;b.vel.z=dz/d*st.speed;
 return st.phase;
}
