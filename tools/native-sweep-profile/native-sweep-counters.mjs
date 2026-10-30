// QA-only observers. No checked-in production instrumentation and no timing claims.
export function instrumentNativeSweep(source) {
 const names=['sweepNativeCatalogueSphere','sweepNativeLevelSphere'];
 if(source.includes('__nativeSweepQAExport')||source.includes('__qaOriginal'))throw Error('Already instrumented/ambiguous QA module');
 const additions=[];
 for(const [i,name] of names.entries()){
  const direct=new RegExp('export\\s+function\\s+'+name+'\\s*\\(','g'),matches=[...source.matchAll(direct)];
  let original;
  if(matches.length===1){original=name+'__qaOriginal';source=source.replace(direct,'function '+original+'(');
   additions.push('export function '+name+'(...args){return globalThis.__nativeSweepQA.invoke("'+(i?'level':'catalogue')+'",'+original+',args,this);}');
  }else if(matches.length===0){
   let found=0;
   source=source.replace(/export\s*\{([^}]+)\}/g,(whole,list)=>{
    const parts=list.split(',').map(part=>{
     const match=part.trim().match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
     if(match&&(match[2]||match[1])===name){found++;original=match[1];return '__nativeSweepQAExport'+i+' as '+name;}
     return part;
    });return 'export{'+parts.join(',')+'}';
   });
   if(found!==1)throw Error('Expected one export binding: '+name);
   additions.push('function __nativeSweepQAExport'+i+'(...args){return globalThis.__nativeSweepQA.invoke("'+(i?'level':'catalogue')+'",'+original+',args,this);}');
  }else throw Error('Expected one export binding: '+name);
 }
 return source+'\n'+additions.join('\n');
}
const approvedQueryBox="queryBox(min,max,fn,stopOnFalse=false){\n  const a=this.nodes,stack=this._acquireStack();let top=1;\n  try {\n  while(top){const n=stack[--top]*8;if(a[n]>max.x||a[n+1]>max.y||a[n+2]>max.z||a[n+3]<min.x||a[n+4]<min.y||a[n+5]<min.z)continue;\n   const left=a[n+6]|0,right=a[n+7]|0;if(left>=0){stack[top++]=left;stack[top++]=right;continue;}const start=-left-1;for(let k=start;k<start+right;k++)if(fn(this.order[k])===false&&stopOnFalse)return;\n  }\n  } finally {this._releaseStack(stack);}\n }";
export function createSweepCounters({enabled=true,normalizeQueryBox=source=>source.replace(/\s+/g,'')}={}) {
 const canonicalQueryBox=normalizeQueryBox(approvedQueryBox),verifiedMethods=new WeakSet();
 const stats={catalogue:0,level:0,sourceQueries:0,queryCountDelta:0,sourceHits:0,totalHits:0,misses:0,queryBoxCalls:0,bvhNodeVisits:0,candidateTriangles:0,triangleTests:0,dynamicOBBCalls:0,sourceOptionsReused:0,sourceOutputReused:0,bvhStackReused:0,errors:0};
 const optionsSeen=new WeakSet(),outputsSeen=new WeakSet(),active=new WeakSet();
 function invoke(kind,original,input,receiver){
  if(!enabled)return Reflect.apply(original,receiver,input);
  if(!['catalogue','level'].includes(kind))throw Error('Unknown sweep kind');
  const args=input.slice(),level=kind==='catalogue'?args[0].level:args[0],world=level.triangleWorld;
  if(active.has(world))throw Error('Nested QA observer is not supported');
  const saved={nodes:world.nodes,queryBox:world.queryBox,sweepSphere:world.sweepSphere,acquire:world._acquireStack};
  if(!Number.isFinite(world.queryCount)||!Number.isFinite(world.triangleTests)||!saved.nodes||typeof saved.queryBox!=='function'||typeof saved.sweepSphere!=='function'||typeof saved.acquire!=='function')throw Error('Incomplete TriangleWorld observer contract');
  // This counter relies on the current read-only queryBox visiting a[n] once per popped BVH node.
  if(!verifiedMethods.has(saved.queryBox)){
   if(normalizeQueryBox(Function.prototype.toString.call(saved.queryBox))!==canonicalQueryBox)throw Error('Unreviewed queryBox traversal; do not infer visits');
   verifiedMethods.add(saved.queryBox);
  }
  const descriptors=Object.fromEntries(['nodes','queryBox','sweepSphere','_acquireStack'].map(key=>[key,Object.getOwnPropertyDescriptor(world,key)]));
  const before=world.triangleTests,beforeQueries=world.queryCount;let boxDepth=0;
  stats[kind]++;active.add(world);
  try{
   world.nodes=new Proxy(saved.nodes,{get(target,key){
    if(boxDepth&&typeof key==='string'&&/^(0|[1-9][0-9]*)$/.test(key)&&Number(key)%8===0)stats.bvhNodeVisits++;
    const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
   }});
   world.queryBox=function(min,max,fn,stop){
    stats.queryBoxCalls++;boxDepth++;
    try{return Reflect.apply(saved.queryBox,this,[min,max,function(...a){stats.candidateTriangles++;return Reflect.apply(fn,this,a);},stop]);}
    finally{boxDepth--;}
   };
   world._acquireStack=function(...a){if(this._queryStacks?.[this._queryDepth])stats.bvhStackReused++;return Reflect.apply(saved.acquire,this,a);};
   world.sweepSphere=function(...a){
    stats.sourceQueries++;const options=a[3],out=a[4];
    if(options&&typeof options==='object'){if(optionsSeen.has(options))stats.sourceOptionsReused++;optionsSeen.add(options);}
    if(out&&typeof out==='object'){if(outputsSeen.has(out))stats.sourceOutputReused++;outputsSeen.add(out);}
    const result=Reflect.apply(saved.sweepSphere,this,a);if(result)stats.sourceHits++;return result;
   };
   const callback=kind==='catalogue'?7:6,obb=args[callback];
   args[callback]=function(...a){stats.dynamicOBBCalls++;return Reflect.apply(obb,this,a);};
   const result=Reflect.apply(original,receiver,args);
   if(result.hit)stats.totalHits++;else stats.misses++;
   return result;
  }catch(error){stats.errors++;throw error;}
  finally{
   stats.triangleTests+=world.triangleTests-before;stats.queryCountDelta+=world.queryCount-beforeQueries;
   for(const [key,descriptor] of Object.entries(descriptors)){if(descriptor)Object.defineProperty(world,key,descriptor);else delete world[key];}active.delete(world);
  }
 }
 return {invoke,snapshot(){return {...stats,resultCache:'not present; reuse counters describe scratch/options, not collision-result caching'};}};
}

