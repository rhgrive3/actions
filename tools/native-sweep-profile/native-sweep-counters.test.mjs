import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
import {instrumentNativeSweep,createSweepCounters,isolateProfileEnvironment,captureObservedValue} from './native-sweep-counters.mjs';
class World{
 constructor(){this.nodes=new Float32Array([-1,-1,-1,1,1,1,-1,1]);this.order=[0];this.triangleTests=0;this.queryCount=0;this._queryStacks=[];this._queryDepth=0;this.throwSource=false;}
 _acquireStack(){const d=this._queryDepth++,stack=this._queryStacks[d]||(this._queryStacks[d]=[]);stack[0]=0;return stack;}
 _releaseStack(){this._queryDepth--;}
 queryBox(min,max,fn,stopOnFalse=false){
  const a=this.nodes,stack=this._acquireStack();let top=1;
  try{while(top){const n=stack[--top]*8;if(a[n]>max.x||a[n+1]>max.y||a[n+2]>max.z||a[n+3]<min.x||a[n+4]<min.y||a[n+5]<min.z)continue;
   const left=a[n+6]|0,right=a[n+7]|0;if(left>=0){stack[top++]=left;stack[top++]=right;continue;}const start=-left-1;for(let k=start;k<start+right;k++)if(fn(this.order[k])===false&&stopOnFalse)return;
  }}finally{this._releaseStack(stack);}
 }
 sweepSphere(_from,_to,_radius,_options,out){if(this.throwSource)throw Error('source fail');this.queryCount++;this.queryBox({x:-2,y:-2,z:-2},{x:2,y:2,z:2},()=>{this.triangleTests++;});return out;}
}
function setup(){
 const world=new World(),level={triangleWorld:world},options={},out={hit:true,dist:1};
 const original=(physics,from,to,r0,r1,result,skip,obb)=>{physics.level.triangleWorld.sweepSphere(from,to,r0,options,result);obb();return result;};
 const args=[{level},{},{},1,1,out,false,()=>7];return {world,level,out,original,args};
}
test('exact counters, returned identity, scratch reuse and restoration across repeated queries',()=>{
 const f=setup(),nodes=f.world.nodes,descriptors=Object.getOwnPropertyDescriptors(f.world),q=createSweepCounters();
 assert.equal(q.invoke('catalogue',f.original,f.args),f.out);
 assert.equal(q.invoke('catalogue',f.original,f.args),f.out);
 const s=q.snapshot();
 for(const key of ['catalogue','sourceQueries','queryCountDelta','sourceHits','totalHits','queryBoxCalls','bvhNodeVisits','candidateTriangles','triangleTests','dynamicOBBCalls'])assert.equal(s[key],2,key);
 assert.equal(s.misses,0);assert.equal(s.sourceOptionsReused,1);assert.equal(s.sourceOutputReused,1);assert.equal(s.bvhStackReused,1);
 assert.equal(f.world.nodes,nodes);
 assert.deepEqual(Object.keys(Object.getOwnPropertyDescriptors(f.world)),Object.keys(descriptors));
 assert.equal(Object.hasOwn(f.world,'queryBox'),false);assert.equal(f.world._queryDepth,0);
});
test('disabled observer and misses do not invent hits or cache results',()=>{
 const f=setup(),disabled=createSweepCounters({enabled:false});
 disabled.invoke('catalogue',f.original,f.args);assert.equal(disabled.snapshot().sourceQueries,0);
 const q=createSweepCounters(),nohit=(...args)=>{f.world.sweepSphere(...args.slice(1,4),{},null);f.out.hit=false;return f.out;};
 q.invoke('catalogue',nohit,f.args);assert.equal(q.snapshot().misses,1);assert.equal(q.snapshot().sourceHits,0);
 assert.equal(q.snapshot().sourceOptionsReused,0);assert.match(q.snapshot().resultCache,/not present/);
});
for(const failure of ['source','obb'])test(failure+' exception propagates once and restores node/method descriptors',()=>{
 const f=setup(),q=createSweepCounters(),nodes=f.world.nodes;
 if(failure==='source')f.world.throwSource=true;else f.args[7]=()=>{throw Error('obb fail');};
 assert.throws(()=>q.invoke('catalogue',f.original,f.args),new RegExp(failure+' fail'));
 assert.equal(q.snapshot().errors,1);assert.equal(f.world.nodes,nodes);
 for(const key of ['queryBox','sweepSphere','_acquireStack'])assert.equal(Object.hasOwn(f.world,key),false);
 f.world.throwSource=false;f.args[7]=()=>7;q.invoke('catalogue',f.original,f.args);assert.equal(q.snapshot().totalHits,1);
});
test('unknown traversal and missing/duplicate exports fail closed',()=>{
 const f=setup();f.world.queryBox=()=>{};assert.throws(()=>createSweepCounters().invoke('catalogue',f.original,f.args),/Unreviewed/);
 assert.throws(()=>instrumentNativeSweep('export function other(){}'),/Expected one/);
 const s='export function sweepNativeCatalogueSphere(){} export function sweepNativeLevelSphere(){}';
 assert.throws(()=>instrumentNativeSweep(s+s),/Expected one/);
 const transformed=instrumentNativeSweep(s);assert.match(transformed,/__nativeSweepQA/);
 assert.equal((transformed.match(/__qaOriginal\(/g)||[]).length,2);
});

test('extra BVH index read rejects the whole unreviewed method, not merely its prefix',()=>{
 const f=setup(),body=World.prototype.queryBox.toString().replace('const left=','void a[n];const left=');
 f.world.queryBox=new Function('return ({'+body+'}).queryBox')();
 assert.throws(()=>createSweepCounters().invoke('catalogue',f.original,f.args),/Unreviewed/);
});
test('receiver is preserved with enabled and disabled observers',()=>{
 for(const enabled of [false,true]){
  const f=setup(),receiver={marker:123},q=createSweepCounters({enabled});
  function original(...args){assert.equal(this,receiver);return f.original(...args);}
  assert.equal(q.invoke('catalogue',original,f.args,receiver),f.out);
 }
});
test('minified export aliases and source declarations retain the same exported bindings',()=>{
 const source='function a(){return this}function b(){return this}export{a as sweepNativeCatalogueSphere,b as sweepNativeLevelSphere}';
 const changed=instrumentNativeSweep(source),seen=[];
 const q={invoke:(kind,fn,args,receiver)=>{seen.push(kind);return Reflect.apply(fn,receiver,args);}};
 const api=new Function('globalThis',changed.replace(/export\{[^}]+\}/,'')+';return [__nativeSweepQAExport0,__nativeSweepQAExport1];')({__nativeSweepQA:q});
 const receiver={};
 for(const fn of api)assert.equal(fn.call(receiver),receiver);
 assert.deepEqual(seen,['catalogue','level']);
});

