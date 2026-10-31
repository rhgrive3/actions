import { TACTICOOLER_SOURCE } from './support-cooler.mjs';

const FRAME=1/60;
// No mesh, deployment, gauge, network or RNG side effects. The same record is
// used by the real throw and by the position guide.
export function createCoolerFlight(api,owner){
  const pos=owner.pos.clone();pos.y+=1.1;
  const vel=owner.aimDir.clone();
  if(vel.lengthSq()<1e-12)vel.set(Math.sin(owner.aimYaw||0),0,Math.cos(owner.aimYaw||0));
  vel.normalize().multiplyScalar(TACTICOOLER_SOURCE.spawnSpeedZ*60);
  vel.y+=TACTICOOLER_SOURCE.spawnSpeedY*60;
  return {owner,pos,prev:pos.clone(),vel,age:0,flightCarry:0,hit:new api.Hit(),
    normal:new api.THREE.Vector3(0,1,0),outcome:'flight'};
}

// Fixed source ticks avoid 30/120 Hz changing the landing point. Retains the
// existing runtime wall-slide calibration: the raw table's rebound defaults
// and placement footprint have not been recovered from the retail executable.
export function stepCoolerFlight(api,d,dt){
  if(d.outcome!=='flight'||!(dt>0)||!Number.isFinite(dt))return d.outcome;
  d.flightCarry+=dt;
  while(d.flightCarry+1e-10>=FRAME){
    d.flightCarry=Math.max(0,d.flightCarry-FRAME);d.age+=FRAME;d.prev.copy(d.pos);
    d.vel.y-=TACTICOOLER_SOURCE.flyGravity*3600*FRAME;
    d.vel.multiplyScalar(1-TACTICOOLER_SOURCE.flyPositionAirResist);
    d.pos.addScaledVector(d.vel,FRAME);
    d.hit.hit=false;
    const hit=api.G.physics?.segment?.(d.prev,d.pos,d.hit,false);
    let landed=hit?.hit&&hit.normal.y>.4;
    if(hit?.hit){
      d.pos.copy(hit.point);d.normal.copy(hit.normal);
      if(!landed){d.pos.addScaledVector(hit.normal,.03);d.vel.addScaledVector(hit.normal,-d.vel.dot(hit.normal));}
    }
    const floor=api.G.level?.groundHeight?.(d.pos.x,d.pos.z,Math.max(d.prev.y,d.pos.y)+.001);
    if(!landed&&Number.isFinite(floor)&&d.prev.y>=floor-1e-9&&d.pos.y<=floor){
      const t=(d.prev.y-floor)/Math.max(1e-10,d.prev.y-d.pos.y);
      const ratio=Math.max(0,Math.min(1,t)),x=d.pos.x,z=d.pos.z;
      d.pos.set(d.prev.x+(x-d.prev.x)*ratio,floor,d.prev.z+(z-d.prev.z)*ratio);
      d.normal.set(0,1,0);landed=true;
    }
    if(landed){d.outcome='landed';return d.outcome;}
    if(d.age>5){d.outcome='expired';return d.outcome;}
    if(d.pos.y<(api.PLAYER?.fallDeathY??-Infinity)&&floor===-Infinity){d.outcome='lost';return d.outcome;}
  }
  return d.outcome;
}
