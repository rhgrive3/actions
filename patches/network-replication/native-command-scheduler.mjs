// Private host/worker integration, not installed on NetMatch or the relay.
// Only complete, authenticated raw-input frames advance the native world.
// Missing owners wait: this bounded lockstep owner never invents held inputs.
import {
  createNativeCommandRoomPolicy,nativeCommandCapability,admitNativeCommandPeer,
  prepareNativeCommandEnvelope,commitNativeCommandEnvelope,retireNativeCommandPeer,
} from './native-command-wire.mjs';
import {advanceTrustedNativeReplay,inspectTrustedNativeReplay,disposeTrustedNativeReplay} from './trusted-native-replay.mjs';

const schedulers=new WeakMap(),leases=new WeakMap();
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const near=(a,b)=>Math.abs(a-b)<=Number.EPSILON*Math.max(1,Math.abs(a),Math.abs(b))*32;
const fail=reason=>({ok:false,reason});
function halt(s,reason){
  s.closed=true;s.error=reason;
  for(const p of s.peers.values()){retireNativeCommandPeer(p.peer);p.frames.clear();}
  // A partially executed native tick cannot be rolled back or certified.
  // Disposal revokes every earlier outstanding contact as well as this tick.
  try{disposeTrustedNativeReplay(s.session);}catch(error){s.cleanupError=String(error?.message||error);}
}
function replayIssue(s){
  const state=inspectTrustedNativeReplay(s.session);
  if(!state||state.closed||state.error||state.tick!==s.tick||!near(state.time,s.time))return 'native-command-replay-diverged';
  if(state.actors.length!==s.roster.length||s.roster.some(r=>!state.actors.some(a=>a.nid===r.nid&&a.owner===r.owner&&a.life===r.life)))return 'native-command-lifecycle-checkpoint-required';
  return null;
}
function guard(s){
  if(!s||s.closed)return fail('retired-native-command-scheduler');
  if(s.executing)return fail('reentrant-native-command-scheduler');
  const issue=replayIssue(s);if(issue){halt(s,issue);return fail(issue);}
  return null;
}
function authorized(s,auth){
  return auth?.epoch===s.epoch&&typeof auth.from==='string'&&s.owners.has(auth.from)&&finite(auth.at)&&auth.at>=s.at;
}

