import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {claimAncillaryCells as baseline,ensureOwnershipState as oldState} from './fixtures/paint-piece-ownership-baseline.mjs';
const source=fs.readFileSync(new URL('../runtime/paint-ownership.mjs',import.meta.url),'utf8');
const candidate=await import('data:text/javascript;base64,'+Buffer.from(source+'\nexport {claimAncillaryCells,ensureOwnershipState};').toString('base64'));
const contract={shapes:[[5,0,0,3],[3,0,0,2],[7,0,0,4],[10,0,0,5],[3,0,0,2],[2,0,0,1],[0,0,0,0],[0,0,0,0]],kind:{speck:7},reach:[2.8,3,2.8,2.8,3,2.8,1,1],dripReach:4};
function paint(){const p={grid:new Uint8Array(96*96),dead:new Uint8Array(96*96),counts:[0,0],version:0};candidate.ensureOwnershipState(p);p._paintOrderRecords=[null,{clock:1,peer:'a',seq:1},{clock:2,peer:'b',seq:1},{clock:3,peer:'a',seq:2}];return p;}
function face(wall,cell=.25){return{atlas:{ppm:32},su:24,sv:24,nu:96,nv:96,cu:cell,cv:cell,grid:0,wall,turf:!wall};}
function compare(a,b,g,tn,dT,c=contract){const aa=baseline(a,g,tn,dT,c),bb=candidate.claimAncillaryCells(b,g,tn,dT,c);assert.equal(bb,aa);assert.deepEqual(b.grid,a.grid);assert.deepEqual(b._paintOwnershipOrder,a._paintOwnershipOrder);assert.deepEqual(b.counts,a.counts);assert.equal(b.version,a.version);}
test('piece-local visits preserve original cells, counts and ownership over growth and overwrites',()=>{
 for(const seed of [0,.37,.999999])for(const R of [.08,.65,1.56,3.74])for(const kind of [0,1,2,3,4,5])for(const wall of [false,true])for(const sa of [0,.7]){
  const a=paint(),b=paint(),f=face(wall),g={R,seed,kind,team:0,paintOrder:1,entries:[f,10,12,R*.1,.6,.8,sa],dripDur:wall?3:0};
  for(const t of [0,.2,.6,1,1.43,3])compare(a,b,g,t,Math.min(1,t/3));
  compare(a,b,{...g,team:1,paintOrder:2},1,.5);
  compare(a,b,g,3,1); // stale growth cannot restore old paint.
  compare(a,b,{...g,paintOrder:3},3,1);
 }
});
test('satellite/spatter overlaps, anisotropic cells, occlusion and sub-cell boundaries match oracle',()=>{
 const c={...contract,shapes:contract.shapes.map(()=>[4,3,3,3])};
 for(const wall of [false,true])for(const sa of [0,.4,1.7])for(const seed of [.03,.51,.92]){
  const a=paint(),b=paint(),f=face(wall);f.cv=.19;f.sv=f.cv*96;
  for(let i=0;i<a.dead.length;i+=7)a.dead[i]=b.dead[i]=1;
  const g={R:2.4,seed,kind:3,team:0,paintOrder:1,entries:[f,.01,3,.2,.6,.8,sa],dripDur:3};
  for(const t of [0,.4,.8,1.2,1.6,3])compare(a,b,g,t,Math.min(1,t),c);
 }
});

test('installed production PaintSystem matches the pre-optimization oracle at every visible growth step',async()=>{
 const {fixture}=await import('./source-fixture.mjs');const {PaintSystem}=await fixture({productionComposition:true});
 const probe=fs.readFileSync(new URL('./paint-mask-browser-fixture.mjs',import.meta.url),'utf8');
 const setup=probe.match(/export function createPaintMaskProbe\(\) \{([\s\S]*?)\n\}/)[1];
 const p=new Function('PaintSystem',setup)(PaintSystem);
 for(const wall of [false,true])for(const kind of [0,1,2,3,4,5])for(const seed of [.37,.72]){
  p.clear();const f={atlas:{x:0,y:0,pad:2,ppm:64},su:32,sv:32,nu:128,nv:128,cu:.25,cv:.25,grid:0,wall,turf:!wall};
  const o={grid:new Uint8Array(p.grid.length),dead:new Uint8Array(p.dead.length),counts:[0,0],version:p.version};oldState(o);
  let actualCredit=0,expectedCredit=0;const order=p._paintOrderId({tick:1,peer:'piece-oracle',seq:1});o._paintOrderRecords=p._paintOrderRecords;
  const g={R:2.7,seed,kind,team:0,paintOrder:order,netOrderId:order,entries:[f,16,20,0,.6,.8,kind===1?1.2:0],dur:1,dripDur:wall?3:0,paintOwner:{remote:false,addTurf:v=>actualCredit+=v}};
  for(const t of [.2,.6,1.1,2,3]){
   g.age=t;const td=g.dripDur?Math.min(1,t/g.dripDur):1,dT=1-Math.pow(1-td,2.2);
   const expected=baseline(o,{...g,paintOwner:{remote:false,addTurf:v=>expectedCredit+=v}},Math.min(3,t),dT,contract);
   const actual=p._advanceSplatOwnership(g);assert.equal(actual,expected);assert.deepEqual([...p.grid],[...o.grid]);assert.deepEqual([...p._paintOwnershipOrder],[...o._paintOwnershipOrder]);assert.deepEqual([...p.counts],[...o.counts]);assert.equal(actualCredit,expectedCredit);
  }
 }
});

test('seeded boundary fuzz preserves wall/floor edges, stale order and dead-cell scoring',()=>{
 let word=0x7149ab3;const random=()=>{word=(Math.imul(word,1664525)+1013904223)>>>0;return word/4294967296;};
 for(let n=0;n<240;n++){
  const a=paint(),b=paint(),wall=random()<.5,f=face(wall),cell=.12+random()*.5;f.cu=cell;f.cv=.12+random()*.5;f.su=f.cu*f.nu;f.sv=f.cv*f.nv;
  const R=.021+random()*3.8,sa=random()*1.9,angle=random()*Math.PI*2;
  for(let i=n%7;i<a.dead.length;i+=11)a.dead[i]=b.dead[i]=1;
  const g={R,seed:random(),kind:n%6,team:n%2,paintOrder:1,entries:[f,(random()*1.4-.2)*f.su,(random()*1.4-.2)*f.sv,R*random()*.95,Math.cos(angle),Math.sin(angle),sa],dripDur:wall?3:0};
  for(const t of [.001,.49,.95,1.4,3])compare(a,b,g,t,Math.min(1,t/3));
  compare(a,b,{...g,team:1-g.team,paintOrder:2},1,.6);compare(a,b,g,3,1);
 }
});

test('pre-optimization oracle is immutable',()=>{assert.equal(createHash('sha256').update(fs.readFileSync(new URL('./fixtures/paint-piece-ownership-baseline.mjs',import.meta.url))).digest('hex'),'9f38008a6b2e693eafe03c123a820dc46c93b8e3dbb6d0ece947674b098dcff4');});
