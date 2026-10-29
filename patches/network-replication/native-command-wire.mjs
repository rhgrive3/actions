// Optional sibling envelope codec for a future negotiated authority room.
// No existing tuple is changed. This is not installed on server/NetMatch.
// Room policy and the authenticated `from` argument must originate in trusted
// room/session code, never in the owner's JSON. Omission cannot downgrade a
// policy minted here. Raw input is a request; this codec grants no damage.
export const NATIVE_COMMAND_SCHEMA='native-intent-v2';
export const NATIVE_COMMAND_LIMITS=Object.freeze({frames:256,actors:32,bytes:24576,dt:.1});
const policies=new WeakMap(),peers=new WeakMap(),plans=new WeakMap();
const safe=n=>Number.isSafeInteger(n)&&n>=0;
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const keys=(o,names)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).every(k=>names.includes(k));
const copy=x=>JSON.parse(JSON.stringify(x));
const bytes=x=>new TextEncoder().encode(JSON.stringify(x)).byteLength;
const buttons=['fire','squid','sub','jump','special','booyah'];
const fail=reason=>({ok:false,reason});
function policy(p){const s=policies.get(p);if(!s)throw Error('Trusted native command room policy required');return s;}
export function createNativeCommandRoomPolicy({epoch,build,seed,roster}={}){
  if(typeof epoch!=='string'||!epoch||typeof build!=='string'||!build||!safe(seed)||seed>0xffffffff||!Array.isArray(roster)||!roster.length||roster.length>32)throw Error('Invalid native command room');
  const actors=new Map();
  for(const r of roster){if(!keys(r,['nid','owner','life'])||!safe(r.nid)||actors.has(r.nid)||typeof r.owner!=='string'||!r.owner||!safe(r.life))throw Error('Invalid command roster');actors.set(r.nid,Object.freeze({...r}));}
  const token=Object.freeze({version:2,schema:NATIVE_COMMAND_SCHEMA,epoch,build,seed});
  policies.set(token,{actors,peers:new Set()});return token;
}
export function nativeCommandCapability(p){policy(p);return {version:2,schema:NATIVE_COMMAND_SCHEMA,build:p.build};}
export function admitNativeCommandPeer(p,{from,capability,at}={}){
  const s=policy(p);
  if(typeof from!=='string'||![...s.actors.values()].some(a=>a.owner===from)||!finite(at))return fail('authenticated-room-member-required');
  if(!keys(capability,['version','schema','build'])||capability.version!==2||capability.schema!==NATIVE_COMMAND_SCHEMA||capability.build!==p.build)return fail('required-native-command-capability');
  const token=Object.freeze({}),state={policy:p,from,at,sequence:0,tick:0,time:null,elapsed:0,lastPayload:null,revision:0,closed:false};
  peers.set(token,state);s.peers.add(state);return {ok:true,peer:token};
}
// Called by trusted native lifecycle ownership after executing spawn/respawn,
// not by a received snapshot. Only the next native life may replace enrollment.
export function advanceNativeCommandLife(p,{nid,owner,previousLife,life}={}){
  const s=policy(p),old=s.actors.get(nid);
  if(!old||old.owner!==owner||old.life!==previousLife||!safe(life)||life!==previousLife+1)return false;
  s.actors.set(nid,Object.freeze({nid,owner,life}));
  for(const peer of s.peers)if(peer.from===owner&&!peer.closed)peer.revision++;
  return true;
}
function encodeCommand(c,room,from){
  if(!keys(c,['nid','owner','life','input','aim','aimPoint']))throw Error('Invalid native command fields');
  const actor=room.actors.get(c.nid),i=c.input;
  if(!actor||actor.owner!==from||c.owner!==from||c.life!==actor.life||!keys(i,[...buttons,'move'])||buttons.slice(0,5).some(k=>typeof i[k]!=='boolean')||i.booyah!==undefined&&typeof i.booyah!=='boolean'||!Array.isArray(i.move)||i.move.length!==2||!i.move.every(finite)||Math.hypot(...i.move)>1+1e-12||!Array.isArray(c.aim)||c.aim.length!==2||!c.aim.every(finite)||!Array.isArray(c.aimPoint)||c.aimPoint.length!==3||!c.aimPoint.every(finite))throw Error('Invalid native command request');
  return [c.nid,c.life,buttons.reduce((n,k,index)=>n|(i[k]?1<<index:0),0),...i.move,...c.aim,...c.aimPoint];
}
function decodeEnvelope(p,from,nc){
  const room=policy(p);
  if(!keys(nc,['version','schema','epoch','build','sequence','frames'])||nc.version!==2||nc.schema!==NATIVE_COMMAND_SCHEMA||nc.epoch!==p.epoch||nc.build!==p.build||!safe(nc.sequence)||nc.sequence===0||!Array.isArray(nc.frames)||!nc.frames.length||nc.frames.length>NATIVE_COMMAND_LIMITS.frames||bytes(nc)>NATIVE_COMMAND_LIMITS.bytes)throw Error('Invalid required native command envelope');
  const frames=[];
  for(const row of nc.frames){
    if(!Array.isArray(row)||row.length!==4||!safe(row[0])||!finite(row[1])||row[1]<=0||row[1]>NATIVE_COMMAND_LIMITS.dt||!finite(row[2])||!Array.isArray(row[3])||!row[3].length||row[3].length>32)throw Error('Invalid command frame');
    const seen=new Set(),commands=[];
    for(const c of row[3]){
      if(!Array.isArray(c)||c.length!==10||!c.every(finite)||!safe(c[0])||!safe(c[1])||!safe(c[2])||c[2]>63||seen.has(c[0]))throw Error('Invalid native command row');
      const a=room.actors.get(c[0]);if(!a||a.owner!==from||a.life!==c[1]||Math.hypot(c[3],c[4])>1+1e-12)throw Error('Foreign actor or invalid command');
      seen.add(c[0]);commands.push({nid:c[0],owner:from,life:c[1],input:{...Object.fromEntries(buttons.map((k,i)=>[k,!!(c[2]&(1<<i))])),move:[c[3],c[4]]},aim:[c[5],c[6]],aimPoint:[c[7],c[8],c[9]]});
    }
    // No omitted actor can be silently treated as holding its previous input.
    if([...room.actors.values()].some(a=>a.owner===from&&!seen.has(a.nid)))throw Error('Incomplete owned frame');
    frames.push({tick:row[0],dt:row[1],sourceTime:row[2],commands});
  }
  return frames;
}
export function attachNativeCommandEnvelope(packet,p,{from,sequence,frames}={}){
  const room=policy(p);
  if(!packet||typeof packet!=='object'||Array.isArray(packet)||Object.hasOwn(packet,'nc')||!Array.isArray(frames))throw Error('Fresh native command packet required');
  const nc={version:2,schema:NATIVE_COMMAND_SCHEMA,epoch:p.epoch,build:p.build,sequence,frames:frames.map(f=>{
    if(!keys(f,['tick','dt','sourceTime','commands'])||!Array.isArray(f.commands))throw Error('Invalid frame request');
    return [f.tick,f.dt,f.sourceTime,f.commands.map(c=>encodeCommand(c,room,from))];
  })};
  decodeEnvelope(p,from,nc);return {...packet,nc};
}
export function prepareNativeCommandEnvelope(peer,packet,{from,at}={}){
  const s=peers.get(peer);
  if(!s||s.closed||from!==s.from||!finite(at)||at<s.at)return fail('authenticated-command-peer-required');
  // An nc omission, legacy self-declaration or missing capability never selects
  // a weaker admission policy for this already-v2 room.
  let frames;try{frames=decodeEnvelope(s.policy,from,packet?.nc);}catch(error){return fail(String(error.message));}
  const payload=JSON.stringify(packet.nc);
  if(packet.nc.sequence===s.sequence&&payload===s.lastPayload)return {ok:true,duplicate:true,frames:[]};
  if(packet.nc.sequence!==s.sequence+1)return fail('native-command-sequence-gap');
  let tick=s.tick,time=s.time,elapsed=s.elapsed;
  for(const f of frames){
    const epsilon=Number.EPSILON*Math.max(1,Math.abs(f.sourceTime),Math.abs(time||0))*8;
    if(f.tick!==tick+1||time!==null&&Math.abs(f.sourceTime-(time+f.dt))>epsilon)return fail('native-command-frame-gap');
    elapsed+=f.dt;if(elapsed>at-s.at+1e-9)return fail('native-command-exceeds-authority-elapsed');
    tick=f.tick;time=f.sourceTime;
  }
  const token=Object.freeze({});plans.set(token,{s,revision:s.revision,used:false,tick,time,elapsed,sequence:packet.nc.sequence,payload});
  return {ok:true,token,frames:copy(frames)};
}
export function commitNativeCommandEnvelope(peer,token){
  const s=peers.get(peer),p=plans.get(token);
  if(!s||s.closed||!p||p.s!==s||p.used||p.revision!==s.revision)return false;
  p.used=true;Object.assign(s,{tick:p.tick,time:p.time,elapsed:p.elapsed,sequence:p.sequence,lastPayload:p.payload,revision:s.revision+1});return true;
}
export function retireNativeCommandPeer(peer){const s=peers.get(peer);if(s){s.closed=true;s.revision++;policies.get(s.policy)?.peers.delete(s);}}
