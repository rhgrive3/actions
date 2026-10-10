import fs from 'node:fs';
import vm from 'node:vm';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';
import { adaptNetworkSource } from '../adapter.mjs';
import { adaptRange } from '../../practice-range/adapter.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';
import { installDisconnectFidelity } from '../../splatoon3/runtime/disconnect-fidelity.mjs';
import { fixture as actorFixture } from '../../splatoon3/tests/source-fixture.mjs';
import { installRespawnLifecycle, beginInitialSquidSpawn } from '../../splatoon3/runtime/respawn-lifecycle.mjs';

async function setup(options = {}) {
  const f=await fixture(options), nm=f.makeNetMatch(f.makeSession('p2','host'));
  const a=f.makeActor({nid:1,owner:'p2',remote:false});
  const m=f.bind(nm,[a]); m.mode='turf';m.duration=180;m.stateT=3;
  m.setState=function(s){this.state=s;this.stateT=0;};
  f.G.match=m;return {...f,nm,m,a};
}
test('host clock samples cannot poison finite battle time',async()=>{
  const f=await setup();
  for(const time of [NaN,Infinity,-Infinity,-1]) {
    f.m.time=50;f.nm._hostClock(['playing',time]);assert.equal(f.m.time,50);
    f.nm.onMessage('host',{k:'st',s:'playing',t:time});assert.equal(f.m.time,50);
  }
  f.nm._hostClock(['playing',40]);assert.equal(f.m.time,45);
});
test('late host state cannot rewind finish/judge/results or replace the finish snapshot',async()=>{
  const f=await setup();
  f.nm.onMessage('host',{k:'st',s:'finish',t:0,fc:[.6,.4]});
  for(const state of ['finish','judge','results']) {
    f.m.state=state;f.m.time=0;f.m.stateT=2;
    f.nm.onMessage('host',{k:'st',s:'playing',t:30});
    assert.equal(f.m.state,state);assert.equal(f.m.time,0);assert.equal(f.m.stateT,2);
  }
  f.nm.onMessage('host',{k:'st',s:'finish',t:0,fc:[.1,.9]});
  assert.deepEqual(Array.from(f.m.s3FinishCoverage),[.6,.4]);
});
test('a replayed final result cannot restart judging or rewrite accepted statistics',async()=>{
  const f=await setup();f.m.state='finish';
  const packet={k:'res',mode:'turf',cov:[.6,.4],win:0,st:[[1,120,2,1,0,0]]};
  f.nm.onMessage('host',packet);assert.equal(f.m.state,'judge');
  f.m.state='results';f.m.stateT=5;
  f.nm.onMessage('host',{...packet,cov:[.1,.9],win:1,st:[[1,999,8,8,0,0]]});
  assert.equal(f.m.state,'results');assert.equal(f.m.stateT,5);
  assert.equal(f.a.stats.turf,120);assert.equal(f.m.result.winner,0);
});
test('repeated no-contest notice does not extend an already running cancellation countdown',async()=>{
  const f=await setup();installDisconnectFidelity(f);
  f.nm.onMessage('host',{k:'nc',r:6});f.nm.update(2);
  assert.equal(f.nm.s3NoContestRemaining,4);
  f.nm.onMessage('host',{k:'nc',r:6});assert.equal(f.nm.s3NoContestRemaining,4);
  f.nm.onMessage('host',{k:'nc',r:2});assert.equal(f.nm.s3NoContestRemaining,2);
});
test('splat retires the old Squid Spawn action so native death countdown resumes',async()=>{
  const f=await actorFixture();installRespawnLifecycle(f,f.profile);
  const level=new f.Level({bounds:{minX:-20,maxX:20,minZ:-20,maxZ:20},
    spawnPads:[[0,2.2,0],[0,2.2,18]],spawnBarrier:4.2,
    single:[{kind:'box',min:[-6,-1,-12],max:[6,0,12]}],half:[]});
  f.G.level=level;f.G.physics=new f.Physics(level);f.G.match.mode='turf';
  const a=f.make();a.slot=0;assert.equal(beginInitialSquidSpawn(a),true);
  assert.equal(a.s3.squidSpawn.phase,'aim');
  a.splat(null);assert.equal(a.alive,false);assert.equal(a.s3.squidSpawn,undefined);
  const before=a.respawnTimer;f.tick(a);assert.ok(a.respawnTimer<before);
});

test('invalid and terminal host messages retain owner and state admission boundaries',async()=>{
  const f=await setup();
  for(const sample of [null,{},[],['playing'],['playing','30']]) {
    assert.doesNotThrow(()=>f.nm._hostClock(sample));assert.equal(f.m.time,180);
  }
  f.nm.onMessage('intruder',{k:'st',s:'finish',t:0});assert.equal(f.m.state,'playing');
  f.nm.onMessage('host',{k:'st',s:'bogus',t:0});assert.equal(f.m.state,'playing');assert.equal(f.m.time,180);
  f.nm.onMessage('host',{k:'st',s:'finish',t:0,fc:[.6,.4]});f.m.stateT=2;
  f.nm.onMessage('host',{k:'st',s:'finish',t:0,fc:[.1,.9]});
  assert.equal(f.m.stateT,2);assert.deepEqual(Array.from(f.m.s3FinishCoverage),[.6,.4]);
});
test('No Contest zero stays terminal and separate matches start independent timers',async()=>{
  const f=await setup();installDisconnectFidelity(f);
  f.nm.onMessage('intruder',{k:'nc',r:6});assert.equal(f.m.s3NoContest,undefined);
  f.nm.onMessage('host',{k:'nc',r:6});f.nm.update(6);
  assert.equal(f.nm.s3NoContestRemaining,0);
  f.nm.onMessage('host',{k:'nc',r:6});assert.equal(f.nm.s3NoContestRemaining,0);
  const next=f.makeNetMatch(f.makeSession('p2','host'),{id:'next'});f.bind(next,[]);
  next.onMessage('host',{k:'nc',r:6});assert.equal(next.s3NoContestRemaining,6);
});
test('direct replicated death retires stale spawn before native countdown without launching',async()=>{
  const f=await actorFixture();installRespawnLifecycle(f,f.profile);
  const a=f.make();a.alive=false;a.respawnTimer=3;
  a.s3.squidSpawn={phase:'flight',t:0,duration:1};
  f.tick(a);assert.equal(a.s3.squidSpawn,undefined);assert.ok(a.respawnTimer<3);
});

