// Real loopback WebSockets -> unmodified production Worker admission/relay ->
// production-adapted Transport -> NetSession -> NetMatch -> ranked effects.
// No browser/GPU is claimed: stage/render sinks are an isolated native fixture.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {sourceLoadedActorFixture} from './source-loaded-actor-fixture.mjs';
import {fixture} from './source-fixture.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {createLocalRelay} from '../../../scripts/lib/inkwave-local-relay-fixture.mjs';
const require=createRequire(import.meta.url);
let ws;try{ws=require('ws');}catch{const b=require(process.env.INKWAVE_WS_BUNDLE || '/opt/codex/cua_node/lib/node_modules/playwright-core/lib/utilsBundle.js');ws={WebSocket:b.ws,WebSocketServer:b.wsServer};}
// Legacy peers always load preserved source; the native current/current case
// uses INKWAVE_BUILT_SITE when supplied, including the emitted Transport.
let sourceFixture=fixture;
if(process.env.INKWAVE_BUILT_SITE){const site=process.env.INKWAVE_BUILT_SITE;delete process.env.INKWAVE_BUILT_SITE;try{sourceFixture=(await import('./source-fixture.mjs?rainmaker-source-only')).fixture;}finally{process.env.INKWAVE_BUILT_SITE=site;}}
const OLD='iw-gameplay-20261020-r3';
const extraExports=`
 export {NetSession} from './src/net/session.js';
 export {Transport,PROTO,COMPAT} from './src/net/transport.js';
 export {createRankedEffects} from './patches/splatoon3/runtime/ranked/combat.mjs';
 export const configurePeer = values => Object.assign(globalThis, values);
`;
const stage={id:'native-peer-origin',rainmaker:{center:[0,0,0],goals:[[0,0,100],[0,0,-100]],checkpoints:[[],[]],retreatZ:[-90,90]}};
const plain=x=>JSON.parse(JSON.stringify(x));
const pause=()=>new Promise(r=>setTimeout(r,5));
async function until(fn,label){for(let i=0;i<200;i++){if(fn())return;await pause();}assert.fail('Timed out: '+label);}
async function relay(){const server=new ws.WebSocketServer({host:'127.0.0.1',port:0});await new Promise(r=>server.once('listening',r));const rooms=new Map(),wire=[];const connect=createLocalRelay({rooms});server.on('connection',(socket,request)=>connect(socket,request,{receive:text=>wire.push(text)}));return{rooms,wire,url:'ws://127.0.0.1:'+server.address().port,close:()=>new Promise(r=>server.close(r))};}
async function peer(r,{token=null,legacy=false,native=false}={}){
 const replace=(rel,code)=>adaptBuildSource(rel,rel==='src/net/transport.js'&&token?code.replace(/export const COMPAT = '[^']+';/,`export const COMPAT = '${token}';`):code);
 let f;
 if(native){f=await sourceLoadedActorFixture({transform:replace,extraExports});}
 else{
  f=await sourceFixture({fullRuntime:true,realProjectiles:true,productionComposition:false,adaptNative:replace,
   adaptRuntime:(rel,code)=>{const p=new URL('./fixtures/rainmaker-pre-origin/'+rel.split('/').at(-1)+'.txt',import.meta.url);return legacy&&rel.startsWith('patches/splatoon3/runtime/ranked/')&&fs.existsSync(p)?fs.readFileSync(p,'utf8'):code;},
   extraExports:extraExports.replaceAll("'./src/","'./inkwave-public/src/")+"export {installRanked,buildFrame} from './patches/splatoon3/runtime/ranked/install.mjs'; export {RankedEngine} from './patches/splatoon3/runtime/ranked/engine.mjs';"});f.installRanked(f);
 }
 let clock=100000;f.configurePeer({WebSocket:ws.WebSocket,setInterval,clearInterval,location:{search:'?relay='+encodeURIComponent(r.url),hostname:'localhost'},performance:{now:()=>clock},structuredClone});
 const session=new f.NetSession();const p={f,session,starts:0,events:[],births:[],paint:[],damage:[],stepTime(dt=1/60){clock+=dt*1000;f.G.time+=dt;}};
 f.G.game={profile:{weapon:'shooter',name:'Origin peer'},mapDef:{id:'tidewater'},settings:{},startNetMatch:async()=>{p.starts++;},netMatchGo(){}};
 p.close=()=>{session.leave(true);p.match?.rankedEffects?.dispose();f.reset?.();};return p;
}
async function pair(r,options=[{},{}]){const a=await peer(r,options[0]),b=await peer(r,options[1]);const code=await a.session.create('Origin host');await b.session.join(code,'Origin guest');await until(()=>a.session.lobby.players.length===2,'relay membership');return[a,b];}
async function bindWorld(p,hostId,owners){const {f,session}=p;const actors=[];for(let i=0;i<2;i++){const a=await f.make(i);Object.assign(a,{nid:i,owner:owners[i],slot:0,team:i,netLife:7,invuln:0,isLocal:owners[i]===session.myId});a.pos.set(i?15:0,0,0);a.damage=function(amount){p.damage.push({nid:this.nid,amount,remote:this.remote});return false;};actors.push(a);}
 const m=Object.assign(Object.create(f.Match.prototype),{mode:'rainmaker',state:'playing',time:300,actors,local:actors.find(a=>a.owner===session.myId),follower:session.myId!==hostId,ranked:new f.RankedEngine('rainmaker',stage),rankedBarrierHits:[],rankedGains:[0,0],rankedWorld:{zoneCoverage:()=>[],floorAt:()=>0,blocked:()=>false,update(){}}});
 f.G.match=m;f.G.actors=actors;f.G.paint={sample:()=>1,splat:(pos,...args)=>{p.paint.push({pos:pos.toArray(),args});return 0;}};f.G.audio={play(){},stop(){}};f.G.fx={ring(){}};
 const add=f.G.scene.add.bind(f.G.scene);f.G.scene.add=o=>{if(o.geometry?.type==='SphereGeometry')p.births.push({position:o.position.toArray(),mesh:o});return add(o);};
 const nm=new f.NetMatch(session,{id:'native-origin-match',mode:'rainmaker',map:'tidewater'});session.match=nm;session.state='match';nm.bind(m);m.rankedEffects=f.createRankedEffects(f,m);
 const play=m.playRankedEvents.bind(m);m.playRankedEvents=(events,visual)=>{p.events.push(...plain(events));return play(events,visual);};p.match=m;p.net=nm;return p;
}
async function exchange(peers){for(const p of peers){p.stepTime(.05);p.net._sendTick();}await pause();await pause();}
function arm(p,nid){const a=p.match.actors[nid],s=p.match.ranked.rule.state;s.carrier=String(nid);s.carrierTeam=a.team;s.barrier.active=false;s.holderRemaining=60;s.charge={seconds:1,value:1,firing:true,delay:0,recovery:0,pending:null,wasSwimming:false};a.intent.fire=false;a.aimYaw=0;a.aimPitch=0;a.intent.move.set(0,0,0);p.f.tick(a);}
async function fire(peers,nid){for(const p of peers)arm(p,nid);await exchange(peers);const host=peers[0];host.match.advanceRanked(1/60);await until(()=>peers[1].events.some(e=>e.kind==='rainmaker-shot'),'wire shot');return host.events.filter(e=>e.kind==='rainmaker-shot').at(-1);}

for(const [label,options]of [['old/current',[{token:OLD,legacy:true},{}]],['current/old',[{},{token:OLD,legacy:true}]]])test('rollout '+label+' rejects before lobby or START',async t=>{const r=await relay();let a,b;try{a=await peer(r,options[0]);b=await peer(r,options[1]);const code=await a.session.create('Host');await assert.rejects(b.session.join(code,'Guest'),/Incompatible/);assert.equal(b.session.state,'error');assert.equal(b.starts,0);assert.equal([...r.rooms.values()][0].members.size,1);assert.equal(a.session.lobby.players.length,1);t.diagnostic(JSON.stringify({host:a.f.COMPAT,guest:b.f.COMPAT,status:b.session.state,members:1}));}finally{a?.close();b?.close();await r.close();}});

test('original candidate token admits incompatible old/current and drops a legacy shot (negative control)',async t=>{const r=await relay();let peers;try{peers=await pair(r,[{token:OLD,legacy:true},{token:OLD}]);const [a,b]=peers;assert.equal(a.f.COMPAT,b.f.COMPAT);assert.equal(b.session.state,'lobby');
 const m={mode:'rainmaker',state:'playing',ranked:new b.f.RankedEngine('rainmaker',stage),actors:[],playRankedEvents:e=>b.events.push(...e)};
 const nm=b.session.match=new b.f.NetMatch(b.session,{id:'negative-match',mode:'rainmaker'});nm.match=m;b.f.G.netm=nm;b.session.state='match';
 const oldEngine=new a.f.RankedEngine('rainmaker',stage),oldActor={id:'0',team:0,pos:[0,0,0],alive:true};oldEngine.rule._updateShot(2,oldActor,{fire:true,aim:[0,0,1]});oldEngine.rule._updateShot(1/60,oldActor,{fire:false,aim:[0,0,1]});const oldShot=oldEngine.events.find(e=>e.kind==='rainmaker-shot');assert.ok(oldShot);assert.equal(oldShot.shotOrigin,undefined);a.session.tr.broadcast({k:'rkevent',match:'negative-match',seq:1,events:[oldShot]});await pause();await pause();assert.equal(b.events.length,0);assert.equal(nm.rankedEventSeq,undefined);t.diagnostic('Unbumped candidate admitted both peers but silently rejected legacy host shot.');}finally{peers?.forEach(p=>p.close());await r.close();}});

test('current/current native host and follower carrier release traverses real WebSockets and owner damage route',async t=>{const r=await relay();let peers;try{peers=await pair(r,[{native:true},{native:true}]);const ids=peers.map(p=>p.session.myId);const validShots=[],trace=[];for(const p of peers)await bindWorld(p,ids[0],ids);await exchange(peers);
 for(const nid of [0,1]){for(const p of peers){p.events.length=0;p.births.length=0;p.paint.length=0;p.damage.length=0;p.match.rankedEffects.dispose();p.match.rankedEffects=p.f.createRankedEffects(p.f,p.match);p.match.actors[nid].pos.set(0,0,0);p.match.actors[1-nid].pos.set(15,0,0);}
 await exchange(peers);const e=await fire(peers,nid);validShots.push(e);assert.ok(e.shotOrigin);assert.equal(e.shotOrigin.owner,ids[nid]);assert.equal(e.shotOrigin.life,7);assert.equal(peers[0].births.length,1);assert.equal(peers[1].births.length,1);assert.deepEqual(plain(peers[0].births[0].position),e.shotOrigin.muzzle);assert.deepEqual(plain(peers[1].births[0].position),e.shotOrigin.muzzle);
 for(const p of peers){p.match.actors[1-nid].pos.set(e.shotOrigin.muzzle[0],e.shotOrigin.muzzle[1]-.7,e.shotOrigin.muzzle[2]+.2);p.match.rankedEffects.update(1/60);}await pause();await pause();assert.equal(peers[1].paint.length,0,'follower effects never apply paint');assert.equal(peers.reduce((n,p)=>n+p.damage.length,0),1,'one authoritative hit across both peers');assert.equal(peers[1-nid].damage[0].remote,false,'damage applies only on victim owner');
 trace.push({carrier:nid,origin:{...e.shotOrigin,owner:nid===0?'host':'guest'},damage:peers.map(p=>p.damage.length)});t.diagnostic(JSON.stringify({carrier:nid,owner:e.shotOrigin.owner,muzzle:e.shotOrigin.muzzle,wireShots:r.wire.filter(s=>s.includes('"rkevent"')).length,damage:peers.map(p=>p.damage.length)}));}

 const [host,guest]=peers, original=validShots[0];
 const send=async(packet,sender=host)=>{sender.net._sendNow(packet);await pause();await pause();};
 const packet=(event,seq=(guest.net.rankedEventSeq||0)+1)=>({k:'rkevent',match:host.net.cfg.id,seq,events:[event]});
 await t.test('native guest input rejects replay, wrong-owner and old-life rows without replacing admitted authority',async()=>{
  const tick=r.wire.filter(x=>x.startsWith('b|')).map(x=>JSON.parse(x.slice(2))).filter(x=>x.k==='t'&&x.rki).at(-1);
  assert.ok(tick);const before=host.net.rankedInputs.get('1'),pose=host.net.rankedPose.get('1'),life=host.match.actors[1].net.lastLife;
  const cases=[plain(tick),plain(tick),plain(tick),plain(tick)];cases[1].rki.id='0';cases[1].rki.seq+=100;cases[2].l[1]=6;cases[2].rki.seq+=100;cases[3].rki.aim=[null,0,1];cases[3].rki.seq+=100;
  for(const bad of cases){guest.session.tr.broadcast(bad);await pause();await pause();assert.equal(host.net.rankedInputs.get('1'),before);assert.equal(host.net.rankedPose.get('1'),pose);assert.equal(host.match.actors[1].net.lastLife,life);}
 });
 await t.test('malformed origins reject before sequence, and a valid next packet still works',async()=>{
  for(const mutate of [e=>delete e.shotOrigin,e=>e.shotOrigin.body[1]+=1,e=>e.shotOrigin.muzzle=[100,100,100],e=>e.shotOrigin.life=-1,e=>e.shotOrigin.muzzle[0]=NaN]){
   const e=plain(original);mutate(e);const count=guest.births.length,seq=guest.net.rankedEventSeq;await send(packet(e));assert.equal(guest.births.length,count);assert.equal(guest.net.rankedEventSeq,seq);
  }
  const count=guest.births.length;await send(packet(original));assert.equal(guest.births.length,count+1);
 });
 await t.test('duplicate, reordered, wrong-match and wrong-sender packets do not spawn or recoil',async()=>{
  const seq=guest.net.rankedEventSeq,count=guest.births.length,vel=plain(guest.match.actors[0].vel.toArray());
  await send(packet(original,seq));await send(packet(original,seq-1));await send({...packet(original,seq+100),match:'other-match'});
  guest.session.tr.sendTo(guest.session.myId,packet(original,seq+100));await pause();await pause();
  await send(packet(original,seq+100),guest);
  assert.equal(guest.births.length,count);assert.equal(guest.net.rankedEventSeq,seq);assert.deepEqual(plain(guest.match.actors[0].vel.toArray()),vel);
 });
 await t.test('wrong owner and life are inert through native receive/effect routing',async()=>{
  for(const field of ['owner','life']){const e=plain(original);e.shotOrigin[field]=field==='owner'?'other-owner':6;const count=guest.births.length;await send(packet(e));assert.equal(guest.births.length,count);}
  host.match.actors[0].netLife=8;host.stepTime(.05);host.net._sendTick();await pause();await pause();assert.equal(guest.match.actors[0].net.lastLife,8);
  const count=guest.births.length;await send(packet(original));assert.equal(guest.births.length,count,'old-life release is rejected after native life update');
 });
 await t.test('native level/Physics body-to-muzzle thin wall blocks host and follower without owner damage',async()=>{
  for(const p of peers){p.events.length=0;p.births.length=0;p.paint.length=0;p.damage.length=0;p.match.rankedEffects.dispose();p.match.rankedEffects=p.f.createRankedEffects(p.f,p.match);p.match.actors[0].pos.set(0,0,0);p.match.actors[1].pos.set(0,0,2);
   p.f.G.level=new p.f.Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-90,0,0],[90,0,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]},{kind:'box',min:[-1,0,.4],max:[1,2,.5]}]});p.f.G.physics=new p.f.Physics(p.f.G.level);
  }
  host.net.rankedEventNext=guest.net.rankedEventSeq;const e=await fire(peers,0);for(const p of peers){p.match.rankedEffects.update(1/60);assert.ok(p.births[0].mesh.position.z<=.5,'native wall wins release segment');for(let i=0;i<15;i++)p.match.rankedEffects.update(1/60);}
  await pause();await pause();assert.equal(peers.reduce((n,p)=>n+p.damage.length,0),0);assert.equal(guest.paint.length,0);assert.ok(host.paint.every(x=>x.pos[2]<=.5));assert.equal(e.shotOrigin.life,8);trace.push({wall:true,origin:{...e.shotOrigin,owner:'host'},impact:peers.map(p=>plain(p.births[0].mesh.position.toArray())),damage:peers.map(p=>p.damage.length)});
 });
 await t.test('relay host migration keeps new contract and retired owner release cannot revive',async()=>{
  host.session.leave(true);await until(()=>guest.session.isHost,'native host migration');assert.equal(guest.match.actors[0].owner,guest.session.myId);assert.notEqual(guest.match.actors[0].owner,original.shotOrigin.owner);const count=guest.births.length;guest.match.playRankedEvents([original],true);assert.equal(guest.births.length,count);
  const room=[...r.rooms.values()][0];assert.equal(room.compat,guest.f.COMPAT);assert.equal(room.hostId,guest.session.myId);
  const old=await peer(r,{token:OLD,legacy:true});try{await assert.rejects(old.session.join(guest.session.code,'Old reconnect'),/Incompatible/);}finally{old.close();}
 });
 if(process.env.INKWAVE_RAINMAKER_PEER_TRACE)fs.writeFileSync(process.env.INKWAVE_RAINMAKER_PEER_TRACE,JSON.stringify(trace,null,2)+'\n');
 }finally{peers?.forEach(p=>p.close());await r.close();}});

