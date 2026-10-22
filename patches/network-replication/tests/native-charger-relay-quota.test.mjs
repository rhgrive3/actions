import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {webcrypto} from 'node:crypto';
import {fixture} from '../../splatoon3/tests/source-fixture.mjs';
import {FixedClock} from '../../splatoon3/runtime/clock.mjs';
import {createLocalRelay} from '../../../scripts/lib/inkwave-local-relay-fixture.mjs';
let wall=1000;
const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,vmPerformance:{now:()=>wall*1000},extraExports:`export {Transport} from './inkwave-public/src/net/transport.js';export {NetSession} from './inkwave-public/src/net/session.js';export {nativeChargerInputStatus} from './patches/splatoon3/runtime/native-charger-input.mjs';`});
f.context.crypto=webcrypto;
class Socket extends EventEmitter{
 constructor(){super();this.readyState=1;this.bufferedAmount=0;this.sent=[];}
 send(text){this.sent.push(text);}
 close(code=1000,reason='bye'){if(this.readyState!==1)return;this.readyState=3;this.closed={code,reason};this.emit('close');}
 get welcome(){return this.sent.map(t=>{try{return JSON.parse(t)}catch{return null}}).find(d=>d?.t==='welcome');}
}
async function setup(count){
 wall=1000;f.G.projectiles.clear();f.G.actors=[];f.G.time=0;
 const rooms=new Map(),connect=createLocalRelay({rooms}),host=new Socket(),guest=new Socket(),compat='iw-native-charger-input-v2';
 const request=(name,create=false)=>({url:`/room/BCEFG?v=2&compat=${compat}&name=${name}${create?'&create=1':''}`,method:'GET',headers:{upgrade:'websocket'}});
 assert.equal((await connect(host,request('Host',true))).accepted,true);assert.equal((await connect(guest,request('Peer'))).accepted,true);
 const s=new f.NetSession();Object.assign(s,{myId:host.welcome.id,hostId:host.welcome.id,state:'match'});s._members.set(host.welcome.id,{});s._members.set(guest.welcome.id,{});
 const actors=Array.from({length:count},(_,i)=>Object.assign(f.make('charger'),{nid:77+i,owner:s.myId,netLife:0}));
 const tr=new f.Transport(),wire=[];s.tr=tr;tr.ws={get readyState(){return host.readyState},bufferedAmount:0,send(text){wire.push({at:wall,text,bytes:Buffer.byteLength(text)});host.emit('message',text)},close(){host.close()}};
 const n=new f.NetMatch(s,{id:'native-quota',map:'reef'}),m={id:'native-quota',state:'playing',time:180,actors,playing:()=>true,canRespawn:()=>false};f.G.match=m;s.match=n;n.bind(m);
 return {host,guest,actors,n,s,tr,wire,rooms,close(){n.dispose();host.close();guest.close();f.G.projectiles.clear();}};
}
for(const hz of [30,60,120])test(`normal8 dense native input at${hz}Hz render stays inside actual Worker relay quotas`,async()=>{
 const old=Date.now;Date.now=()=>wall*1000;const w=await setup(8);try{
  const clock=new FixedClock();let ticks=0;
  for(let render=0;render<hz*10;render++)clock.advance(1/hz,dt=>{
   ticks++;wall=1000+ticks/60;f.G.time+=dt;
   for(const [i,a] of w.actors.entries()){
    a.aimYaw=Math.sin((i+ticks)*.037);a.aimPitch=Math.cos((i+ticks)*.083)*.4;a.intent.move.set(Math.sin((i+ticks)*.071)*.3,0,Math.cos((i+ticks)*.091)*.2);
    a.intent.fire=ticks%100<65;a.intent.sub=ticks%97===77;a.intent.squid=ticks%211===200;a.update(dt);
   }
   if(ticks%3===0)assert.equal(w.n._sendTick(),true);
  });
  assert.equal(ticks,600);assert.equal(w.host.closed,undefined);assert.equal(w.rooms.get('BCEFG').members.size,2);assert.equal(f.nativeChargerInputStatus(w.n,f.G).frames,0);
  const packets=w.wire.filter(p=>p.text.startsWith('b|')&&JSON.parse(p.text.slice(2)).k==='t');assert.equal(packets.length,200);
  const inputs=packets.reduce((sum,p)=>sum+JSON.parse(p.text.slice(2)).ci.slice(1).reduce((n,b)=>n+b[3].length,0),0);assert.equal(inputs,8*600);
  let peak=0;for(const p of w.wire)peak=Math.max(peak,w.wire.filter(q=>q.at>p.at-1+1e-8&&q.at<=p.at).reduce((n,q)=>n+q.bytes,0));
  assert.ok(peak<256*1024,`native maximum one-second bytes ${peak}`);assert.ok(w.wire.every(p=>p.bytes<=65536));
  console.log(JSON.stringify({case:'native-charger-normal8-relay',renderHz:hz,sourceTicks:ticks,inputFrames:inputs,packets:packets.length,peakOneSecondBytes:peak,totalWireBytes:w.wire.reduce((n,p)=>n+p.bytes,0),closed:w.host.closed||null}));
 }finally{w.close();Date.now=old;}
});
test('32actor defensive stress hits the unchanged Worker quota with bounded input state and explicit close',async()=>{
 const old=Date.now;Date.now=()=>wall*1000;const w=await setup(32);try{
  for(let tick=1;tick<=600&&!w.host.closed;tick++){
   wall=1000+tick/60;f.G.time+=1/60;
   for(const [i,a] of w.actors.entries()){a.aimYaw=Math.sin((i+tick)*.037);a.aimPitch=Math.cos((i+tick)*.083)*.4;a.intent.move.set(Math.sin((i+tick)*.071)*.3,0,Math.cos((i+tick)*.091)*.2);a.update(1/60);}
   if(tick%3===0)w.n._sendTick();
  }
  assert.equal(w.host.closed?.code,1008);assert.equal(w.host.closed?.reason,'Relay traffic limit');const status=f.nativeChargerInputStatus(w.n,f.G);assert.ok(status.frames<=4096);assert.ok(status.bytes<=512*1024);assert.ok(status.actors<=32);
  console.log(JSON.stringify({case:'native-charger-guard32-relay',wireFrames:w.wire.length,closed:w.host.closed,input:status}));
 }finally{w.close();Date.now=old;}
});
