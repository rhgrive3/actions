// A held guide ends at the first contact, as the native Splat Bomb guide does.
// Callers supply their real launch/integration/contact rules; this renderer has
// no projectile birth, payment, paint, damage, RNG or network authority.
export const SUB_FLIGHT_STEP = 1 / 60;
const PREVIEW_INTERVAL=1/30;

export function colorSubTrajectory(system, actor, inkCost) {
  const gray = system._s3SubArcGray ||= actor.color.clone().setRGB(.6,.6,.6);
  const color = Number.isFinite(inkCost) && actor.ink < inkCost ? gray : actor.color;
  system.arcLine.material.color.copy(color).multiplyScalar(1.4);
  system.arcRing.material.color.copy(color).multiplyScalar(1.4);
}

export function drawSubTrajectory(api, system, actor, prepare, deferTrace = false) {
  const leases=system._s3SubArcScratch ||= {depth:0,frames:[]},depth=leases.depth++;
  const s=leases.frames[depth] ||= {
    p:new api.THREE.Vector3(),vel:new api.THREE.Vector3(),prev:new api.THREE.Vector3(),
    start:new api.THREE.Vector3(),initial:new api.THREE.Vector3(),normal:new api.THREE.Vector3(),
    up:new api.THREE.Vector3(0,1,0),hit:new api.Hit(),template:{},flight:{},contact:{},
  };
  s.advance=s.contactAt=s.stopBefore=null;
  s.frames=(system.arcN-1)*2;s.timeoutContact=false;s.inkCost=NaN;s.subId=actor.weapon?.sub;
  s.age=0;s.normal.copy(s.up);
  try {
    prepare(s);
    s.start.copy(s.p);s.initial.copy(s.vel);
    const cached=system._s3SubArcCache,now=api.G.time||0;
    const ready=cached&&system._arcCache===cached&&system.arcLine.visible&&cached.actor===actor
      &&cached.weapon===actor.weapon&&cached.subId===s.subId&&cached.physics===api.G.physics
      &&cached.inkCost===s.inkCost&&cached.subPowerAP===actor.s3?.abilityPoints?.subPower
      &&cached.subPower===actor.s3?.modifiers?.subPower;
    // Compare consecutive input samples so ordinary motion cannot defeat the
    // 30 Hz budget by gradually accumulating beyond a displacement threshold.
    // Fast darts use the same angular snap tolerance as a normal thrown bomb.
    const speedScale=Math.max(1,s.initial.length()/67.2);
    const jumped=ready&&(Math.hypot(s.start.x-cached.lastPX,s.start.y-cached.lastPY,s.start.z-cached.lastPZ)>.5
      ||Math.hypot(s.initial.x-cached.lastVX,s.initial.y-cached.lastVY,s.initial.z-cached.lastVZ)>4*speedScale);
    if(ready&&!jumped&&now>=cached.time&&now-cached.time<PREVIEW_INTERVAL-1e-9) {
      cached.lastPX=s.start.x;cached.lastPY=s.start.y;cached.lastPZ=s.start.z;
      cached.lastVX=s.initial.x;cached.lastVY=s.initial.y;cached.lastVZ=s.initial.z;
      colorSubTrajectory(system,actor,s.inkCost);system.arcRing.visible=cached.landed;
      system.arcRing.scale.setScalar(1+Math.sin(now*8)*.06);return;
    }
    // Opt-in native callers prepare their contact callbacks only for an actual
    // trace. Launch samples and readiness are still refreshed on every call.
    if(deferTrace)prepare(s,true);
    const position=system.arcGeo.attributes.position;
    const maxFrames=Math.min((system.arcN-1)*2,Math.max(0,Math.ceil(s.frames-1e-9)));
    let count=1,landed=false;
    position.setXYZ(0,s.p.x,s.p.y,s.p.z);
    for(let i=0;i<maxFrames;i++) {
      s.age=(i+1)*SUB_FLIGHT_STEP;
      // Guided Torpedoes can choose a different route after acquiring a target.
      // Stop the forecast at that transition instead of inventing a landing.
      if(s.stopBefore?.(s)){
        if(i%2===1&&count<system.arcN)position.setXYZ(count++,s.p.x,s.p.y,s.p.z);
        break;
      }
      s.prev.copy(s.p);s.advance(s,SUB_FLIGHT_STEP);
      landed=s.contactAt(s)===true;
      if(!landed&&s.timeoutContact&&i+1>=s.frames)landed=true;
      if(landed||(i+1)%2===0||i+1===maxFrames) {
        position.setXYZ(count++,s.p.x,s.p.y,s.p.z);
        if(landed) {
          system.arcRing.position.copy(s.p);
          system.arcRing.quaternion.setFromUnitVectors(s.up,s.normal);
          break;
        }
      }
      if(count>=system.arcN)break;
    }
    const pr=position._arcRange ||= {start:0,count:0};pr.count=count*position.itemSize;
    position.updateRanges.length=0;position.updateRanges.push(pr);position.needsUpdate=true;
    system.arcGeo.setDrawRange(0,count);
    const distance=system.arcGeo.attributes.lineDistance,points=position.array;
    let total=0;distance.setX(0,0);
    for(let i=1;i<count;i++) {
      const k=i*3,dx=points[k]-points[k-3],dy=points[k+1]-points[k-2],dz=points[k+2]-points[k-1];
      total+=Math.sqrt(dx*dx+dy*dy+dz*dz);distance.setX(i,total);
    }
    const dr=distance._arcRange ||= {start:0,count:0};dr.count=count;
    distance.updateRanges.length=0;distance.updateRanges.push(dr);distance.needsUpdate=true;
    colorSubTrajectory(system,actor,s.inkCost);
    system.arcLine.visible=true;system.arcRing.visible=landed;
    system.arcRing.scale.setScalar(1+Math.sin((api.G.time||0)*8)*.06);
    const cache=system._s3SubArcCache ||= {};
    Object.assign(cache,{actor,weapon:actor.weapon,time:now,physics:api.G.physics,px:s.start.x,py:s.start.y,pz:s.start.z,
      vx:s.initial.x,vy:s.initial.y,vz:s.initial.z,landed,inkCost:s.inkCost,subId:s.subId,
      subPowerAP:actor.s3?.abilityPoints?.subPower,subPower:actor.s3?.modifiers?.subPower,
      lastPX:s.start.x,lastPY:s.start.y,lastPZ:s.start.z,lastVX:s.initial.x,lastVY:s.initial.y,lastVZ:s.initial.z});
    system._arcCache=cache;
  } finally {
    s.flight.owner=s.contact.owner=null;
    s.advance=s.contactAt=s.stopBefore=null;
    leases.depth--;
  }
}

export function previewWorldContact(api,s) {
  const hit=api.G.physics.segment(s.prev,s.p,s.hit);
  if(!hit?.hit)return false;
  s.p.copy(hit.point).addScaledVector(hit.normal,.03);s.normal.copy(hit.normal);
  return true;
}

export function clearSubTrajectory(system) {
  if(system._arcCache===system._s3SubArcCache)system._arcCache=null;
  delete system._s3SubArcCache;delete system._s3SubArcScratch;delete system._s3SubArcGray;
}
