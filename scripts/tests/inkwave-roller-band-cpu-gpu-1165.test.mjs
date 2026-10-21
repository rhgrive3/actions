// #1165: regression against the *actual composed* PaintSystem CPU band and
// the pinned GPU shader's final-body expression, not a rewritten fake painter.
// The upstream game source remains byte-identical; only the build adapter adds
// one shared JS SDF for authoritative cell ownership.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptBuildSource } from '../inkwave-source-composition.mjs';
import { fixture } from '../../patches/splatoon3/tests/source-fixture.mjs';

const source = fs.readFileSync(new URL('../../inkwave-public/src/world/paint.js',import.meta.url),'utf8');
const composed = adaptBuildSource('src/world/paint.js',source);
const r = 0.62, seed = Math.PI/60;
function gpuFinalBand(x,y,R,s) {
  // From the actual PAINT_FS branch (grow=1, dir=(1,0), no splat smear).
  const wv=R*(0.03*Math.sin(x/R*9+s*30)+0.018*Math.sin(x/R*23+s*11));
  const qa=Math.abs(x)-R*.55,qb=Math.abs(y)-(R*.62+wv);
  return Math.hypot(Math.max(qa,0),Math.max(qb,0))+Math.min(Math.max(qa,qb),0)-R*.1;
}
function painter(f) {
  const p=Object.create(f.PaintSystem.prototype);
  p.grid=new Uint8Array(16*16);
  p.dead=new Uint8Array(16*16);
  p.counts=new Uint32Array(2);
  p.version=0;
  const face={grid:0,cu:.25,cv:.25,nu:16,nv:16,turf:true};
  return {p,face,index:(i,j)=>j*face.nu+i};
}
function stampCell(f,{sx=0,sy=.73*r,seedValue=seed,dir=0,team=0}={}) {
  const d=painter(f),i=5,j=5;
  const centre=(i+.5)*.25, pixel=(j+.5)*.25;
  // Desired local physical offset is rotated into each face-space direction.
  const px=sx*Math.cos(dir)-sy*Math.sin(dir);
  const py=sx*Math.sin(dir)+sy*Math.cos(dir);
  const lu=centre-px, lv=pixel-py;
  d.p._cpuSplat(d.face,lu,lv,r,team,seedValue,Math.cos(dir),Math.sin(dir),0,6);
  return {painted:d.p.grid[d.index(i,j)]===team+1,paint:d.p,cell:d.index(i,j)};
}

test('#1165 build output replaces only Roller CPU ownership with seeded GPU-core equation',()=>{
  assert.ok(!source.includes('rollerBandSignedDistance'),'upstream remains immutable');
  assert.equal((composed.match(/export function rollerBandSignedDistance\(/g)||[]).length,1);
  assert.equal((composed.match(/if \(rollerBandSignedDistance\(along, across, r, seed\) > 0\) continue;/g)||[]).length,1);
  assert.ok(composed.includes('float wv = r * (0.03 * sin(q.x / r * 9.0 + seed * 30.0)'),
    'the actual GPU shader remains the referenced equation');
  assert.ok(!composed.includes('if (sd > -0.03 * r) continue;'),
    'inset scoring mismatch is retired, not merely masked by a cosmetic overlay');
});

test('#1165 seeded positive Roller wobble owns cell rendered by GPU, negative seed does not',async()=>{
  const f=await fixture({productionComposition:true});
  const positive=stampCell(f),negative=stampCell(f,{seedValue:.35});
  assert.equal(positive.painted,true,'GPU-painted band cell must be gameplay-owned');
  assert.equal(positive.paint.counts[0]>0,true);
  assert.equal(negative.painted,false,'outside the seeded band stays unowned');
  assert.ok(gpuFinalBand(0,.73*r,r,seed)<0);
  assert.ok(gpuFinalBand(0,.73*r,r,.35)>0);
  const old=0.73*r-(.62+.1)*r;
  assert.ok(old>-.03*r,'historical CPU formula skipped the positive GPU cell');
});

test('#1165 final Roller SDF matches GPU expression across seeds, position and rotations',async()=>{
  const f=await fixture({productionComposition:true});
  const cpu=f.rollerBandSignedDistance;
  assert.equal(typeof cpu,'function');
  for(const s of [0,seed,.1,.2,.35,.5,.75,1])for(const x of [-.65,-.55,-.3,0,.25,.55,.65]){
    for(const y of [-.78,-.73,-.68,-.2,0,.2,.68,.73,.78]){
      const a=cpu(x*r,y*r,r,s),b=gpuFinalBand(x*r,y*r,r,s);
      assert.ok(Math.abs(a-b)<1e-12,JSON.stringify({s,x,y,a,b}));
      for(const angle of [Math.PI/7,Math.PI/3,Math.PI*.91]){
        const v=stampCell(f,{sx:x*r,sy:y*r,seedValue:s,dir:angle});
        // If a cell lies comfortably away from antialias threshold, its CPU
        // claim must match the GPU core (the shader is continuous at sd==0).
        if(Math.abs(b)>0.008*r)assert.equal(v.painted,b<0,JSON.stringify({s,x,y,angle,b}));
      }
    }
  }
});

test('#1165 30/60/120Hz fixed render rates result in identical turf cells',async()=>{
  const f=await fixture({productionComposition:true});
  const snapshots=[];
  for(const hz of [30,60,120]){
    const d=painter(f),clock=new f.FixedClock();
    let tick=0;
    for(let i=0;i<hz;i++)clock.advance(1/hz,()=>{
      const lu=1.25+0.008*tick++,lv=1.5;
      d.p._cpuSplat(d.face,lu,lv,r,0,seed,1,0,0,6);
    });
    assert.equal(clock.ticks,60);
    snapshots.push([...d.p.grid]);
  }
  assert.deepEqual(snapshots[0],snapshots[1]);
  assert.deepEqual(snapshots[1],snapshots[2]);
});

test('#1165 non-Roller impact remains under its unchanged legacy body predicate',()=>{
  const anchor='if (d / (r * blobWobble(Math.atan2(py, px), seed)) > 0.97) continue;';
  assert.ok(source.includes(anchor));
  assert.ok(composed.includes(anchor));
});
