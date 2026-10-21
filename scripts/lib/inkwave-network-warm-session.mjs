// QA only. Uses ordinary warm/quit/new-room lifecycle; never edits a peer,
// timestamp, interpolation buffer, remote Actor, model, or admission policy.
export function installNativeWarmSessionQA(root=globalThis){
 let phase='initial',old=null,fresh=null,placement=null,warmReceipt=null,newWarmReceipt=null,newPrepared=null;
 const fail=m=>{throw Error('Native warm session: '+m);};
 const need=p=>{if(phase!==p)fail('Invalid transition '+phase+' -> '+p);};
 const now=()=>root.performance.now()/1000;
 const finite=v=>typeof v==='number'&&Number.isFinite(v);
 const current=()=>{
  const G=root.__G,g=root.__inkwave,n=G?.net,m=G?.match,nm=G?.netm;
  if(!G||G.game!==g||g.match!==m||G.mode!=='match'||!n?.active||!n._setupReady||!n.tr||n.match!==nm||nm?.match!==m||m?.state!=='playing'||m.attract||g.frozen||m.actors?.length!==2)fail('Native playing identity unavailable');
  if(n._startCfg!==nm.cfg||typeof n.code!=='string'||!n.code||n.code.length>64||typeof nm.cfg?.id!=='string'||!nm.cfg.id||nm.cfg.id.length>64)fail('Native protocol identity unavailable');
  if(m.actors.filter(a=>a.isLocal&&!a.remote&&a.owner===n.myId).length!==1||m.actors.filter(a=>a.remote&&a.owner!==n.myId).length!==1)fail('Native owner pair unavailable');
  return {G,g,n,m,nm,tr:n.tr,protocol:{roomCode:n.code,matchId:nm.cfg.id}};
 };
 const unchanged=s=>{const c=current();if(c.n!==s.n||c.m!==s.m||c.nm!==s.nm||c.tr!==s.tr||c.protocol.roomCode!==s.protocol.roomCode||c.protocol.matchId!==s.protocol.matchId)fail('Native session replaced unexpectedly');return c;};
 const bounded=async(p,ms)=>{if(!finite(ms)||ms<=0||ms>240000)fail('Invalid readiness deadline');let t;try{return await Promise.race([p,new Promise((_,reject)=>{t=setTimeout(()=>reject(Error('Native warm session: Readiness timeout')),ms);})]);}finally{clearTimeout(t);}};
 const prepareActors=async(snapshot,timeoutMs)=>bounded(Promise.all(snapshot.m.actors.map(async a=>{
    const ch=a.character;if(typeof ch?.warmAll!=='function')fail('Missing actual warmAll');
    const warmed=await ch.warmAll();if(warmed===false)fail('Renderer warm unavailable');
    const owner=ch.sourceMotion;if(!owner?.ready||typeof owner.ready.then!=='function')fail('Missing actual source readiness');await owner.ready;
    if(a.character!==ch||ch.sourceMotion!==owner||owner.status!=='ready'||owner.enabled!==true||owner.disposed||owner.error||owner.character!==ch||owner.squidRig?.character!==ch||!['Player00','Player01'].includes(owner.variant)||!owner.bank?.clips?.has('WaitHold_Nrml')||!owner.squidBank?.clips?.has('Sqd_Walk')||!owner.squidBank.clips.has('Sqd_ToSquid'))fail('Source owner not prepared');
    return {nid:a.nid,warmCompleted:true,sourceReady:true,variant:owner.variant};
   })),timeoutMs);
 const api={
  async warm(timeoutMs=180000){need('initial');phase='warming';try{
   old=current();
   warmReceipt=await prepareActors(old,timeoutMs);unchanged(old);phase='warmed';return {phase,actors:warmReceipt,protocol:old.protocol};
  }catch(e){phase='failed';throw e;}},
  async leave(){need('warmed');phase='leaving';try{
   const G=root.__G;
   if(G!==old.G||G.net!==old.n||(G.net.tr!=null&&G.net.tr!==old.tr)||(G.netm!=null&&G.netm!==old.nm))fail('Session changed before native quit');
   await old.g.quitToMenu();return {phase};
  }catch(e){phase='failed';throw e;}},
  offlineReady(){need('leaving');const G=root.__G;if(G!==old.G||G.net!==old.n)fail('Session owner changed during quit');
   const ok=G.net.state==='offline'&&G.net.tr==null&&G.net.match==null&&G.netm==null&&G.mode==='menu'&&old.g.match===G.match&&G.match?.attract===true&&old.tr.ws==null;
   if(ok)phase='offline';return ok;
  },
  async warmNew(timeoutMs=180000){need('offline');phase='new-warming';try{const c=current();if(c.nm===old.nm||c.tr===old.tr||c.m===old.m||c.protocol.roomCode===old.protocol.roomCode||c.protocol.matchId===old.protocol.matchId)fail('Old session reused');newWarmReceipt=await prepareActors(c,timeoutMs);unchanged(c);newPrepared=c;phase='new-warmed';return {phase,actors:newWarmReceipt,protocol:c.protocol};}catch(e){phase='failed';throw e;}},
  beginFresh(){need('new-warmed');const c=current();if(c.nm===old.nm||c.tr===old.tr||c.m===old.m||c.protocol.roomCode===old.protocol.roomCode||c.protocol.matchId===old.protocol.matchId)fail('Old session reused');unchanged(newPrepared);const a=c.m.actors.find(a=>a.remote),p=c.nm.peers.get(a.owner);fresh={...c,owner:a.owner,nid:a.nid,at:now(),ts:finite(p?.lastTs)?p.lastTs:null};phase='fresh-wait';return {phase,baselineTs:fresh.ts,boundaryAt:fresh.at,newTransport:true,newNetMatch:true};},
  freshReady(){need('fresh-wait');const c=unchanged(fresh),a=c.m.actors.find(a=>a.remote),p=c.nm.peers.get(fresh.owner);if(a.owner!==fresh.owner||a.nid!==fresh.nid)fail('Remote owner changed');const ok=finite(p?.lastTs)&&finite(p?.lastReceiveAt)&&p.lastReceiveAt>fresh.at&&(fresh.ts===null||p.lastTs>fresh.ts);if(ok){fresh.accepted={lastTs:p.lastTs,lastReceiveAt:p.lastReceiveAt,boundaryAt:fresh.at,baselineTs:fresh.ts};phase='fresh';}return ok;},
  ownedPose(){need('fresh');const c=unchanged(fresh),a=c.m.local;if(!a||a.remote||a.owner!==c.n.myId)fail('Not actual local owner');return {nid:a.nid,owner:a.owner,life:a.netLife,tp:a.netTp??0,pos:a.pos.toArray()};},
  beginPlacement(expected){need('fresh');const c=unchanged(fresh);if(!Array.isArray(expected)||expected.length!==2||new Set(expected.map(x=>x.nid)).size!==2)fail('Invalid placement owners');
   for(const e of expected){const a=c.nm.byNid.get(e.nid);if(!a||a.owner!==e.owner||!Number.isSafeInteger(e.life)||e.life<0||!Number.isSafeInteger(e.tp)||e.tp<0||!Array.isArray(e.pos)||e.pos.length!==3||!e.pos.every(finite))fail('Invalid placement life or owner');}
   const p=c.nm.peers.get(fresh.owner);placement={expected:expected.map(e=>({...e,pos:[...e.pos]})),at:now(),ts:finite(p?.lastTs)?p.lastTs:null};phase='placement-wait';return {phase,boundaryAt:placement.at};},
  placementReady(){need('placement-wait');const c=unchanged(fresh),p=c.nm.peers.get(fresh.owner);if(!finite(p?.lastTs)||!finite(p?.lastReceiveAt)||p.lastReceiveAt<=placement.at||(placement.ts!==null&&p.lastTs<=placement.ts))return false;
   for(const e of placement.expected){const a=c.nm.byNid.get(e.nid);if(!a||a.owner!==e.owner)fail('Placement owner changed');if(!a.alive||!a.grounded||a.form!=='kid'||a.netLife!==e.life||(a.remote?a.net?.tp:(a.netTp??0))!==e.tp||!a.pos.toArray().every(finite)||Math.hypot(...a.pos.toArray().map((v,i)=>v-e.pos[i]))>.05)return false;
    if(a.remote){const n=a.net,last=n?.buf?.at(-1),cur=n?.cur;if(!n?.ready||!last||!cur||last.life!==e.life||cur.life!==e.life||last.tp!==e.tp||cur.tp!==e.tp||![last.x,last.y,last.z,cur.x,cur.y,cur.z].every(finite)||Math.hypot(last.x-e.pos[0],last.y-e.pos[1],last.z-e.pos[2])>.05||Math.hypot(cur.x-e.pos[0],cur.y-e.pos[1],cur.z-e.pos[2])>.05)return false;}
   }placement.accepted={lastTs:p.lastTs,lastReceiveAt:p.lastReceiveAt,boundaryAt:placement.at,baselineTs:placement.ts};phase='converged';return true;},
  receipt(){return {phase,initialProtocol:old?.protocol,currentProtocol:(fresh||newPrepared)?.protocol,warmActors:warmReceipt,newWarmActors:newWarmReceipt,freshness:fresh?.accepted,placementFreshness:placement?.accepted,scope:'Warm-session native lifecycle only; cold-start timestamp lockout remains unresolved',...(placement?{placement:placement.expected.map(({nid,life,tp,pos})=>({nid,life,tp,pos}))}:{})};}
 };
 root.__ceilingWarmSession=api;return api;
}

