import test from 'node:test';import assert from 'node:assert/strict';
import{installIssue264PaintOwnership as oldInstall}from './fixtures/paint-piece-ownership-baseline.mjs';
import{installIssue264PaintOwnership as install}from '../runtime/paint-ownership.mjs';
const contract={kind:{speck:7},shapes:[],reach:[],dripReach:4};
function make(fn,n){class P{splat(){}flush(){}_emitGrowth(){}}fn(P,contract);const p=new P();p.grid=new Uint8Array(n);p._paintOrderId();return p;}
function exercise(factory,count){
 let seed=0x721947;const rand=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;};
 for(let z=0;z<count;z++){
  const nu=1+Math.floor(rand()*128),nv=1+Math.floor(rand()*96),cu=.07+rand()*.6,cv=.07+rand()*.6;
  const face={nu,nv,cu,cv,su:nu*cu,sv:nv*cv,grid:Math.floor(rand()*11),atlas:{pad:8,ppm:4+rand()*60}};
  const a=make(oldInstall,face.grid+nu*nv),b=factory(face.grid+nu*nv);
  for(let i=0;i<a.grid.length;i++)a._paintOwnershipOrder[i]=z%4===0?1:z%4===1?0:z%4===2?i%2:Math.floor(rand()*4);
  b._paintOwnershipOrder.set(a._paintOwnershipOrder);
  const u0=-1+rand()*face.su*.5,u1=face.su*(.5+rand()*.6),v0=-1+rand()*face.sv*.5,v1=face.sv*(.5+rand()*.6);
  for(const order of [0,1,2]){
   const args=[face,order,u0,u1,v0,v1],na=a._paintOrderRuns(...args),nb=b._paintOrderRuns(...args);
   assert.equal(nb,na,`run count case ${z}/${order}`);
   assert.deepEqual(Buffer.from(b._paintOrderRunScratch.buffer,0,nb*4*8),Buffer.from(a._paintOrderRunScratch.buffer,0,na*4*8),`ordered rectangles case ${z}/${order}`);
  }
 }
}
test('run scanner preserves exact old rectangle sequence across 1200 grids and fractional boundaries',()=>exercise(n=>make(install,n),1200));
test('actual installed run scanner preserves old rectangles without coalescing in composed source/built',async()=>{
 const{fixture}=await import('./source-fixture.mjs');const f=await fixture({productionComposition:true});
 exercise(n=>{const p=Object.create(f.PaintSystem.prototype);p.grid=new Uint8Array(n);p._paintOrderId();return p;},160);
});