export function isolateProfileEnvironment(base,{root,head,site}){
 const env={...base,PROFILE_ROOT:root,PROFILE_SOURCE_SHA:head,PROFILE_BUILT_SITE:site};
 for(const key of ['INKWAVE_BUILT_ROOT','INKWAVE_BUILT_SITE','INKWAVE_UPSTREAM_SOURCE','NODE_OPTIONS','NODE_TEST_CONTEXT','INKWAVE_DISABLE_FIXTURE_CACHES'])delete env[key];
 return env;
}

export function captureObservedValue(value){
 const seen=new WeakMap();let nodes=0;
 function copy(v,path,depth){
  if(++nodes>4096||depth>16)throw Error('QA observation bound exceeded');
  if(v===null||typeof v==='string'||typeof v==='boolean')return v;
  if(typeof v==='number')return Number.isNaN(v)?{number:'NaN'}:v===Infinity?{number:'+Infinity'}:v===-Infinity?{number:'-Infinity'}:Object.is(v,-0)?{number:'-0'}:v;
  if(v===undefined)return {type:'undefined'};
  if(typeof v!=='object')throw Error('Unsupported QA observed value type '+typeof v);
  if(seen.has(v))return {ref:seen.get(v)};seen.set(v,path);
  const entries=Object.create(null);for(const key of Object.keys(v).sort()){
   const d=Object.getOwnPropertyDescriptor(v,key);if(!d||!Object.hasOwn(d,'value'))throw Error('QA refuses observed getters');
   entries[key]=copy(d.value,path+'/'+key,depth+1);
  }
  return Array.isArray(v)?{type:'Array',length:v.length,entries}:{type:'Object',entries};
 }
 return copy(value,'$',0);
}
