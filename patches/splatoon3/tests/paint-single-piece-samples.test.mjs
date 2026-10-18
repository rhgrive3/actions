import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const load=async file=>import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(new URL(file,import.meta.url),'utf8')+'\nexport {prepareAncillary,pointInsideAncillary};').toString('base64'));
const old=await load('./fixtures/paint-piece-ownership-baseline.mjs');
const current=await load('../runtime/paint-ownership.mjs');
const contract={shapes:Array.from({length:8},()=>[4,3,3,3]),kind:{speck:7},reach:[2.8,3,2.8,2.8,3,2.8,1,1],dripReach:4};
test('direct-piece sampling preserves every type, stretch and boundary predicate',()=>{
 let word=0x3876219,checked=0;const types=new Set();const random=()=>{word=(Math.imul(word,1664525)+1013904223)>>>0;return word/4294967296;};
 for(const wall of [false,true])for(const sa of [0,.4,1.7])for(const seed of [0,.37,.99999])for(const tn of [.01,.5,1.2,3]){
  const face={wall,atlas:{ppm:32}},g={R:2.7,kind:3,seed,dripDur:wall?3:0};
  const mask=old.prepareAncillary(g,face,10,12,.2,.6,.8,sa,tn,Math.min(1,tn/3),contract);
  const actual=current.prepareAncillary(g,face,10,12,.2,.6,.8,sa,tn,Math.min(1,tn/3),contract);
  assert.ok(actual,'production ancillary mask exists');
  assert.equal(actual.pieces.length,mask.pieces.length,'same generated paint-piece count');
  // The production hot path pools uniform scratch records with zero-valued
  // fields for other piece types. Compare every field the immutable baseline
  // actually defines, then test the exact inside/outside predicate below.
  // Requiring identical object key sets would reject a safe allocation change.
  const semantic={...actual,pieces:actual.pieces.map((p,i)=>
    Object.fromEntries(Object.keys(mask.pieces[i]).map(key=>[key,p[key]])))};
  assert.deepEqual(semantic,mask);
  for(let index=0;index<mask.pieces.length;index++){
   const p=mask.pieces[index];types.add(p.type);
   const samples=[];for(const x of[p.minX-mask.margin,p.maxX+mask.margin])for(const y of[p.minY-mask.margin,p.maxY+mask.margin])for(const eps of[-1e-12,0,1e-12])samples.push([x+eps,y-eps]);
   for(let i=0;i<32;i++)samples.push([p.minX-1+random()*(p.maxX-p.minX+2),p.minY-1+random()*(p.maxY-p.minY+2)]);
   for(const[x,y]of samples){assert.equal(current.pointInsideAncillary(mask,x,y,mask.seed,p),old.pointInsideAncillary({...mask,pieces:[p]},x,y,mask.seed));checked++;}
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
