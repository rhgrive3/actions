// #1165: target the actual remaining mismatch, not an obsolete sine/tooth
// difference: the real CPU and GPU already share the same tooth SDF, but
// the old CPU broadphase circle clips legal rotated/seed-expanded corners.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptBuildSource } from '../inkwave-source-composition.mjs';
import { fixture } from '../../patches/splatoon3/tests/source-fixture.mjs';

const raw=fs.readFileSync(new URL('../../inkwave-public/src/world/paint.js',import.meta.url),'utf8');
const source=adaptBuildSource('src/world/paint.js',raw);
const hypot=Math.hypot;
const tooth=x=>1-4*Math.abs(x-Math.floor(x)-.5);
function gpuToothDistance(along,across,seed,r=1){
  const wob=r*(0.08*tooth(along/r*2.1+seed*4.7+.25)
    +0.04*tooth(along/r*5.3+seed*2.3+.25));
  const qa=Math.abs(along)-r*.55,qb=Math.abs(across)-r*.62-wob;
  return hypot(Math.max(qa,0),Math.max(qb,0))+Math.min(Math.max(qa,qb),0)-r*.1;
}
const oldExtent=hypot(.55,.62)+.1+.05;
const safeExtent=hypot(.55+.1,.62+.1+.08+.04);

test('#1165 production composition preserves the identical GPU and CPU triangular SDF',()=>{
  assert.ok(raw.includes('float wv = r * (0.03 * sin('),'unmodified source still has its pre-patch GPU formula');
  assert.match(source,/float wv = r \* \(0\.08 \* \(1\.0 - 4\.0 \* abs\(fract\(/);
  assert.match(source,/const toothA = along \/ r \* 2\.1 \+ seed \* 4\.7/);
  assert.match(source,/if \(sd > 0\) continue;/);
  assert.match(source,/const ext = roll \? r \* Math\.hypot\(BAND_L \+ BAND_R, BAND_W \+ BAND_R \+ 0\.12\)/);
  assert.doesNotMatch(source,/export function rollerBandSignedDistance/,'do not introduce a second competing SDF');
});

test('#1165 actual CPU grid admits rotated seeded body corner the historical scan skipped',async()=>{
  const seed=.4125,along=.623,across=.788,r=1;
  const dist=gpuToothDistance(along,across,seed,r),radius=hypot(along,across);
  assert.ok(dist<-.012 && radius>oldExtent+.01 && radius<safeExtent,
    'strictly inside the emitted GPU body, outside the former CPU scan circle');
  const f=await fixture({productionComposition:true}),p=Object.create(f.PaintSystem.prototype);
  const face={grid:0,cu:.01,cv:.01,nu:1024,nv:1024,turf:true};
  p.grid=new Uint8Array(face.nu*face.nv);p.dead=new Uint8Array(p.grid.length);
  p.counts=new Uint32Array(2);p.version=0;
  // This regression measures only the source-composed _cpuSplat candidate
  // rectangle and core SDF; network ownership chronology has its own tests.
  p._paintClaimCell=()=>true;
  const i=500,j=500,c=(i+.5)*face.cu;
  const a=-Math.atan2(across,along),dx=Math.cos(a),dy=Math.sin(a);
  const px=along*dx-across*dy,py=along*dy+across*dx;
  assert.ok(Math.abs(py)<1e-12);
  const lu=c-px,lv=c-py,oldI1=Math.floor((lu+oldExtent)/face.cu);
  assert.ok(oldI1<i,'the old broadphase would never visit this legal GPU cell');
  const painted=p._cpuSplat(face,lu,lv,r,0,seed,dx,dy,0,6);
  assert.ok(painted>0);
  assert.equal(p.grid[face.grid+j*face.nu+i],1,'the published CPU scorer owns the visible GPU cell');
  assert.ok(p.version>0);
});

test('#1165 conservative radius is mathematically bounded for all tooth phases',()=>{
  for(const seed of [0,.12,.4125,.75,.99])for(let k=-65;k<=65;k++){
    const along=k/100;
    for(let j=-85;j<=85;j++){
      const across=j/100;
      if(gpuToothDistance(along,across,seed)>0)continue;
      assert.ok(hypot(along,across)<=safeExtent+1e-12,JSON.stringify({seed,along,across}));
    }
  }
});
