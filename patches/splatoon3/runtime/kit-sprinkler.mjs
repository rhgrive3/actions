import { receiverSprinklerObserved, recordReceiverSprinklerContact } from '../../network-replication/sprinkler-contact-commit.mjs';
// Splatoon 3 v11.3.0 Sprinkler: one native bomb record with owner-authoritative
// detached ink drops, source phase timing and surface attachment.
// Physics ejection and PNG paint shapes are calibrated, NOT retail binary code.
// Source: Leanny/splat3@7280ff9c/WeaponSprinkler.game__GameParameterTable.json
// S3 verification: https://wikiwiki.jp/splatoon3mix/ブキ/サブウェポン/スプリンクラー
import {gearCurve} from './gear.mjs';
import {captureSubAttachment,syncSubAttachment} from './sub-surface-attachment.mjs';
const FRAME=1/60, EPS=1e-9;
export const SPRINKLER=Object.freeze({
  id:'sprinkler', name:'Sprinkler', mode:'sprinkler', chargeable:false,
  inkCost:60, inkCostStatus:'extracted', inkRecoverStop:60*FRAME,
  throwSpeed:1.12*60, throwSpeedTiers:Object.freeze({low:1.12*60,mid:1.12*60,high:1.12*60}), throwSpeedStatus:'extracted',
  spawnSpeedY:.24*60, hitPaintRadius:2.9,
  deploymentPaintRadius:.3, dropletPaintRadius:1.4, dropletDamage:20,
  hp:120, deployFrames:30, periodFirstFrames:480, periodSecondFrames:900,
  cadenceFrames:[4,6,9], spinDegreesPerFrame:[33,11,1],
  maxDrops:96, dropletSpeed:10, dropletLift:5, dropletGravity:24, dropletDrag:.015,
  status:'extracted+community-verified+calibrated-droplet-dynamics',
});
export function resolveSprinklerPower(spec,ap){
  const points=Number.isFinite(ap)?Math.max(0,Math.min(57,ap)):0;
  return {...spec,periodFirstFrames:gearCurve(points,480,630,780),
    periodSecondFrames:gearCurve(points,900,960,1020),throwSpeed:SPRINKLER.throwSpeed};
}
export function sprinklerPhase(f,spec=SPRINKLER){
  if(!Number.isFinite(f)||f<spec.deployFrames)return -1;
  // PeriodSecond is the duration of the middle stage, not a deployment-age
  // timestamp. GP0 therefore weakens at 8 s, then at 8 + 15 = 23 s.
  return f<spec.periodFirstFrames?0:f<spec.periodFirstFrames+spec.periodSecondFrames?1:2;
}
export function sprinklerShotFrames(until,spec=SPRINKLER){
  const out=[];if(!Number.isFinite(until)||until<spec.deployFrames)return out;
  let f=spec.deployFrames;
  while(f<=until+EPS&&out.length<1024){
    out.push(f);const p=sprinklerPhase(f,spec);let next=f+spec.cadenceFrames[p];
    if(f<spec.periodFirstFrames&&next>=spec.periodFirstFrames)next=spec.periodFirstFrames;
    const secondEnd=spec.periodFirstFrames+spec.periodSecondFrames;
    if(f<secondEnd&&next>=secondEnd)next=secondEnd;
    f=next;
  }
  return out;
}
export function beginSprinkler(b,n,spec=SPRINKLER,hit=null){
  if(!b||b.s3Sprinkler)return;
  const tangent=n.clone(), bitangent=n.clone();
  if(Math.abs(n.y)<.9)tangent.set(0,1,0).cross(n).normalize();
  else tangent.set(1,0,0);
  bitangent.copy(n).cross(tangent).normalize();
  b.s3Sprinkler={sourceAge:b.age,nextFrame:spec.deployFrames,drops:[],spraySequence:0,
    phase:-1,normal:n.clone(),tangent,bitangent,p0:b.pos.clone(),p1:b.pos.clone(),
    hit:{point:b.pos.clone(),normal:n.clone()},supportBlockId:hit?.block,
    previousAge:b.age,baseSeed:Math.floor(b.age*1e7)>>>0};
}
function unit(seed){let n=Math.imul(seed^0x9e3779b9,0x85ebca6b)>>>0;
  n^=n>>>13;n=Math.imul(n,0xc2b2ae35)>>>0;n^=n>>>16;return(n>>>0)/4294967296;}
