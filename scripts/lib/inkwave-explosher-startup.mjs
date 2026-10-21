// Diagnostic-only normal boot admission; no production object/color/clock rewrites.
export function readExplosherSceneClocks(){
        const G=window.__G,g=window.__inkwave;
        const finite=(value,label,required=false)=>{
          if(value===undefined||value===null){if(required)throw Error('Missing clock '+label);return null;}
          if(!Number.isFinite(value))throw Error('Non-finite clock '+label);return value;
        };
        const uniforms=[];
        G.scene.traverse(o=>{
          for(const [slot,m]of (Array.isArray(o.material)?o.material:[o.material]).entries()){
            if(!m)continue;
            for(const [kind,bank]of [['direct',m.uniforms],['userData',m.userData?.uniforms]]){
              for(const [key,u]of Object.entries(bank||{})){
                if(/time|clock/i.test(key)&&typeof u?.value==='number')
                  uniforms.push([o.name||'',m.name||'',slot,kind,key,finite(u.value,key)]);
              }
            }
          }
        });
        uniforms.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
        return {game:finite(G.time,'game',true),environment:finite(G.env?.time,'environment',true),
          environmentUniform:finite(G.env?.U?.uTime?.value,'environmentUniform',true),
          fx:finite(G.fx?._time,'fx',true),fxHooks:finite(g.fxHooks?.time,'fxHooks'),
          paint:finite(G.paint?.clock,'paint',true),decor:finite(g.decor?.time,'decor'),
          decorUniform:finite(g.decor?.uTime?.value,'decorUniform'),propsUniform:finite(g.props?.uTime?.value,'propsUniform'),
          levelUniform:finite(g.levelMat?.userData?.uniforms?.uTime?.value,'levelUniform'),
          grateUniform:finite(g.grateMat?.userData?.uniforms?.uTime?.value,'grateUniform'),uniforms};
      }

export function requireExplosherStyle(actual){
 const expected={hair:0,skin:7,outfit:5,eyes:1,hat:0,brows:3};
 if(!actual||Object.keys(actual).length!==6||Object.entries(expected).some(([k,v])=>!Object.hasOwn(actual,k)||actual[k]!==v))throw Error('Native diagnostic profile style mismatch');
 return {...actual};
}

export function installExplosherEarlyFreeze(){
 if(Object.hasOwn(window,'__inkwave'))throw Error('Game already published before diagnostic freeze');
 Object.defineProperty(window,'__inkwave',{configurable:true,set(game){
  Object.defineProperty(window,'__inkwave',{value:game,writable:true,configurable:true,enumerable:true});
  if(!game||typeof game!=='object')throw Error('Invalid native game publication');
  game.frozen=true;
  queueMicrotask(()=>{
   if(window.__G?.game!==game||!game.frozen||typeof game.debug?.freeze!=='function')throw Error('Incomplete native game publication');
   game.debug.freeze();window.explosherBootClocks=window.readExplosherSceneClocks();
  });
 }});
 const entry=e=>{
  if(!e.isTrusted||!e.target?.closest?.('.iw-ui [data-id="mode-range"]'))return;
  const g=window.__inkwave;if(g?.menus?.current!=='mode')return;
  g.debug.freeze();
  const clocks=window.readExplosherSceneClocks();
  if(!window.explosherBootClocks||JSON.stringify(clocks)!==JSON.stringify(window.explosherBootClocks))throw Error('Scene clocks advanced before trusted Range entry');
  window.explosherEntry={trusted:true,boundary:'native-publication-to-trusted-range',boot:window.explosherBootClocks,entry:clocks};
  document.removeEventListener('click',entry,true);
 };
 document.addEventListener('click',entry,true);
}


