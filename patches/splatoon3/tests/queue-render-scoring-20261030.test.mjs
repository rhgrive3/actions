import test from 'node:test';import assert from 'node:assert/strict';
import {installScoring,floorCoverage,indexedFloorCoverage,noteCoverageCell,notePaintMutation} from '../runtime/scoring.mjs';
class Paint{} installScoring({PaintSystem:Paint});
function paint(n=32768){const p=new Paint();p.grid=new Uint8Array(n);p.dead=new Uint8Array(n);p.version=0;p.paintFaces=[];for(let at=0;at<n;at+=256)p.paintFaces.push({turf:at%1792!==0,grid:at,nu:Math.min(256,n-at),nv:1,cu:(at%13+1)/7,cv:(at%17+1)/11,n:{y:.17+at%5}});for(let i=19;i<n;i+=97)p.dead[i]=1;return p;}
test('sparse score preserves exact addition order through claims, overwrites, clears, unknown writers and dense fallbacks',()=>{
 const p=paint();let seed=723123;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 assert.deepEqual(p.coverage(),floorCoverage(p));assert.equal(p._s3CoverageIndex.sparseEnabled,true);
 for(let tick=0;tick<900;tick++){
  for(let write=0;write<5;write++){const cell=Math.floor(random()*p.grid.length),value=Math.floor(random()*3);p.grid[cell]=value;noteCoverageCell(p,cell,value);}
  notePaintMutation(p,true,true);
  if(tick===90){p.grid[5]=2;p.version++;}
  if(tick===200){p.grid.fill(0);p.version++;}
  if(tick===300){p.grid.fill(1);p.version++;}
  if(tick===400){p.grid.fill(0);p.version++;}
  if(tick===600){p.grid=p.grid.slice();p.version++;}
  if(tick===700){p.grid[331]=1;notePaintMutation(p,true);}
  assert.deepEqual(p.coverage(),floorCoverage(p),'tick '+tick);
  if(tick===300)assert.equal(p._s3CoverageIndex.sparseEnabled,false);
 }
});
test('custom face order, unversioned direct coverage and bit31/word31 boundaries preserve legacy results',()=>{
 for(const order of ['normal','reverse','duplicates']){
  const p=paint(2048);if(order==='reverse')p.paintFaces.reverse();if(order==='duplicates')p.paintFaces.push(p.paintFaces[2]);
  for(const cell of [31,32,63,64,255,256,511,1023,1024,1055,1056,2047])p.grid[cell]=cell%2+1;
  assert.deepEqual(p.coverage(),floorCoverage(p));if(order!=='normal')assert.equal(p._s3CoverageIndex.sparseEnabled,false);
  for(const cell of [31,32,1023,1024,2047]){p.grid[cell]=0;noteCoverageCell(p,cell,0);notePaintMutation(p,true,true);assert.deepEqual(p.coverage(),floorCoverage(p));}
  p.grid[700]=2;assert.deepEqual(indexedFloorCoverage(p),floorCoverage(p),'direct API always reads current values');
 }
});

test('actual production main-body writer updates the sparse index before coverage without relying on minimap dirty bounds',async()=>{
 const [{fixture},{adaptBuildSource},{adaptQueueRender20261030}]=await Promise.all([import('./source-fixture.mjs'),import('../../../scripts/inkwave-source-composition.mjs'),import('../../local-quality/queue-render-20261030-adapter.mjs')]);
 const f=await fixture({adapt:(rel,code)=>adaptQueueRender20261030(rel,adaptBuildSource(rel,code))});installScoring({PaintSystem:f.PaintSystem});
 const face={grid:0,nu:128,nv:128,cu:.25,cv:.25,turf:true,n:{y:1}},p=Object.create(f.PaintSystem.prototype);
 Object.assign(p,{grid:new Uint8Array(16384),dead:new Uint8Array(16384),paintFaces:[face],level:{native:false},counts:[0,0],version:0});
 const plain=v=>Array.from(v);p.coverage();assert.equal(p._s3CoverageIndex.sparseEnabled,true);
 for(let i=0;i<80;i++){
  p._cpuSplat(face,2+(i%7)*.4,2+Math.floor(i/7)*.3,.35,i%2,.37,1,0,0,0);
  assert.equal(p._s3CoverageIndex.bitsValid,true,'known writer keeps tracked bits valid');
  assert(p._s3CoverageIndex.painted>0);
  assert.deepEqual(plain(p.coverage()),floorCoverage(p));
 }
});