export function createNativeCommandScheduler(session,{build,seed,at,dt=1/60,maxPendingFrames=256}={}){
  const state=inspectTrustedNativeReplay(session);
  if(!state||state.closed||state.error||state.tick!==0||leases.has(session)||!finite(at)||!finite(dt)||dt<=0||dt>.1||!Number.isSafeInteger(maxPendingFrames)||maxPendingFrames<1||maxPendingFrames>256)
    throw Error('Fresh native replay and trusted command clock required');
  const roster=state.actors.map(({nid,owner,life})=>({nid,owner,life}));
  const policy=createNativeCommandRoomPolicy({epoch:state.epoch,build,seed,roster});
  const token=Object.freeze({}),s={session,policy,roster,epoch:state.epoch,owners:new Set(roster.map(a=>a.owner)),authorization:{epoch:state.epoch,owners:new Map(roster.map(a=>[a.nid,a.owner]))},at,dt,maxPendingFrames,origin:state.time,time:state.time,tick:0,peers:new Map(),executing:false,closed:false,error:null,cleanupError:null};
  schedulers.set(token,s);leases.set(session,s);return token;
}
export function nativeCommandSchedulerCapability(token){
  const s=schedulers.get(token);if(!s||s.closed)throw Error('Live native command scheduler required');
  return nativeCommandCapability(s.policy);
}
export function checkNativeCommandScheduler(token){return guard(schedulers.get(token))||{ok:true};}
export function enrollNativeCommandSchedulerPeer(token,capability,auth){
  const s=schedulers.get(token),invalid=guard(s);if(invalid)return invalid;
  if(!authorized(s,auth))return fail('authenticated-command-room-member-required');
  // The common room start owns elapsed budget, even if enrollment arrives late.
  const admitted=admitNativeCommandPeer(s.policy,{from:auth.from,capability,at:s.at});
  if(!admitted.ok)return admitted;
  s.peers.set(auth.from,{peer:admitted.peer,frames:new Map()});return {ok:true};
}
export function receiveNativeCommandSchedulerPacket(token,packet,auth){
  const s=schedulers.get(token),invalid=guard(s);if(invalid)return invalid;
  if(!authorized(s,auth))return fail('authenticated-command-room-member-required');
  const peer=s.peers.get(auth.from);if(!peer)return fail('native-command-peer-not-enrolled');
  const prepared=prepareNativeCommandEnvelope(peer.peer,packet,{from:auth.from,at:auth.at});
  if(!prepared.ok)return prepared;
  if(prepared.duplicate)return {ok:true,duplicate:true,executed:0,tick:s.tick};
  // Check the entire packet before reserving its sequence or any queue slot.
  // Source time is anchored by the host, including each owner's first frame.
  for(const f of prepared.frames){
    if(f.dt!==s.dt||!near(f.sourceTime,s.origin+f.tick*s.dt))return fail('native-command-room-clock-mismatch');
    if(f.tick<=s.tick||f.tick>s.tick+s.maxPendingFrames||peer.frames.has(f.tick))return fail('native-command-pending-limit');
  }
  if(peer.frames.size+prepared.frames.length>s.maxPendingFrames)return fail('native-command-pending-limit');
  if(!commitNativeCommandEnvelope(peer.peer,prepared.token)){
    halt(s,'native-command-prefix-commit-failed');return fail(s.error);
  }
  // This is durable-in-memory queue admission, not a native action receipt.
  for(const f of prepared.frames)peer.frames.set(f.tick,f);
  let executed=0;
  s.executing=true;
  try{
    while([...s.owners].every(owner=>s.peers.get(owner)?.frames.has(s.tick+1))){
      const tick=s.tick+1,byNid=new Map();
      for(const owner of s.owners)for(const c of s.peers.get(owner).frames.get(tick).commands)byNid.set(c.nid,c);
      // The native roster, never packet arrival order, determines actor order.
      const result=advanceTrustedNativeReplay(s.session,{tick,dt:s.dt,commands:s.roster.map(r=>byNid.get(r.nid))},s.authorization);
      if(!result.ok){halt(s,result.reason||'native-command-frame-failed');return fail(s.error);}
      s.tick=tick;s.time+=s.dt;executed++;
      for(const p of s.peers.values())p.frames.delete(tick);
      const issue=replayIssue(s);if(issue){halt(s,issue);return fail(issue);}
    }
  }catch(error){halt(s,String(error?.message||error));return fail(s.error);}
  finally{s.executing=false;}
  return {ok:true,executed,tick:s.tick};
}
export function inspectNativeCommandScheduler(token){
  const s=schedulers.get(token);if(!s)return null;
  return {epoch:s.epoch,tick:s.tick,closed:s.closed,error:s.error,cleanupError:s.cleanupError,
    queued:Object.fromEntries([...s.owners].map(owner=>[owner,s.peers.get(owner)?.frames.size||0])),
    waitingFor:[...s.owners].filter(owner=>!s.peers.get(owner)?.frames.has(s.tick+1))};
}
export function disposeNativeCommandScheduler(token){
  const s=schedulers.get(token);if(!s||s.closed)return true;
  if(s.executing)return false;
  halt(s,null);return true;
}
// Trusted room membership must call this on disconnect/authorization loss.
// A fixed-roster room cannot continue with fabricated neutral/held input.
// No network request can authoritatively remove an owner from this barrier.
export function revokeNativeCommandSchedulerOwner(token,owner){
  const s=schedulers.get(token);if(!s||s.closed||s.executing||!s.owners.has(owner))return false;
  halt(s,'native-command-owner-revoked');return true;
}
