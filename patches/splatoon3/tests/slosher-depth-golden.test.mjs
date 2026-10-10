import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../../scripts/weapons-fixture.mjs';
import { reset, launch, finish, paintMetrics } from '../../../scripts/measure-weapons-fidelity.mjs';

// This is a deterministic .25-unit native scoring receipt, not retail range.
// Compute impact dimensions directly from pinned PaintParam fields, separately
// from fidelitySlosherImpactPaint, then compare every scoring cell.
test('Slosher integrated paint receipt uses one source depth ratio, not an extra base width', async () => {
  async function shot(independent) {
    const f=await fixture({site:'/nonexistent/inkwave-slosher-depth-source',fidelity:true});
    const c={id:'slosher',key:'slosher'},actor=reset(f,c);let impacts=0;
    if(independent){
      const impact=f.projectiles._impact;
      f.projectiles._impact=function(p,hit){
        if(p.type!=='slosh')return impact.call(this,p,hit);
        const src=p.fidelitySloshIndex>0?p.fidelitySloshUnit.AfterPaintParam:p.fidelitySloshUnit.PaintParam;
        const scale=f.profile.weaponsFidelityCompletion.worldUnitsPerSourceUnit;
        assert.ok(p.start.y-hit.point.y<=src.ScaleStartFallDistance,'fixture is below high-drop shrink');
        const distance=Math.hypot(hit.point.x-p.start.x,hit.point.z-p.start.z)/scale;
        const t=Math.max(0,Math.min(1,(distance-src.DistanceXZNear)/(src.DistanceXZFar-src.DistanceXZNear)));
        const radius=(src.WidthHalfNear+(src.WidthHalfFar-src.WidthHalfNear)*t)*scale;
        const ratio=src.DepthScaleNear+(src.DepthScaleFar-src.DepthScaleNear)*t;
        const splat=f.G.paint.splat;
        f.G.paint.splat=function(center,_radius,team,opts){impacts++;return splat.call(this,center,radius,team,{...opts,stretchAmt:Math.max(0,ratio-1)});};
        try{return impact.call(this,p,hit);}finally{f.G.paint.splat=splat;}
      };
    }
    launch(f,actor,c);finish(f,actor);
    return {grid:Array.from(f.G.paint.grid),paint:paintMetrics(f),impacts};
  }
  const actual=await shot(false),independent=await shot(true);
  assert.equal(independent.impacts,9);
  assert.deepEqual(actual.grid,independent.grid);
  assert.equal(independent.paint.bounds.maxZ,16.375);
  assert.equal(independent.paint.cells,1179);
});
