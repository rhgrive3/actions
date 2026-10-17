// Explicit 11.3.0 fields are retained in main-weapon-catalog-data.mjs.
// These fallback values are INKWAVE modelling choices, NOT extracted defaults:
// horizontal Saber drops must fall independently of the zero-gravity wave;
// sparse LACT/Brella tables do not specify every count/spacing/physics field.
import { catalogSplashDropSpec, catalogSplashFirst } from './catalog-splash-paint.mjs';
import { SPLASH_DROP_AIR_RESIST } from './blaster-flight-paint.mjs';
const finite = (v, fallback) => Number.isFinite(v) ? v : fallback;
export const ADDED_PAINT_MODEL = Object.freeze({ gravity: .016, stringerCount: 5, brellaCount: 6, brellaSpacing: 3 });

export function addedFamilySplash(source, family, ordinal) {
  if (!['stringer','splatana'].includes(family)) return null;
  const spawn=source.SplashSpawnParam, paint=source.SplashPaintParam;
  if (!spawn || !(paint?.WidthHalf>0)) return null;
  const spacing=finite(spawn.DropInterval,3), nearest=finite(spawn.NearestLen,1);
  const first=catalogSplashFirst({ ...spawn, SpawnNearestLength:nearest, SpawnBetweenLength:spacing },ordinal);
  // Preserve the established positive-gravity path. A horizontal Saber has
  // explicit zero projectile gravity; it must not disable its detached drops.
  const spec=catalogSplashDropSpec(source)||catalogSplashDropSpec({ ...source,
    MoveParam:{ ...source.MoveParam, FreeGravity:ADDED_PAINT_MODEL.gravity } });
  return { spec, first, spacing, count:Math.max(0,Math.floor(finite(spawn.SplashNumMax,
    family==='stringer'?ADDED_PAINT_MODEL.stringerCount:0))) };
}

export function brellaSplashPlan(source) {
  const p=source?.SplashParam;
  if (!p || ![p.SplashPaintWidthFullActive,p.SplashPaintWidthOneActive,
    p.SplashPaintDepthScaleFullActive,p.SplashPaintDepthScaleOneActive].every(v=>Number.isFinite(v)&&v>0)) return null;
  return { first:finite(p.CreateSplashLength,ADDED_PAINT_MODEL.brellaSpacing),
    spacing:finite(p.CreateSplashLength,ADDED_PAINT_MODEL.brellaSpacing),
    count:Math.max(0,Math.floor(finite(p.CreateSplashNum,ADDED_PAINT_MODEL.brellaCount))), source:p };
}

// A Brella volley owns ONE intermediate drop at each distance. Contributions
// are collected from every surviving pellet, even if the centre pellet hit a
// wall. Wait for all members to cross/terminate so iteration order and host
// frame rate cannot change the active fraction, centroid or number of drops.
export function collectBrellaSplashes(node, projectile, end, ended, release) {
  const volley=node.volley,plan=volley.plan, before=node.distance;
  const distance=projectile.prev.distanceTo(end), limit=before+distance;
  for(let i=volley.next;i<plan.count;i++) {
    const at=plan.first+i*plan.spacing;
    if(at>limit+1e-9)break;
    if(at+1e-9<before || node.samples.has(i))continue;
    node.samples.set(i,projectile.prev.clone().lerp(end,distance>0?Math.max(0,Math.min(1,(at-before)/distance)):0));
  }
  node.distance=limit;node.ended=ended;
  while(volley.next<plan.count){
    const i=volley.next,at=plan.first+i*plan.spacing;
    if(!volley.nodes.every(n=>n.ended||n.distance+1e-9>=at))break;
    const points=volley.nodes.map(n=>n.samples.get(i)).filter(Boolean);
    if(points.length){
      const centre=points[0].clone().set(0,0,0);
      for(const point of points)centre.add(point);
      centre.multiplyScalar(1/points.length);
      const active=volley.nodes.length>1?(points.length-1)/(volley.nodes.length-1):1,p=plan.source;
      const radius=p.SplashPaintWidthOneActive+(p.SplashPaintWidthFullActive-p.SplashPaintWidthOneActive)*active;
      const depth=p.SplashPaintDepthScaleOneActive+(p.SplashPaintDepthScaleFullActive-p.SplashPaintDepthScaleOneActive)*active;
      release(centre,radius,{ gravity:ADDED_PAINT_MODEL.gravity*3600,drag:SPLASH_DROP_AIR_RESIST,
        surfaceOnly:true,depthScaleMax:depth,depthScaleMin:depth,dropHeightMax:0,dropHeightMin:0,
        randomVelocity:{x:finite(p.RandomSpawnVelXMax,0)*60,y:finite(p.RandomSpawnVelYMax,0)*60,
          zMin:finite(p.RandomSpawnVelZMin,0)*60,zMax:finite(p.RandomSpawnVelZMax,0)*60} },i);
    }
    for(const n of volley.nodes)n.samples.delete(i);
    volley.next++;
  }
}
