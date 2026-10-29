import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from './source-fixture.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { objectiveText } from '../runtime/ranked/ui.mjs';
import { createZoneCoveragePair } from '../runtime/ranked/zone-coverage-samples.mjs';
const plain=v=>JSON.parse(JSON.stringify(v));
const stage={id:'continuation',zones:[{center:[0,0,0],size:[8,8]}],tower:{path:[[0,0,-10],[0,0,0],[0,0,10]],centerIndex:1,checkpoints:[[],[]]},rainmaker:{center:[0,0,0],goals:[[0,0,10],[0,0,-10]],checkpoints:[[],[]]},clams:{spawns:[],goals:[[0,0,10],[0,0,-10]]}};
async function boot(negative=false){
 const f=await fixture({fullRuntime:true,adaptNative:(rel,code)=>{
  code=adaptBuildSource(rel,code);
  if(negative&&rel==='src/game/match.js'){
   assert(code.includes('if (!this.ranked) this.time -= dt;'));
   assert(code.includes('if (!this.ranked && this.time <= 0) {'));
   code=code.replace('if (!this.ranked) this.time -= dt;','this.time -= dt;').replace('if (!this.ranked && this.time <= 0) {','if (this.time <= 0) {');
  }
  return code;
 },adaptRuntime:adaptBuildSource,extraExports:`export {Match} from './inkwave-public/src/game/match.js';export {installRanked,buildFrame} from './patches/splatoon3/runtime/ranked/install.mjs';export {RankedEngine} from './patches/splatoon3/runtime/ranked/engine.mjs';export {simulateMatchInterval} from './patches/splatoon3/runtime/turf-finish.mjs';`});
 f.context.structuredClone=structuredClone;f.installRanked({...f.installedRuntime,structuredClone});return f;
}
function match(f,mode,time=1/60,overtime=false){
 const m=new f.Match({mode,duration:300});m.mode=mode;m.state='playing';m.time=time;m.duration=300;
 const r=m.ranked=new f.RankedEngine(mode,stage);r.time=time;r.counts=[40,60];r.leader=0;r.events.length=0;
 const state=r.rule.state;
 if(mode==='clams')state.scoredPoints=[60,40];
 if(overtime){
  if(mode==='zones'){state.controllingTeam=1;state.zones[0].team=1;}
  if(mode==='tower'){state.controllingTeam=1;state.emptySeconds=0;}
  if(mode==='rainmaker'){state.lastDropTeam=0;state.lastDropReason='drop';state.lastDropAge=1;}
  if(mode==='clams')state.scoredPoints=[0,0];
 }
 const events=[];m.rankedEffects={event:e=>events.push(plain(e)),update(){}};
 m.rankedGains=[0,0];m.rankedBarrierHits=[];
 m.rankedWorld={stage,zoneCoverage:()=>[[overtime?0:1,overtime?1:0]],captureZone(){},beforeActors(){},floorAt:()=>0,blocked:()=>false,update(){}};
 f.G.match=m;f.G.netm=null;f.G.projectiles={update(){}};
 return {m,r,events};
}
test('composed Match deadline reaches all four real rule engines, overtime and result exactly once',async()=>{
 const f=await boot();
 for(const mode of ['zones','tower','rainmaker','clams'])for(const overtime of [false,true])for(const time of [1/60,1/120,.001]){
  const {m,r,events}=match(f,mode,time,overtime),oracle=new f.RankedEngine(mode,stage);
  assert.equal(oracle.restore(r.snapshot()),true);const frame=f.buildFrame(m,f.installedRuntime);
  oracle.update(1/60,frame);const expected=plain(oracle.snapshot()),expectedEvents=plain(oracle.events);
  let finishes=0;const set=m.setState;m.setState=function(s){if(s==='finish')finishes++;return set.call(this,s);};
  f.simulateMatchInterval(m,1/60,f.G,false);
  assert.deepEqual(plain(r.snapshot()),expected,mode+'/'+overtime+'/'+time);
  assert.deepEqual(events,expectedEvents);
  assert.equal(r.overtime,overtime,mode+' overtime fixture reaches its actual rule condition');
  assert.equal(m.state,overtime?'playing':'finish');assert.equal(finishes,overtime?0:1);
  if(!overtime){m._judge();m._judge();assert.equal(m.state,'judge');assert.equal(m.result.winner,0);}
 }
});
test('unfixed composed Match is an independent negative control: rule clock and winner never advance at deadline',async()=>{
 const f=await boot(true),{m,r}=match(f,'zones');f.simulateMatchInterval(m,1/60,f.G,false);
 assert.equal(m.state,'finish');assert.equal(r.time,1/60);assert.equal(r.winner,null);
});
test('ranked single special drain preserves callback order, reentrant queue, host suppression and mixed wire events',async()=>{
 const f=await boot();
 for(const host of [false,true]){
  const {m,r,events}=match(f,'zones',20);r.rule.state.controllingTeam=0;r.rule.state.zones[0].team=0;const a=f.make();a.team=1;a.special=0;a.nid=1;a.owner='self';m.actors=[a];m.local=a;
  const wire=[];if(host)f.G.netm={isHost:true,cfg:{id:'m'},_sendNow:x=>wire.push(plain(x))};
  let splices=0;const splice=r.events.splice;r.events.splice=function(...args){splices++;return splice.apply(this,args);};
  const originalEvent=m.rankedEffects.event;m.rankedEffects.event=e=>{originalEvent(e);if(e.kind==='special-gain')r.event('lead',{team:0});};
  m.advanceRanked(1/60);assert.equal(splices,0);assert.equal(events[0].kind,'special-gain');assert.equal(r.events.length,1);assert.equal(r.events[0].kind,'lead');assert.equal(wire.length,0);assert(m.rankedGains[1]>0);assert(a.special>0);
  m.rankedEffects.event=originalEvent;m.advanceRanked(1/60);assert.equal(splices,1);assert.equal(r.events.length,0);assert.equal(wire.length,host?1:0);if(host)assert.deepEqual(wire[0].events.map(e=>e.kind),['lead']);
  let customCalls=0;const original=m.playRankedEvents;m.playRankedEvents=function(es){customCalls++;return original.call(this,es);};m.advanceRanked(1/60);assert.equal(customCalls,1,'custom event consumer keeps original callback');assert.equal(splices,2);
  const before=a.special;m.follower=true;r.special(1,10);m.advanceRanked(1/60);assert.equal(a.special,before);assert.equal(r.events.length,1);
 }
});
test('owned frozen zone samples elide descriptors while replacement, owner, names, locale and custom proxies retain semantics',()=>{
 const owned=createZoneCoveragePair(.722,.278),engine={mode:'zones',frame:{zoneCoverage:Object.freeze([owned])},rule:{state:{zones:[{team:0}]}}},G={palette:{names:['ALPHA','BRAVO']}},api={LANG:'en'};
 const original=Object.getOwnPropertyDescriptor;let reads=0;Object.getOwnPropertyDescriptor=function(o,k){if(o===owned)reads++;return original(o,k);};
 try{const first=objectiveText(engine,G,api);assert.equal(reads,2);for(let i=0;i<3600;i++)assert.equal(objectiveText(engine,G,api),first);assert.equal(reads,2);engine.rule.state.zones[0].team=1;assert.match(objectiveText(engine,G,api),/BRAVO/);G.palette.names[1]='NEW';assert.match(objectiveText(engine,G,api),/NEW/);api.LANG='ja';assert.notEqual(objectiveText(engine,G,api),first);engine.frame.zoneCoverage=Object.freeze([createZoneCoveragePair(.2,.8)]);assert.match(objectiveText(engine,G,api),/20\/80/);}finally{Object.getOwnPropertyDescriptor=original;}
 let traps=0;const custom=new Proxy(Object.freeze([.4,.6]),{getOwnPropertyDescriptor(t,k){traps++;return Reflect.getOwnPropertyDescriptor(t,k);}});engine.frame.zoneCoverage=Object.freeze([custom]);objectiveText(engine,G,api);const n=traps;objectiveText(engine,G,api);assert.equal(traps,n*2,'custom proxy still runs complete validation each call');
 let value=.1;const pair=Object.freeze(Object.defineProperty([0,.5],'0',{get:()=>value}));engine.frame.zoneCoverage=Object.freeze([pair]);assert.match(objectiveText(engine,G,api),/10\/50/);value=.9;assert.match(objectiveText(engine,G,api),/90\/50/);
});
