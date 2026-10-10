// Splatoon 3 v11.3.0 Sprinkler: one native bomb record with owner-authoritative
// detached ink drops, source phase timing and surface attachment.
// Physics ejection and PNG paint shapes are calibrated, NOT retail binary code.
// Source: Leanny/splat3@7280ff9c/WeaponSprinkler.game__GameParameterTable.json
// S3 verification: https://wikiwiki.jp/splatoon3mix/ブキ/サブウェポン/スプリンクラー
const FRAME=1/60, EPS=1e-9;
export const SPRINKLER=Object.freeze({
  id:'sprinkler', name:'Sprinkler', mode:'sprinkler', chargeable:false,
  inkCost:60, inkCostStatus:'extracted', inkRecoverStop:60*FRAME,
  throwSpeed:1.12*60, throwSpeedStatus:'extracted',
  spawnSpeedY:.24*60, hitPaintRadius:2.9,
  deploymentPaintRadius:.3, dropletPaintRadius:1.4, dropletDamage:20,
  hp:120, deployFrames:30, periodFirstFrames:480, periodSecondFrames:900,
  cadenceFrames:[4,6,9], spinDegreesPerFrame:[33,11,1],
  maxDrops:96, dropletSpeed:10, dropletLift:5, dropletGravity:24, dropletDrag:.015,
  status:'extracted+community-verified+calibrated-droplet-dynamics',
});
export function sprinklerPhase(f,spec=SPRINKLER){
  if(!Number.isFinite(f)||f<spec.deployFrames)return -1;
  return f<spec.periodFirstFrames?0:f<spec.periodSecondFrames?1:2;
}
export function sprinklerShotFrames(until,spec=SPRINKLER){
  const out=[];if(!Number.isFinite(until)||until<spec.deployFrames)return out;
  let f=spec.deployFrames;
  while(f<=until+EPS&&out.length<1024){
    out.push(f);const p=sprinklerPhase(f,spec);let next=f+spec.cadenceFrames[p];
    if(f<spec.periodFirstFrames&&next>=spec.periodFirstFrames)next=spec.periodFirstFrames;
    if(f<spec.periodSecondFrames&&next>=spec.periodSecondFrames)next=spec.periodSecondFrames;
    f=next;
  }
  return out;
}
export function beginSprinkler(b,n,spec=SPRINKLER){
  if(!b||b.s3Sprinkler)return;
  const tangent=n.clone(), bitangent=n.clone();
  if(Math.abs(n.y)<.9)tangent.set(0,1,0).cross(n).normalize();
  else tangent.set(1,0,0);
  bitangent.copy(n).cross(tangent).normalize();
  b.s3Sprinkler={sourceAge:b.age,nextFrame:spec.deployFrames,drops:[],spraySequence:0,
    phase:-1,normal:n.clone(),tangent,bitangent,p0:b.pos.clone(),p1:b.pos.clone(),
    hit:null,previousAge:b.age,baseSeed:Math.floor(b.age*1e7)>>>0};
}
function unit(seed){let n=Math.imul(seed^0x9e3779b9,0x85ebca6b)>>>0;
  n^=n>>>13;n=Math.imul(n,0xc2b2ae35)>>>0;n^=n>>>16;return(n>>>0)/4294967296;}
export function stepSprinkler(b,paint,projectiles,G,physics,player){
  const st=b?.s3Sprinkler,spec=b?.s3Resolved?.spec;
  if(!st||b.ghost||!spec||spec.mode!=='sprinkler'||!paint?.splat||!G?.physics)return 0;
  const elapsed=Math.max(0,b.age-st.sourceAge),f=elapsed/FRAME;
  const n=st.normal, t=st.tangent, bit=st.bitangent;let area=0;
  if(!st.deploymentPainted){
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
      const velocity=t.clone().multiplyScalar(Math.cos(theta))
        .addScaledVector(bit,Math.sin(theta)).multiplyScalar(spec.dropletSpeed)
        .addScaledVector(n,spec.dropletLift);
      const pos=b.pos.clone().addScaledVector(n,.1);
      st.drops.push({pos,vel:velocity,life:0,seed:unit(st.baseSeed+st.spraySequence*3+arm)});
    }
    st.spraySequence++;
    let next=at+spec.cadenceFrames[phase];
    if(at<spec.periodFirstFrames&&next>=spec.periodFirstFrames)next=spec.periodFirstFrames;
    if(at<spec.periodSecondFrames&&next>=spec.periodSecondFrames)next=spec.periodSecondFrames;
    st.nextFrame=next;
  }
  const dt=Math.min(.25,Math.max(0,b.age-st.previousAge));st.previousAge=b.age;
  for(let i=st.drops.length-1;i>=0;i--){
    const d=st.drops[i];d.life+=dt;
    d.vel.multiplyScalar(1-spec.dropletDrag*Math.min(1,dt/FRAME));
    d.vel.y-=spec.dropletGravity*dt;
    st.p0.copy(d.pos);st.p1.copy(d.pos).addScaledVector(d.vel,dt);
    const hit=G.physics.segment?.(st.p0,st.p1,st.hit||{});
    if(hit?.hit){
      st.hit=hit;const at=hit.point.clone().addScaledVector(hit.normal,.035);
      area+=paint.splat(at,spec.dropletPaintRadius,b.team,
        {seed:d.seed,kind:'drop',claimOwner:b.owner})||0;
      st.drops.splice(i,1);continue;
    }
    let struck=false;
    if(physics?.pointCapsuleDist&&projectiles?.applyHit){
      for(const actor of G.actors||[]){
        if(!actor?.alive||actor.team===b.team||!actor.pos)continue;
        const centre=actor.pos.clone();centre.y+=actor.smoothY||0;
        const h=actor.form==='squid'?player?.squidHeight:player?.height;
        if(!Number.isFinite(h))continue;
        if(physics.pointCapsuleDist(st.p1,centre,player.radius,h)>.3)continue;
        if(G.physics.los&&!G.physics.los(st.p1,centre))continue;
        projectiles.applyHit(b.owner,actor,spec.dropletDamage,'sprinkler');
        struck=true;break;
      }
    }
    if(struck||d.life>2||!Number.isFinite(st.p1.y))st.drops.splice(i,1);
    else d.pos.copy(st.p1);
  }
  if(area>0&&Number.isFinite(area))b.owner?.addTurf?.(area);
  return Number.isFinite(area)?area:0;
}
