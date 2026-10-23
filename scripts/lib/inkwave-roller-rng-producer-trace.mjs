// QA observations only. Install before production modules cache Math.random.
// Keep the original LCG/reset contract; never reset native FX/scheduler state.
export function installTracedRollerRandom(){
 let state=123,draws=0,fx=null,active=false,stage='boot',tick=null,trace=null,chain=[],stageStart=null;
 const snapshot=()=>({state,draws});
 const fxState=()=>fx?{phase:fx._iwCosmeticPhase??null,time:fx._time,dt:fx._dt,recycle:fx._recycle,sqN:fx._sqN,dN:fx.dN,checks:fx._checks,maxChecks:fx.maxChecks,q:fx.q,camPos:fx._camPos?.toArray(),stats:fx.stats()}:null;
 const fullFx=()=>{const r={...fxState(),drops:Object.fromEntries([['dP',3],['dV',3],['dA',8],['dK',3],['dC',3]].map(([k,n])=>[k,Array.from(fx[k].slice(0,fx.dN*n))]))};return r;};
 const closeStage=()=>{if(stageStart&&trace)trace.stages.push({...stageStart,after:snapshot(),fxAfter:fxState()});stageStart=null;};
 const random=()=>{
  const before=state;state=(Math.imul(state,1664525)+1013904223)>>>0;draws++;
  if(active&&trace){
   if(trace.calls.length>=250000)throw Error('RNG diagnostic bound exceeded');
   const stack=new Error().stack;let stackId=trace.stackIds.get(stack);
   if(stackId===undefined){stackId=trace.stacks.length;trace.stackIds.set(stack,stackId);trace.stacks.push(stack);}
   trace.calls.push({tick,stage,draw:draws,before,after:state,producer:[...chain],stackId});
  }
  return state/4294967296;
 };
 const qa=globalThis.__rollerQaRandom={random,reset(seed=123){state=seed>>>0;draws=0;},snapshot,
  startCase(meta,G){fx=G.fx;active=false;tick=null;stage='case-setup';chain=[];stageStart=null;trace={meta,calls:[],stacks:[],stackIds:new Map(),events:[],checkpoints:[],stages:[],fxSnapshots:[]};},
  checkpoint(name){trace.checkpoints.push({name,tick,stage,rng:snapshot(),fx:fxState()});},
  beginTick(value){tick=value;active=true;qa.stage('pose-setup');},
  stage(name){closeStage();stage=name;stageStart={tick,stage,before:snapshot(),fxBefore:fxState()};},
  endTick(){closeStage();trace.checkpoints.push({name:'end-native-tick',tick,stage,rng:snapshot(),fx:fxState()});active=false;stage='between-displays';},
  beginRender(){active=true;qa.stage('render-setup');},
  endRender(){closeStage();active=false;stage='between-displays';},
  enter(name,args){
   if(!active)return null;
   chain.push(name);const detailed=tick>=28&&tick<=38;
   const record=detailed?{tick,stage,name,producer:[...chain],before:snapshot(),fxBefore:fxState(),args}:null;
   if(name==='FX.update'&&tick>=33&&tick<=36)trace.fxSnapshots.push({tick,when:'before-update',rng:snapshot(),fx:fullFx()});
   return {name,record};
  },
  leave(token,result){if(!token)return;if(token.record){token.record.after=snapshot();token.record.fxAfter=fxState();token.record.result=result;if(trace.events.length>=50000)throw Error('Producer diagnostic bound exceeded');trace.events.push(token.record);}if(token.name==='FX.update'&&tick>=33&&tick<=36)trace.fxSnapshots.push({tick,when:'after-update',rng:snapshot(),fx:fullFx()});chain.pop();},
  finish(){closeStage();active=false;return {...trace,stackIds:undefined,final:snapshot(),finalFx:fxState()};}
 };
 Math.random=random;
}

export function installRollerProducerTrace(){
 globalThis.__rollerInstallProducerTrace=G=>{
  if(G.fx.__rollerQaProducerTraceInstalled)return;
  Object.defineProperty(G.fx,'__rollerQaProducerTraceInstalled',{value:true});
  const qa=globalThis.__rollerQaRandom;
  const plain=v=>v==null||['number','string','boolean'].includes(typeof v)?v:v.toArray?v.toArray():v.isColor?[v.r,v.g,v.b]:v.point?{point:v.point.toArray(),normal:v.normal?.toArray(),distance:v.distance}:undefined;
  const wrap=(owner,key,name,describe=args=>args.map(plain))=>{
   const original=owner[key];if(typeof original!=='function')return;
   owner[key]=function(...args){const token=qa.enter(name,describe(args));let result;try{result=original.apply(this,args);return result;}finally{qa.leave(token,plain(result));}};
  };
  for(const name of ['update','_updateDrops','_landDrop','_ringRaw','_spawnDrop','onSpeck','onRipple','onDropletLand','collider']){
   wrap(G.fx,name,'FX.'+name,args=>name==='_landDrop'?{args:args.map(plain),drop:{index:args[0],p:Array.from(G.fx.dP.slice(args[0]*3,args[0]*3+3)),v:Array.from(G.fx.dV.slice(args[0]*3,args[0]*3+3)),a:Array.from(G.fx.dA.slice(args[0]*8,args[0]*8+8)),k:Array.from(G.fx.dK.slice(args[0]*3,args[0]*3+3))}}:name==='update'?[args[0]]:args.map(plain));
  }
  for(const name of ['speck','ripple','splat','flush'])wrap(G.paint,name,'Paint.'+name);
 };
}
