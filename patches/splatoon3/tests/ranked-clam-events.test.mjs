import test from 'node:test';
import assert from 'node:assert/strict';
import {RankedEngine} from '../runtime/ranked/engine.mjs';
import {installRankedNetwork} from '../runtime/ranked/network.mjs';
const stage={id:'clam-event-contract',clams:{spawns:[],goals:[[0,0,20],[0,0,-20]]}};
const frame={actors:[],inputs:{},floorAt:()=>0,blocked:()=>false};
function scenario(legacy=false){
 const e=new RankedEngine('clams',stage),r=e.rule,states=[],mark=()=>states.push(e.snapshot());
 // Exact main3839 event adapter. All physical rule methods are the same;
 // this isolates the envelope repair from the unchanged rule transition logic.
 if(legacy)r._event=function(kind,data={}){if(typeof this.engine?.event==='function')this.engine.event(kind,data);};
 const a={id:'player',team:0,alive:true,pos:[0,0,0]};
 for(let i=0;i<8;i++){const c=r._newClam('small',null,[0,0,0]);r._pickup(c,a,frame);mark();}
 r._throw(a,{aim:[0,0,1]},frame);mark();
 for(let i=0;i<120;i++){e.update(1/60,frame);mark();}
 for(const c of r.state.clams)c.expiresIn=.001;r._expireAndAge(.002);mark();
 r.state.inventories.player={team:0,power:true,small:0};r._throw(a,{aim:[0,0,1]},frame);mark();
 const c=r.state.clams.at(-1);r._tryGoal(c,[0,.55,19],[0,.55,21],frame);mark();
 e.update(1.2,frame);mark();r._score(0,'small',[0,.55,20]);mark();
 for(let i=0;i<700;i++){e.update(1/60,frame);mark();}
 return{e,states,events:e.events};
}
test('event envelope repair preserves every physical state and event order through pickup, throw, expiry, drill, scores and close',()=>{
 const old=scenario(true),now=scenario();assert.deepEqual(now.states,old.states);
 const legacyShape=now.events.map(({kind,clamKind,...data})=>({kind:clamKind??kind,...data}));
 assert.deepEqual(legacyShape,old.events);
 const scores=now.events.filter(e=>e.kind==='clam-score');assert.deepEqual(scores.map(e=>[e.clamKind,e.points]),[['power',20],['small',3]]);
 assert.ok(now.events.some(e=>e.kind==='clam-barrier-open'));assert.ok(now.events.some(e=>e.kind==='clam-barrier-close'));
 assert.equal(now.events.some(e=>['small','power'].includes(e.kind)),false);
});
function client(){
 const delivered=[];
 class NetMatch{constructor(){this.myId='guest';this.s={hostId:'host',isHost:false};this.cfg={id:'m'};this.match={mode:'clams',state:'playing',follower:true,ranked:new RankedEngine('clams',stage),rankedGains:[0,0],actors:[],playRankedEvents:(events,visualOnly)=>delivered.push({events,visualOnly})};}get isHost(){return false;}_sendNow(){}_sendTick(){}onMessage(){}_hostClock(){}onLeave(){}dispose(){}}
 const G={time:0};installRankedNetwork({NetMatch,G,emit(){}});const nm=G.netm=new NetMatch();return{nm,delivered};
}
test('host clam events reach clients once in order, preserve scoring authority, and reject replay or wrong owner',()=>{
 const host=scenario().e,{nm,delivered}=client(),initial=nm.match.ranked.snapshot();
 // Multiple ordinary transport envelopes preserve original ordering.
 const all=host.events.filter(e=>e.kind!=='special-gain');
 let seq=0;for(let offset=0;offset<all.length;offset+=64){const p={k:'rkevent',match:'m',seq:++seq,events:all.slice(offset,offset+64)};nm.onMessage('intruder',p);nm.onMessage('host',p);nm.onMessage('host',p);}
 assert.deepEqual(delivered.flatMap(d=>d.events),all);assert.ok(delivered.every(d=>d.visualOnly===true));
 assert.deepEqual(nm.match.ranked.snapshot(),initial,'Events must never apply authoritative scores');
 nm.onMessage('host',{k:'rkstate',rk:{match:'m',host:'host',state:host.snapshot(),gains:[0,0]}});
 assert.deepEqual(nm.match.ranked.snapshot(),host.snapshot());
 const restored=nm.match.ranked.snapshot(),count=delivered.length;
 nm.onMessage('host',{k:'rkevent',match:'m',seq,events:all.slice(-1)});
 assert.equal(delivered.length,count);assert.deepEqual(nm.match.ranked.snapshot(),restored);
});
