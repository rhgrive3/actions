import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../../splatoon3/tests/source-fixture.mjs';
const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:"export {NetSession} from './inkwave-public/src/net/session.js'; export {MockNet} from './inkwave-public/src/net/mock.js'; export {Transport,PROTO,COMPAT} from './inkwave-public/src/net/transport.js';"});
const sockets=[],sessions=[],timers=new Map();let serial=0,starts=0,launches=0;
class Socket{
 constructor(url){this.url=url;this.readyState=1;this.bufferedAmount=0;this.sent=[];this.closes=[];sockets.push(this);}
 send(s){this.sent.push(s);} close(code,reason){this.readyState=3;this.closes.push({code,reason});this.onclose?.({reason});}
 deliver(o){this.onmessage?.({data:typeof o==='string'?o:JSON.stringify(o)});}
}
const add=(fn,ms,repeat=false)=>{const id=++serial;timers.set(id,{fn,ms,repeat});return id;};
Object.assign(f.context,{WebSocket:Socket,location:{search:'?relay=ws://relay.test',hostname:'localhost'},setTimeout:(fn,ms)=>add(fn,ms),clearTimeout:id=>timers.delete(id),setInterval:(fn,ms)=>add(fn,ms,true),clearInterval:id=>timers.delete(id)});
f.G.game={profile:{weapon:'shooter',name:'Guest'},mapDef:{id:'cargo'},settings:{},startNetMatch:async()=>{starts++;},netMatchGo(){launches++;}};
const welcome=(patch={})=>({t:'welcome',proto:f.PROTO,compat:f.COMPAT,id:'G',host:'H',members:[{id:'H',name:'Host'},{id:'G',name:'Guest'},{id:'J',name:'Next host'}],...patch});
const config=(patch={})=>({k:'start',id:'compat-test',host:'H',proto:f.PROTO,compat:f.COMPAT,map:'cargo',time:'day',duration:180,difficulty:'normal',palette:0,mode:'turf',roster:[{nid:0,owner:'H',bot:false,team:0,slot:0,name:'Host',weapon:'shooter',style:null},{nid:1,owner:'G',bot:false,team:1,slot:0,name:'Guest',weapon:'shooter',style:null}],...patch});
const settle=()=>new Promise(setImmediate);
async function join(patch={}){const s=new f.NetSession();sessions.push(s);const p=s.join('BCEFG','Guest'),ws=sockets.at(-1);ws.deliver(welcome(patch));await p;return {s,ws};}
function packet(ws,from,data){ws.deliver('m|'+from+'|'+JSON.stringify(data));}
afterEach(()=>{for(const s of sessions.splice(0))s.leave(true);assert.equal(timers.size,0,'all connection/heartbeat/GO timers released');sockets.length=0;starts=0;launches=0;});
for(const [label,patch] of [['missing', {proto:undefined,compat:undefined}],['wrong-proto',{proto:99}],['string-proto',{proto:'2'}],['wrong-compat',{compat:'other-version'}],['missing-compat',{compat:undefined}]])test('welcome '+label+' fails closed before lobby or heartbeat',async()=>{
 const s=new f.NetSession();sessions.push(s);const p=s.join('BCEFG','Guest'),ws=sockets.at(-1);ws.deliver(welcome(patch));
 await assert.rejects(p,/Incompatible.*room service/);assert.equal(s.state,'error');assert.equal(s.tr,null);assert.equal(s.match,null);assert.equal(s.myId,null);assert.equal(starts,0);assert.equal(ws.readyState,3);assert.equal(ws.sent.length,0);
});
for(const [label,patch] of [['missing',{proto:undefined,compat:undefined}],['wrong-proto',{proto:99}],['wrong-compat',{compat:'other-version'}]])test('host START '+label+' fails before world/readiness/GO',async()=>{
 const {s,ws}=await join();const before=ws.sent.length;packet(ws,'H',config(patch));await settle();assert.equal(s.state,'error');assert.equal(s.match,null);assert.equal(starts,0);assert.equal(launches,0);assert.equal(ws.sent.slice(before).length,0);assert.equal(ws.readyState,3);
});
test('compatible host START builds real NetMatch and GO launches exactly once',async()=>{
 const {s,ws}=await join();const url=new URL(ws.url);assert.equal(url.searchParams.get('v'),String(f.PROTO));assert.equal(url.searchParams.get('compat'),f.COMPAT);
 packet(ws,'H',config());await settle();assert(s.match instanceof f.NetMatch);assert.equal(starts,1);assert.equal(s.state,'starting');assert.equal(ws.sent.filter(x=>x.includes('"ready"')).length,1);
 packet(ws,'H',{k:'go',id:'compat-test'});packet(ws,'H',{k:'go',id:'compat-test'});assert.equal(s.state,'match');assert.equal(launches,1);
});
test('wrong sender START is inert; migrated host owns compatibility admission',async()=>{
 const {s,ws}=await join();packet(ws,'J',config({proto:99}));assert.equal(s.state,'lobby');assert.equal(starts,0);
 ws.deliver({t:'leave',id:'H',host:'J'});assert.equal(s.hostId,'J');packet(ws,'H',config({proto:99}));assert.equal(s.state,'lobby');
 packet(ws,'J',config({host:'J'}));await settle();assert.equal(starts,1);assert(s.match instanceof f.NetMatch);
});
test('host generated START carries the shared tuple and still starts locally',async()=>{
 const {s,ws}=await join({id:'H'});assert(s.isHost);ws.deliver({t:'join',m:{id:'G',name:'Guest'}});assert.equal(s.confirmTeams(),true);s.setMe({ready:true});packet(ws,'G',{k:'me',ready:true});assert.equal(s.canStart(),true);assert.equal(s.start(),true);await settle();const cfg=ws.sent.filter(x=>x.startsWith('b|')).map(x=>JSON.parse(x.slice(2))).find(x=>x.k==='start');
 assert(cfg);assert.equal(cfg.proto,f.PROTO);assert.equal(cfg.compat,f.COMPAT);assert.equal(starts,1);assert(s.match instanceof f.NetMatch);
});
test('cancel and rejoin discard late old welcomes without losing the new connection',async()=>{
 const s=new f.NetSession();sessions.push(s);const p=s.join('BCEFG','Guest'),old=sockets.at(-1),oldHandler=old.onmessage;const reject=assert.rejects(p,{name:'AbortError'});s.leave(true);await reject;
 const next=s.join('BCEFG','Guest'),ws=sockets.at(-1);oldHandler({data:JSON.stringify(welcome({proto:99}))});ws.deliver(welcome());await next;assert.equal(s.state,'lobby');assert.equal(s.tr.ws,ws);assert.equal(old.readyState,3);
});
test('malformed welcome stays inert and duplicate welcome cannot overwrite accepted identity',async()=>{
 const s=new f.NetSession();sessions.push(s);const p=s.join('BCEFG','Guest'),ws=sockets.at(-1);ws.deliver(welcome({members:null}));await Promise.resolve();assert.equal(s.state,'connecting');assert.equal(ws.sent.length,0);ws.deliver(welcome());await p;
 ws.deliver(welcome({id:'H',proto:99,compat:'other-version'}));assert.equal(s.myId,'G');assert.equal(s.tr.id,'G');assert.equal(s.state,'lobby');
});
const {RoomDurableObject}=await import('../../../server/src/index.js');
for(const valid of [true,false])test('actual Worker welcome and host relay START '+(valid?'reach NetMatch':'reject mismatch'),async t=>{
 const savedResponse=globalThis.Response,savedPair=globalThis.WebSocketPair;
 class WorkerSocket{constructor(){this.sent=[];this.events={};this.bufferedAmount=0;}accept(){}send(x){this.sent.push(x);}addEventListener(k,fn){this.events[k]=fn;}close(){this.events.close?.();}emit(s){this.events.message?.({data:s});}}
 globalThis.Response=class{constructor(body,opts={}){this.body=body;Object.assign(this,opts);this.status??=200;}};
 globalThis.WebSocketPair=class{constructor(){this[0]=new WorkerSocket();this[1]=new WorkerSocket();}};
 let room;
 try{
  room=new RoomDurableObject({},{});const req=create=>({url:'https://relay.test/room/BCEFG?v='+f.PROTO+'&compat='+f.COMPAT+(create?'&create=1':''),method:'GET',headers:new Headers({Upgrade:'websocket'})});
  assert.equal((await room.fetch(req(true))).status,101);const host=[...room.members.values()][0].ws;
  assert.equal((await room.fetch(req(false))).status,101);const guest=[...room.members.values()][1].ws,actual=JSON.parse(guest.sent[0]);assert.equal(actual.proto,f.PROTO);assert.equal(actual.compat,f.COMPAT);
  const s=new f.NetSession();sessions.push(s);const p=s.join('BCEFG','Guest'),ws=sockets.at(-1);ws.deliver(actual);await p;
  const cfg=config({host:actual.host,proto:valid?f.PROTO:99,roster:config().roster.map((r,i)=>({...r,owner:i===0?actual.host:actual.id}))});
  host.emit('b|'+JSON.stringify(cfg));const wire=guest.sent.at(-1);assert(wire.startsWith('m|'+actual.host+'|'));ws.deliver(wire);await settle();
  assert.equal(starts,valid?1:0);assert.equal(s.state,valid?'starting':'error');assert.equal(s.match instanceof f.NetMatch,valid);
  t.diagnostic(JSON.stringify({actualWorkerWelcome:{proto:actual.proto,compat:actual.compat},hostEnvelope:true,startProto:cfg.proto,state:s.state,actualNetMatch:s.match instanceof f.NetMatch}));
 }finally{for(const m of [...(room?.members.values()||[])])m.ws.close();globalThis.Response=savedResponse;if(savedPair===undefined)delete globalThis.WebSocketPair;else globalThis.WebSocketPair=savedPair;}
});

test('solo Turf still refuses start while solo Boss retains compatible host START',async()=>{
 const {s,ws}=await join({id:'H'});assert.equal(s.start(),false);assert.equal(starts,0);
 s.setSettings({mode:'boss'});assert.equal(s.start(),true);await settle();assert.equal(starts,1);
 const cfg=ws.sent.filter(x=>x.startsWith('b|')).map(x=>JSON.parse(x.slice(2))).find(x=>x.k==='start');assert.equal(cfg.mode,'boss');assert.equal(cfg.proto,f.PROTO);assert.equal(cfg.compat,f.COMPAT);
});
test('offline MockNet remains separate and never acquires a relay or NetMatch',async()=>{
 const mock=new f.MockNet();mock.mock.auto(false);mock._lat=0;mock._fill=0;
 try{const p=mock.create('Solo');for(const [id,item] of [...timers])if(item.ms===0){timers.delete(id);item.fn();}await p;
  assert.equal(mock.state,'lobby');assert.equal(mock.isMock,true);assert.equal(mock.isHost,true);assert.equal(sockets.length,0);assert.equal(starts,0);assert.equal(mock.match,undefined);
 }finally{mock.leave();}
});
