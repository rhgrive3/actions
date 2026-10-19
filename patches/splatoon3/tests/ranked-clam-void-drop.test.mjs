import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {sourceLoadedActorFixture} from './source-loaded-actor-fixture.mjs';
const f=await sourceLoadedActorFixture({random:()=>.5,extraExports:`export {RankedWorld} from './patches/splatoon3/runtime/ranked/world.mjs'; export {TIDEWATER} from './src/world/maps.js';`}),{G}=f;
G.netm=null;
G.level=new f.Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-5,0,0],[5,0,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-10,-.5,-10],max:[10,0,10]},{kind:'box',min:[-20,-4,-4],max:[-15,-3,4]}]});G.physics=new f.Physics(G.level);
const stage={id:'clam-water-boundary',clams:{spawns:[],goals:[[0,0,4],[0,0,-4]]}};
const plain=v=>JSON.parse(JSON.stringify(v));
const active=new Set();afterEach(()=>{for(const x of [...active])x.dispose();});
async function env(team=0){
 const a=await f.make(team);a.nid=1;a.character.onEvent=null;
 const m=Object.assign(Object.create(f.Match.prototype),{mode:'clams',state:'playing',ranked:new f.RankedEngine('clams',stage),actors:[a],local:a,rankedGains:[0,0],rankedBarrierHits:[],rankedEffects:{event(){},update(){}},playing(){return this.state==='playing'},canRespawn:()=>false});
 m.rankedWorld=new f.RankedWorld(f,m,stage);G.match=m;
 const events=[],play=m.playRankedEvents;m.playRankedEvents=function(es,...args){events.push(...plain(es));return play.call(this,es,...args)};
 const x={a,m,e:m.ranked,r:m.ranked.rule,events,dispose(){active.delete(x);m.rankedWorld.dispose();f.reset();}};active.add(x);return x;
}
function inventory(x,{small=0,power=false}={}){x.r.state.inventories['1']={team:x.a.team,small,power};}
function comeback(x,dt){const team=x.a.team;x.e.counts[team]=70;x.e.counts[1-team]=50;x.e.leader=1-team;x.r.state.scoredPoints[team]=30;x.r.state.scoredPoints[1-team]=50;x.e.time=dt;x.m.advanceRanked(dt);assert.equal(x.e.overtime,true);}
function waterDeath(x,dt){x.a.pos.set(12,f.PLAYER.fallDeathY-.1,0);x.a.vel.set(0,-1,0);x.a.grounded=x.a.ground.hit=false;G.time+=dt;x.a.update(dt);assert.equal(x.a.alive,false);assert.equal(x.m.rankedWorld.floorAt(x.a.pos.x,x.a.pos.z,x.a.pos.y+.25),null);}
for(const hz of [30,60,120])for(const team of [0,1])test(`actual water death ${hz}Hz/team${team}: last power is lost and comeback ends in that ranked tick`,async t=>{
 const x=await env(team),dt=1/hz;inventory(x,{power:true});comeback(x,dt);waterDeath(x,dt);const before=x.e.elapsed;x.m.advanceRanked(dt);
 assert.equal(x.r.state.clams.length,0,'water drop follows existing void removal');assert.equal(x.e.winner,1-team);assert.equal(x.e.reason,'clam-overtime-power-clams-lost');assert.equal(x.m.state,'finish');assert(x.e.elapsed-before<=dt+1e-9);assert.equal(x.r.state.inventories['1'].power,false);
 t.diagnostic(JSON.stringify({hz,team,deathY:x.a.pos.y,endedAt:x.e.elapsed,events:x.events.filter(e=>e.kind!=='special-gain')}));x.dispose();
});
test('small death counts 1/3/7 disappear in water; dry drops retain 1/2/3 and their full ten seconds',async()=>{
 for(const small of [1,3,7])for(const water of [false,true]){
  const x=await env();inventory(x,{small});if(water)waterDeath(x,1/60);else x.a.splat(null,'weapon');x.m.advanceRanked(1/60);
  assert.equal(x.r.state.inventories['1'].small,0);assert.equal(x.r.state.clams.length,water?0:small===1?1:small===3?2:3);
  if(!water){for(const c of x.r.state.clams){assert.equal(c.grounded,true);assert.equal(c.pos[1],0);assert.equal(c.expiresIn,10);}for(let i=0;i<599;i++)x.m.advanceRanked(1/60);assert(x.r.state.clams.length>0);x.m.advanceRanked(1/60);assert.equal(x.r.state.clams.length,0);}
  x.dispose();
 }
});
test('above-void weapon death drops fall through the existing gravity/void path; a supported trench stays supported',async()=>{
 for(const trench of [false,true]){
  const x=await env();inventory(x,{power:true});x.a.pos.set(trench?-17:12,trench?-3:3,0);if(trench){G.time+=1/60;x.a.update(1/60);assert.equal(x.a.alive,true,'supported below-waterline trench is safe');}x.a.splat(null,'weapon');x.m.advanceRanked(1/60);
  assert.equal(x.r.state.clams.length,1);const c=x.r.state.clams[0];assert.equal(c.grounded,trench);assert.equal(c.expiresIn,10);
  if(!trench){assert(c.velocity[1]<0);assert(c.pos[1]<3);for(let i=0;i<120&&x.r.state.clams.length;i++)x.m.advanceRanked(1/60);assert.equal(x.r.state.clams.length,0);}
  x.dispose();
 }
});
test('water death of one power holder does not end overtime while another field power remains',async()=>{
 const x=await env(1);inventory(x,{power:true});const survivor=x.r._newClam('power',1,[5,0,0],{grounded:true,expiresIn:10});comeback(x,1/60);waterDeath(x,1/60);x.m.advanceRanked(1/60);
 assert.equal(x.r.state.clams.length,1);assert.equal(x.r.state.clams[0].id,survivor.id);assert.equal(x.e.winner,null);assert.equal(x.r.state.clams[0].expiresIn,(10-1/60)-1/60);x.dispose();
});
test('power formed at the regulation boundary admits overtime; water death at that boundary does not',async()=>{
 for(const dying of [false,true]){
  const x=await env(1);inventory(x,dying?{power:true}:{small:7});x.e.counts=[50,70];x.e.leader=0;x.r.state.scoredPoints=[50,30];x.e.time=1/60;
  if(dying)waterDeath(x,1/60);else x.r._newClam('small',null,[0,0,0]);x.m.advanceRanked(1/60);
  assert.equal(x.e.overtime,!dying);assert.equal(x.e.winner,dying?0:null);assert.equal(x.r.state.inventories['1'].power,!dying);x.dispose();
 }
});
test('released projectile survives its owner death and scores; dying before the input edge cannot throw',async()=>{
 for(const before of [false,true]){
  const x=await env();inventory(x,{small:1});x.r.state.baskets[0].barrierOpen=true;x.r.state.baskets[0].openTimer=10;
  x.a._rankedInput={throw:true,aim:[0,-.15,1]};if(before)x.a.splat(null,'weapon');x.m.advanceRanked(1/60);x.a._rankedInput.throw=false;
  if(before){assert.equal(x.r.state.clams.length,1);assert.equal(x.r.state.clams[0].thrower,null);assert.equal(x.r.state.clams[0].grounded,true);}else{
   assert.equal(x.r.state.clams[0].thrower,'1');x.a.splat(null,'weapon');for(let i=0;i<60&&x.e.counts[0]===100;i++)x.m.advanceRanked(1/60);assert.equal(x.e.counts[0],97);
  }
  x.dispose();
 }
});
test('match finish clears pending throw and later ranked calls cannot move, score or drop anything',async()=>{
 const x=await env();inventory(x,{small:2});x.a._rankedInput={throw:true,aim:[0,0,1]};x.m.advanceRanked(1/60);x.a._rankedInput.throw=false;x.e.finish(0,'audit-finish');x.m.advanceRanked(1/60);assert.equal(x.m.state,'finish');
 const snap=plain(x.e.snapshot());x.a.splat(null,'weapon');x.a._rankedInput.throw=true;for(let i=0;i<10;i++)x.m.advanceRanked(1/60);assert.deepEqual(plain(x.e.snapshot()),snap);assert.equal(x.a.intent.throw,false);x.dispose();
});
test('same-tick goal closure retains current ordering: late arrival reflects, earlier open arrival scores',async()=>{
 for(const expires of [true,false]){
  const x=await env();const b=x.r.state.baskets[0];b.barrierOpen=true;b.openTimer=expires?1/60:2/60;b.chancePoints=20;
  x.r._newClam('small',null,[0,.55,2.9],{grounded:false,thrower:'1',ownerTeam:0,velocity:[0,0,12.48]});x.m.advanceRanked(1/60);
  assert.equal(x.e.counts[0],expires?100:97);assert.equal(b.barrierOpen,!expires);if(expires)assert(x.events.some(e=>e.reason==='tucked'));x.dispose();
 }
});
test('scoreless overtime timeout tick still permits a due barrier break to win',async()=>{
 const x=await env();x.e.time=1/60;x.m.advanceRanked(1/60);assert.equal(x.e.overtime,true);x.r.state.overtime.elapsed=180-1/60;x.e.overtimeElapsed=180-1/60;
 const b=x.r.state.baskets[0];b.pendingBreak={remaining:1/60,sequence:0,clamId:'audit-drill',team:0,pos:[0,.55,4]};x.m.advanceRanked(1/60);
 assert.equal(x.e.winner,0);assert.equal(x.e.reason,'clam-overtime-score');assert.equal(x.e.counts[0],80);x.dispose();
});