test('current/current real session START and GO carry the new tuple once',async()=>{const r=await relay();let peers;try{peers=await pair(r);const[a,b]=peers;a.session.setSettings({bots:false,mode:'rainmaker'});await pause();assert.equal(a.session.confirmTeams(),true);await pause();b.session.setMe({ready:true});a.session.setMe({ready:true});await until(()=>a.session.canStart(),'both peers ready');assert.equal(a.session.start(),true);await until(()=>peers.every(p=>p.session.state==='match'),'both GO');assert.ok(peers.every(p=>p.session.match instanceof p.f.NetMatch));assert.deepEqual(peers.map(p=>p.starts),[1,1]);const start=r.wire.filter(x=>x.startsWith('b|')).map(x=>JSON.parse(x.slice(2))).find(x=>x.k==='start');assert.equal(start.compat,a.f.COMPAT);assert.equal(start.proto,2);assert.equal(start.mode,'rainmaker');}finally{peers?.forEach(p=>p.close());await r.close();}});

test('START defense rejects old contract before constructing a world even inside an admitted room',async()=>{const r=await relay();let peers;try{peers=await pair(r);const[a,b]=peers;a.session.tr.broadcast({k:'start',id:'old-start',host:a.session.myId,proto:2,compat:OLD,roster:peers.map((p,i)=>({nid:i,owner:p.session.myId,bot:false,team:i,slot:0,name:'Peer '+i,weapon:'shooter',style:null})),mode:'rainmaker',map:'tidewater',time:'day',duration:180,difficulty:'normal',palette:0});await until(()=>b.session.state==='error','old START rejection');assert.equal(b.starts,0);assert.equal(b.session.match,null);}finally{peers?.forEach(p=>p.close());await r.close();}});

