import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './controls-fixture.mjs';

const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
async function setup(){
 const f=await fixture({session:true,network:true,production:true});
 Object.assign(f.G.projectiles,{list:[],bombs:[],clouds:[],beams:[],beamPool:[],sights:new Map()});
 let serial=0;const timers=new Map();
 Object.assign(f.context,{setTimeout:(fn,ms)=>{const id=++serial;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)});
 function client({count=3,mode='turf',id='B',loading=false,nativeActors=false}={}){
  const ids=Array.from({length:count},(_,i)=>String.fromCharCode(65+i)),net=new f.NetSession(),wire=[],gate=deferred();let launched=0;
  Object.assign(net,{myId:id,hostId:'A',state:'lobby',code:'TEST',_members:new Map(ids.map(x=>[x,x])),tr:{sendTo(to,data){wire.push({to,data});return true;},broadcast(data){wire.push({data});return true;},close(){},lock(){}}});
  net.lobby.players=ids.map((owner,i)=>({id:owner,name:owner,weapon:'shooter',team:mode==='boss'?0:i%2,ready:true}));
  const cfg={proto:f.PROTO,compat:f.COMPAT,id:'case-'+serial,mode,map:'tidewater',duration:180,
   roster:ids.map((owner,i)=>({owner,nid:i,bot:false,team:mode==='boss'?0:i%2,slot:mode==='boss'?i:Math.floor(i/2),weapon:'shooter'}))};
  const game={profile:{},menus:{launchLobby:async()=>{}},netMatchGo(){launched++;},
   async startNetMatch(_cfg,nm){const actors=nativeActors?cfg.roster.map(r=>{const a=f.make(r.weapon);Object.assign(a,{nid:r.nid,owner:r.owner,team:r.team,slot:r.slot,isLocal:r.owner===id});return a;}):[];const m={actors,state:'init',mode,opts:{},time:180};this.match=m;f.G.match=m;f.G.actors=actors;nm.bind(m);if(loading)await gate.promise;}};
  f.G.game=game;f.G.net=net;const begin=net._begin(cfg);
  return{net,wire,gate,cfg,begin,get launched(){return launched;},close(){net.leave();}};
 }
 return{f,timers,client};
}
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};

test('omitting only the new handoff continuation reproduces the loaded-successor deadlock on the same composed Session',async()=>{
 const x=await setup(),prototype=x.f.NetSession.prototype,continuation=prototype._restartStartingBarrier;
 prototype._restartStartingBarrier=()=>{};
 const c=x.client();
 try{await c.begin;c.net._control({t:'leave',id:'A',host:'B'});
  assert.equal(c.net.state,'starting');assert.equal(c.net._setupReady,true);
  assert.equal(c.net._ready.size,0);assert.equal(c.net._goT,null);assert.equal(c.launched,0);
 }finally{prototype._restartStartingBarrier=continuation;c.close();}
});

test('actual composed STARTING handoff re-registers a loaded successor and restores bounded GO across modes/rosters',async()=>{
 const x=await setup();
 for(const [mode,count] of [['turf',2],['turf',3],['tower',8],['boss',8]]){
  const c=x.client({mode,count});await c.begin;assert.equal(c.net._setupReady,true);
  assert.equal(c.net._goT,null);c.net._control({t:'leave',id:'A',host:'B'});
  assert(c.net._ready.has('B'),'new host registers its own completed local setup');
  if(count===2){assert.equal(c.net.state,'match');assert.equal(c.launched,1);}
  else{
   const timer=x.timers.get(c.net._goT);assert.equal(timer.ms,12000);
   for(const owner of c.net._members.keys())if(owner!=='B')c.net._message(owner,{k:'ready',id:c.cfg.id});
   assert.equal(c.net.state,'match');assert.equal(c.launched,1);assert.equal(x.timers.has(c.net._goT),false);
  }
  assert.equal(c.wire.filter(w=>w.data.k==='go').length,1);c.close();
 }
});

test('ready survivor resends only existing READY to current elected host; duplicates/old GO cannot launch',async()=>{
 const x=await setup(),c=x.client({id:'C'});await c.begin;
 c.net._control({t:'leave',id:'A',host:'B'});
 assert.equal(c.wire.at(-1).to,'B');assert.deepEqual(JSON.parse(JSON.stringify(c.wire.at(-1).data)),{k:'ready',id:c.cfg.id});
 const sent=c.wire.length;c.net._control({t:'leave',id:'A',host:'B'});assert.equal(c.wire.length,sent);
 c.net._message('A',{k:'go',id:c.cfg.id});c.net._message('B',{k:'go',id:'old-match'});assert.equal(c.launched,0);
 c.net._message('B',{k:'go',id:c.cfg.id});c.net._message('B',{k:'go',id:c.cfg.id});assert.equal(c.launched,1);c.close();
});

test('successor still loading never fabricates readiness and completes through real _begin after two host changes',async()=>{
 const x=await setup(),c=x.client({id:'C',loading:true});await flush();
 assert.equal(c.net._setupReady,false);c.net._goPending=c.cfg.id;
 c.net._control({t:'leave',id:'A',host:'B'});assert.equal(c.net._goPending,null);
 assert.equal(c.wire.filter(w=>w.data.k==='ready').length,0);
 c.net._control({t:'leave',id:'B',host:'C'});assert.equal(c.net._ready.size,0);assert.equal(c.net._goT,null);
 c.gate.resolve();await c.begin;assert.equal(c.net.state,'match');assert.equal(c.launched,1);c.close();
});

test('new host fallback stays 12s and stale timer cannot act after end/room replacement or after losing host',async()=>{
 const x=await setup(),c=x.client();await c.begin;c.net._control({t:'leave',id:'A',host:'B'});
 const old=x.timers.get(c.net._goT);assert.equal(old.ms,12000);
 c.net.hostId='C';old.fn();assert.equal(c.net.state,'starting');assert.equal(c.launched,0);
 c.net.hostId='B';c.net._startHostEpoch++;old.fn();assert.equal(c.launched,0,'a prior host epoch cannot regain authority');
 c.net.endMatch();old.fn();assert.equal(c.launched,0);c.close();
 const next=x.client();await next.begin;next.net._control({t:'leave',id:'A',host:'B'});
 const fallback=x.timers.get(next.net._goT);fallback.fn();assert.equal(next.net.state,'match');assert.equal(next.launched,1);next.close();
});

test('synchronous host listener replacing the room cannot rebuild a barrier in that replacement',async()=>{
 const x=await setup(),c=x.client();await c.begin;
 c.net.on('host',()=>c.net.leave());c.net._control({t:'leave',id:'A',host:'B'});
 assert.equal(c.net.state,'offline');assert.equal(c.net._goT,null);assert.equal(c.launched,0);assert.equal(c.net._ready,null);c.close();
});


test('actual departed Actor ownership transfers before the rebuilt GO barrier launches',async()=>{
 const x=await setup(),c=x.client({nativeActors:true});await c.begin;
 const departed=c.net.match.byNid.get(0);assert.equal(departed.owner,'A');assert.equal(departed.remote,true);
 c.net._control({t:'leave',id:'A',host:'B'});
 assert.equal(departed.owner,'B');assert.equal(departed.remote,false);assert.equal(departed.isBot,true);
 assert.equal(c.net.state,'starting');assert.equal(c.launched,0);
 c.net._message('C',{k:'ready',id:c.cfg.id});assert.equal(c.net.state,'match');assert.equal(c.launched,1);c.close();
});
