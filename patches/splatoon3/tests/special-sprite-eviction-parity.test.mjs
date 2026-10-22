import test from 'node:test';import assert from 'node:assert/strict';
import * as T from '../../../inkwave-public/vendor/three/build/three.module.js';
import {SpecialVfxKit} from '../runtime/special-vfx-kit.mjs';
function scan(){let best=0,bk=-1;for(let j=0;j<this.n;j++){const k=this.p[j*this.S+6]/this.p[j*this.S+7];if(k>bk){bk=k;best=j;}}this._kill(best);}
for(const cap of [2,3,520,900])test('indexed eviction preserves original scan victim and exact particle storage cap='+cap,()=>{
 const a=new SpecialVfxKit(T,new T.Scene(),1),b=new SpecialVfxKit(T,new T.Scene(),1),x=a.sparks,y=b.sparks;
 x.cap=y.cap=cap;y._evict=scan;let word=7;
 const rng=()=>((word=(Math.imul(word,1664525)+1013904223)>>>0)/4294967296);
 try{for(let i=0;i<cap+2500;i++){
  if(i%43===0){const dt=[1/30,1/60,1/120][i%3];x.update(dt);y.update(dt);}
  if(i%997===0){x.clear();y.clear();}
  const args=[i,2,3,rng(),rng(),rng(),i%17===0?.001:rng()*3,.2,.1,1,.5,.3,1,0,{rot:0,seed:.5,drag:i%2,grav:1}];
  x.spawn(...args);y.spawn(...args);assert.equal(x.n,y.n);assert.deepEqual(x.p,y.p,'spawn '+i);
 }}finally{a.dispose();b.dispose();}
});
test('nonfinite and negative-age ratios retain the exact original scan fallback',()=>{
 const a=new SpecialVfxKit(T,new T.Scene(),.35),b=new SpecialVfxKit(T,new T.Scene(),.35),x=a.sparks,y=b.sparks;x.cap=y.cap=3;y._evict=scan;
 try{for(const life of [NaN,Infinity,.5,1,.4,.2]){const args=[1,2,3,0,0,0,life,1,1,1,1,1,1,0,{rot:0,seed:0}];x.spawn(...args);y.spawn(...args);assert.deepEqual(x.p,y.p);}x.update(-.02);y.update(-.02);x.spawn(4,0,0,0,0,0,1,1,1,1,1,1,1,0,{rot:0,seed:0});y.spawn(4,0,0,0,0,0,1,1,1,1,1,1,1,0,{rot:0,seed:0});assert.deepEqual(x.p,y.p);}finally{a.dispose();b.dispose();}
});
