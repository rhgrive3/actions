import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const load=async (file,salt='')=>import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(new URL(file,import.meta.url),'utf8')+'\nexport {prepareAncillary,pointInsideAncillary};\n// '+salt).toString('base64'));
const old=await load('./fixtures/paint-piece-ownership-baseline.mjs');
const current=await load('../runtime/paint-ownership.mjs');
// Keep the original allocating shape formulas as the independent value oracle.
// Model every fixed pool field explicitly, including retained inactive values.
const freshPiece=()=>({type:0,ax:0,ay:0,bx:0,by:0,ra:0,rb:0,x:0,y:0,radius:0,ux:0,uy:0,el:0,x0:0,yTop:0,len:0,w:0,h2:0,k:0,r:0,minX:0,maxX:0,minY:0,maxY:0});
function pooledOracle(){
 const slots=[];
 return mask=>{
  if(mask===null)return null;
  const pieces=mask.pieces.map((piece,i)=>{
   const slot=slots[i]||(slots[i]=freshPiece());
   for(const key of Object.keys(piece))assert.ok(Object.hasOwn(slot,key),'known original field '+key);
   Object.assign(slot,piece);return {...slot};
  });
  return {...mask,pieces};
 };
}
const contract={shapes:Array.from({length:8},()=>[4,3,3,3]),kind:{speck:7},reach:[2.8,3,2.8,2.8,3,2.8,1,1],dripReach:4};
test('direct-piece sampling preserves every type, stretch and boundary predicate',()=>{
 const expectedPool=pooledOracle();
 let word=0x3876219,checked=0;const types=new Set();const random=()=>{word=(Math.imul(word,1664525)+1013904223)>>>0;return word/4294967296;};
 for(const wall of [false,true])for(const sa of [0,.4,1.7])for(const seed of [0,.37,.99999])for(const tn of [.01,.5,1.2,3]){
  const face={wall,atlas:{ppm:32}},g={R:2.7,kind:3,seed,dripDur:wall?3:0};
  const mask=old.prepareAncillary(g,face,10,12,.2,.6,.8,sa,tn,Math.min(1,tn/3),contract);
  const actual=current.prepareAncillary(g,face,10,12,.2,.6,.8,sa,tn,Math.min(1,tn/3),contract);
  assert.deepEqual(actual,expectedPool(mask));
  for(let index=0;index<mask.pieces.length;index++){
   const p=mask.pieces[index];types.add(p.type);
   const samples=[];for(const x of[p.minX-mask.margin,p.maxX+mask.margin])for(const y of[p.minY-mask.margin,p.maxY+mask.margin])for(const eps of[-1e-12,0,1e-12])samples.push([x+eps,y-eps]);
   for(let i=0;i<32;i++)samples.push([p.minX-1+random()*(p.maxX-p.minX+2),p.minY-1+random()*(p.maxY-p.minY+2)]);
   for(const[x,y]of samples){assert.equal(current.pointInsideAncillary(actual,x,y,actual.seed,actual.pieces[index]),old.pointInsideAncillary({...mask,pieces:[p]},x,y,mask.seed));checked++;}
  }
 }
 assert.deepEqual([...types].sort(),[0,1,2,3]);assert.ok(checked>30000);
});

test('circle and ellipse inner boundaries retain the exact signed-distance predicate', () => {
  let checked = 0;
  const types = new Set();
  for (const wall of [false, true]) for (const sa of [0, .4, 1.7]) {
    for (const seed of [0, .37, .99999]) for (const tn of [.01, .5, 1.2, 3]) {
      const face = { wall, atlas: { ppm: 32 } };
      const g = { R: 2.7, kind: 3, seed, dripDur: wall ? 3 : 0 };
      const mask = old.prepareAncillary(g, face, 10, 12, .2, .6, .8, sa, tn, Math.min(1, tn / 3), contract);
      for (const p of mask.pieces) {
        if (![1, 2].includes(p.type) || p.radius <= mask.margin) continue;
        types.add(p.type);
        const oracleMask = { ...mask, pieces: [p] };
        const limit = p.radius - mask.margin;
        // The outer bounding-box samples above do not exercise this inner
        // decision boundary. Include both sides within a few binary64 ULPs.
        for (let direction = 0; direction < 128; direction++) {
          for (const delta of [-4, -2, -1, 0, 1, 2, 4]) {
            const radius = limit * (1 + delta * Number.EPSILON);
            const angle = direction / 128 * Math.PI * 2;
            let x = radius * Math.cos(angle), y = radius * Math.sin(angle);
            if (p.type === 2) {
              const along = x * p.ux + y * p.uy;
              x += p.ux * along * (p.el - 1);
              y += p.uy * along * (p.el - 1);
            }
            x += p.x; y += p.y;
            if (sa > 0) {
              const along = x * mask.sdu + y * mask.sdv;
              const scale = along > 0 ? 1 + sa : 1 + .25 * sa;
              x += mask.sdu * along * (scale - 1);
              y += mask.sdv * along * (scale - 1);
            }
            assert.equal(current.pointInsideAncillary(mask, x, y, mask.seed, p),
              old.pointInsideAncillary(oracleMask, x, y, mask.seed),
              `type=${p.type}, wall=${wall}, stretch=${sa}, seed=${seed}, time=${tn}, direction=${direction}, delta=${delta}`);
            checked++;
          }
        }
      }
    }
  }
  assert.deepEqual([...types].sort(), [1, 2]);
  assert.ok(checked > 400000);
});

test('pooled records retain explicit full schema across cross-type reuse, truncation and empty calls',async()=>{
 const isolated=await load('../runtime/paint-ownership.mjs','independent-pool-reuse');
 const expectedPool=pooledOracle(),refs=[];
 let previousMask=null,sawReuse=false,sawTruncate=false,previousLength=0;
 const schedules=[[4,3,3,3],[0,0,0,3],[1,0,0,0],[0,3,0,0],[0,0,3,0],[0,0,0,0],[4,3,3,3]];
 for(let cycle=0;cycle<3;cycle++)for(const counts of schedules){
  const shapeContract={...contract,shapes:Array.from({length:8},()=>counts)};
  const face={wall:true,atlas:{ppm:32}},g={R:2.7,kind:3,seed:.37+cycle*.1,dripDur:3};
  const args=[g,face,10,12,.2,.6,.8,cycle*.4,3,1,shapeContract];
  const oracle=old.prepareAncillary(...args),actual=isolated.prepareAncillary(...args);
  assert.deepEqual(actual,expectedPool(oracle),'all active and inactive fields');
  if(actual===null)continue;
  if(previousMask)assert.equal(actual,previousMask,'one reusable mask');
  previousMask=actual;
  if(actual.pieces.length<previousLength)sawTruncate=true;
  previousLength=actual.pieces.length;
  for(let i=0;i<actual.pieces.length;i++){
   const p=actual.pieces[i];
   assert.deepEqual(Object.keys(p).sort(),Object.keys(freshPiece()).sort(),'fixed complete schema');
   if(refs[i]){assert.equal(p,refs[i],'stable slot object');sawReuse=true;}else refs[i]=p;
   for(const [x,y]of[[p.minX,p.minY],[p.maxX,p.maxY],[(p.minX+p.maxX)/2,(p.minY+p.maxY)/2]]){
    assert.equal(isolated.pointInsideAncillary(actual,x,y,actual.seed,p),old.pointInsideAncillary({...oracle,pieces:[oracle.pieces[i]]},x,y,oracle.seed));
   }
  }
 }
 assert(sawReuse);assert(sawTruncate);
});
