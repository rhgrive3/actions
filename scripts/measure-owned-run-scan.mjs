import assert from 'node:assert/strict';import {performance} from 'node:perf_hooks';
import{installIssue264PaintOwnership as oldInstall}from'../patches/splatoon3/tests/fixtures/paint-piece-ownership-baseline.mjs';
import{installIssue264PaintOwnership as install}from'../patches/splatoon3/runtime/paint-ownership.mjs';
const contract={kind:{speck:7},shapes:[],reach:[],dripReach:4};
function make(fn,n){class P{splat(){}flush(){}_emitGrowth(){}}fn(P,contract);const p=new P;p.grid=new Uint8Array(n);p._paintOrderId();return p;}
let rng=0x721947;const random=()=>{rng^=rng<<13;rng^=rng>>>17;rng^=rng<<5;return(rng>>>0)/4294967296;};
const cases=[];
for(let z=0;z<1200;z++){
 const nu=1+Math.floor(random()*128),nv=1+Math.floor(random()*96),cu=.07+random()*.6,cv=.07+random()*.6,face={nu,nv,cu,cv,su:nu*cu,sv:nv*cv,grid:Math.floor(random()*11),atlas:{pad:8,ppm:4+random()*60}};
 const a=make(oldInstall,face.grid+nu*nv),b=make(install,face.grid+nu*nv);for(let i=0;i<a.grid.length;i++)a._paintOwnershipOrder[i]=z%4===0?1:Math.floor(random()*4);b._paintOwnershipOrder.set(a._paintOwnershipOrder);
 const u0=-1+random()*face.su*.5,u1=face.su*(.5+random()*.6),v0=-1+random()*face.sv*.5,v1=face.sv*(.5+random()*.6),args=[face,1,u0,u1,v0,v1];
 const na=a._paintOrderRuns(...args),nb=b._paintOrderRuns(...args);assert.equal(nb,na);assert.deepEqual(b._paintOrderRunScratch.slice(0,nb*4),a._paintOrderRunScratch.slice(0,na*4));if(z<100)cases.push({a,b,args});
}
const runs=[];let consume=0;for(let warm=0;warm<2;warm++)for(const c of cases){consume+=c.a._paintOrderRuns(...c.args);consume+=c.b._paintOrderRuns(...c.args);}
for(const mode of ['a','b','b','a','a','b']){const start=performance.now();for(let n=0;n<150;n++)for(const c of cases)consume+=c[mode]._paintOrderRuns(...c.args);runs.push({mode,ms:performance.now()-start});}console.log(JSON.stringify({cases:1200,consume,runs}));
