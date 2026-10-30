import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

// Sealed raw files from 7e8601d233e2a56ee175f0c459ed304621e870b5,
// the pre-PR1913 paint implementation. Never replace the oracle with the candidate.
const files = {
  bounds: ['patches/local-quality/paint-profile-bounds.mjs', '714b2e9155f16e11cb43e51dc046e87b95d5d70d30959e40b85dc12e1bdc10e6'],
  dry: ['patches/local-quality/paint-dry-region-grid.mjs', '8b532c81fc1a06720afa198271306ae891ce81d282c331ba2c66e3d5e5d946b0'],
  ownership: ['patches/splatoon3/runtime/paint-ownership.mjs', '16c7cf72a8f060a69c00399512526eba1a0e19968b3ce8b306797a7f4925385e'],
};
const sourceRoot = fileURLToPath(new URL('../../../', import.meta.url));
const selectedRoot = process.env.INKWAVE_BUILT_SITE ? path.resolve(process.env.INKWAVE_BUILT_SITE) : sourceRoot;
const selected = rel => pathToFileURL(path.join(selectedRoot, rel)).href;
async function modules(key) {
  const [rel, digest] = files[key];
  const raw = gunzipSync(readFileSync(new URL(`./fixtures/wave345-paint/${path.basename(rel)}.gz`, import.meta.url)));
  assert.equal(createHash('sha256').update(raw).digest('hex'), digest, `sealed ${key} oracle`);
  let old = raw.toString('utf8');
  if (key === 'ownership') {
    const anchor = "from './scoring.mjs'";
    assert.equal(old.split(anchor).length, 2, 'one scoring import in sealed oracle');
    old = old.replace(anchor, `from ${JSON.stringify(selected('patches/splatoon3/runtime/scoring.mjs'))}`);
  }
  // Explicit emitted selection must exist; no source fallback or candidate rewriting.
  const [before, after] = await Promise.all([
    import(`data:text/javascript;base64,${Buffer.from(old).toString('base64')}`),
    import(selected(rel)),
  ]);
  return [before, after];
}
function random(seed) { return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32); }

function boundsInput(i, rng) {
  const size = [256, 512, 1024, 2048, 4096][i % 5], quads = 1 + i % 3;
  const p = {size, quads, aPos:new Float32Array(quads*8), aLocal:new Float32Array(quads*12),
    aSplat:new Float32Array(quads*16), aStretch:new Float32Array(quads*12), aGrow:new Float32Array(quads*16)};
  for (let q=0; q<quads; q++) {
    const R=.02+rng()*12, angle=rng()*7, dx=Math.cos(angle), dy=Math.sin(angle), amount=rng()*4;
    const plane=(rng()-.5)*R, age=rng()*2-.5, lo=-.8+rng()*.2, hi=.1+rng()*.7, L=R*10;
    for(let c=0;c<4;c++) {
      const z=q*4+c, right=c===1||c===2, top=c>=2;
      p.aPos.set([right?hi:lo, top?hi:lo],z*2);
      p.aLocal.set([right?L:-L, top?L:-L, plane],z*3);
      p.aSplat.set([R,.5,.25,20+2*(i%10)],z*4);
      p.aStretch.set([dx,dy,amount],z*3);
      p.aGrow.set([age,.5,0,1234],z*4);
    }
  }
  if(i%5===0) {
    const fields=[p.aPos,p.aLocal,p.aSplat,p.aStretch,p.aGrow], k=Math.floor(i/5);
    fields[k%fields.length][(i*13)%fields[k%fields.length].length]=[NaN,Infinity,-Infinity][k%3];
  }
  return p;
}

test('conservative bounds preserve the sealed pre-PR result and fallback',async()=>{
  const [before,after]=await modules('bounds'), rng=random(0x1960f);
  let accepted=0,rejected=0;
  for(let i=0;i<3000;i++) {
    const p=boundsInput(i,rng), a=new Int32Array(p.quads*4).fill(0x3546), b=a.slice();
    const x=before.profilePaintBounds(p,a), y=after.profilePaintBounds(p,b);
    assert.equal(y,x,`eligibility ${i}`); assert.deepEqual(b,a,`rectangle ${i}`);
    if(x) accepted++; else rejected++;
  }
  assert.ok(accepted>1000 && rejected>100,`accepted ${accepted}, rejected ${rejected}`);
  const p=boundsInput(1,rng), expected=new Int32Array(p.quads*4), actual=new Int32Array(p.quads*4);
  assert.equal(before.profilePaintBounds(p,expected),true);
  assert.equal(after.profilePaintBounds(p,actual),true);
  actual[0]++;
  assert.throws(()=>assert.deepEqual(actual,expected),'oracle detects a changed rectangle');
});

