import test from 'node:test';
import assert from 'node:assert/strict';
import {RankedEngine} from '../runtime/ranked/engine.mjs';
import {installRankedNetwork} from '../runtime/ranked/network.mjs';
const stage={id:'network-stage',zones:[{center:[0,0,0],size:[6,6]}],tower:{path:[[0,0,-10],[0,0,0],[0,0,10]],centerIndex:1,checkpoints:[[],[]],speed:1.2,halfSize:1.4},rainmaker:{center:[0,0,0],goals:[[0,0,10],[0,0,-10]],checkpoints:[[[0,0,5]],[[0,0,-5]]],retreatZ:[-8,8]},clams:{spawns:[[0,0,0]],goals:[[0,0,10],[0,0,-10]]}};
function setup(mode='zones',host=false){
 const packets=[];
 class NetMatch{constructor(){this.myId=host?'host':'guest';this.s={hostId:'host',isHost:host,tr:{broadcast:d=>packets.push(d)}};this.cfg={id:'match-1'};this.match={mode,state:'playing',follower:!host,ranked:new RankedEngine(mode,stage),rankedGains:[0,0],rankedBarrierHits:[],actors:[],playRankedEvents:e=>{this.events=e;}};}get isHost(){return this.s.isHost;}_sendNow(d){packets.push(d);}_sendTick(){this.s.tr.broadcast({k:'t'});}onMessage(from,d){this.native={from,d};}_hostClock(){}onLeave(){}dispose(){}}
 const G={time:2,netm:null};installRankedNetwork({NetMatch,G,emit(){}});const nm=G.netm=new NetMatch();return{nm,G,packets};
}
function packet(nm,e,k='t'){return{k,rk:{match:nm.cfg.id,host:nm.s.hostId,state:e.snapshot(),gains:[0,0]}};}
test('ranked actor ticks and host-migration state restore; another sender, match, malformed state and stale revisions cannot mutate authority',()=>{
 const {nm}=setup(),host=new RankedEngine('zones',stage);host.setCount(0,60);host.revision=50;
 nm.onMessage('intruder',packet(nm,host));assert.equal(nm.match.ranked.counts[0],100);
 nm.onMessage('host',packet(nm,host));assert.equal(nm.match.ranked.counts[0],60);
 const old=new RankedEngine('zones',stage);nm.onMessage('host',packet(nm,old,'st'));assert.equal(nm.match.ranked.counts[0],60);
 const wrong=packet(nm,host);wrong.rk.match='another-match';nm.onMessage('host',wrong);assert.equal(nm.match.ranked.counts[0],60);
 const bad=packet(nm,host);bad.rk.state.rule={};bad.rk.state.counts=[1,100];nm.onMessage('host',bad);assert.equal(nm.match.ranked.counts[0],60);
 host.revision++;host.setCount(0,55);nm.onMessage('host',packet(nm,host,'rkstate'));assert.equal(nm.match.ranked.counts[0],55);
});
test('throw edges belong to the submitting actor owner and cannot be replayed',()=>{
 const{nm}=setup('clams',true);nm.match.actors=[{nid:7,owner:'guest',alive:true,team:1}];
 const d={k:'t',rki:{match:'match-1',id:'7',seq:1,fire:false,throw:true,aim:[0,0,1]}};
 nm.onMessage('intruder',d);assert.equal(nm.rankedInputs,undefined);
 nm.onMessage('guest',d);assert.equal(nm.rankedInputs.get('7').throw,true);nm.rankedInputs.get('7').throw=false;
 nm.onMessage('guest',d);assert.equal(nm.rankedInputs.get('7').throw,false);
});
test('host departure drops the objective and the promoted host broadcasts its retained state',()=>{
 const{nm,packets}=setup('rainmaker');nm.match.actors=[{nid:4,owner:'old-host',team:0}];
 nm.match.ranked.rule.state.carrier='4';nm.match.ranked.rule.state.carrierTeam=0;nm.match.ranked.rule.state.barrier.active=false;
 nm.s.hostId='guest';nm.s.isHost=true;nm.onLeave('old-host',true);
 assert.equal(nm.match.ranked.rule.state.carrier,null);assert.equal(nm.match.follower,false);assert.equal(packets.at(-1).k,'rkstate');assert.equal(packets.at(-1).rk.host,'guest');
});
test('render-rate-sized intervals produce identical ranked counts and regulation elapsed time',()=>{
 for(const mode of ['zones','tower','rainmaker','clams']){
  const results=[];
  for(const hz of [30,60,120,144]){
   const e=new RankedEngine(mode,stage);const frame={actors:[],inputs:{},zoneCoverage:[[1,0]],floorAt:()=>0};
   for(let i=0;i<hz*6;i++)e.update(1/hz,frame);
   results.push({counts:e.counts,penalties:e.penalties,time:Math.round(e.time*1e6),elapsed:Math.round(e.elapsed*1e6)});
  }
  for(const r of results)assert.deepEqual(r,results[0],mode);
 }
});
