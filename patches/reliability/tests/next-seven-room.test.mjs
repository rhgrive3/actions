import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture, outcome, flush, deferred} from './net-fixture.mjs';
import {combatWorld} from './combat-integration-fixture.mjs';

for(const first of ['join','create'])for(const second of ['join','create']) {
  test(`#1167 ${first} cancellation cannot tear down subsequent ${second}, including queued deadline`,async()=>{
    const f=await fixture(), call=method=>method==='join'?f.net.join('BC234'):f.net.create('Player');
    const old=outcome(call(first)), deadline=f.timers.get(f.timer(8000)).fn;
    f.net.leave();
    const next=call(second);f.welcome(f.sockets.at(-1));await next;
    assert.equal((await old).error.name,'AbortError');
    const tr=f.net.tr,code=f.net.code;deadline();await flush();
    assert.equal(f.net.state,'lobby');assert.equal(f.net.tr,tr);assert.equal(f.net.code,code);
    assert.equal(tr.open,true);assert.equal(f.timer(8000),undefined);
    f.net.leave();assert.equal(f.timers.size,0);
  });
}
test('#1167 two cancelled connections leave only the third successful socket and heartbeat',async()=>{
  const f=await fixture(), old=[];
  for(let i=0;i<2;i++){old.push(outcome(f.net.join('BC234')));f.net.leave();}
  const p=f.net.create('Third');f.welcome(f.sockets.at(-1));await p;
  for(const r of await Promise.all(old))assert.equal(r.error.name,'AbortError');
  assert.equal(f.net.state,'lobby');assert.equal(f.timers.size,1);
  assert.equal(f.sockets.filter(s=>s.readyState===1).length,1);f.net.leave();
});

for(const boundary of ['lobby','world','warmup'])test(`#1154 early GO waits for ${boundary}, matches cfg and launches once`,async()=>{
  const f=await fixture(), joined=f.net.join('BC234');
  f.welcome(f.sockets[0],{id:'guest',host:'host',members:[{id:'host',name:'Host'},{id:'guest',name:'Guest'}]});await joined;
  const gate=deferred();let launches=0;
  f.G.game.menus={launchLobby:()=>boundary==='lobby'?gate.promise:Promise.resolve()};
  f.G.game.startNetMatch=()=>boundary==='lobby'?Promise.resolve():gate.promise;
  f.G.game.netMatchGo=()=>launches++;
  const cfg={id:'round-1',roster:[]}, pending=f.net._begin(cfg);await flush();
  f.net._message('host',{k:'go',id:'old-round'});f.net._message('intruder',{k:'go',id:cfg.id});
  assert.equal(f.net._goPending,null);
  f.net._message('host',{k:'go',id:cfg.id});f.net._message('host',{k:'go',id:cfg.id});
  assert.equal(f.net.state,'starting');assert.equal(launches,0);
  if(boundary==='lobby')assert.equal(f.net.match,null);
  gate.resolve();await pending;
  assert.equal(f.net.state,'match');assert.ok(f.net.match);assert.equal(f.net.match.launched,true);assert.equal(launches,1);
  f.net._message('host',{k:'go',id:cfg.id});assert.equal(launches,1);
  const ready=f.sockets[0].sent.filter(s=>s.includes('"k":"ready"'));
  assert.equal(ready.length,1);f.net.leave();assert.equal(f.net._goPending,null);
});
test('#1154 disconnect with a queued GO cannot revive a disposed match or a new lobby',async()=>{
  const f=await fixture(), joined=f.net.join('BC234');f.welcome(f.sockets[0],{id:'guest',host:'host'});await joined;
  const gate=deferred();f.G.game.startNetMatch=()=>gate.promise;let launches=0;f.G.game.netMatchGo=()=>launches++;
  const pending=f.net._begin({id:'old',roster:[]});await flush();const abandoned=f.net.match;
  f.net._message('host',{k:'go',id:'old'});f.net.leave();
  const next=f.net.join('BC235');f.welcome(f.sockets.at(-1));await next;
  gate.resolve();await pending;assert.equal(abandoned.disposed,true);assert.equal(f.net.state,'lobby');assert.equal(launches,0);
  assert.equal(f.net._goPending,null);f.net.leave();
});
test('#1157 native disposed NetMatch cannot rebind or resubscribe; duplicate live bind is inert',async()=>{
  const f=await combatWorld('A',{network:true});
  const m=f.G.match,subscriptions=f.net.unsubs.length;
  f.net.bind(m);assert.equal(f.net.unsubs.length,subscriptions);
  f.net.dispose();assert.equal(f.G.netm,null);assert.equal(f.net._disposed,true);
  assert.equal(f.net.bind(m),false);assert.equal(f.G.netm,null);assert.equal(f.net.unsubs.length,0);
  f.net.dispose();
});