export function installExplosherRandom(trace = false){
 const seed=0x515e7021;let word=seed,draws=0,resets=0,phase='boot';const boundaries=[],callers=new Map();let overflow=0;
 const snapshot=()=>({algorithm:'xorshift32',seed,word:word>>>0,draws,resets,identityPreserved:true});
 const bootCallers=new Map();let bootSamples=0,bootOverflow=0,bootCapExcluded=0,bootUnobserved=0;
 const bootWindow={startDraw:30000,endDraw:70000,stride:32,maxSamples:1536,maxCallerGroups:24};
 const readPortrait=()=>{
  const G=window.__G,g=window.__inkwave;
  if(!G||!g)return {observed:false,reason:'Native context not yet published'};
  if(G.game!==g)return {observed:false,reason:'Published native context owner mismatch'};
  const s=g.showcase;if(!s)return {observed:true,showcasePresent:false};
  return {observed:true,showcasePresent:true,warmState:s._warmState??null,
   queued:Array.isArray(s._pq)?s._pq.length:null,hasJob:!!s._portraitJob,hasTask:!!s._portraitTask,
   hasActiveCharacter:!!s._portraitActiveCharacter,inFlight:s._pflight??0};
 };
 const callerStack=()=> (new Error('QA RNG caller').stack||'').split('\n').slice(3,7).join('\n').replace(/http:\/\/127\.0\.0\.1:\d+/g,'<site>').replace(/\/_versions\/[^/]+\//g,'/').slice(0,900);

 // Native clock temporarily replaces the global during presentation. Check only
 // frame/reset boundaries; captured aliases keep this function and native routing.
 const random=()=>{draws++;word^=word<<13;word^=word>>>17;word^=word<<5;
  if(trace&&phase==='boot'&&draws>=bootWindow.startDraw&&draws<=bootWindow.endDraw&&(draws-bootWindow.startDraw)%bootWindow.stride===0){
   if(bootSamples<bootWindow.maxSamples){
    bootSamples++;const stack=callerStack(),portrait=readPortrait();if(!portrait.observed)bootUnobserved++;
    let group=bootCallers.get(stack);if(!group&&bootCallers.size<bootWindow.maxCallerGroups){group={stack,samples:0,firstDraw:draws,lastDraw:draws,firstReset:resets,lastReset:resets,lastPortrait:portrait};bootCallers.set(stack,group);}
    if(group){group.samples++;group.lastDraw=draws;group.lastReset=resets;group.lastPortrait=portrait;}else bootOverflow++;
   }else bootCapExcluded++;
  }
  if(trace&&phase==='shot-input'&&draws<=512){
   const stack=callerStack();
   let group=callers.get(stack);if(!group&&callers.size<16){group={stack,count:0,firstDraw:draws,lastDraw:draws};callers.set(stack,group);}
   if(group){group.count++;group.lastDraw=draws;}else overflow++;
  }
  return(word>>>0)/4294967296;
 };
 Math.random=random;
 const check=()=>{if(Math.random!==random)throw Error('Diagnostic RNG identity replaced');};
 window.markExplosherRandomBoundary=label=>{check();if(trace){
  if(boundaries.length>=12)throw Error('Too many RNG diagnostic boundaries');
  const G=window.__G,g=window.__inkwave,ch=G?.local?.character,r=G?.renderer,hooks=g?.fxHooks;
  const nativeState=G&&g?{time:G.time,renderSkipped:!!g._skipRender,
   character:ch?{inWorld:!!ch.inWorld,rendered:!!ch._rendered,warmStarted:!!ch._warmed,sourceStatus:ch.sourceMotion?.status??null,sourceOwnerMatches:ch.sourceMotion?.character===ch,sourceLoaderPromise:typeof ch._sourceMotionLoader?.then==='function',actorOwned:ch.actor===G.local,sceneOwned:ch.root?.parent===G.scene}:null,
   resources:r?{geometries:r.info.memory.geometries,textures:r.info.memory.textures,renderFrame:r.info.render.frame}:null,
   fxHooks:hooks?{time:hooks.time,stamp:hooks.stamp,sprayT:hooks.sprayT,featherT:hooks.featherT,edgeCount:hooks.edges?.length,actorStateCount:hooks.st?.size,triggerCounts:Object.fromEntries(Object.entries(hooks.count||{}).sort(([a],[b])=>a.localeCompare(b)).slice(0,32))}:null,
   portrait:readPortrait(),
   fixedClock:g.s3Clock?{ticks:g.s3Clock.ticks,accumulator:g.s3Clock.accumulator,advancing:g.s3Clock.advancing}:null}:null;
  boundaries.push({label,phase,...snapshot(),nativeState});
 }};
 window.resetExplosherRandom=(label='reset')=>{check();window.markExplosherRandomBoundary('before-reset:'+label);word=seed;draws=0;resets++;phase=label;callers.clear();overflow=0;};
 window.readExplosherRandom=()=>{check();return snapshot();};
 window.readExplosherRandomDiagnostic=()=>{check();return {enabled:trace,scope:'QA captured alias only; excludes native presentationRandom direct calls; caller stacks are diagnostic, not performance evidence',phase,maxTraceDraws:512,maxCallerGroups:16,overflowDraws:overflow,untracedShotDraws:phase==='shot-input'?Math.max(0,draws-512):null,boundaries:boundaries.map(x=>({...x})),callers:[...callers.values()].map(x=>({...x})),
  bootSampling:{...bootWindow,samples:bootSamples,overflowSamples:bootOverflow,capExcludedSamples:bootCapExcluded,
   unobservedSamples:bootUnobserved,observedSamples:bootSamples-bootUnobserved,
   scope:'Fixed draw-index window sampled every 32 draws; sampled caller counts are not total caller counts. No guarantee of observing the first ambient call. Native state before publication is unobserved.',
   callers:[...bootCallers.values()].map(x=>({...x,lastPortrait:{...x.lastPortrait}}))}};};
 window.resetExplosherRandom('boot');
}

export async function readExplosherEffects(){
 const G=window.__G,fx=G.fx,env=G.env;
 const hash=async(a,count)=>{
  if(!(a instanceof Float32Array)||!Number.isInteger(count)||count<0||count>a.length||count>100000)throw Error('Invalid bounded native effect buffer');
  for(let i=0;i<count;i++)if(!Number.isFinite(a[i]))throw Error('Non-finite native effect state');
  const bytes=new Uint8Array(a.buffer,a.byteOffset,count*a.BYTES_PER_ELEMENT);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return {entries:count,sha256:Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('')};
 };
 if(!Number.isFinite(fx._dt)||fx._dt<=0||!Number.isFinite(fx._time)||fx._time<0||!Number.isInteger(env._frameId)||env._frameId<0)throw Error('Invalid native FX scalar');
 if(!Number.isInteger(fx._sqN)||fx._sqN<0||fx._sqN>96)throw Error('Invalid native schedule count');
 const schemas={puffs:{P:3,V:3,C:3,X:14},glows:{P:3,V:3,C:3,X:14},rings:{P:3,V:3,C:3,N:3,X:8},shells:{P:3,V:3,C:3,X:9,A:4},beams:{P:3,C:3,X:5},marks:{P:3,N:3,C:3,X:6},pillars:{P:3,C:4,X:3}};
 const pools={};
 for(const [name,schema]of Object.entries(schemas)){
  const p=fx[name];if(!p||!Number.isInteger(p.n)||p.n<0||p.n>p.cap||!Number.isInteger(p.cap)||p.cap<=0)throw Error('Invalid native FX pool');
  const arrays={};for(const [key,stride]of Object.entries(schema)){
   if(!(p[key] instanceof Float32Array)||p[key].length!==p.cap*stride)throw Error('Missing or invalid native FX array stride');
   arrays[key]=await hash(p[key],p.n*stride);
  }
  pools[name]={count:p.n,arrays};
 }
 if(!Number.isInteger(fx.dCap)||fx.dCap<=0||!Number.isInteger(fx.dN)||fx.dN<0||fx.dN>fx.dCap)throw Error('Invalid native drop count');
 const drops={count:fx.dN};for(const key of ['dP','dV','dC','dK','dA']){const stride=key==='dA'?8:3;if(!(fx[key] instanceof Float32Array)||fx[key].length!==fx.dCap*stride)throw Error('Invalid native drop array stride');drops[key]=await hash(fx[key],fx.dN*stride);}
 if(!Number.isInteger(env.gullInst?.count)||env.gullInst.count<0)throw Error('Invalid native gull count');
 return {scope:'Read-only active native FX buffers and gull matrices; inactive pool tails excluded',dt:fx._dt,time:fx._time,
  scheduled:{count:fx._sqN,state:await hash(fx._sq,fx._sqN*14)},pools,drops,environmentFrame:env._frameId,gulls:await hash(env.gullInst.instanceMatrix.array,env.gullInst.count*16)};
}