test('first authoritative result survives earlier host phase messages and commits only once',async()=>{
  for(const phase of ['finish','judge','results']) {
    const f=await setup();
    f.nm.onMessage('host',{k:'st',s:phase,t:0});
    assert.equal(f.m.result,undefined);
    assert.equal(f.m.state,phase==='finish'?'finish':'playing','terminal phase messages wait for the result payload');
    const packet={k:'res',mode:'turf',cov:[.6,.4],win:0,st:[[1,123,2,1,0,0]]};
    f.nm.onMessage('host',packet);
    assert.equal(f.m.state,'judge');assert.equal(f.m.result.winner,0);assert.equal(f.a.stats.turf,123);
    f.m.stateT=2;
    f.nm.onMessage('host',{...packet,win:1,st:[[1,999,9,9,0,0]]});
    assert.equal(f.m.stateT,2);assert.equal(f.m.result.winner,0);assert.equal(f.a.stats.turf,123);
  }
});
test('a judge presentation with no result does not count as an accepted result',async()=>{
  const f=await setup();f.m.state='judge';f.m.stateT=3;f.m.result=null;
  f.nm.onMessage('host',{k:'res',mode:'turf',cov:[.4,.6],win:1,st:[[1,45,0,1,0,0]]});
  assert.equal(f.m.result.winner,1);assert.equal(f.a.stats.turf,45);assert.equal(f.m.state,'judge');assert.equal(f.m.stateT,3);
});

test('first result fills an already terminal view without rewinding it; replacement match gets its own result',async()=>{
  const f=await setup();f.m.state='results';f.m.stateT=5;f.m.result=null;
  const packet={k:'res',mode:'turf',cov:[.6,.4],win:0,st:[[1,88,2,1,0,0]]};
  f.nm.onMessage('host',packet);
  assert.equal(f.m.state,'results');assert.equal(f.m.stateT,5);
  assert.equal(f.m.result.winner,0);assert.equal(f.a.stats.turf,88);
  const next=f.bind(f.nm,[f.a]);next.state='finish';next.setState=function(s){this.state=s;this.stateT=0;};
  f.G.match=next;
  f.nm.onMessage('host',{...packet,win:1,cov:[.4,.6],st:[[1,33,1,2,0,0]]});
  assert.equal(next.state,'judge');assert.equal(next.result.winner,1);assert.equal(f.a.stats.turf,33);
  assert.equal(f.m.state,'results');assert.equal(f.m.result.winner,0);
});

function productionJudge(G) {
  const rel='src/main.js';
  let code=fs.readFileSync(new URL('../../../inkwave-public/'+rel,import.meta.url),'utf8');
  for(const adapt of [adaptSource,adaptTouchLayout,adaptReliability,adaptQualitySource,adaptNetworkSource,adaptRange])code=adapt(rel,code);
  const start=code.indexOf('  async _judge() {'),end=code.indexOf('  _fade(',start);
  assert.ok(start>=0&&end>start);
  return vm.runInNewContext(`(class Game {${code.slice(start,end)}})`,{
    G,PROGRESSION:{xpForLevel:()=>1000},TEAM_NAMES:['A','B'],
    setTimeout:()=>0,saveJSON(){throw Error('Private Battle may not save XP');},
  });
}
for(const network of [false,true])test(`${network?'fixed':'negative control'}: host results cannot cancel the real guest judge menu continuation`,async()=>{
  const f=await setup({network});
  f.G.teamHex=['#f80','#04f'];f.G.net={isHost:false,tr:{}};f.m.local=f.a;
  const packet={k:'res',mode:'turf',cov:[.6,.4],win:0,st:[[1,88,2,1,0,0]]};
  f.nm.onMessage('host',packet);assert.equal(f.m.state,'judge');
  let finishJudge;const pending=new Promise(resolve=>{finishJudge=resolve;});const menus=[];
  const NativeGame=productionJudge(f.G),game=new NativeGame();
  Object.assign(game,{match:f.m,_matchFlow:1,
    hud:{hideSplatted(){},setVisible(){},judge:()=>pending},rig:{overview(){}},palette:{names:['A','B']},
    profile:{level:1,xp:0,matches:0,wins:0,totalTurf:0},mapDef:{name:'test'},showcase:{showResults(){}},
    menus:{showResults:data=>menus.push(data),show(){}},
  });
  const continuation=game._judge();
  f.nm.onMessage('host',{k:'st',s:'results',t:0});
  assert.equal(f.m.state,network?'judge':'results');
  finishJudge({cancelled:false});await continuation;
  assert.equal(menus.length,network?1:0,network?'actual native continuation reaches results menu':'baseline host notification kills native menu continuation');
  if(network){
    assert.equal(f.m.state,'results');assert.equal(menus[0].win,true);
    f.nm.onMessage('host',{...packet,win:1});assert.equal(f.m.result.winner,0);assert.equal(menus.length,1);
  }
});
