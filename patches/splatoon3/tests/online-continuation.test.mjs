import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import fs from 'node:fs';
import vm from 'node:vm';
import {adaptQualitySource} from '../../local-quality/adapter.mjs';
async function peer(id='host'){
 const f=await fixture({productionComposition:true,extraExports:"export * from './patches/splatoon3/runtime/disconnect-fidelity.mjs';"}),sent=[];
 const s={myId:id,hostId:'host',isHost:id==='host',_members:new Map([['host',true],['guest',true]]),tr:{broadcast:d=>sent.push(structuredClone(d)),sendTo(){}}};
 const nm=new f.NetMatch(s,{id:'results-1'}),actors=['host','guest'].map((owner,n)=>{const a=f.make('shooter');Object.assign(a,{nid:n,owner,remote:owner!==id});return a;});
 f.G.match={mode:'turf',state:'results',actors};nm.bind(f.G.match);s.match=nm;
 let ended=0;f.G.game={netMatchEnd(){ended++;}};
 return {...f,s,nm,actors,sent,ended:()=>ended};
}
test('#478 host keep cannot force a peer changing gear; both keep completes once and preserves ready intents',async()=>{
 const h=await peer(),g=await peer('guest');
 const deliver=(from,to)=>{for(const d of from.sent.splice(0))to.nm.onMessage(from.s.myId,d);};
 assert.equal(h.chooseOnlineContinuation(h.nm,'keep'),true);deliver(h,g);assert.equal(h.ended(),0);
 assert.equal(g.chooseOnlineContinuation(g.nm,'change'),true);deliver(g,h);assert.equal(h.ended(),0);
 assert.equal(g.chooseOnlineContinuation(g.nm,'keep'),true);const keep=structuredClone(g.sent.at(-1));deliver(g,h);assert.equal(h.ended(),1);assert.equal(h.sent.filter(d=>d.k==='end').length,1);
 h.nm.onMessage('guest',keep);h.tickOnlineContinuation(h.nm);assert.equal(h.ended(),1);
 assert.deepEqual([...h.continuationReadyPlayers(h.s)],['host','guest']);assert.equal(h.continuationReadyPlayers(h.s).size,0);
});
test('#478 stale, outsider and invalid choices cannot ready players; host migration retains choices and departure removes the departed requirement',async()=>{
 const g=await peer('guest');g.chooseOnlineContinuation(g.nm,'keep');
 for(const [from,d] of [['host',{k:'rc',m:'old',q:1,choice:'keep'}],['intruder',{k:'rc',m:'results-1',q:1,choice:'keep'}],['host',{k:'rc',m:'results-1',q:1,choice:'start'}]])g.nm.onMessage(from,d);
 assert.equal(g.nm._resultChoices.rows.size,1);assert.equal(g.ended(),0);
 g.s.isHost=true;g.s.hostId='guest';g.s._members.delete('host');g.actors[0].s3.disconnected=true;
 g.tickOnlineContinuation(g.nm);assert.equal(g.ended(),1);assert.deepEqual([...g.continuationReadyPlayers(g.s)],['guest']);
});
test('#478 session end carries only explicit ready participants and clears stale match intent',()=>{
 const raw=fs.readFileSync('inkwave-public/src/net/session.js','utf8'),code=adaptQualitySource('src/net/session.js',raw),start=code.indexOf('  endMatch() {'),end=code.indexOf('\n  //',start);
 const ctor=vm.runInNewContext('class Session {'+code.slice(start,end)+'}; Session',{continuationReadyPlayers:s=>new Set(s._resultReady.matchId===s.match.cfg.id?s._resultReady.ids:[])});
 const s=new ctor();Object.assign(s,{match:{cfg:{id:'a'},dispose(){}},_resultReady:{matchId:'a',ids:['one']},tr:{lock(){}},isHost:true,lobby:{players:[{id:'one'},{id:'two'}]},_broadcastLobby(){},_setState(){},_emit(){},_pushLobby(){}});
 s.endMatch();assert.deepEqual(s.lobby.players.map(p=>p.ready),[true,false]);
});
