import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './controls-fixture.mjs';

const clone = o => JSON.parse(JSON.stringify(o));
async function setup() {
  let now = 100, serial = 0;
  const f = await fixture({session:true, network:true, production:true, clock:{now:()=>now}});
  const sockets = [], timers = new Map();
  class Socket {
    constructor() { this.readyState=1; this.sent=[]; this.closed=[]; sockets.push(this); }
    send(s) { this.sent.push(s); }
    close(code,reason) { this.closed.push({code,reason}); this.readyState=3; this.onclose?.({reason}); }
  }
  const add = (fn,ms,repeat) => { const id=++serial; timers.set(id,{fn,ms,repeat}); return id; };
  Object.assign(f.context,{WebSocket:Socket,location:{hostname:'localhost',search:''},
    setTimeout:(fn,ms)=>add(fn,ms,false),clearTimeout:id=>timers.delete(id),
    setInterval:(fn,ms)=>add(fn,ms,true),clearInterval:id=>timers.delete(id)});
  const welcome = {t:'welcome',id:'guest',host:'host',members:[{id:'host',name:'Host'},{id:'guest',name:'Guest'}]};
  const message = (socket,o) => socket.onmessage?.({data:typeof o==='string'?o:JSON.stringify(o)});
  return {...f,sockets,timers,welcome,message,setNow:n=>{now=n;},
    run(ms) { const entry=[...timers].find(([,v])=>v.ms===ms); assert.ok(entry,`timer ${ms}`); const [id,v]=entry; if(!v.repeat)timers.delete(id); v.fn(); },
    async join(host=false) {
      const net=new f.NetSession(), pending=net.join('BC235',host?'Host':'Guest');
      const socket=sockets.at(-1); message(socket,{...welcome,id:host?'host':'guest'}); await pending;
      if(host)message(socket,{t:'join',m:{id:'guest',name:'Guest'}});
      return {net,socket};
    }};
}

test('malformed relay controls are inert and a later valid welcome still connects',async()=>{
  const f=await setup(), tr=new f.Transport(), controls=[];
  tr.onControl=o=>controls.push(o);
  const pending=tr.connect('BC235','Guest',false), socket=f.sockets.at(-1);
  try {
    for(const o of ['null','42','[]',{t:'join',m:null},{t:'leave',id:[]},{t:'err',e:{}}])
      assert.doesNotThrow(()=>f.message(socket,o));
    assert.equal(controls.length,0);
    f.message(socket,f.welcome); assert.equal((await pending).id,'guest');
  } finally {tr.close(); await pending.catch(()=>{});}
});

test('invalid welcomes cannot settle the handshake, change identity, or start heartbeats',async()=>{
  const f=await setup(), tr=new f.Transport(); let settled=false;
  const pending=tr.connect('BC235','Guest',false); pending.then(()=>settled=true,()=>settled=true);
  const socket=f.sockets.at(-1);
  try {
    for(const bad of [{members:null},{id:[]},{host:'missing'},
      {members:[{id:'host',name:'Host'},{id:'host',name:'Duplicate'}]},
      {members:[{id:'host',name:'Host'},{id:'guest',name:32}]}]) {
      assert.doesNotThrow(()=>f.message(socket,{...f.welcome,...bad}));
      await Promise.resolve(); assert.equal(settled,false); assert.equal(tr.id,null);
      assert.equal([...f.timers.values()].filter(v=>v.repeat).length,0);
    }
    f.message(socket,f.welcome); assert.equal((await pending).id,'guest');
  } finally {tr.close(); await pending.catch(()=>{});}
});

test('JSON heartbeat replies acknowledge only a current finite probe',async()=>{
  const f=await setup(), tr=new f.Transport(), pending=tr.connect('BC235','Guest',false), socket=f.sockets.at(-1);
  f.message(socket,f.welcome); await pending;
  try {
    const initial=tr.rtt;
    for(const c of ['bad',null,-1,999]) {f.message(socket,{t:'pong',c}); assert.equal(tr.rtt,initial); assert.equal(tr._pingSent,100);}
    f.setNow(150); f.message(socket,{t:'pong',c:100}); assert.equal(tr._pingSent,0); assert.equal(tr.rtt,50);
    f.setNow(200); f.run(2000); assert.equal(tr._pingSent,200);
    f.setNow(250); f.message(socket,{t:'pong',c:100}); assert.equal(tr._pingSent,200); assert.equal(tr.rtt,50);
    f.message(socket,{t:'pong',c:200}); assert.equal(tr._pingSent,0); assert.equal(tr.rtt,50);
  } finally {tr.close();}
});

