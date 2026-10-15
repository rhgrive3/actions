import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {setup,geometry,flatten,oldWorld,oldPhysics} from './fixtures/bvh-query-fixture.mjs';
const f=await setup(),{V}=f;
const bounds=[V(-8,-8,-8),V(8,8,8)];
const ids=w=>{const a=[];w.queryBox(...bounds,id=>a.push(id));return a;};
const released=w=>{assert.equal(w._queryDepth,0);for(const s of w._queryStacks)assert.equal(s.length,0);};
test('frozen before implementations retain their hashes',()=>{
 assert.equal(createHash('sha256').update(oldWorld).digest('hex'),'8ddfa80124c6d6f47c56ba0d9325f2faf9fca4688894b34e336769b3c43f921a');
 assert.equal(createHash('sha256').update(oldPhysics).digest('hex'),'d140048c3ad37db47580ce3d1e1459e1bd148a81a16379882866fe322903843c');
});
test('default ray results stay independent; reusable output preserves every field and miss/anyHit returns',()=>{
 const a=new f.OldWorld(geometry()),b=new f.CurrentWorld(geometry()),out={point:V(),normal:V()},p=out.point,n=out.normal;
 let state=73,hits=0;const rnd=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
 for(let i=0;i<7000;i++){
  const origin=V((rnd()-.5)*12,rnd()*6-1,(rnd()-.5)*12),dir=i%3?V(rnd()-.5,rnd()-.5,rnd()-.5).normalize():V(-0,-1,0),far=i%37?rnd()*20:NaN;
  const opts={ignoreGrates:i%2===0,minNormalY:i%5===0?.68:-2,anyHit:i%11===0,minHitY:i%7===0?1:-Infinity};
  const expected=a.ray(origin,dir,far,opts),actual=b.ray(origin,dir,far,opts,out);
  assert.deepEqual(flatten(actual),flatten(expected));if(actual&&typeof actual==='object'){assert.equal(actual,out);hits++;}
  assert.equal(b.queryCount,a.queryCount);assert.equal(b.triangleTests,a.triangleTests);released(b);
 }
 assert.ok(hits>100);assert.equal(out.point,p);assert.equal(out.normal,n);
 const first=b.ray(V(0,6,0),V(0,-1,0)),snapshot=flatten(first),second=b.ray(V(1,6,0),V(0,-1,0));
 assert.notEqual(first,second);assert.notEqual(first.point,second.point);assert.deepEqual(flatten(first),snapshot);
 const before=flatten(out);assert.equal(b.ray(V(NaN,0,0),V(0,-1,0),10,{},out),null);assert.deepEqual(flatten(out),before);released(b);
});
test('pooled stacks preserve traversal order during nested box and ray queries, exceptions and early exits',()=>{
 const a=new f.OldWorld(geometry()),b=new f.CurrentWorld(geometry()),expected=ids(a),actual=[];
 b.queryBox(...bounds,id=>{actual.push(id);if(actual.length===1){assert.deepEqual(ids(b),expected);assert.deepEqual(flatten(b.ray(V(0,6,0),V(0,-1,0))),flatten(a.ray(V(0,6,0),V(0,-1,0))));}});
 assert.deepEqual(actual,expected);released(b);assert.equal(b._queryStacks.length,2);
 const seen=[];b.queryBox(...bounds,id=>{seen.push(id);return false;});assert.deepEqual(seen,expected,'default callbacks returning false still visit everything');
 const stopped=[];b.queryBox(...bounds,id=>{stopped.push(id);return false;},true);assert.deepEqual(stopped,expected.slice(0,1));released(b);
 assert.throws(()=>b.queryBox(...bounds,()=>{b.queryBox(...bounds,()=>{throw Error('nested failure');});}),/nested failure/);released(b);assert.deepEqual(ids(b),expected);
 // A property read can throw during ray traversal too.
 const nodes=b.nodes;b.nodes=new Proxy(nodes,{get(target,key){if(key==='0')throw Error('ray failure');return target[key];}});
 assert.throws(()=>b.ray(V(0,6,0),V(0,-1,0)),/ray failure/);b.nodes=nodes;released(b);assert.deepEqual(ids(b),expected);
 const stacks=[...b._queryStacks];for(let i=0;i<200;i++){ids(b);b.ray(V(0,6,0),V(0,-1,0),10,{anyHit:true});}
 assert.equal(b._queryStacks.length,stacks.length);for(let i=0;i<stacks.length;i++)assert.equal(b._queryStacks[i],stacks[i]);released(b);
});
test('NativePhysics copies pooled hits into independent caller results and retains dynamic precedence',()=>{
 const a=f.make(true),b=f.make();
 for(const grate of [false,true])for(const x of [-4,-1,0,1,4,5])for(const far of [0,.00001,2,10,Infinity,NaN]){
  const origin=V(x,6,0),dir=V(0,-1,0);assert.deepEqual(flatten(b.physics.raycast(origin,dir,far,new f.Hit(),grate)),flatten(a.physics.raycast(origin,dir,far,new f.Hit(),grate)));
 }
 const result=b.physics.raycast(V(0,6,0),V(0,-1,0),10),saved=flatten(result);
 b.physics.raycast(V(1,6,0),V(0,-1,0),10);assert.deepEqual(flatten(result),saved);assert.notEqual(result.point,b.physics._nativeRayHit.point);
 for(const pair of [a,b])pair.physics.dynamic.raycast=(_o,_d,_far,out)=>{out.hit=true;out.dist=.25;out.point.set(7,8,9);out.normal.set(1,0,0);out.block=123;out.face=456;out.u=.3;out.v=.7;return out;};
 const current=b.physics.raycast(V(0,6,0),V(0,-1,0),10);assert.deepEqual(flatten(current),flatten(a.physics.raycast(V(0,6,0),V(0,-1,0),10)));assert.equal(current.block,123);
});
test('bodyFits preserves decisions and stops visiting triangles after the first obstruction',()=>{
 const a=f.make(true),b=f.make();let before=0,after=0;
 for(const [pair,increment]of [[a,()=>before++],[b,()=>after++]]){const native=pair.world.queryBox;pair.world.queryBox=function(lo,hi,fn,stop){return native.call(this,lo,hi,id=>{increment();return fn(id);},stop);};}
 for(const squid of [false,true])for(const x of [-5,-3,0,3,5])for(const y of [-1,0,.3,1,2.4,4])for(const margin of [0,.01,.38]){
  assert.equal(b.physics.bodyFits(V(x,y,0),.38,.1,1.45,squid,margin),a.physics.bodyFits(V(x,y,0),.38,.1,1.45,squid,margin));
 }
 assert.ok(after<before*.5,JSON.stringify({before,after}));released(b.world);console.log(JSON.stringify({bodyFitCallbacks:{before,after}}));
});
for(const hz of [30,60,120])test(`native contacts and ray outputs retain exact movement at ${hz} Hz`,()=>{
 const a=f.make(true),b=f.make(),positions=[V(-3,2.5,-2),V(-3,2.5,-2)];
 for(let i=0;i<hz*3;i++){
  const outputs=[];
  for(const [index,pair]of [a,b].entries()){
   const pos=positions[index];pos.x+=1/hz;pos.y-=2/hz;pos.z+=.4/hz;
   const c={ground:false,wall:false,ceiling:false,groundNormal:V(),wallNormal:V()};
   pair.physics.collideCapsule(pos,.38,1.45,c,3,i%5===0);
   outputs.push({position:pos.toArray(),contacts:{...c,groundNormal:c.groundNormal.toArray(),wallNormal:c.wallNormal.toArray()},hit:flatten(pair.physics.raycast(pos,V(0,-1,0),10)),fits:pair.physics.bodyFits(pos,.38,.1,1.45)});
  }
  assert.deepEqual(outputs[1],outputs[0]);
 }
});
