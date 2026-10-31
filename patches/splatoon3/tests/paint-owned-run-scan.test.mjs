import test from 'node:test';import assert from 'node:assert/strict';
import{installIssue264PaintOwnership as oldInstall}from './fixtures/paint-piece-ownership-baseline.mjs';
import{installIssue264PaintOwnership as install}from '../runtime/paint-ownership.mjs';
const contract={kind:{speck:7},shapes:[],reach:[],dripReach:4};
function make(fn,n){class P{splat(){}flush(){}_emitGrowth(){}}fn(P,contract);const p=new P();p.grid=new Uint8Array(n);p._paintOrderId();return p;}
// Compare exact half-open rectangle coverage with multiplicity. The signed
// corner events are the mixed derivative of the coverage function: adjacent
// vertical edges cancel when rectangles merge, without rounding areas or
// choosing sample points that could miss a narrow gap.
function assertSameCoverage(before,beforeCount,after,afterCount,label){
 const corners=new Map();
 const corner=(x,y,delta)=>{let column=corners.get(x);if(!column)corners.set(x,column=new Map());column.set(y,(column.get(y)||0)+delta);};
 const add=(rows,count,sign)=>{
  for(let i=0;i<count*4;i+=4){
   const x0=rows[i],x1=rows[i+1],y0=rows[i+2],y1=rows[i+3];
   assert.ok(Number.isFinite(x0)&&Number.isFinite(x1)&&Number.isFinite(y0)&&Number.isFinite(y1)&&x1>x0&&y1>y0,label+' valid rectangle');
   corner(x0,y0,sign);corner(x1,y0,-sign);corner(x0,y1,-sign);corner(x1,y1,sign);
  }
 };
 add(before,beforeCount,1);add(after,afterCount,-1);
 for(const [x,column]of corners)for(const [y,delta]of column)assert.equal(delta,0,`${label} coverage boundary ${x}/${y}`);
}
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
   assert.ok(nb<=na,`rectangle count increased in case ${z}/${order}`);
   assertSameCoverage(a._paintOrderRunScratch,na,b._paintOrderRunScratch,nb,`case ${z}/${order}`);
   assert.deepEqual(Buffer.from(b._paintOwnershipOrder.buffer),Buffer.from(a._paintOwnershipOrder.buffer),`ownership changed in case ${z}/${order}`);
  }
 }
}
test('run scanner preserves exact coverage across 1200 grids and fractional boundaries with no extra rectangles',()=>exercise(n=>make(install,n),1200));
test('actual installed run scanner coalesces rectangles while preserving exact coverage in composed source/built',async()=>{
 const{fixture}=await import('./source-fixture.mjs');const f=await fixture({productionComposition:true});
 exercise(n=>{const p=Object.create(f.PaintSystem.prototype);p.grid=new Uint8Array(n);p._paintOrderId();return p;},160);
});