export function stepSprinkler(b,paint,projectiles,G,physics,player){
  const st=b?.s3Sprinkler,spec=(b?.s3Resolved||b?.s3GhostResolved)?.spec;
  if(!st||!spec||spec.mode!=='sprinkler'||!G?.physics)return 0;
  if(!st.supportCaptured){st.supportCaptured=true;st.support=captureSubAttachment(G,b,st.supportBlockId,st);}
  syncSubAttachment(G,b,st.support,st);b.s3SurfaceNormal?.copy(st.normal);
  // A registered replica observes native contacts without direct paint/applyHit.
  // Only a matching independent owner claim may flush through the native HP/ACK path.
  const observed=b.ghost&&receiverSprinklerObserved(G.netm,b);
  if(b.ghost&&!observed||!b.ghost&&!paint?.splat)return 0;
  const elapsed=Math.max(0,b.age-st.sourceAge),f=elapsed/FRAME;
  const n=st.normal, t=st.tangent, bit=st.bitangent;let area=0;
  if(!b.ghost&&!st.deploymentPainted){
    st.deploymentPainted=true;st.p0.copy(b.pos).addScaledVector(n,.02);
    area+=paint.splat(st.p0,spec.deploymentPaintRadius,b.team,
      {seed:unit(st.baseSeed),claimOwner:b.owner})||0;
  }
  let guard=0;
  while(f+EPS>=st.nextFrame&&guard++<16){
    const at=st.nextFrame, phase=sprinklerPhase(at,spec);
    st.phase=phase;const angle=at*spec.spinDegreesPerFrame[phase]*Math.PI/180;
    for(let arm=0;arm<3;arm++){
      if(st.drops.length>=spec.maxDrops)break;
      const theta=angle+arm*Math.PI*2/3;
      const recycled=b.ghost?st.receiverPool?.pop():null;
      const velocity=(recycled?recycled.vel.copy(t):t.clone()).multiplyScalar(Math.cos(theta))
        .addScaledVector(bit,Math.sin(theta)).multiplyScalar(spec.dropletSpeed)
        .addScaledVector(n,spec.dropletLift);
      const pos=(recycled?recycled.pos.copy(b.pos):b.pos.clone()).addScaledVector(n,.1);
      st.drops.push({pos,vel:velocity,life:0,seed:unit(st.baseSeed+st.spraySequence*3+arm)});
    }
    st.spraySequence++;
    let next=at+spec.cadenceFrames[phase];
    if(at<spec.periodFirstFrames&&next>=spec.periodFirstFrames)next=spec.periodFirstFrames;
    const secondEnd=spec.periodFirstFrames+spec.periodSecondFrames;
    if(at<secondEnd&&next>=secondEnd)next=secondEnd;
    st.nextFrame=next;
  }
  const dt=Math.min(.25,Math.max(0,b.age-st.previousAge));st.previousAge=b.age;
  for(let i=st.drops.length-1;i>=0;i--){
    const d=st.drops[i];d.life+=dt;
    d.vel.multiplyScalar(1-spec.dropletDrag*Math.min(1,dt/FRAME));
    d.vel.y-=spec.dropletGravity*dt;
    st.p0.copy(d.pos);st.p1.copy(d.pos).addScaledVector(d.vel,dt);
    const hit=G.physics.segment?.(st.p0,st.p1,st.hit);
    if(hit?.hit){
      st.hit=hit;
      if(!b.ghost){const at=hit.point.clone().addScaledVector(hit.normal,.035);
        area+=paint.splat(at,spec.dropletPaintRadius,b.team,
          {seed:d.seed,kind:'drop',claimOwner:b.owner})||0;}
      if(b.ghost)(st.receiverPool||=[]).push(d);
      st.drops.splice(i,1);continue;
    }
    let struck=false;
    if(physics?.pointCapsuleDist&&projectiles?.applyHit){
      for(const actor of G.actors||[]){
        if(!actor?.alive||actor.team===b.team||!actor.pos||b.ghost&&(actor.remote||actor.owner!==G.netm?.myId))continue;
        // Exact capsule broad-phase: avoid allocating centres or querying LOS for distant actors.
        if(b.ghost&&(Math.abs(st.p1.x-actor.pos.x)>.3||Math.abs(st.p1.z-actor.pos.z)>.3))continue;
        const centre=b.ghost?(st.receiverCentre||=(actor.pos.clone())).copy(actor.pos):actor.pos.clone();centre.y+=actor.smoothY||0;
        const h=actor.form==='squid'?player?.squidHeight:player?.height;
        if(!Number.isFinite(h))continue;
        if(physics.pointCapsuleDist(st.p1,centre,player.radius,h)>.3)continue;
        if(G.physics.los&&!G.physics.los(st.p1,centre))continue;
        if(b.ghost)recordReceiverSprinklerContact(G.netm,b,d,actor,spec.dropletDamage,performance.now()/1000);
        else projectiles.applyHit(b.owner,actor,spec.dropletDamage,'sprinkler');
        struck=true;break;
      }
    }
    if(struck||d.life>2||!Number.isFinite(st.p1.y)){if(b.ghost)(st.receiverPool||=[]).push(d);st.drops.splice(i,1);}
    else d.pos.copy(st.p1);
  }
  if(area>0&&Number.isFinite(area))b.owner?.addTurf?.(area);
  return Number.isFinite(area)?area:0;
}