test('airborne death-drop snapshot restores and host migration continues the same void loss',async()=>{
 const x=await env(1);inventory(x,{power:true});comeback(x,1/60);x.a.pos.set(12,3,0);x.a.splat(null,'weapon');x.m.advanceRanked(1/60);assert.equal(x.r.state.clams[0].grounded,false);
 const follower=new f.RankedEngine('clams',stage);assert.equal(follower.restore(x.e.snapshot()),true);const atDrop=plain(x.e.snapshot());assert.deepEqual(plain(follower.snapshot()),atDrop);
 for(let i=0;i<120&&x.e.winner===null;i++){const frame=f.buildFrame(x.m,f);x.e.update(1/60,frame);follower.update(1/60,{...frame,actors:plain(frame.actors),inputs:plain(frame.inputs)});assert.deepEqual(plain(follower.snapshot()),plain(x.e.snapshot()));}
 assert.equal(x.e.winner,0);assert.equal(x.e.reason,'clam-overtime-power-clams-lost');assert.equal(follower.restore(x.e.snapshot()),true);assert.equal(follower.winner,0);x.dispose();
});

test('current death-blast metadata and splat credit are unchanged by carried clams on land and in water',async()=>{
 for(const water of [false,true]){
  const traces=[];
  for(const held of [false,true]){
   const x=await env(0),enemy=await f.make(1);enemy.nid=2;x.m.actors.push(enemy);enemy.pos.set(5,0,0);if(held)inventory(x,{power:true});
   const stamps=[],native=G.paint.splat;G.paint.splat=(point,radius,team,opts)=>{stamps.push({point:point.toArray(),radius,team,seed:opts.seed,paintDeath:Array.from(opts.paintDeath||[]),claimOwner:opts.claimOwner?.nid??null});return 0;};
   try{if(water){x.a.invuln=0;x.a.damage(1,enemy,'weapon');assert.equal(x.a.lastAttackerHitAge,0,'real damage establishes attribution');waterDeath(x,1/60);}else x.a.splat(enemy,'weapon');x.m.advanceRanked(1/60);}finally{G.paint.splat=native;}
   assert.equal(x.a.alive,false);assert.equal(enemy.stats.splats,1);assert.equal(stamps.length,11);for(const s of stamps){assert.equal(s.paintDeath.length,9,'new main death metadata preserved');assert.equal(s.paintDeath[0],1);assert.equal(s.paintDeath[2],2);}
   assert.equal(x.r.state.clams.length,held&&!water?1:0);traces.push(stamps);x.dispose();
  }
  assert.deepEqual(traces[0],traces[1]);
 }
});


