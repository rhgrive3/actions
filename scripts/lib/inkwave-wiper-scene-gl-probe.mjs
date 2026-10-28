// Local-only, self-contained object-boundary diagnostic. NOT acceptance.
export function runDirectGlProbe(gl,system,{maxChecks=20000,maxRing=16,methods=null}={}) {
 class ProbeError extends Error{constructor(kind,details){super('Direct boundary diagnostic '+kind);this.name='ProbeError';this.kind=kind;this.details=details;}}
 if(!gl||typeof gl.getError!=='function'||!system||!Number.isSafeInteger(maxChecks)||maxChecks<1||maxChecks>20000)throw TypeError('Invalid probe input');
 const allowed=['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced','useProgram','bindVertexArray','bindBuffer','activeTexture','bindTexture','vertexAttribPointer','vertexAttribIPointer','enableVertexAttribArray','vertexAttribDivisor',...[1,2,3,4].flatMap(n=>['f','i','ui','fv','iv','uiv'].map(s=>`uniform${n}${s}`)),...[2,3,4].map(n=>`uniformMatrix${n}fv`)];
 if(methods===null)methods=allowed;
 if(!Array.isArray(methods)||!methods.length||new Set(methods).size!==methods.length||methods.some(n=>!allowed.includes(n))||!Number.isSafeInteger(maxRing)||maxRing<1||maxRing>32)throw TypeError('Invalid GL probe configuration');
 const renderer=system.renderer,pass=system.renderPass,composer=system.composer,nativeGetError=gl.getError;
 if(!renderer||!pass||!composer||renderer===pass)throw TypeError('Missing diagnostic owners');
 const state={status:'installing',checks:0,passCalls:0,sceneCalls:0,directCalls:0,completedDirectCalls:0,failure:null,primary:null,coverage:null,restoreErrors:[],renderState:'not-entered',glCalls:0,glInDirectCalls:0,glRing:[],glRingDropped:0,glMethods:[...methods]};
 const installed=[];let passActive=false,sceneDepth=0,directDepth=0,passEntered=false,hadPrimary=false,primary,lastArgs=null,lastOrdinal=null,glDepth=0;const activeDirect=[];
 const describe=e=>{try{return String(e?.stack||e).slice(0,4096);}catch{return 'unprintable thrown value';}};
 const read=fn=>{try{return fn();}catch{return null;}};
 const number=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
 function metadata(args){
  const [camera,scene,geometry,material,object,group]=args;
  const objType=read(()=>object?.isInstancedMesh?'instanced-mesh':object?.isMesh?'mesh':object?.isLine?'line':object?.isPoints?'points':object?.isSprite?'sprite':'other');
  const matType=read(()=>material?.isRawShaderMaterial?'raw-shader':material?.isShaderMaterial?'shader':material?.isMeshStandardMaterial?'standard':material?.isMeshBasicMaterial?'basic':material?.isMeshDepthMaterial?'depth':material?.isMeshDistanceMaterial?'distance':'other');
  return {object:{id:number(read(()=>object?.id)),type:objType,instances:number(read(()=>object?.isInstancedMesh?object.count:null))},
   material:{id:number(read(()=>material?.id)),type:matType,transparent:read(()=>typeof material?.transparent==='boolean'?material.transparent:null),wireframe:read(()=>typeof material?.wireframe==='boolean'?material.wireframe:null),side:number(read(()=>material?.side))},
   geometry:{id:number(read(()=>geometry?.id)),positionCount:number(read(()=>geometry?.attributes?.position?.count)),indexCount:number(read(()=>geometry?.index?.count)),instanced:read(()=>typeof geometry?.isInstancedBufferGeometry==='boolean'?geometry.isInstancedBufferGeometry:null),instanceCount:number(read(()=>geometry?.instanceCount))},
   group:group==null?null:{start:number(read(()=>group.start)),count:number(read(()=>group.count)),materialIndex:number(read(()=>group.materialIndex))},sceneIsNull:scene===null};
 }
 function check(boundary,args,ordinal,extra={}){
  if(state.checks>=maxChecks){state.status='limit';throw new ProbeError('checkpoint-limit',{maxChecks});}
  state.checks++;const code=Reflect.apply(nativeGetError,gl,[]);
  if(code!==gl.NO_ERROR){const details={boundary,code,ordinal,directDepth,sceneDepth,...extra,metadata:args?metadata(args):(activeDirect.length?metadata(activeDirect.at(-1).args):null),currentDirect:activeDirect.length?{ordinal:activeDirect.at(-1).ordinal}:null,lastCompleted:!args&&lastArgs?{ordinal:lastOrdinal,metadata:metadata(lastArgs),observation:'read-at-failure; referenced object state may have changed since call'}:null,attribution:'interval since preceding checkpoint, not proof of a causal object or GL call',stack:(new Error().stack||'').split('\n').slice(0,10).join('\n').slice(0,2048)};state.failure=details;state.status='gl-error';throw new ProbeError('gl-error',details);}
 }
 try {
  const specs=[{target:pass,name:'render',role:'pass'},{target:renderer,name:'render',role:'scene'},{target:renderer,name:'renderBufferDirect',role:'direct'},...methods.map(name=>({target:gl,name,role:'gl'}))].map(s=>{const own=Object.getOwnPropertyDescriptor(s.target,s.name),original=Reflect.get(s.target,s.name);if(typeof original!=='function'||(own&&!own.configurable))throw new ProbeError('unsupported-method',{role:s.role,name:s.name});return {...s,own,original};});
  for(const spec of specs){
   const wrapper=function(...args){
    if(spec.role==='pass'){
     state.passCalls++;if(state.passCalls!==1||passActive)throw new ProbeError('unexpected-pass-call',{count:state.passCalls});
     check('before-pass');passActive=true;try{passEntered=true;const value=Reflect.apply(spec.original,this,args);check('after-pass');return value;}finally{passActive=false;}
    }
    if(spec.role==='scene'){
     if(!passActive)return Reflect.apply(spec.original,this,args);
     state.sceneCalls++;const depth=sceneDepth;check('before-scene-render',null,null,{depth});sceneDepth++;
     try{const value=Reflect.apply(spec.original,this,args);check('after-scene-render',null,null,{depth});return value;}finally{sceneDepth--;}
    }
    if(spec.role==='gl'){
     if(!passActive||sceneDepth===0)return Reflect.apply(spec.original,this,args);
     const ordinal=++state.glCalls,depth=glDepth;if(activeDirect.length)state.glInDirectCalls++;const entry={method:spec.name,ordinal,depth,status:'pending-before-call',argumentTypes:args.map(x=>x===null?'null':typeof x)};
     if(state.glRing.length===maxRing){state.glRing.shift();state.glRingDropped++;}state.glRing.push(entry);
     check('before-gl',null,ordinal,{method:spec.name,depth,executed:false});glDepth++;
     try{const value=Reflect.apply(spec.original,this,args);entry.status='returned';check('after-gl',null,ordinal,{method:spec.name,depth,executed:true});entry.status='checked-clean';return value;}finally{glDepth--;}
    }
    if(!passActive||sceneDepth===0)return Reflect.apply(spec.original,this,args);
    const ordinal=++state.directCalls;const depth=directDepth;check('before-direct',args,ordinal,{depth,executed:false});directDepth++;activeDirect.push({ordinal,args});
    try{const value=Reflect.apply(spec.original,this,args);state.completedDirectCalls++;check('after-direct',args,ordinal,{depth,executed:true});lastArgs=args;lastOrdinal=ordinal;return value;}finally{activeDirect.pop();directDepth--;}
   };
   Object.defineProperty(spec.target,spec.name,{value:wrapper,configurable:true,writable:true,enumerable:spec.own?.enumerable??false});installed.push({...spec,wrapper});
  }
  state.status='running';check('pre-render');const value=system.render();if(value!==undefined)throw new ProbeError('unexpected-render-return',{type:typeof value});check('post-render');
  if(state.passCalls!==1||state.sceneCalls!==1||state.directCalls<1||state.glCalls<1||state.glInDirectCalls<1)throw new ProbeError('incomplete-coverage',{passCalls:state.passCalls,sceneCalls:state.sceneCalls,directCalls:state.directCalls,glCalls:state.glCalls,glInDirectCalls:state.glInDirectCalls});
  if(system.renderer!==renderer||system.renderPass!==pass||system.composer!==composer||!Array.isArray(composer.passes)||!composer.passes.includes(pass))throw new ProbeError('identity-changed',{});
  state.status='completed';
 }catch(error){hadPrimary=true;primary=error;let kind=null;try{if(typeof error?.kind==='string')kind=error.kind.slice(0,80);}catch{}state.primary={type:error===null?'null':typeof error,kind,description:describe(error)};if(state.status==='installing'||state.status==='running')state.status='exception';}
 finally{
  try{state.coverage={passCalls:state.passCalls,sceneCalls:state.sceneCalls,directCalls:state.directCalls,completedDirectCalls:state.completedDirectCalls,glCalls:state.glCalls,glInDirectCalls:state.glInDirectCalls,rendererSame:system.renderer===renderer,passSame:system.renderPass===pass,composerSame:system.composer===composer,passStillInComposer:Array.isArray(composer.passes)&&composer.passes.includes(pass)};}
  catch(error){state.coverage={inspectionError:describe(error)};if(!hadPrimary){state.status='exception';primary=new ProbeError('coverage-inspection-failed',{});hadPrimary=true;state.primary={type:'object',kind:primary.kind,description:primary.message};}}
  for(const s of installed.reverse())try{const now=Object.getOwnPropertyDescriptor(s.target,s.name);if(!now||now.value!==s.wrapper)throw Error('wrapper descriptor replaced');if(s.own)Object.defineProperty(s.target,s.name,s.own);else if(!Reflect.deleteProperty(s.target,s.name))throw Error('cannot remove wrapper');if(Reflect.get(s.target,s.name)!==s.original)throw Error('restored identity mismatch');}catch(error){state.restoreErrors.push({role:s.role,name:s.name,message:describe(error)});}
 }
 if(!hadPrimary&&state.restoreErrors.length)state.status='restore-failed';state.renderState=hadPrimary||state.restoreErrors.length?(passEntered?'potentially-dirty':'not-entered'):'completed';
 return {ok:!hadPrimary&&!state.restoreErrors.length,state,error:hadPrimary?primary:(state.restoreErrors.length?new ProbeError('restore-failed',{errors:state.restoreErrors}):null)};
}
