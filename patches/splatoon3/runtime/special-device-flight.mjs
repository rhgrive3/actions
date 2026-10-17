import { gearCurve } from './gear.mjs';
import { fidelityThrowVelocity } from './sub-special-fidelity.mjs';

// PvP 11.3.0, Leanny/splat3 7280ff9cde8bb1c5dcef46c700c326471584d2e6.
// ShockSonar explicitly supplies gravity/air resistance. Chimney and
// TripleTornado omit those inherited defaults: keep the existing bomb gravity
// and native zero air drag as a CALIBRATED fallback, not an extracted curve.
export function specialDeviceFlight(api,actor,id,ap=0){
  const sonar=id==='waveBreaker',triple=id==='tripleInkstrike';
  const speed=sonar?.3:triple?gearCurve(ap,2,2.3,2.6):gearCurve(ap,1.3,1.5,1.7);
  const launch={spawnSpeedY:(sonar?.07:triple?.276:.24)*60,
    spawnSpeedYWorldMin:(sonar?-.5:-.4)*60,
    inheritX:sonar?0:1.6,inheritYPlus:sonar?0:4,inheritYMax:sonar?0:.16*60};
  return {vel:fidelityThrowVelocity(actor,'bomb',new api.THREE.Vector3(),speed*60,launch),
    gravity:sonar?.009*3600:api.SUB.bomb.gravity,airResist:sonar?.001:0};
}

// Called at the world-device fixed 60 Hz boundary. Sweep solid terrain,
// including grates for guide devices; opponents and their barriers are not
// terrain and cannot stick a Triple Inkstrike marker.
export function stepSpecialDeviceFlight(api,object,dt,hit){
  const from=object.pos.clone();
  object.vel.y-=object.gravity*dt;
  if(object.airResist>0)object.vel.multiplyScalar(Math.pow(1-object.airResist,dt*60));
  const to=from.clone().addScaledVector(object.vel,dt);
  let contact=api.G.physics?.segment?.(from,to,hit,false);
  if(!contact?.hit){
    const floor=api.G.level?.groundHeight?.(to.x,to.z,Math.max(from.y,to.y)+.001);
    if(Number.isFinite(floor)&&from.y>=floor&&to.y<=floor){
      const t=(from.y-floor)/Math.max(1e-10,from.y-to.y);
      hit.hit=true;hit.point.copy(from).lerp(to,t);hit.normal.set(0,1,0);contact=hit;
    }
  }
  if(contact?.hit){object.pos.copy(contact.point);return contact;}
  object.pos.copy(to);return null;
}

export function deviceBelowWorld(api,object){
  return object.pos.y<api.PLAYER.fallDeathY
    &&api.G.level?.groundHeight?.(object.pos.x,object.pos.z,object.pos.y+.6)===-Infinity;
}
