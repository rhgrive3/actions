import assert from 'node:assert/strict';import {performance} from 'node:perf_hooks';
import{installIssue264PaintOwnership as oldInstall}from'../patches/splatoon3/tests/fixtures/paint-piece-ownership-baseline.mjs';
import{installIssue264PaintOwnership as install}from'../patches/splatoon3/runtime/paint-ownership.mjs';
const contract={kind:{speck:7},shapes:[],reach:[],dripReach:4};
function make(fn,n){class P{splat(){}flush(){}_emitGrowth(){}}fn(P,contract);const p=new P;p.grid=new Uint8Array(n);p._paintOrderId();return p;}
// Coalescing changes rectangle counts/order but must preserve exact covered
// regions and overdraw multiplicity. Signed corner events compare that without
// sampled points, rounded area sums or a visual tolerance.
function verifyCoverage(before,beforeCount,after,afterCount){
 const corners=new Map(),corner=(x,y,delta)=>{let column=corners.get(x);if(!column)corners.set(x,column=new Map());column.set(y,(column.get(y)||0)+delta);};
 const add=(rows,count,sign)=>{for(let i=0;i<count*4;i+=4){
  const x0=rows[i],x1=rows[i+1],y0=rows[i+2],y1=rows[i+3];
  assert.ok(Number.isFinite(x0)&&Number.isFinite(x1)&&Number.isFinite(y0)&&Number.isFinite(y1)&&x1>x0&&y1>y0,'valid paint rectangle');
  corner(x0,y0,sign);corner(x1,y0,-sign);corner(x0,y1,-sign);corner(x1,y1,sign);
 }};
 add(before,beforeCount,1);add(after,afterCount,-1);
 for(const [x,column]of corners)for(const [y,delta]of column)assert.equal(delta,0,`paint coverage boundary ${x}/${y}`);
}
const verifyOnly=process.argv.includes('--verify-only');
let beforeRectangles=0,afterRectangles=0;
let rng=0x721947;const random=()=>{rng^=rng<<13;rng^=rng>>>17;rng^=rng<<5;return(rng>>>0)/4294967296;};
const cases=[];
for(let z=0;z<1200;z++){
 const nu=1+Math.floor(random()*128),nv=1+Math.floor(random()*96),cu=.07+random()*.6,cv=.07+random()*.6,face={nu,nv,cu,cv,su:nu*cu,sv:nv*cv,grid:Math.floor(random()*11),atlas:{pad:8,ppm:4+random()*60}};
 const a=make(oldInstall,face.grid+nu*nv),b=make(install,face.grid+nu*nv);for(let i=0;i<a.grid.length;i++)a._paintOwnershipOrder[i]=z%4===0?1:Math.floor(random()*4);b._paintOwnershipOrder.set(a._paintOwnershipOrder);
 const u0=-1+random()*face.su*.5,u1=face.su*(.5+random()*.6),v0=-1+random()*face.sv*.5,v1=face.sv*(.5+random()*.6),args=[face,1,u0,u1,v0,v1];
 const na=a._paintOrderRuns(...args),nb=b._paintOrderRuns(...args);
 assert.ok(nb<=na,`rectangle count increased in case ${z}`);verifyCoverage(a._paintOrderRunScratch,na,b._paintOrderRunScratch,nb);
 assert.deepEqual(b._paintOwnershipOrder,a._paintOwnershipOrder,`ownership changed in case ${z}`);
 beforeRectangles+=na;afterRectangles+=nb;if(z<100)cases.push({a,b,args});
}
const runs=[];let consume=0;
if(!verifyOnly){
for(let warm=0;warm<2;warm++)for(const c of cases){consume+=c.a._paintOrderRuns(...c.args);consume+=c.b._paintOrderRuns(...c.args);}
for(const mode of ['a','b','b','a','a','b']){const start=performance.now();for(let n=0;n<150;n++)for(const c of cases)consume+=c[mode]._paintOrderRuns(...c.args);runs.push({mode,ms:performance.now()-start});}
}
console.log(JSON.stringify({cases:1200,verifyOnly,beforeRectangles,afterRectangles,consume,runs}));