test('dry region expiry and rebuilt rectangles match the sealed pre-PR grid',async()=>{
  const [before,after]=await modules('dry'), rng=random(0x18304);
  let liveWitness=0, fullWitness=0;
  for(let i=0;i<1000;i++) {
    const a=new before.PaintDryRegions([16,64,256,2048][i%4]), b=new after.PaintDryRegions(a.size);
    const positions=new Float32Array(64), rects=new Int32Array(32);
    for(let k=0;k<positions.length;k++) positions[k]=rng()*4-2;
    for(let k=0;k<rects.length;k++) rects[k]=Math.floor(rng()*a.size*3-a.size);
    if(i%50===0) positions[0]=[NaN,Infinity,-Infinity][Math.floor(i/50)%3];
    for(const grid of [a,b]) { grid.markPositions(positions,8,20); grid.markPixelRects(rects,8,30); }
    if(a.live>0) liveWitness++; if(i%50===0 && a.live===a.axis*a.axis) fullWitness++;
    for(const grid of [a,b]) {grid.credit=280;grid.expire();grid.rebuild();}
    assert.deepEqual(Array.from(b.expiry),Array.from(a.expiry),`expiry ${i}`);
    for(const key of ['live','dirty','count','full','credit']) assert.equal(b[key],a[key],`${key} ${i}`);
    assert.deepEqual(Array.from(b.rects),Array.from(a.rects),`rectangles ${i}`);
  }
  assert.ok(liveWitness>0,'region marks produce live cells');
  assert.ok(fullWitness>0,'nonfinite positions exercise full-region fallback');
});

const contract={shapes:[[5,0,0,3],[3,0,0,2],[7,0,0,4],[10,0,0,5],[3,0,0,2],[2,0,0,1],[0,0,0,0],[0,0,0,0]],
  kind:{speck:7},reach:[2.8,3,2.8,2.8,3,2.8,1,1],dripReach:4};
function ownershipRun(module, config) {
  class Paint { splat(){} flush(){} _emitGrowth(){} }
  assert.equal(module.installIssue264PaintOwnership(Paint,contract),true);
  const p=new Paint(); Object.assign(p,{level:{native:true},grid:new Uint8Array(48*48),dead:new Uint8Array(48*48),counts:[0,0],version:0});
  p._preparePaintOwnership(); p._paintOrderRecords=[null,{clock:1,peer:'a',seq:1},{clock:2,peer:'b',seq:1},{clock:3,peer:'a',seq:2}];
  const face={atlas:{ppm:32},su:12,sv:12,nu:48,nv:48,cu:.25,cv:.25,grid:0,wall:config.wall,turf:!config.wall};
  const g={R:config.R,seed:config.seed,kind:config.kind,team:0,paintOrder:1,
    entries:[face,6,6,config.R*.1,Math.cos(config.angle),Math.sin(config.angle),config.sa],dripDur:config.wall?3:0};
  let calls=0,nested=false; const trace=[], marks=[];
  if(config.nested) p._inkMark=(f,x,y)=>{calls++;marks.push([x,y]);if(!nested){nested=true;p._advanceSplatOwnership({...g,team:1,paintOrder:2},1,.5);}};
  for(let i=0;i<6;i++){
    g.age=i*.7;
    const claimed=p._advanceSplatOwnership(g,[.2,.6,1.4,1.6,2,3][i],[0,.2,.4,.6,.8,1][i]);
    trace.push({claimed,grid:Array.from(p.grid),orders:Array.from(p._paintOwnershipOrder),counts:[...p.counts],version:p.version});
  }
  return {trace,grid:Array.from(p.grid),orders:Array.from(p._paintOwnershipOrder),counts:p.counts,version:p.version,calls,nested,marks,
    cacheEntries:(g._s3AncillaryCells||[]).flat().filter(x=>x?.cells?.length>0).length};
}

test('ownership keeps floor and wall growth, native wall cache, and nested mark ordering',async()=>{
  const [before,after]=await modules('ownership'), rng=random(20261029); let cached=0,nested=0,painted=0;
  for(let i=0;i<120;i++) {
    const config={R:.1+rng()*2,seed:rng(),kind:i%6,wall:i%2===0,sa:rng()*1.5,angle:rng()*6,nested:i%6===1};
    const a=ownershipRun(before,config), b=ownershipRun(after,config);
    if(config.nested){assert.ok(a.nested&&a.calls>0,'actual reentrant mark');nested++;}
    if(a.cacheEntries>0 && b.cacheEntries>0)cached++; if(a.grid.some(Boolean))painted++;
    const {cacheEntries: oldCache, ...oldState}=a, {cacheEntries: newCache, ...newState}=b;
    assert.deepEqual(newState,oldState,`ownership case ${i}`);
  }
  assert.ok(cached>0,`native wall cache populated: ${cached}`);
  assert.ok(nested>0 && painted>0,'nested callback and painted cells observed');
});
