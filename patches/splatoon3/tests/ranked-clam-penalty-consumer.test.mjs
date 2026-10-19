import test from 'node:test';
import assert from 'node:assert/strict';
import { RankedEngine } from '../runtime/ranked/engine.mjs';
import { fixture } from './source-fixture.mjs';

// Inkipedia Clam Blitz, Gameplay > Scoring (reported revision 730528,
// retrieved 2026-10-19): the common Splatoon 2/3 section specifies flooring
// half the complete scoring window on closure, including penalty repayment.
// https://splatoonwiki.org/wiki/Clam_Blitz#Scoring
// S3mix gives 3/20 scoring and half-window penalties, without rounding order.
// This is Wiki-conformance CPU coverage, not new retail hardware measurement.
const stage={id:'clam-penalty-consumer',clams:{spawns:[],goals:[[0,0,1.5],[0,0,-1.5]]}};
const empty={actors:[],inputs:{},floorAt:()=>0};
function pure(team,dt) {
  const e=new RankedEngine('clams',stage),a={id:'p',team,alive:true,grounded:true,pos:[0,0,0]},frame={...empty,actors:[a]};
  const tick=seconds=>{while(seconds>1e-9){const n=Math.min(dt,seconds);e.update(n,frame);seconds-=n;}};
  const put=kind=>{
    e.rule.state.inventories.p={team,small:kind==='small'?1:0,power:kind==='power'};
    e.update(1/60,{...frame,inputs:{p:{throw:true,aim:[0,0,team===0?1:-1]}}});
    tick(kind==='power'?1.4:.25);
  };
  return {e,tick,put};
}
for(const dt of [1/60,.05,.2])for(const team of [0,1]) {
 test(`Clam window floors aggregate half once, not each small clam (${dt}, team ${team})`,()=>{
  for(const [small,points,penalty] of [[0,20,10],[1,23,11],[2,26,13],[17,71,35]]) {
    const {e,tick,put}=pure(team,dt);put('power');for(let i=0;i<small;i++)put('small');
    assert.equal(e.counts[team],100-points);assert.equal(e.penalties[team],0);
    tick(10.1);assert.equal(e.penalties[team],penalty);
    const event=e.events.findLast(x=>x.kind==='clam-barrier-close');assert.equal(event.penalty,penalty);
    assert.equal(e.rule.state.baskets[team].chancePoints,0);tick(.2);assert.equal(e.penalties[team],penalty,'no second addition');
    const restored=new RankedEngine('clams',stage);assert(restored.restore(e.snapshot()));assert.equal(restored.penalties[team],penalty);
  }
 });
 test(`Clam odd window cannot leak half a point into subsequent scoring (${dt}, team ${team})`,()=>{
  const {e,tick,put}=pure(team,dt);put('power');put('small');tick(20.2);
  assert.equal(e.penalties[team],11);put('power');assert.equal(e.counts[team],68);assert.equal(e.penalties[team],0);
  put('small');tick(20.2);assert.equal(e.counts[team],65);assert.equal(e.penalties[team],11);
  put('power');assert.equal(e.counts[team],56);
 });
 test(`Clam existing penalty survives partial repayment before new window addition (${dt}, team ${team})`,()=>{
  const {e,tick,put}=pure(team,dt);put('power');for(let i=0;i<17;i++)put('small');tick(20.2);
  assert.equal(e.counts[team],29);assert.equal(e.penalties[team],35);
  put('power');assert.equal(e.penalties[team],15);tick(20.2);assert.equal(e.penalties[team],25);
  put('power');put('small');assert.equal(e.penalties[team],2);tick(20.2);assert.equal(e.penalties[team],13);
  put('power');assert.equal(e.penalties[team],0);assert.equal(e.counts[team],22);
 });
 test(`Clam floored penalty reaches exact tie without prematurely winning overtime (${dt}, team ${team})`,()=>{
  const {e,tick,put}=pure(team,dt);put('power');put('small');tick(20.2);
  e.counts[1-team]=68;e.leader=1-team;e.rule.state.scoredPoints[1-team]=32;
  e.rule.state.inventories.p={team,small:0,power:true};e.time=1/60;e.update(1/60,{...empty,actors:[{id:'p',team,alive:true,grounded:true,pos:[0,0,0]}]});
  assert.equal(e.overtime,true);put('power');assert.equal(e.counts[team],68);assert.equal(e.winner,null,'tie retains the earlier leader');
  tick(10.1);assert.equal(e.counts[team],69);assert.equal(e.winner,1-team);assert.equal(e.penalties[team],10);
 });
}

test('legacy fractional residue is not silently normalized outside the new half-window addition',()=>{
 const {e,tick,put}=pure(0,1/60);e.penalties[0]=.5;put('power');assert.equal(e.counts[0],80.5);assert.equal(e.penalties[0],0);
 put('small');tick(10.1);assert.equal(e.penalties[0],11,'only the newly assessed window is floored');
});

