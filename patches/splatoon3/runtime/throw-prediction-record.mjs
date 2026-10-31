// Presentation-only records. Use the gameplay 60 Hz tick even when the
// caller/render loop runs at 30, 90 or 120 Hz.
export const THROW_PREDICTION_STEP = 1 / 60;

export function createThrowPrediction(kind, origin, velocity, options = {}) {
  const points = Array.isArray(options.points) ? options.points : [];
  // Keep vectors, but never Actor/Physics/scene references, across refreshes.
  points._s3PredictionPool ||= [];
  points.length = 0;
  const result = { kind, origin: origin.clone(), velocity: velocity.clone(), points,
    endpoint: origin.clone(), normal: null, firstImpact: null, outcome: 'no-contact',
    complete: false, radius: 0, time: 0, targetDependent: false,
    simulationStep: THROW_PREDICTION_STEP, explosions: [] };
  appendThrowPredictionPoint(result, origin);
  return result;
}
export function appendThrowPredictionPoint(result, point) {
  const points=result.points,last=points[points.length-1];
  if(last&&last.distanceToSquared(point)<=1e-16)return;
  const pool=points._s3PredictionPool,index=points.length;
  const next=pool[index]||(pool[index]=point.clone());next.copy(point);points.push(next);
}
export function noteThrowPredictionImpact(result, point, normal, time, kind='world') {
  if(!result.firstImpact)result.firstImpact={point:point.clone(),normal:normal?.clone?.()||null,time,kind};
  if(normal?.clone)result.normal=normal.clone();
}
export function finishThrowPrediction(result, point, time, outcome, complete=true) {
  result.endpoint.copy(point);result.time=time;result.outcome=outcome;result.complete=complete;
  appendThrowPredictionPoint(result,point);return result;
}
export function throwPredictionLimit(options, fallback=8) {
  return Number.isFinite(options?.maxTime)?Math.max(0,Math.min(30,options.maxTime)):fallback;
}

// Collision queries also refresh attached device positions/collider caches.
// Give those queries private records so drawing a guide cannot move a live
// mesh, initialize its collider, or update a moving-platform attachment.
export function snapshotThrowCollisionSystem(projectiles) {
  const system=Object.create(projectiles);
  const copy=object=>{
    const result={...object,mesh:null,s3CoolerCollision:null};
    for(const key of ['pos','prev','vel','s3SurfaceNormal'])
      if(object[key]?.clone)result[key]=object[key].clone();
    if(object.s3SurfaceAttachment)result.s3SurfaceAttachment={...object.s3SurfaceAttachment};
    return result;
  };
  for(const key of ['_s3SubObjects','_s3SupportCoolers'])
    system[key]=Array.isArray(projectiles[key])?projectiles[key].map(copy):[];
  system._s3BombDefenseProbe=null;
  system._s3CoolerCollisionLevel=null;
  return system;
}
