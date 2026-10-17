import assert from 'node:assert/strict';
import path from 'node:path';
import { fixture, ROOT } from '../weapons-fixture.mjs';
import { reset, launch, finish, paintMetrics } from '../measure-weapons-fidelity.mjs';
import { compileFlatSourcedStamp } from './source-paint-oracle.mjs';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);

// Observe the real nine-unit release, falling splashes and native landings.
// Negative controls alter only the named paint projection/shape after the
// original source dimensions and owner have already been independently checked.
export async function slosherPaintReceipt({legacyScale=false,legacyDepth=false,legacyMask=false,legacyCircle=false,site}={}) {
  const f=await fixture({fidelity:true,site:site||path.join(ROOT,'.ci-scratch/unbuilt-slosher-golden')});
  const c={key:'slosher',id:'slosher'},a=reset(f,c),scale=f.profile.weaponsFidelityCompletion.worldUnitsPerSourceUnit;
  assert.equal(scale,1,'configured source-to-world scale');
  const nativeImpact=f.projectiles._impact,impacts=[];
  f.projectiles._impact=function(p,hit) {
    if(p.type!=='slosh'||!p.fidelitySloshUnit)return nativeImpact.call(this,p,hit);
    const src=p.fidelitySloshIndex>0?p.fidelitySloshUnit.AfterPaintParam:p.fidelitySloshUnit.PaintParam;
    const distance=Math.hypot(hit.point.x-p.start.x,hit.point.z-p.start.z);
    const t=Math.max(0,Math.min(1,(distance/scale-src.DistanceXZNear)/(src.DistanceXZFar-src.DistanceXZNear)));
    const drop=Math.max(0,p.start.y-hit.point.y);
    const fall=Math.max(0,Math.min(1,(drop-src.ScaleStartFallDistance)/(src.ScaleEndFallDistance-src.ScaleStartFallDistance)));
    const shrink=1+(src.WidthDepthScaleFall-1)*fall;
    const radius=(src.WidthHalfNear+(src.WidthHalfFar-src.WidthHalfNear)*t)*scale*shrink;
    const depthRatio=(src.DepthScaleNear+(src.DepthScaleFar-src.DepthScaleNear)*t)*shrink,depth=Math.max(0,depthRatio-1);
    const splat=f.G.paint.splat;let count=0;
    f.G.paint.splat=function(point,actualRadius,team,opts) {
      count++;near(actualRadius,radius);near(opts.stretchAmt,depth);
      assert.equal(opts.claimOwner,a,'native landing owner');
      impacts.push({distance,radius,depth,index:p.fidelitySloshIndex});
      if(legacyDepth)opts={...opts,stretchAmt:depthRatio};
      if(legacyScale) {
        const oldT=Math.max(0,Math.min(1,(distance-src.DistanceXZNear*.2)/((src.DistanceXZFar-src.DistanceXZNear)*.2)));
        actualRadius=(src.WidthHalfNear+(src.WidthHalfFar-src.WidthHalfNear)*oldT)*.2;
        opts={...opts,stretchAmt:src.DepthScaleNear+(src.DepthScaleFar-src.DepthScaleNear)*oldT};
      }
      return splat.call(this,point,actualRadius,team,opts);
    };
    try{return nativeImpact.call(this,p,hit);}
    finally{f.G.paint.splat=splat;assert.equal(count,1,'one native landing stamp');}
  };
  if(legacyMask||legacyCircle) {
    const sourceSplat=f.G.paint.splat;
    f.G.paint.splat=function(point,radius,team,opts) {
      const kind=legacyMask?(opts.kind==='source-shot'?'shot':opts.kind==='source-splash'?'drop':opts.kind):opts.kind;
      return sourceSplat.call(this,point,radius,team,{...opts,kind,...(legacyCircle?{footprint:null}:{})});
    };
  }
  launch(f,a,c);finish(f,a);
  assert.equal(impacts.length,9,'nine native source-owned landings');
  const paint=paintMetrics(f);
  if(!legacyMask) {
    const cells=independentSlosherCells(f);
    assert.deepEqual(paint.cellsXZ,cells,'every cell matches the independent frozen-edge/source-sphere oracle');
    assert.equal(paint.area,cells.length*paint.cell**2);
  }
  assert.equal(f.draws(),35,'paint shape and dimensions must not change seeded flight');
  return{paint,impacts,stamps:structuredClone(f.paints)};
}

function independentSlosherCells(f) {
  assert.equal(f.G.paint.paintFaces.length,1);
  const face=f.G.paint.paintFaces[0];
  assert.deepEqual(Array.from(face.n.toArray()),[0,1,0]);
  assert.deepEqual(Array.from(face.u.toArray()),[1,0,0]);
  assert.deepEqual(Array.from(face.v.toArray()),[0,0,1]);
  assert.equal(f.paints.length,19,'nearest + nine flight splashes + nine impacts');
  assert.equal(f.paints.filter(p=>p.kind==='source-shot').length,9);
  assert.equal(f.paints.filter(p=>p.kind==='source-splash').length,10);
  const noDepth=f.paints.filter(p=>p.stretch===null);
  assert.equal(noDepth.length,9,'depth-one falling splashes retain no directional stretch');
  assert.ok(noDepth.every(p=>p.kind==='source-splash'&&p.stretchAmt===null));
  const masks=f.paints.map(p=>{assert.equal(p.cosmetic,false);assert.equal(p.team,0);return compileFlatSourcedStamp(p);});
  const cells=[];
  for(let j=0;j<face.nv;j++)for(let i=0;i<face.nu;i++) {
    const x=face.origin.x+(i+.5)*face.cu,z=face.origin.z+(j+.5)*face.cv;
    if(masks.some(owns=>owns(x,z)))cells.push([x,z]);
  }
  return cells;
}