test('installed Actor input, Match scorer, HUD formatter and host-client snapshot preserve integer Clam penalties',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,extraExports:`
  export { Match } from './inkwave-public/src/game/match.js';
  export { installRanked } from './patches/splatoon3/runtime/ranked/install.mjs';
  export { RankedEngine } from './patches/splatoon3/runtime/ranked/engine.mjs';
  export { installRankedUi } from './patches/splatoon3/runtime/ranked/ui.mjs';
 `});f.context.structuredClone=structuredClone;f.installRanked(f.installedRuntime);
 // Actual installed HUD formatter on inert DOM nodes; no browser render claim.
 const nodes=Object.fromEntries(['count0','count1','penalty0','penalty1','team0','team1','rule','clock','objective','hint'].map(k=>[k,{textContent:'',dataset:{count:k.at(-1),penalty:k.at(-1),team:k.at(-1)},classList:{toggle(){}},style:{setProperty(){}}}]));
 const el={dataset:{},querySelectorAll(s){return s==='[data-count]'?[nodes.count0,nodes.count1]:s==='[data-penalty]'?[nodes.penalty0,nodes.penalty1]:[nodes.team0,nodes.team1]},querySelector(s){return nodes[s.split('__')[1]]}};
 f.context.document={querySelector(){return {}}};class Hud{update(){}constructor(){this.el={};this._rankedHud=el;}}
 f.installRankedUi({G:f.G,HUD:Hud});const hud=new Hud();
 for(const dt of [1/60,.05,.2])for(const team of [0,1]){
  const a=f.make('shooter');Object.assign(a,{nid:'p'+team,team,slot:team,aimYaw:team===0?0:Math.PI,aimPitch:0});a.pos.set(0,0,0);a.character.root.position.copy(a.pos);
  const observed=[];
  const m=Object.assign(Object.create(f.Match.prototype),{mode:'clams',state:'playing',paused:false,follower:false,
   ranked:new f.RankedEngine('clams',stage),actors:[a],local:a,rankedBarrierHits:[],rankedGains:[0,0],
   rankedWorld:{zoneCoverage:()=>[],floorAt:()=>0,blocked:()=>false,update(){}},rankedEffects:{event(e,visualOnly){if(e.kind==='clam-barrier-close')observed.push({event:e,visualOnly})},update(){}},setState(s){this.state=s}});
  f.G.match=m;f.G.netm=null;f.G.actors=[a];
  const tick=seconds=>{while(seconds>1e-8){const n=Math.min(seconds,dt);f.G.time+=n;m.advanceRanked(n);seconds-=n;}};
  const put=kind=>{m.ranked.rule.state.inventories['p'+team]={team,small:kind==='small'?1:0,power:kind==='power'};a.intent.throw=true;a.update(1/60);tick(1/60);a.intent.throw=false;a.update(1/60);tick(kind==='power'?1.4:.25)};
  const check=(count,penalty)=>{
   assert.equal(m.ranked.counts[team],count);assert.equal(m.ranked.penalties[team],penalty);hud.update(0);
   assert.equal(nodes['count'+team].textContent,String(count));assert.equal(nodes['penalty'+team].textContent,penalty?`PEN ${penalty}`:'');
   const state=m.ranked.snapshot(),guestEngine=new f.RankedEngine('clams',stage);
   const guest=Object.assign(Object.create(f.Match.prototype),{mode:'clams',state:'playing',paused:false,follower:true,ranked:guestEngine,actors:[],local:null,time:300,rankedBarrierHits:[],rankedGains:[0,0],rankedWorld:m.rankedWorld,rankedEffects:m.rankedEffects,setState(s){this.state=s}});
   const session={myId:'guest',hostId:'host',isHost:false,_members:new Set(['host','guest']),tr:{broadcast(){},sendTo(){}}};
   const net=new f.NetMatch(session,{id:'clam-penalty-wire',map:'tidewater'});net.bind(guest);f.G.netm=net;f.G.match=guest;
   const packet={k:'st',s:'playing',t:state.time,rk:{match:'clam-penalty-wire',host:'host',state,gains:[0,0]}};
   net.onMessage('not-host',packet);assert.deepEqual(Array.from(guestEngine.counts),[100,100]);assert.deepEqual(Array.from(guestEngine.penalties),[0,0]);
   net.onMessage('host',packet);assert.deepEqual(Array.from(guestEngine.counts),Array.from(m.ranked.counts));assert.deepEqual(Array.from(guestEngine.penalties),Array.from(m.ranked.penalties));
   const revision=guestEngine.revision;guest.advanceRanked(.2);assert.equal(guestEngine.revision,revision);
   const close=observed.findLast(x=>!x.visualOnly)?.event;
   if(close){
    const before=observed.filter(x=>x.visualOnly).length,balances=Array.from(guestEngine.penalties);
    const packetEvent={k:'rkevent',match:'clam-penalty-wire',seq:1,events:[close]};
    net.onMessage('not-host',packetEvent);assert.equal(observed.filter(x=>x.visualOnly).length,before);
    net.onMessage('host',packetEvent);net.onMessage('host',packetEvent);
    assert.equal(observed.filter(x=>x.visualOnly).length,before+1,'host event displayed once');
    assert.equal(observed.at(-1).event.penalty,close.penalty);
    assert.deepEqual(Array.from(guestEngine.penalties),balances,'visual close event cannot charge the penalty again');
   }
   f.G.netm=null;f.G.match=m;
  };
  put('power');put('small');tick(10.1);check(77,11);
  tick(10.1);put('power');check(68,0);put('small');tick(10.1);check(65,11);
  tick(10.1);put('power');check(56,0);
  m.ranked=new f.RankedEngine('clams',stage);m.state='playing';put('power');for(let i=0;i<17;i++)put('small');tick(10.1);check(29,35);
  tick(10.1);put('power');check(29,15);tick(10.1);check(29,25);
  tick(10.1);put('power');put('small');check(29,2);tick(10.1);check(29,13);
  tick(10.1);put('power');check(22,0);
 }
});