test('pinned esbuild full-method canonicalization accepts minified traversal but rejects an extra node read',()=>{
 const esbuild=createRequire(path.join(process.env.PROFILE_ROOT||process.cwd(),'package.json'))('esbuild');
 assert.equal(esbuild.version,'0.28.2');
 const normalize=source=>esbuild.transformSync('globalThis.__qa={'+source+'};',{loader:'js',minify:true,target:'es2022'}).code;
 const holder={};new Function('globalThis',normalize(World.prototype.queryBox.toString()))(holder);
 const f=setup();f.world.queryBox=holder.__qa.queryBox;
 const q=createSweepCounters({normalizeQueryBox:normalize});q.invoke('catalogue',f.original,f.args);
 assert.equal(q.snapshot().bvhNodeVisits,1);
 const bad=World.prototype.queryBox.toString().replace('const left=','void a[n];const left=');
 const h={};new Function('globalThis',normalize(bad))(h);f.world.queryBox=h.__qa.queryBox;
 assert.throws(()=>q.invoke('catalogue',f.original,f.args),/Unreviewed/);
});

test('pair environment removes alternate upstream and Node injection without mutating original env',()=>{
 const base={INKWAVE_UPSTREAM_SOURCE:'/wrong',INKWAVE_BUILT_SITE:'/wrong',INKWAVE_BUILT_ROOT:'/wrong',NODE_OPTIONS:'--import=/wrong',NODE_TEST_CONTEXT:'child',INKWAVE_DISABLE_FIXTURE_CACHES:'1',KEEP:'yes'};
 const out=isolateProfileEnvironment(base,{root:'/root',head:'a'.repeat(40),site:'/site'});
 for(const k of ['INKWAVE_UPSTREAM_SOURCE','INKWAVE_BUILT_SITE','INKWAVE_BUILT_ROOT','NODE_OPTIONS','NODE_TEST_CONTEXT','INKWAVE_DISABLE_FIXTURE_CACHES'])assert.equal(out[k],undefined);
 assert.equal(out.PROFILE_ROOT,'/root');assert.equal(out.PROFILE_BUILT_SITE,'/site');assert.equal(out.KEEP,'yes');assert.equal(base.NODE_OPTIONS,'--import=/wrong');
});

test('paint own-data graph preserves vector/color values, nonfinite signs and cycles without invoking getters',()=>{
 const a={pos:{x:1,y:2,z:3},color:{r:.2,g:.3,b:.4},zero:-0,nan:NaN};a.self=a;
 const b={pos:{x:2,y:2,z:3},color:{r:.2,g:.3,b:.4},zero:0,nan:NaN};b.self=b;
 assert.notDeepEqual(captureObservedValue(a),captureObservedValue(b));
 const out=captureObservedValue(a);assert.deepEqual(out.entries.self,{ref:'$'});assert.deepEqual(out.entries.zero,{number:'-0'});assert.deepEqual(out.entries.nan,{number:'NaN'});
 let reads=0;const value={get x(){reads++;return 1;}};assert.throws(()=>captureObservedValue(value),/getters/);assert.equal(reads,0);
 assert.throws(()=>captureObservedValue(()=>{}),/Unsupported/);
});

test('own __proto__ data survives graph capture without changing prototype',()=>{
 const value=Object.create(null);value.__proto__={sentinel:7};
 const out=captureObservedValue(value);
 assert.equal(Object.getPrototypeOf(out.entries),null);
 assert.equal(Object.hasOwn(out.entries,'__proto__'),true);
 assert.equal(out.entries.__proto__.entries.sentinel,7);
 assert.match(JSON.stringify(out),/"__proto__"/);
});
