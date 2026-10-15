export async function probeWorldCancellation({worldURL,fixtureURL,threeURL,variant,scenario}){
 const THREE=await import(threeURL),{makeWorldFixture}=await import(fixtureURL),check=(v,m)=>{if(!v)throw Error(m)};
 const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;document.body.append(canvas);
 const renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:false}),gl=renderer.getContext(),f=makeWorldFixture(THREE,renderer);
 const oldFixture=Object.getOwnPropertyDescriptor(globalThis,'__worldFixture'),raf=Object.getOwnPropertyDescriptor(globalThis,'requestAnimationFrame'),compile=Object.getOwnPropertyDescriptor(renderer,'compileAsync'),nativeCompile=renderer.compileAsync;
 const warmReceipts=[],cleanupErrors=[],tasks=[];let primary,result,world,secondIdentity,secondResources,reentrantPreserved=null;
 const wait=async (fn,{ignoreWarmErrors=false}={})=>{const end=performance.now()+10000;while(!fn()){const failed=f.warms.find(x=>x.error);if(failed&&!ignoreWarmErrors)throw failed.error;if(performance.now()>end)throw Error('Controlled boundary deadline');await new Promise(r=>setTimeout(r,0));}};
 try{
  globalThis.__worldFixture=f;
  renderer.compileAsync=async function(...args){
   const entry={resolved:false,release:null};f.warms.push(entry);let release;const gate=new Promise(r=>release=r);entry.release=release;
   try{await Reflect.apply(nativeCompile,this,args);
   const target=renderer.getRenderTarget(),mesh=args[0].children[0],visible=mesh.visible;
   const paint=f.paints[f.warms.indexOf(entry)];const pixels=new Uint8Array(8*8*4);let complete;
   try{mesh.visible=true;renderer.setRenderTarget(paint.rt);renderer.render(args[0],args[1]);complete=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;renderer.readRenderTargetPixels(paint.rt,0,0,8,8,pixels);}finally{renderer.setRenderTarget(target);mesh.visible=visible;}
   const receipt={nativeCompileResolved:true,framebufferComplete:complete,nonblank:pixels.some((x,i)=>i%4!==3&&x>0),glError:gl.getError()};warmReceipts.push(receipt);check(receipt.framebufferComplete&&receipt.nonblank&&receipt.glError===0&&!gl.isContextLost(),'Real shader/render failure');entry.resolved=true;await gate;}catch(e){entry.error=e;throw e;}
  };
  Object.defineProperty(globalThis,'requestAnimationFrame',{...raf,value:function(callback){return Reflect.apply(raf.value,this,[time=>f.frames.push(()=>callback(time))]);}});
  world=await import(worldURL);
  const start=()=>{const generation=f.newGeneration();const task=world.buildNativeWorld(f.game,{id:'synthetic',name:'Synthetic'},f.current(generation));tasks.push(task);task.catch(()=>{});return task;};
  const first=start();await wait(()=>f.warms[0]?.resolved);check(renderer.getRenderTarget()===null,'Renderer state must be restored while waiting');
  if(scenario==='warm-stale'){f.invalidate();f.warms[0].release();}
  else if(scenario==='reentrant'){
   const firstResourceCount=f.resources.length;const second=start();await wait(()=>f.warms[1]?.resolved);f.warms[1].release();await wait(()=>f.frames.length);f.frames.shift()();await second;secondIdentity=[f.game.nativeWorld,f.G.paint,f.G.nav,f.game.levelMesh];check(secondIdentity.every(Boolean),'New world published');secondResources=f.resources.slice(firstResourceCount);check(secondResources.length===7&&secondResources.every(x=>x.disposed===0),'New world owns all resources');f.warms[0].release();
  }else{f.warms[0].release();await wait(()=>f.frames.length);if(scenario==='frame-stale')f.invalidate();f.frames.shift()();}
  let settled=false;first.finally(()=>settled=true).catch(()=>{});await wait(()=>{for(const frame of f.frames.splice(0))frame();return settled;});await first;
  if(secondIdentity){reentrantPreserved=secondIdentity.every((x,i)=>x===[f.game.nativeWorld,f.G.paint,f.G.nav,f.game.levelMesh][i])&&secondResources.every(x=>x.disposed===0);check(reentrantPreserved,'Old build must not replace/dispose new world');}
  const published=!!f.game.nativeWorld;check(published===(scenario==='normal'||scenario==='reentrant'),'Expected publication');
  result={variant,scenario,published,reentrantPreserved,counts:f.counts,warmReceipts,resources:f.resources,rendererTargetRestored:renderer.getRenderTarget()===null,pageErrors:[],cleanupErrors,restored:false,contextLost:gl.isContextLost(),glError:gl.getError()};
 }catch(e){primary=e;}
 finally{
  const attempt=fn=>{try{fn();}catch(e){cleanupErrors.push(String(e.stack||e));}};
  for(const entry of f.warms)entry.release?.();for(const frame of f.frames.splice(0))attempt(frame);
  f.game._nativeAbort?.abort();
  let settled=false;Promise.allSettled(tasks).then(()=>settled=true);try{await wait(()=>{for(const entry of f.warms)entry.release?.();for(const frame of f.frames.splice(0))frame();return settled;},{ignoreWarmErrors:true});}catch(e){cleanupErrors.push(String(e));}
  attempt(()=>world?.releaseNativeWorld(f.game));attempt(()=>f.G.paint?.dispose());
  const liveBeforeEmergency=f.resources.filter(row=>row.disposed===0).map(row=>row.kind);
  if(liveBeforeEmergency.length&&!primary)primary=Error('Unexpected live resources after owner cleanup: '+liveBeforeEmergency.join(','));
  // Emergency cleanup cannot turn a missing owner disposal into a successful receipt.
  for(const row of f.resources)if(row.disposed===0)attempt(()=>row.resource.dispose());
  attempt(()=>Object.defineProperty(globalThis,'requestAnimationFrame',raf));attempt(()=>{if(compile)Object.defineProperty(renderer,'compileAsync',compile);else delete renderer.compileAsync;});
  attempt(()=>{if(oldFixture)Object.defineProperty(globalThis,'__worldFixture',oldFixture);else delete globalThis.__worldFixture;});
  const restored=globalThis.requestAnimationFrame===raf.value&&renderer.compileAsync===nativeCompile;
  result??={variant,scenario,counts:f.counts,warmReceipts,resources:f.resources};
  result.resources=f.resources.map(({kind,disposed})=>({kind,disposed}));result.restored=restored;result.cleanupErrors=cleanupErrors;
  result.contextLost=gl.isContextLost();result.glError=gl.getError();attempt(()=>renderer.dispose());attempt(()=>canvas.remove());
  if(!restored||cleanupErrors.length)primary=new AggregateError([...(primary?[primary]:[]),...cleanupErrors.map(x=>Error(x))],'Probe/cleanup failed',{cause:primary});
 }
 if(primary){primary.capturePartial=result;throw primary;}return result;
}
