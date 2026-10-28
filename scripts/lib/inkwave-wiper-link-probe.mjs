// Local-only opt-in shader link diagnostic. No source/quality change; no getError drain.
// Self-contained function for separately reviewed Playwright serialization.
export function runWiperLinkProbe(gl,system,target,{maxPrograms=4,maxLogChars=2048}={}) {
 class ProbeError extends Error{constructor(kind,details){super('Wiper link diagnostic '+kind);this.name='ProbeError';this.kind=kind;this.details=details;}}
 if(!gl||typeof gl.getError!=='function'||!system||!target||!Number.isSafeInteger(maxPrograms)||maxPrograms<1||maxPrograms>8||!Number.isSafeInteger(maxLogChars)||maxLogChars<1||maxLogChars>4096)throw TypeError('Invalid link probe input');
 const renderer=system.renderer,pass=system.renderPass,composer=system.composer,scene=system.scene,material=target.material,getError=gl.getError;
 if(!renderer||!pass||!composer||!scene||!material)throw TypeError('Missing exact owners');
 const state={status:'installing',checks:0,passCalls:0,sceneCalls:0,targetSeen:0,colorTargetSeen:0,programCalls:0,observations:[],failure:null,primary:null,coverage:null,restoreErrors:[],renderState:'not-entered'};
 const installed=[];let activePass=false,sceneDepth=0,targetDepth=0,passEntered=false,hadPrimary=false,primary;
 const describe=e=>{try{return String(e?.stack||e).slice(0,4096);}catch{return 'unprintable thrown value';}};
 function check(boundary){state.checks++;const code=Reflect.apply(getError,gl,[]);if(code!==gl.NO_ERROR){const details={boundary,code,attribution:'first observed boundary, not necessarily causal GL call'};state.failure=details;state.status='gl-error';throw new ProbeError('gl-error',details);}}
 function query(name,fn){const value=fn();check('after-query-'+name);return value;}
 function safeLog(value){if(value==null)return {text:null,truncated:false};if(typeof value!=='string')return {text:null,truncated:false,invalidType:typeof value};const bounded=value.slice(0,maxLogChars);return {text:bounded.replace(/(?:https?|wss?|file):\/\/[^\s]+/gi,'[url-redacted]').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,' '),truncated:value.length>maxLogChars};}
 try{
  const specs=[{target:pass,name:'render',role:'pass'},{target:renderer,name:'render',role:'scene'},{target:renderer,name:'renderBufferDirect',role:'direct'},{target:gl,name:'useProgram',role:'program'}].map(s=>{const own=Object.getOwnPropertyDescriptor(s.target,s.name),original=Reflect.get(s.target,s.name);if(typeof original!=='function'||(own&&!own.configurable))throw new ProbeError('unsupported-method',{role:s.role,name:s.name});return {...s,own,original};});
  for(const spec of specs){
   const wrapper=function(...args){
    if(spec.role==='pass') {state.passCalls++;if(state.passCalls!==1||activePass)throw new ProbeError('unexpected-pass',{count:state.passCalls});check('before-pass');activePass=true;try{passEntered=true;const value=Reflect.apply(spec.original,this,args);check('after-pass');return value;}finally{activePass=false;}}
    if(spec.role==='scene') {if(!activePass)return Reflect.apply(spec.original,this,args);state.sceneCalls++;check('before-scene');sceneDepth++;try{const value=Reflect.apply(spec.original,this,args);check('after-scene');return value;}finally{sceneDepth--;}}
    if(spec.role==='direct') {if(!activePass||!sceneDepth)return Reflect.apply(spec.original,this,args);if(args[4]!==target)return Reflect.apply(spec.original,this,args);state.targetSeen++;if(args[1]!==scene||args[3]!==material)return Reflect.apply(spec.original,this,args);state.colorTargetSeen++;check('before-target');targetDepth++;try{const value=Reflect.apply(spec.original,this,args);check('after-target');return value;}finally{targetDepth--;}}
    if(!activePass||!sceneDepth||!targetDepth)return Reflect.apply(spec.original,this,args);
    if(++state.programCalls>maxPrograms)throw new ProbeError('program-limit',{maxPrograms});
    const program=args[0];check('before-target-useProgram');if(!program)throw new ProbeError('null-program',{});
    const observation={index:state.programCalls,linked:null,programLog:null,shaders:[],nativeUseProgramCalled:false};state.observations.push(observation);
    const linked=query('link-status',()=>gl.getProgramParameter(program,gl.LINK_STATUS));observation.linked=typeof linked==='boolean'?linked:null;
    if(observation.linked===null)throw new ProbeError('link-status-unavailable',{});
    observation.programLog=safeLog(query('program-info-log',()=>gl.getProgramInfoLog(program)));
    const shaders=query('attached-shaders',()=>gl.getAttachedShaders(program));if(!Array.isArray(shaders)||shaders.length>4)throw new ProbeError('attached-shaders-unavailable',{count:Array.isArray(shaders)?shaders.length:null});
    for(let i=0;i<shaders.length;i++){
     const shader=shaders[i],type=query('shader-type',()=>gl.getShaderParameter(shader,gl.SHADER_TYPE));
     const compile=query('compile-status',()=>gl.getShaderParameter(shader,gl.COMPILE_STATUS));
     const log=safeLog(query('shader-info-log',()=>gl.getShaderInfoLog(shader)));
     observation.shaders.push({type:type===gl.VERTEX_SHADER?'vertex':type===gl.FRAGMENT_SHADER?'fragment':'unknown',compiled:typeof compile==='boolean'?compile:null,log});
    }
    if(!observation.linked)throw new ProbeError('link-failed',{index:observation.index});
    if(observation.shaders.length!==2||new Set(observation.shaders.map(x=>x.type)).size!==2||observation.shaders.some(x=>!['vertex','fragment'].includes(x.type)||x.compiled!==true))throw new ProbeError('shader-coverage-incomplete',{index:observation.index});
    observation.nativeUseProgramCalled=true;const value=Reflect.apply(spec.original,this,args);check('after-target-useProgram');return value;
   };
   Object.defineProperty(spec.target,spec.name,{value:wrapper,configurable:true,writable:true,enumerable:spec.own?.enumerable??false});installed.push({...spec,wrapper});
  }
  state.status='running';check('pre-render');const value=system.render();if(value!==undefined)throw new ProbeError('unexpected-render-return',{type:typeof value});check('post-render');
  if(state.passCalls!==1||state.sceneCalls!==1||state.colorTargetSeen<1||state.programCalls<1)throw new ProbeError('incomplete-coverage',{passCalls:state.passCalls,sceneCalls:state.sceneCalls,colorTargetSeen:state.colorTargetSeen,programCalls:state.programCalls});
  if(system.renderer!==renderer||system.renderPass!==pass||system.composer!==composer||system.scene!==scene||target.material!==material||!Array.isArray(composer.passes)||!composer.passes.includes(pass))throw new ProbeError('identity-changed',{});
  state.status='completed';
 }catch(error){hadPrimary=true;primary=error;let kind=null;try{if(typeof error?.kind==='string')kind=error.kind.slice(0,80);}catch{}state.primary={type:error===null?'null':typeof error,kind,description:describe(error)};if(state.status==='installing'||state.status==='running')state.status='exception';}
 finally{
  try{state.coverage={passCalls:state.passCalls,sceneCalls:state.sceneCalls,targetSeen:state.targetSeen,colorTargetSeen:state.colorTargetSeen,programCalls:state.programCalls,rendererSame:system.renderer===renderer,passSame:system.renderPass===pass,composerSame:system.composer===composer,sceneSame:system.scene===scene,targetMaterialSame:target.material===material,passStillInComposer:Array.isArray(composer.passes)&&composer.passes.includes(pass)};}
  catch(error){state.coverage={inspectionError:describe(error)};if(!hadPrimary){state.status='exception';primary=new ProbeError('coverage-inspection-failed',{});hadPrimary=true;state.primary={type:'object',kind:primary.kind,description:primary.message};}}
  for(const s of installed.reverse())try{const now=Object.getOwnPropertyDescriptor(s.target,s.name);if(!now||now.value!==s.wrapper)throw Error('wrapper descriptor replaced');if(s.own)Object.defineProperty(s.target,s.name,s.own);else if(!Reflect.deleteProperty(s.target,s.name))throw Error('cannot remove wrapper');if(Reflect.get(s.target,s.name)!==s.original)throw Error('restored identity mismatch');}catch(error){state.restoreErrors.push({role:s.role,name:s.name,message:describe(error)});}
 }
 if(!hadPrimary&&state.restoreErrors.length)state.status='restore-failed';state.renderState=hadPrimary||state.restoreErrors.length?(passEntered?'potentially-dirty':'not-entered'):'completed';
 return {ok:!hadPrimary&&!state.restoreErrors.length,state,error:hadPrimary?primary:(state.restoreErrors.length?new ProbeError('restore-failed',{errors:state.restoreErrors}):null)};
}