test('native browser void callback uses the actual Actor, Match and World for both water and ten-second floor control',async t=>{
 const source=fs.readFileSync(new URL('../../../scripts/check-inkwave-ranked-browser.mjs',import.meta.url),'utf8');
 const body=source.match(/\/\/ BEGIN CLAM VOID DROP PROOF[^\n]*\n([\s\S]*?)\/\/ END CLAM VOID DROP PROOF/)?.[1];assert(body);
 const globals={level:G.level,physics:G.physics,time:G.time};let x;
 try{
  G.level=new f.Level(f.TIDEWATER);G.physics=new f.Physics(G.level);
  const run=vm.runInNewContext(`(${body.trim()})`);x=await env();const other=await f.make(1);other.nid=2;other.pos.set(5,0,0);x.m.actors.push(other);
  const saved={ranked:x.m.ranked,actors:x.m.actors,state:x.m.state};
  const receipt=run(G,f.RankedEngine,f.PLAYER);
  assert.equal(receipt.rows.length,2);assert.deepEqual(Array.from(receipt.rows,r=>r.kind),['floor','water']);assert(receipt.searches<=625);
  assert.equal(receipt.rows[0].aliveAtTick599,true);assert.equal(receipt.rows[0].expiredAtTick600,true);assert.equal(receipt.rows[1].clams,0);
  for(const k of Object.keys(saved))assert.equal(x.m[k],saved[k],'native callback restores '+k);
  t.diagnostic(JSON.stringify(receipt));
 }finally{x?.dispose();Object.assign(G,globals);}
});
