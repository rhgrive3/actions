// QA-only observation. Never changes an Actor, peer, sample, clock, or acceptance.
export function installNetworkPlacementObservation(){
 const rows=[],limit=48,stages=new Set(['frozen','placed','before-net','after-net','after-actors','settled-read']);
 let truncated=false,dispatchTruncated=false,observationErrors=0,dispatchOwner=null;
 const dispatch=[],dispatchLimit=96,restorers=[];
 const n=v=>Number.isFinite(v)?v:null;
 const xyz=v=>v?[n(v.x),n(v.y),n(v.z)]:null;
 const sample=v=>v?{t:n(v.t),life:n(v.life),tp:n(v.tp),f:n(v.f),pos:xyz(v)}:null;
 const record=(stage,step=-1)=>{
  if(!stages.has(stage)||!Number.isInteger(step)||step < -1||step>12)throw Error('Invalid placement observation stage');
  if(rows.length>=limit){truncated=true;return;}
  const G=globalThis.__G,nm=G?.netm;
  const actors=(G?.match?.actors||[]).slice(0,2).map(a=>{
   const net=a.net,peer=nm?.peers?.get(a.owner),buf=Array.isArray(net?.buf)?net.buf:[];
   return {nid:n(a.nid),ownerIsSelf:a.owner!=null&&a.owner===nm?.myId,remote:a.remote===true,local:a.isLocal===true,
    alive:a.alive===true,grounded:a.grounded===true,life:n(a.netLife),tp:n(a.netTp),pos:xyz(a.pos),vel:xyz(a.vel),
    respawnTimer:n(a.respawnTimer),lifeStartedAt:n(a._netLifeStartedAt),
    intent:{move:xyz(a.intent?.move),fire:a.intent?.fire===true,jump:a.intent?.jump===true,squid:a.intent?.squid===true},
    net:{ready:net?.ready===true,has:net?.has===true,tp:n(net?.tp),cur:sample(net?.cur),err:xyz(net?.err),prevT:n(net?.prevT),prevRaw:xyz(net?.prevRaw),
     bufferCount:buf.length,first:sample(buf[0]),last:sample(buf.at(-1))},
    peer:peer?{init:peer.init===true,tr:n(peer.tr),lastTs:n(peer.lastTs),lastReceiveAt:n(peer.lastReceiveAt),prevTs:n(peer.prevTs),off:n(peer.off),delay:n(peer.delay),rate:n(peer.rate)}:null};
  });
  rows.push({stage,step,wallMs:n(performance.now()),gameTime:n(G?.time),tickT:n(nm?.tickT),actors});
 };
 // Wrappers call the original handler exactly once with unchanged receiver,
 // arguments, return value and thrown object. They never invent accepted data.
 const observeDispatch=()=>{
  const nm=globalThis.__G?.netm;
  if(dispatchOwner===nm)return;
  if(dispatchOwner||!nm)throw Error('Placement dispatch observer owner changed');
  for(const name of ['onMessage','_tick'])if(typeof nm[name]!=='function')throw Error('Missing native dispatch method');
  dispatchOwner=nm;
  const capture=(stage,from,d,threw=false)=>{
   try{
    if(d?.k!=='t')return;
    if(dispatch.length>=dispatchLimit){dispatchTruncated=true;return;}
    const p=nm.peers?.get(from);
    dispatch.push({stage,wallMs:n(performance.now()),threw,fromKnownOwner:(globalThis.__G?.match?.actors||[]).some(a=>a.remote&&a.owner===from),
     ts:n(d.ts),simulationTick:n(d.u),hasPackedPaint:Object.hasOwn(d,'pe'),
     actors:Array.isArray(d.a)?d.a.slice(0,2).map(a=>({nid:n(a?.[0]),life:n(d.l?.[a?.[0]])})):[],
     peer:p?{lastTs:n(p.lastTs),lastReceiveAt:n(p.lastReceiveAt),tr:n(p.tr)}:null});
   }catch{observationErrors++;}
  };
  for(const name of ['onMessage','_tick']){
   const original=nm[name],descriptor=Object.getOwnPropertyDescriptor(nm,name);
   const wrapped=function(...args){
    capture(name+'-before',args[0],args[1]);let threw=false;
    try{return Reflect.apply(original,this,args);}catch(e){threw=true;throw e;}
    finally{capture(name+'-after',args[0],args[1],threw);}
   };
   nm[name]=wrapped;
   restorers.push(()=>{if(nm[name]===wrapped){if(descriptor)Object.defineProperty(nm,name,descriptor);else delete nm[name];}});
  }
 };
 globalThis.__ceilingPlacementObservation={record,observeDispatch,restore:()=>{for(const f of restorers)f();},
  report:()=>({schema:2,limit,truncated,rows,dispatchLimit,dispatchTruncated,observationErrors,dispatch})};
}

// Node-side socket metadata only; payload strings and owner IDs are not kept.
export function createNetworkFrameObservation(){
 const rows=[],limit=128;let truncated=false,invalidFrames=0;
 const n=v=>Number.isFinite(v)?v:null;
 return {record(stage,payload,index){
  try{
   if(!['relay-forward','browser-receive'].includes(stage)||!Number.isInteger(index)||index<0||index>1){invalidFrames++;return;}
   const text=typeof payload==='string'?payload:payload?.toString?.('utf8');
   if(typeof text!=='string'||text.length>65536)return;
   if(!text.startsWith('m|'))return;
   const split=text.indexOf('|',2);if(split<0)return;
   const d=JSON.parse(text.slice(split+1));if(d?.k!=='t')return;
   if(rows.length>=limit){truncated=true;return;}
   rows.push({stage,index,at:Date.now(),ts:n(d.ts),simulationTick:n(d.u),hasPackedPaint:Object.hasOwn(d,'pe'),
    actors:Array.isArray(d.a)?d.a.slice(0,2).map(a=>({nid:n(a?.[0]),life:n(d.l?.[a?.[0]])})):[]});
  }catch{invalidFrames++;}
 },report:()=>({limit,truncated,invalidFrames,rows})};
}
