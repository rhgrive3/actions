// QA observer only. Resource counts mean API creates minus explicit deletes,
// not driver residency: GC, context loss and deferred GL deletion differ.
export function installGameplayObserver() {
 const resources={},gpu={resources,resourceSemantics:'API creates minus explicit deletes; not GPU resident bytes',bufferUploadBytes:0,bufferAllocationBytes:0,bufferUploads:0,draws:0};
 for(const C of [globalThis.WebGLRenderingContext,globalThis.WebGL2RenderingContext]) {
  if(!C)continue;const p=C.prototype;
  for(const type of ['Buffer','Texture','Framebuffer','Renderbuffer','Program','Shader','VertexArray','Query','Sync']) {
   const create=type==='Sync'?'fenceSync':'create'+type,del='delete'+type;
   if(!Object.hasOwn(p,create)||!p[del])continue;
   const counter=resources[type]??={created:0,deleted:0,live:0,peak:0},live=new WeakSet(),make=p[create],drop=p[del];
   p[create]=function(...args){const value=make.apply(this,args);if(value){live.add(value);counter.created++;counter.live++;counter.peak=Math.max(counter.peak,counter.live);}return value;};
   p[del]=function(value){const result=drop.call(this,value);if(value&&live.delete(value)){counter.deleted++;counter.live--;}return result;};
  }
  for(const name of ['bufferData','bufferSubData']) {
   if(!Object.hasOwn(p,name))continue;const native=p[name];
   p[name]=function(...args){const data=args[name==='bufferData'?1:2];let bytes=typeof data==='number'?data:data?.byteLength||0;
    if(ArrayBuffer.isView(data)){const unit=data.BYTES_PER_ELEMENT||1,offset=args[3]||0,length=args[4];bytes=(length||Math.max(0,data.byteLength/unit-offset))*unit;}
    if(name==='bufferData')gpu.bufferAllocationBytes+=bytes;
    if(typeof data!=='number')gpu.bufferUploadBytes+=bytes;
    gpu.bufferUploads++;return native.apply(this,args);};
  }
  for(const name of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']) {if(!Object.hasOwn(p,name))continue;const native=p[name];p[name]=function(...args){gpu.draws++;return native.apply(this,args);};}
 }
 const data={gpu,frames:[],frameCpu:[],calls:[],triangles:[],gpuRenderMs:[],owners:{},totalFrames:0,windowFrames:0,contextLost:false,crab:[]};
 globalThis.__gameplayProbe=data;
 globalThis.__startGameplayObserver=()=>{
  const G=globalThis.__G,g=globalThis.__inkwave;if(!g||g.__gameplayObserved)return false;g.__gameplayObserved=true;
  const seen=new WeakMap(),frame=g._frame;let previous,query=null;
  const gl=G.renderer.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
  data.gpuTimer={supported:!!ext,scope:'g.R.render only; Query counters include observer queries',disjointSamples:0};
  const dropQuery=()=>{if(query){gl.deleteQuery(query);query=null;}};
  globalThis.__stopGameplayObserver=dropQuery;
  const bind=(name,owner,key)=>{
   if(!owner||typeof owner[key]!=='function')return;let keys=seen.get(owner);if(!keys)seen.set(owner,keys=new Set());if(keys.has(key))return;keys.add(key);
   const native=owner[key];owner[key]=function(...args){let active=false;
    if(name==='render'&&ext&&!gl.isContextLost()){
     if(query&&gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE)){if(gl.getParameter(ext.GPU_DISJOINT_EXT))data.gpuTimer.disjointSamples++;else if(data.gpuRenderMs.length<20000)data.gpuRenderMs.push(gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6);dropQuery();}
     if(!query&&!gl.getQuery(ext.TIME_ELAPSED_EXT,gl.CURRENT_QUERY)){query=gl.createQuery();if(query){gl.beginQuery(ext.TIME_ELAPSED_EXT,query);active=true;}}
    }
    const t=performance.now();try{return native.apply(this,args);}finally{if(active)gl.endQuery(ext.TIME_ELAPSED_EXT);const x=data.owners[name]??={calls:0,ms:0};x.calls++;x.ms+=performance.now()-t;}
   };
  };
  g._frame=function(dt){
   for(const [name,owner,key]of [['paint',G.paint,'flush'],['projectiles',G.projectiles,'update'],['fx',G.fx,'update'],['render',g.R,'render'],['match',g.match,'update']])bind(name,owner,key);
   const now=performance.now();if(previous!==undefined&&data.frames.length<20000)data.frames.push(now-previous);previous=now;
   const t=performance.now();try{return frame.call(this,dt);}finally{globalThis.__pollCrabBalls?.();data.contextLost ||=gl.isContextLost();data.totalFrames++;data.windowFrames++;if(data.frameCpu.length<20000){data.frameCpu.push(performance.now()-t);data.calls.push(G.renderer.info.render.calls);data.triangles.push(G.renderer.info.render.triangles);}}
  };
 };
 // Keep only WeakRefs and numeric receipts. No observer closure captures actors,
 // meshes, geometry or materials across match teardown.
 globalThis.__watchCrabBall=(actor,cycle)=>{
  const record={cycle,actor:new WeakRef(actor),mesh:null,created:0,geometryId:-1,geometryCpuBytes:0,geometryDisposed:0,materialDisposed:0,seenInScene:false};
  data.crab.push(record);return record;
 };
 globalThis.__pollCrabBalls=()=>{
  for(const record of data.crab){const actor=record.actor.deref(),mesh=actor?._s3AllSpecialState?.ballMesh;
   if(mesh&&!record.mesh){record.mesh=new WeakRef(mesh);record.created++;record.geometryId=mesh.geometry?.id??-1;const arrays=new Set();for(const attribute of [mesh.geometry?.index,...Object.values(mesh.geometry?.attributes||{})])if(attribute?.array&&!arrays.has(attribute.array)){arrays.add(attribute.array);record.geometryCpuBytes+=attribute.array.byteLength;}mesh.geometry?.addEventListener('dispose',()=>record.geometryDisposed++);for(const mat of Array.isArray(mesh.material)?mesh.material:[mesh.material])mat?.addEventListener('dispose',()=>record.materialDisposed++);}
   if(record.mesh?.deref()?.parent)record.seenInScene=true;
  }
 };
 globalThis.__crabReceipts=()=>data.crab.map(r=>({cycle:r.cycle,created:r.created,geometryId:r.geometryId,geometryCpuBytes:r.geometryCpuBytes,geometryDisposed:r.geometryDisposed,materialDisposed:r.materialDisposed,seenInScene:r.seenInScene,inScene:!!r.mesh?.deref()?.parent,actorRetained:!!r.actor.deref(),meshRetained:!!r.mesh?.deref()}));
}