export function validateNativeRoomAdmissions(rows,warmSession=false){
 const phases=warmSession?['preparation','proof']:['proof'];
 if(!Array.isArray(rows)||rows.length!==phases.length*2)throw Error('Native relay lifecycle admission count');
 const ids=new Set();for(const r of rows){if(!phases.includes(r.sessionPhase)||r.status!==101||r.accepted!==true||!Number.isSafeInteger(r.connectionIndex)||r.connectionIndex<0||ids.has(r.connectionIndex))throw Error('Native relay lifecycle admission identity');ids.add(r.connectionIndex);}
 for(const p of phases)if(rows.filter(r=>r.sessionPhase===p).length!==2)throw Error('Native relay needs both browsers in each lifecycle');
 return {phases:phases.map(phase=>({phase,accepted:2})),connections:rows.length};
}

export function validateNativeSessionPair(rows,prior=null){
 if(!Array.isArray(rows)||rows.length!==2)throw Error('Native session pair missing');
 const a=rows[0]?.protocol,b=rows[1]?.protocol;
 if(!a||!b||typeof a.roomCode!=='string'||!a.roomCode||typeof a.matchId!=='string'||!a.matchId||a.roomCode!==b.roomCode||a.matchId!==b.matchId)throw Error('Native session pair protocol mismatch');
 if(prior&&(a.roomCode===prior.roomCode||a.matchId===prior.matchId))throw Error('Native session pair reused old protocol');
 return {...a};
}
