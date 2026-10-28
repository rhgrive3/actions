// Local diagnostic only. Captures boundaries, not causal GL calls.
// Self-contained for serialization into a separately reviewed diagnostic harness.
export function runRenderPassProbe(gl, system, {maxChecks=512}={}) {
  class ProbeError extends Error { constructor(kind,details){super('RenderPass diagnostic '+kind);this.name='ProbeError';this.kind=kind;this.details=details;} }
  if(!gl||typeof gl.getError!=='function'||!system||!Number.isSafeInteger(maxChecks)||maxChecks<1)throw TypeError('Invalid probe input');
  const renderer=system.renderer, pass=system.renderPass, composer=system.composer, nativeGetError=gl.getError;
  if(!renderer||!pass||!composer||renderer===pass)throw TypeError('Missing or invalid RenderPass owners');
  const state={status:'installing',checks:0,boundaries:[],failure:null,restoreErrors:[],passCalls:0,topCalls:[],nestedCalls:0,coverage:null,primary:null,renderState:'not-entered'};
  const installed=[],stack=[];let primary,hadPrimary=false,active=false,expectedClear,passEntered=false;
  const describe=error=>{try{return String(error?.stack||error).slice(0,4096);}catch{return 'unprintable thrown value';}};
  function check(boundary,args=[]) {
    if(state.checks>=maxChecks){state.status='limit';throw new ProbeError('checkpoint-limit',{maxChecks});}
    state.checks++;const code=Reflect.apply(nativeGetError,gl,[]);state.boundaries.push(boundary);
    if(code!==gl.NO_ERROR){const details={boundary,code,argumentTypes:Array.from(args,x=>x===null?'null':typeof x),stack:(new Error().stack||'').split('\n').slice(0,10).join('\n').slice(0,2048),attribution:'first observed boundary, not necessarily causal GL call'};state.failure=details;state.status='gl-error';throw new ProbeError('gl-error',details);}
  }
  try {
    const names=['setRenderTarget','clear','render'];
    const specs=[{target:pass,name:'render',role:'pass'},...names.map(name=>({target:renderer,name,role:'renderer'}))].map(s=>{
      const own=Object.getOwnPropertyDescriptor(s.target,s.name),original=Reflect.get(s.target,s.name);
      if(typeof original!=='function'||(own&&!own.configurable))throw new ProbeError('unsupported-method',{role:s.role,name:s.name});
      return {...s,own,original};
    });
    expectedClear=pass.clear===true;
    for(const spec of specs){
      const wrapper=function(...args){
        if(spec.role==='pass'){
          state.passCalls++;
          if(state.passCalls!==1||active)throw new ProbeError('unexpected-pass-call',{count:state.passCalls});
          check('before-pass',args);active=true;
          try { passEntered=true;const value=Reflect.apply(spec.original,this,args);check('after-pass',args);return value; }
          finally { active=false; }
        }
        if(!active)return Reflect.apply(spec.original,this,args);
        const depth=stack.length, where=`${spec.name}@${depth}`;
        if(depth===0)state.topCalls.push(spec.name);else state.nestedCalls++;
        check('before-'+where,args);stack.push(spec.name);
        try {const value=Reflect.apply(spec.original,this,args);check('after-'+where,args);return value;}
        finally {stack.pop();}
      };
      Object.defineProperty(spec.target,spec.name,{value:wrapper,configurable:true,writable:true,enumerable:spec.own?.enumerable??false});
      installed.push({...spec,wrapper});
    }
    state.status='running';check('pre-render');
    const value=system.render();if(value!==undefined)throw new ProbeError('unexpected-render-return',{type:typeof value});
    check('post-render');
    if(state.passCalls!==1)throw new ProbeError('unexpected-pass-call',{count:state.passCalls});
    const expected=expectedClear?['setRenderTarget','clear','render']:['setRenderTarget','render'];
    if(state.topCalls.length!==expected.length||expected.some((x,i)=>x!==state.topCalls[i]))throw new ProbeError('unexpected-top-calls',{expected,actual:[...state.topCalls]});
    if(system.renderer!==renderer||system.renderPass!==pass||system.composer!==composer||!Array.isArray(composer.passes)||!composer.passes.includes(pass))throw new ProbeError('identity-changed',{});
    state.status='completed';
  } catch(error){hadPrimary=true;primary=error;let kind=null;try{kind=error?.kind||null;}catch{}state.primary={type:error===null?'null':typeof error,kind,description:describe(error)};if(state.status==='installing'||state.status==='running')state.status='exception';}
  finally {
    try{state.coverage={passCalls:state.passCalls,topCalls:[...state.topCalls],nestedCalls:state.nestedCalls,rendererSame:system.renderer===renderer,passSame:system.renderPass===pass,composerSame:system.composer===composer,passStillInComposer:Array.isArray(composer.passes)&&composer.passes.includes(pass)};}
    catch(error){state.coverage={inspectionError:describe(error)};if(!hadPrimary){state.status='exception';primary=new ProbeError('coverage-inspection-failed',{});hadPrimary=true;state.primary={type:'object',kind:primary.kind,description:primary.message};}}
    for(const s of installed.reverse())try{
      const now=Object.getOwnPropertyDescriptor(s.target,s.name);if(!now||now.value!==s.wrapper)throw Error('wrapper descriptor replaced');
      if(s.own)Object.defineProperty(s.target,s.name,s.own);else if(!Reflect.deleteProperty(s.target,s.name))throw Error('cannot remove wrapper');
      if(Reflect.get(s.target,s.name)!==s.original)throw Error('restored identity mismatch');
    }catch(error){state.restoreErrors.push({role:s.role,name:s.name,message:describe(error)});}
  }
  if(!hadPrimary&&state.restoreErrors.length)state.status='restore-failed';
  state.renderState=hadPrimary||state.restoreErrors.length?(passEntered?'potentially-dirty':'not-entered'):'completed';
  return {ok:!hadPrimary&&!state.restoreErrors.length,state,error:hadPrimary?primary:(state.restoreErrors.length?new ProbeError('restore-failed',{errors:state.restoreErrors}):null)};
}