test('background recovery keeps a JSON-pong connection and still closes an unanswered one',async()=>{
  for(const answered of [true,false]) {
    const f=await setup(), {net,socket}=await f.join();
    try {
      const owner=f.getPlatformLifecycle(); owner.block('test',true); f.setNow(1000); owner.block('test',false);
      if(answered){f.setNow(1050);f.message(socket,{t:'pong',c:1000});}
      f.setNow(7000); f.run(6000);
      assert.equal(socket.closed.filter(c=>c.reason === 'Connection did not recover after background').length,answered?0:1);
      assert.equal(socket.readyState,answered?1:3);
    } finally {net.leave();}
  }
});

test('malformed host lobby snapshots leave every field and event unchanged',async()=>{
  const f=await setup(), host=await f.join(true), guest=await f.join(), good=clone(host.net._wireLobby());
  try {
    f.message(guest.socket,`m|host|${JSON.stringify({k:'lobby',l:good})}`);
    const before=clone(guest.net.lobby); let events=0; guest.net._emit=()=>events++;
    const badRows=[null,[null],[...good.players,good.players[0]],good.players.map(p=>({...p,weapon:'constructor'}))];
    for(const l of [null,...badRows.map(players=>({...good,time:'dusk',players})),{...good,duration:'bad'},{...good,palette:-1}]) {
      assert.doesNotThrow(()=>f.message(guest.socket,`m|host|${JSON.stringify({k:'lobby',l})}`));
      assert.deepEqual(clone(guest.net.lobby),before); assert.equal(events,0);
    }
    f.message(guest.socket,`m|host|${JSON.stringify({k:'lobby',l:{...good,time:'dusk'}})}`);
    assert.equal(guest.net.lobby.time,'dusk'); assert.ok(events>0);
  } finally {host.net.leave();guest.net.leave();}
});

test('invalid peer profile updates cannot partly mutate or rebroadcast the host roster',async()=>{
  const f=await setup(), {net,socket}=await f.join(true); net.confirmTeams(); const before=clone(net.lobby);
  let broadcasts=0; net._broadcastLobby=()=>broadcasts++;
  try {
    for(const patch of [{name:42},{name:'x'.repeat(17)},{name:'Changed',ping:'bad'},
      {name:'Changed',ping:-1},{name:'Changed',ready:[]},{name:'Changed',team:3},
      {name:'Changed',weapon:'constructor'},{name:'Changed',style:[]}]) {
      assert.doesNotThrow(()=>f.message(socket,`m|guest|${JSON.stringify({k:'me',...patch})}`));
      assert.deepEqual(clone(net.lobby),before); assert.equal(broadcasts,0);
    }
    f.message(socket,`m|guest|${JSON.stringify({k:'me',name:'Renamed',ping:23.6,ready:true})}`);
    const guest=net.lobby.players.find(p=>p.id==='guest'); assert.equal(guest.name,'Renamed');assert.equal(guest.ping,24);assert.equal(guest.ready,true);assert.equal(broadcasts,1);
  } finally {net.leave();}
});

test('eight-player host snapshots retain Turf, Boss, ranked modes, gear and legacy optional fields',async()=>{
  const f=await setup(), host=await f.join(true), guest=await f.join();
  try {
    for(let i=2;i<8;i++)f.message(host.socket,{t:'join',m:{id:`peer${i}`,name:`Peer ${i}`}});
    for(const mode of ['turf','boss','zones','tower','rainmaker','clams']) {
      host.net.setSettings({mode});
      const l=clone(host.net._wireLobby());
      assert.equal(l.mode,mode); assert.equal(l.players.length,8);
      l.players[1].gear={head:'fixture-preserved-extension'};
      f.message(guest.socket,`m|host|${JSON.stringify({k:'lobby',l})}`);
      assert.equal(guest.net.lobby.mode,mode); assert.equal(guest.net.lobby.players.length,8);
      assert.deepEqual(clone(guest.net.lobby.players[1].gear),l.players[1].gear);
    }
    const legacy=clone(host.net._wireLobby()); delete legacy.palette; delete legacy.mode;delete legacy.teamsConfirmed;
    f.message(guest.socket,`m|host|${JSON.stringify({k:'lobby',l:legacy})}`);
    assert.equal(guest.net.lobby.mode,'turf');assert.equal(guest.net.lobby.players.length,8);
  } finally {host.net.leave();guest.net.leave();}
});