test('original current/old contract admits a legacy follower that uses the wrong body origin (negative control)',async t=>{const r=await relay();let peers;try{peers=await pair(r,[{token:OLD},{token:OLD,legacy:true}]);const[a,b]=peers,{f}=b;const actor=f.make();Object.assign(actor,{nid:0,owner:a.session.myId,team:0,remote:true,netLife:7});actor.pos.set(0,0,0);actor.net={lastLife:7};const m={mode:'rainmaker',state:'playing',ranked:new f.RankedEngine('rainmaker',stage),actors:[actor]};f.G.scene=new f.THREE.Scene();f.G.audio={play(){}};const fx=f.createRankedEffects(f,m);b.match=m;m.rankedEffects=fx;m.playRankedEvents=(events,visual)=>{for(const e of events)fx.event(e,visual);};const nm=b.session.match=new f.NetMatch(b.session,{id:'negative-current-old',mode:'rainmaker'});nm.match=m;f.G.netm=nm;b.session.state='match';const e={kind:'rainmaker-shot',at:1,actorId:'0',team:0,pos:[0,0,0],aim:[0,0,1],speed:18,shotOrigin:{actorId:'0',team:0,owner:a.session.myId,life:7,body:[0,.7,0],muzzle:[0,.75,1.2]}};a.session.tr.broadcast({k:'rkevent',match:nm.cfg.id,seq:1,events:[e]});await until(()=>f.G.scene.children.some(x=>x.geometry?.type==='SphereGeometry'),'legacy ghost birth');const mesh=f.G.scene.children.find(x=>x.geometry?.type==='SphereGeometry');assert.deepEqual(plain(mesh.position.toArray()),[0,1,0]);assert.notDeepEqual(plain(mesh.position.toArray()),e.shotOrigin.muzzle);t.diagnostic('Unbumped legacy follower ignores host muzzle and spawns at event.pos + [0,1,0].');}finally{peers?.forEach(p=>p.close());await r.close();}});
