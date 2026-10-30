// Explicit 11.3.0 fields are retained in main-weapon-catalog-data.mjs.
// These fallback values are INKWAVE modelling choices, NOT extracted defaults:
// horizontal Saber drops must fall independently of the zero-gravity wave;
// sparse LACT/Brella tables do not specify every count/spacing/physics field.
import { catalogSplashDropSpec, catalogSplashFirst } from './catalog-splash-paint.mjs';
import { SPLASH_DROP_AIR_RESIST } from './blaster-flight-paint.mjs';
const finite = (v, fallback) => Number.isFinite(v) ? v : fallback;
export const ADDED_PAINT_MODEL = Object.freeze({ gravity: .016, stringerCount: 5, brellaCount: 6, brellaSpacing: 3 });

export function addedFamilySplash(source, family, ordinal) {
  if (family!=='stringer'&&family!=='splatana') return null;
  const spawn=source.SplashSpawnParam, paint=source.SplashPaintParam;
  if (!spawn || !(paint?.WidthHalf>0)) return null;
  const spacing=finite(spawn.DropInterval,3), nearest=finite(spawn.NearestLen,1);
  const first=catalogSplashFirst({ ...spawn, SpawnNearestLength:nearest, SpawnBetweenLength:spacing },ordinal);
  // Preserve the established positive-gravity path. A horizontal Saber has
  // explicit zero projectile gravity; it must not disable its detached drops.
  const spec=catalogSplashDropSpec(source)||catalogSplashDropSpec(source,null,'normal',ADDED_PAINT_MODEL.gravity);
  return { spec, first, spacing, count:Math.max(0,Math.floor(finite(spawn.SplashNumMax,
    family==='stringer'?ADDED_PAINT_MODEL.stringerCount:0))) };
}

export function brellaSplashPlan(source) {
  const p=source?.SplashParam;
  if (!p) return null;
  const fullWidth=p.SplashPaintWidthFullActive,oneWidth=p.SplashPaintWidthOneActive,
    fullDepth=p.SplashPaintDepthScaleFullActive,oneDepth=p.SplashPaintDepthScaleOneActive;
  if (!Number.isFinite(fullWidth)||!(fullWidth>0)||!Number.isFinite(oneWidth)||!(oneWidth>0)||
      !Number.isFinite(fullDepth)||!(fullDepth>0)||!Number.isFinite(oneDepth)||!(oneDepth>0)) return null;
  // CreateSplashLength is the interval between shared volley drops. Starting
  // at one whole interval skipped the birth/feet member and left a dry gap.
  // Start at birth and retain the same total budget; exact retail phase still
  // needs a capture (the sparse table does not publish that initial phase).
  return { first:0,
    spacing:finite(p.CreateSplashLength,ADDED_PAINT_MODEL.brellaSpacing),
    count:Math.max(0,Math.floor(finite(p.CreateSplashNum,ADDED_PAINT_MODEL.brellaCount))), source:p };
}

// A Brella volley owns ONE intermediate drop at each distance. Contributions
// are collected from every surviving pellet, even if the centre pellet hit a
// wall. Wait for all members to cross/terminate so iteration order and host
// frame rate cannot change the active fraction, centroid or number of drops.
// The optional borrowed-centre mode is for synchronous-copy releases only.
// Default callers retain fresh Vector3 ownership, including diagnostic hooks.
export function collectBrellaSplashes(node, projectile, end, ended, release, synchronousCopy = false) {
  const volley=node.volley,plan=volley.plan, before=node.distance;
  const centreDepth=synchronousCopy?(volley._centreDepth||0):0;
  if(synchronousCopy)volley._centreDepth=centreDepth+1;
  try {
  const distance=projectile.prev.distanceTo(end), limit=before+distance;
  for(let i=volley.next;i<plan.count;i++) {
    const at=plan.first+i*plan.spacing;
    if(at>limit+1e-9)break;
    if(at+1e-9<before || node.samples.has(i))continue;
    node.samples.set(i,{point:projectile.prev.clone().lerp(end,distance>0?Math.max(0,Math.min(1,(at-before)/distance)):0),
      frame:finite(projectile.age,0)*60});
  }
  node.distance=limit;node.ended=ended;if(ended)node.endFrame=finite(projectile.age,0)*60;
  while(volley.next<plan.count){
    const i=volley.next,at=plan.first+i*plan.spacing;
    // At the zero-distance nearest member, an untouched node also has
    // distance=0. Require its actual sample before computing the centroid.
    const blocked=volley.blockedNode;
    if(blocked&&volley.nodes[volley.blockedIndex]===blocked&&!blocked.ended&&!blocked.samples.has(i))break;
    let ready=true;volley.blockedNode=null;
    for(let j=0;j<volley.nodes.length;j++)if(j in volley.nodes){const n=volley.nodes[j];
      if(!(n.ended||n.samples.has(i))){volley.blockedNode=n;volley.blockedIndex=j;ready=false;break;}
    }
    if(!ready)break;
    let centre=null,count=0,birthFrame=-Infinity;
    for(const n of volley.nodes){
      const sample=n.samples.get(i);
      birthFrame=Math.max(birthFrame,sample?.frame??n.endFrame??0);
      if(sample){
        if(!centre){
          centre=synchronousCopy?(volley._centres?.[centreDepth]||((volley._centres||=[])[centreDepth]=sample.point.clone())):sample.point.clone();
          centre.set(0,0,0);
        }
        centre.add(sample.point);count++;
      }
    }
    // Projectiles consume all their substeps before the next pellet. A ready
    // volley may therefore depend on a later substep of an earlier member.
    if(count){
      centre.multiplyScalar(1/count);
      const active=volley.nodes.length>1?(count-1)/(volley.nodes.length-1):1,p=plan.source;
      const radius=p.SplashPaintWidthOneActive+(p.SplashPaintWidthFullActive-p.SplashPaintWidthOneActive)*active;
      const depth=p.SplashPaintDepthScaleOneActive+(p.SplashPaintDepthScaleFullActive-p.SplashPaintDepthScaleOneActive)*active;
      release(centre,radius,{ gravity:ADDED_PAINT_MODEL.gravity*3600,drag:SPLASH_DROP_AIR_RESIST,
        surfaceOnly:true,depthScaleMax:depth,depthScaleMin:depth,dropHeightMax:0,dropHeightMin:0,
        randomVelocity:{x:finite(p.RandomSpawnVelXMax,0)*60,y:finite(p.RandomSpawnVelYMax,0)*60,
          zMin:finite(p.RandomSpawnVelZMin,0)*60,zMax:finite(p.RandomSpawnVelZMax,0)*60} },i,birthFrame);
    }
    for(const n of volley.nodes)n.samples.delete(i);
    volley.next++;
  }
  } finally {if(synchronousCopy)volley._centreDepth=centreDepth;}
}
