// Local diagnostic prototype: source-level EffectComposer/pass boundaries only.
export function runPassProbe(gl, renderer, {maxPasses=32}={}) {
  // Deliberately self-contained so Playwright can serialize this exact function.
  class PassProbeError extends Error {
    constructor(kind, details) { super(`Wiper pass diagnostic ${kind}`); this.name='PassProbeError';this.kind=kind;this.details=details; }
  }
  const composer=renderer?.composer, passes=composer?.passes, getError=gl?.getError;
  if(typeof getError!=='function'||!composer||!Array.isArray(passes)||!Number.isSafeInteger(maxPasses)||maxPasses<1)throw new TypeError('Invalid probe input');
  const state={status:'installing',checks:0,failure:null,restoreErrors:[],boundaries:[],composerCalls:0,coverage:null};const installed=[];let primary;
  const snapshot=passes.slice();
  try {
    if(snapshot.length>maxPasses||new Set(snapshot).size!==snapshot.length||snapshot.includes(composer))throw new PassProbeError('unsupported-passes',{count:snapshot.length});
    const objects=[{target:composer,label:'composer'},...snapshot.map((target,index)=>({target,label:`pass[${index}]`}))];
    const specs=objects.map(({target,label})=>{
      if(!target)throw new PassProbeError('unsupported-object',{label});
      const original=Reflect.get(target,'render'), own=Object.getOwnPropertyDescriptor(target,'render');
      if(typeof original!=='function'||(own&&!own.configurable))throw new PassProbeError('unsupported-render',{label});
      return {target,label,original,own};
    });
    function check(boundary) {
      if(state.checks>=2*maxPasses+4){state.status='limit';throw new PassProbeError('checkpoint-limit',{maxCheckpoints:2*maxPasses+4});}
      state.checks++; const code=Reflect.apply(getError,gl,[]);
      // Bounded: at most two boundaries per pass plus composer and outer render.
      state.boundaries.push(boundary);
      if(code!==gl.NO_ERROR){const details={boundary,code,stack:(new Error().stack||'').split('\n').slice(0,10).join('\n').slice(0,2048),attribution:'first observed boundary, not necessarily causal pass'};state.failure=details;state.status='gl-error';throw new PassProbeError('gl-error',details);}
    }
    for(const spec of specs){
      const wrapper=function(...args){if(spec.label==='composer')state.composerCalls++;check(`before-${spec.label}`);const value=Reflect.apply(spec.original,this,args);check(`after-${spec.label}`);return value;};
      Object.defineProperty(spec.target,'render',{value:wrapper,configurable:true,writable:true,enumerable:spec.own?.enumerable??false});installed.push({...spec,wrapper});
    }
    state.status='running';check('pre-render');const result=renderer.render();
    if(result!==undefined)throw new PassProbeError('unexpected-render-return',{type:typeof result});
    check('post-render');
    if(state.composerCalls!==1)throw new PassProbeError('composer-call-count',{count:state.composerCalls});
    if(renderer.composer!==composer||composer.passes!==passes||passes.length!==snapshot.length||snapshot.some((p,i)=>passes[i]!==p))throw new PassProbeError('pass-list-changed',{});
    state.status='completed';
  } catch(error){primary=error;if(state.status==='installing'||state.status==='running')state.status='exception';}
  finally {
    try { state.coverage={composerCalls:state.composerCalls,composerIdentitySame:renderer.composer===composer,passArrayIdentitySame:composer.passes===passes,passItemsSame:passes.length===snapshot.length&&snapshot.every((p,i)=>passes[i]===p)}; }
    catch(error){ state.coverage={composerCalls:state.composerCalls,inspectionError:String(error?.message||error)}; if(!primary){state.status='exception';primary=new PassProbeError('coverage-inspection-failed',{});} }
    for(const s of installed.reverse())try{
      const now=Object.getOwnPropertyDescriptor(s.target,'render');if(!now||now.value!==s.wrapper)throw Error('wrapper descriptor was replaced');
      if(s.own)Object.defineProperty(s.target,'render',s.own);else if(!Reflect.deleteProperty(s.target,'render'))throw Error('cannot remove wrapper');
      if(Reflect.get(s.target,'render')!==s.original)throw Error('restored function identity mismatch');
    }catch(error){state.restoreErrors.push({label:s.label,message:String(error?.message||error)});}
  }
  if(!primary&&state.restoreErrors.length)state.status='restore-failed';
  return {ok:!primary&&!state.restoreErrors.length,state,error:primary||(state.restoreErrors.length?new PassProbeError('restore-failed',{errors:state.restoreErrors}):null)};
}
