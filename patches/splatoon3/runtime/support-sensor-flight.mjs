import { segmentCapsuleEntry } from './projectile-collision.mjs';
import { fidelityThrowVelocity, SUB_SPECIAL_FIDELITY } from './sub-special-fidelity.mjs';
import { bombReleasePosition, bombPreviewPosition, bombPredictionPosition } from './bomb-motion.mjs';
import { gearCurve } from './gear.mjs';
import { POINT_SENSOR, POINT_SENSOR_SOURCE, pointSensorThrowSpeed } from './support-recon.mjs';
import { createThrowPrediction, appendThrowPredictionPoint, noteThrowPredictionImpact,
  finishThrowPrediction, throwPredictionLimit, THROW_PREDICTION_STEP as STEP } from './throw-prediction-record.mjs';

// Gravity/lifetime retain the existing documented INKWAVE calibration; the
// public 11.3.0 override table does not supply these class defaults.
export const POINT_SENSOR_FLIGHT = Object.freeze({ gravity:24, maxFlightSeconds:POINT_SENSOR.maxFlightSeconds });
const SENSOR_LAUNCH = Object.freeze({ ...SUB_SPECIAL_FIDELITY.bomb,
  spawnSpeedY:POINT_SENSOR_SOURCE.spawnSpeedY*60,
  spawnSpeedYWorldMin:POINT_SENSOR_SOURCE.spawnSpeedYWorldMin*60,
  inheritX:POINT_SENSOR_SOURCE.inheritedVelocity.xRate,
  inheritYPlus:POINT_SENSOR_SOURCE.inheritedVelocity.yPlusRate,
  inheritYMax:POINT_SENSOR_SOURCE.inheritedVelocity.yMax*60,
});

export function pointSensorLaunch(actor, THREE, preview = false) {
  const origin=actor.pos.clone().add(new THREE.Vector3(0,1.35,0));
  if(preview)bombPredictionPosition(actor,origin);
  else bombPreviewPosition(actor,bombReleasePosition(actor,origin));
  const velocity=fidelityThrowVelocity(actor,'bomb',new THREE.Vector3(),
    pointSensorThrowSpeed(actor.s3?.abilityPoints?.subPower,gearCurve),SENSOR_LAUNCH);
  return {origin,velocity};
}

// Read-only collision query: the same flight step is consumed by live Sensor
// and its guide. No paint, marking, audio, network or actor writes happen here.
export function stepPointSensorFlight(sensor, api, dt) {
  if(!(dt>0)||!Number.isFinite(dt))return null;
  const {G,THREE,Physics,PLAYER}=api;
  sensor.s3SensorRemainder=Math.min(.25,(sensor.s3SensorRemainder||0)+dt);
  const scratch=sensor.contactScratch ||= {delta:new THREE.Vector3(),base:new THREE.Vector3(),
    point:new THREE.Vector3(),result:{t:0,dist:Infinity}};
  let steps=0;
  while(sensor.s3SensorRemainder+1e-10>=STEP&&steps++<8){
    sensor.s3SensorRemainder-=STEP;sensor.age+=STEP;
    sensor.prev.copy(sensor.pos);
    sensor.vel.y-=POINT_SENSOR_FLIGHT.gravity*STEP;
    sensor.pos.addScaledVector(sensor.vel,STEP);
    const hit=G.physics?.segment?.(sensor.prev,sensor.pos,sensor.hit);
    const delta=scratch.delta.copy(sensor.pos).sub(sensor.prev),length=delta.length();
    let body=null,best=hit?.hit?sensor.prev.distanceTo(hit.point):Infinity;
    const reach=PLAYER.radius+.2,minX=Math.min(sensor.prev.x,sensor.pos.x)-reach,maxX=Math.max(sensor.prev.x,sensor.pos.x)+reach,
      minZ=Math.min(sensor.prev.z,sensor.pos.z)-reach,maxZ=Math.max(sensor.prev.z,sensor.pos.z)+reach,
      lowY=Math.min(sensor.prev.y,sensor.pos.y),highY=Math.max(sensor.prev.y,sensor.pos.y);
    for(const actor of G.actors||[]){
      if(!actor.alive||actor.team===sensor.team)continue;
      if(actor.pos.x<minX||actor.pos.x>maxX||actor.pos.z<minZ||actor.pos.z>maxZ)continue;
      const baseY=actor.pos.y+(actor.smoothY||0),height=actor.form==='squid'?PLAYER.squidHeight:PLAYER.height;
      const axisLo=baseY+PLAYER.radius,axisHi=baseY+Math.max(PLAYER.radius,height-PLAYER.radius);
      const yPad=32*Number.EPSILON*Math.max(1,Math.abs(lowY),Math.abs(highY),Math.abs(axisLo),Math.abs(axisHi),Math.abs(reach));
      if(Number.isFinite(yPad)&&reach>=0&&(highY<axisLo-reach-yPad||lowY>axisHi+reach+yPad))continue;
      const base=scratch.base.copy(actor.pos);base.y+=actor.smoothY||0;
      const t=segmentCapsuleEntry(sensor.prev,sensor.pos,base,PLAYER.radius,actor.form==='squid'?PLAYER.squidHeight:PLAYER.height,reach);
      if(Number.isFinite(t)&&length*t<best){body=scratch.point.copy(sensor.prev).addScaledVector(delta,t);best=length*t;}
    }
    if(body){sensor.pos.copy(body);return {kind:'actor',outcome:'contact',point:body,normal:null};}
    if(hit?.hit){sensor.pos.copy(hit.point).addScaledVector(hit.normal,.03);return {kind:'world',outcome:'contact',point:hit.point,normal:hit.normal};}
    if(sensor.age+1e-10>=POINT_SENSOR_FLIGHT.maxFlightSeconds)return {kind:'timeout',outcome:'airburst',normal:null};
  }
  return null;
}

export function predictPointSensor(api,actor,options={}) {
  if(!actor?.pos?.isVector3)return null;
  const {origin,velocity}=pointSensorLaunch(actor,api.THREE,true);
  const result=createThrowPrediction('pointSensor',origin,velocity,options);
  result.radius=POINT_SENSOR.radiusWorld;
  const sensor={owner:actor,team:actor.team,pos:origin.clone(),prev:origin.clone(),vel:velocity.clone(),age:0,hit:new api.Hit()};
  const steps=Math.ceil(throwPredictionLimit(options,POINT_SENSOR_FLIGHT.maxFlightSeconds)/STEP);
  for(let i=0;i<steps;i++){
    const contact=stepPointSensorFlight(sensor,api,STEP);
    appendThrowPredictionPoint(result,sensor.pos);
    if(contact){
      if(contact.kind!=='timeout')noteThrowPredictionImpact(result,contact.point||sensor.pos,contact.normal,sensor.age,contact.kind);
      return finishThrowPrediction(result,sensor.pos,sensor.age,contact.outcome);
    }
  }
  return finishThrowPrediction(result,sensor.pos,sensor.age,'no-contact',false);
}
