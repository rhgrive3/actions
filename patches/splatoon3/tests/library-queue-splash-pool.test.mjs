import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from '../../../inkwave-public/vendor/three/build/three.module.js';
import {spawnSplashDrop,advanceSplashDrops,clearSplashDrops} from '../runtime/blaster-flight-paint.mjs';
const spec=Object.freeze({gravity:3600,drag:0,depthScaleMax:1,depthScaleMin:1,dropHeightMax:0,dropHeightMin:0});
function world(onPaint=()=>{}){
 const system={},owner={remote:false,addTurf(){}},game={projectiles:system,physics:{segment(a,b,h){h.hit=b.y<=0;h.point.set(b.x,0,b.z);h.normal.set(0,1,0);h.face=1;return h;}},paint:{splat(...args){onPaint(...args);return 1;}}};
 return {system,owner,game};
}
function birth(w,owner=w.owner,from=new Vector3(0,1,0)){return spawnSplashDrop(w.game,{owner,team:0,seed:.37,from,radius:1,spec,depth:false});}
test('retired drop leases reuse all five physics vectors and retain independent telemetry snapshots',()=>{
 let count=0;class V extends Vector3{constructor(...args){super(...args);count++;}}
 const w=world(),from=new V(0,1,0);count=0;
 const first=birth(w,w.owner,from);assert.equal(count,5);
 first.drawRadius=.7;first.sourceActor='old';
 advanceSplashDrops(w.system,1/60,w.game);assert.equal(first.owner,null);assert.equal(first.spec,null);
 const snapshot=w.system._s3SplashLandings[0],json=JSON.stringify(snapshot),vectors=[first.pos,first.vel,first.next,first.hit.point,first.hit.normal];
 const other={remote:false,addTurf(){}};count=0;const second=birth(w,other,from);
 assert.equal(second,first);assert.equal(count,0);assert.equal(second.owner,other);assert.equal(second.spec,spec);
 assert.equal(second.drawRadius,undefined);assert.equal(second.sourceActor,undefined);assert.equal(second.landing,null);assert.equal(second.frames,0);
 assert.deepEqual([second.pos,second.vel,second.next,second.hit.point,second.hit.normal],vectors);
 assert.equal(JSON.stringify(snapshot),json);advanceSplashDrops(w.system,1/60,w.game);assert.equal(JSON.stringify(snapshot),json);
});
test('nested landing spawn cannot borrow the still-live outer landing record',()=>{
 let first,nested,once=false;const w=world(()=>{if(!once){once=true;nested=birth(w);assert.notEqual(nested,first);advanceSplashDrops(w.system,1/60,w.game);assert.equal(first.owner,w.owner);}});
 first=birth(w);advanceSplashDrops(w.system,1/60,w.game);
 assert.equal(w.system._s3SplashDrops.length,0);assert.equal(w.system._s3SplashDropPool.length,2);
 assert.equal(first.owner,null);assert.equal(nested.owner,null);assert.equal(w.system._s3SplashLandings.length,2);
});
test('bounded drop pool severs owners and clear epochs cannot repopulate old match leases',()=>{
 const w=world();for(let i=0;i<300;i++)birth(w);advanceSplashDrops(w.system,1/60,w.game);
 assert.equal(w.system._s3SplashDropPool.length,256);assert.ok(w.system._s3SplashDropPool.every(d=>d.owner===null&&d.spec===null));
 clearSplashDrops(w.system);assert.equal(w.system._s3SplashDropPool.length,0);
 let once=false,next;const re=world(()=>{if(!once){once=true;clearSplashDrops(re.system);next=birth(re);}});
 birth(re);advanceSplashDrops(re.system,1/60,re.game);
 assert.deepEqual(re.system._s3SplashDrops,[next]);assert.equal(re.system._s3SplashDropPool.length,0);
});
test('exception during landing still retires all detached leases without leaking actor refs',()=>{
 const w=world(()=>{throw Error('paint failed');}),a=birth(w),b=birth(w);
 assert.throws(()=>advanceSplashDrops(w.system,1/60,w.game),/paint failed/);
 assert.equal(a.owner,null);assert.equal(b.owner,null);assert.equal(w.system._s3SplashDrops.length,0);assert.equal(w.system._s3SplashDropPool.length,2);
});
