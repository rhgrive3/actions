// QA-only observation. Never changes an Actor, peer, sample, clock, or acceptance.
export function installNetworkPlacementObservation(){
 const rows=[],limit=48,stages=new Set(['frozen','placed','before-net','after-net','after-actors','settled-read']);
 let truncated=false;
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
    peer:peer?{init:peer.init===true,tr:n(peer.tr),lastTs:n(peer.lastTs),prevTs:n(peer.prevTs),off:n(peer.off),delay:n(peer.delay),rate:n(peer.rate)}:null};
  });
  rows.push({stage,step,wallMs:n(performance.now()),gameTime:n(G?.time),tickT:n(nm?.tickT),actors});
 };
 globalThis.__ceilingPlacementObservation={record,report:()=>({schema:1,limit,truncated,rows})};
}
