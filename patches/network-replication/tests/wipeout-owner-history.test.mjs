import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';
const ids=['host','p1','p2','p3','p4'];
async function room(){
 const peers=[];
 for(const id of ids){const f=await fixture({flow:true}),sent=[],s=f.makeSession(id,'host',ids.map(x=>[x,x]));s.tr.broadcast=d=>sent.push(structuredClone(d));
  const nm=f.makeNetMatch(s),actors=Array.from({length:8},(_,n)=>f.makeActor({nid:n,team:n<4?1:0,owner:n<4?ids[n+1]:'host',remote:(n<4?ids[n+1]:'host')!==id,roller:false}));
  actors.forEach(a=>{a.netLife=1;a.s3={flow:f.createFlow()};});
  const m=f.G.match={mode:'turf',state:'playing',duration:180,time:180,actors,playing:()=>true};nm.bind(m);
  peers.push({...f,nm,s,actors,m,sent});
 }
 const flush=()=>{let guard=0;while(peers.some(p=>p.sent.length)){assert.ok(++guard<100);for(const p of peers)for(const d of p.sent.splice(0))for(const q of peers)if(q!==p)q.nm.onMessage(p.s.myId,d);}};
 const send=(frame)=>{for(const p of peers){p.m.time=180-frame/60;p.clock.advance(.05);p.nm._sendTick();}flush();};
 const transition=(nid,frame,alive)=>{const p=peers[nid+1],a=p.actors[nid];p.m.time=180-frame/60;a.alive=alive;if(alive)a.netLife++;p.nm._onLocalEvent(alive?'respawn':'splatted',{victim:a,actor:alive?a:undefined,attacker:p.actors[4]});};
 send(1);return {peers,flush,send,transition};
}
const score=p=>p.actors.slice(4).map(a=>a.s3.flow.score);
test('#505 actual owner wire awards each teammate once, ignores forged/replayed decisions and rearms after respawn',async()=>{
 const r=await room();r.peers[0].installFlow(r.peers[0],r.peers[0].profile); // duplicate listener installation still awards once
 for(let n=0;n<3;n++)r.transition(n,20+n,false);r.send(25);for(const p of r.peers)assert.deepEqual(score(p),[0,0,0,0]);
 r.transition(3,30,false);r.send(31);const host=r.peers[0],gain=host.profile.flow.progress.wipeoutBonus*host.profile.flow.threshold/host.profile.flow.progress.referenceThreshold;
 for(const p of r.peers)assert.deepEqual(score(p),[gain,gain,gain,gain]);
 const decision=[...host.nm._wipeoutLedger.confirmed.values()][0];assert(decision);
 for(const p of r.peers){p.nm.onMessage('host',decision);p.nm.onMessage('p1',{...decision,key:'1:0/9/900,1/9/900,2/9/900,3/9/900'});p.nm.onMessage('host',{...decision,m:'old-match'});assert.deepEqual(score(p),[gain,gain,gain,gain]);}
 r.transition(0,40,true);r.send(41);r.transition(0,50,false);r.send(51);for(const p of r.peers)assert.deepEqual(score(p),[gain*2,gain*2,gain*2,gain*2]);
});
test('#505 coalesced deaths and respawns cannot make non-overlapping dead intervals into a wipe',async()=>{
 const r=await room();r.transition(0,10,false);r.transition(0,20,true);
 for(let n=1;n<4;n++)r.transition(n,30+n,false);
 r.send(40);for(const p of r.peers)assert.deepEqual(score(p),[0,0,0,0]);
 // History still discovers a real short wipe even after its respawn is batched.
 r.transition(0,45,false);r.transition(0,46,true);r.send(50);
 for(const p of r.peers)assert.ok(score(p).every(x=>x>0));
});
test('#505 watermarks wait for missing owner; dead or active teammates and host migration do not duplicate rewards',async()=>{
 const r=await room(),host=r.peers[0];host.actors[4].alive=false;host.actors[5].s3.flow.active=true;host.actors[5].s3.flow.remaining=3;
 for(let n=0;n<4;n++)r.transition(n,10+n,false);
 for(const p of r.peers.slice(0,4)){p.m.time=179;p.nm._sendTick();}r.flush();assert.deepEqual(score(host),[0,0,0,0]);
 r.send(61);assert.ok(host.actors[4].s3.flow.score>0);assert.equal(host.actors[5].s3.flow.score,0);assert.equal(host.actors[5].s3.flow.remaining,3);
 const before=r.peers.map(score);
 // All peers retained authenticated histories and decision keys before election.
 for(const p of r.peers){p.s.hostId='p1';p.s.isHost=p.s.myId==='p1';}
 r.send(70);r.peers.forEach((p,i)=>assert.deepEqual(score(p),before[i]));
 // Rewriting an accepted owner's old timeline or spoofing ownership is rejected.
 const p=r.peers[1],row=structuredClone(p.nm._wipeoutLedger.rows.get(0));row.q+=100;row.h=[[0,1,1],[5,1,0]];row.w=100;
 host.nm.onMessage('p2',{k:'t',ts:3000,wf:{m:host.nm.cfg.id,rows:[row]}});assert.deepEqual(score(host),before[0]);
});
