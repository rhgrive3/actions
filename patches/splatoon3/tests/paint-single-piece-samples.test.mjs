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
  assert.deepEqual(current.prepareAncillary(g,face,10,12,.2,.6,.8,sa,tn,Math.min(1,tn/3),contract),mask);
  for(let index=0;index<mask.pieces.length;index++){
   const p=mask.pieces[index];types.add(p.type);
   const samples=[];for(const x of[p.minX-mask.margin,p.maxX+mask.margin])for(const y of[p.minY-mask.margin,p.maxY+mask.margin])for(const eps of[-1e-12,0,1e-12])samples.push([x+eps,y-eps]);
   for(let i=0;i<32;i++)samples.push([p.minX-1+random()*(p.maxX-p.minX+2),p.minY-1+random()*(p.maxY-p.minY+2)]);
   for(const[x,y]of samples){assert.equal(current.pointInsideAncillary(mask,x,y,mask.seed,p),old.pointInsideAncillary({...mask,pieces:[p]},x,y,mask.seed));checked++;}
  }
 }
 assert.deepEqual([...types].sort(),[0,1,2,3]);assert.ok(checked>30000);
});
