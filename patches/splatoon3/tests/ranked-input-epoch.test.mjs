import assert from 'node:assert/strict';
import test from 'node:test';
import {fixture} from '../../network-replication/tests/robustness-fixture.mjs';
const f=await fixture({productionComposition:true,includeMatch:true,rankedNetwork:true});

function rig(label,{power=[0,0,0],blocked=()=>false}={}){
 f.clock.set(1000); f.G.time=1000;
 const nm=f.makeNetMatch(f.makeSession('me','me'),{id:'1648-'+label});
 const a=f.makeActor({nid:0,owner:'p2',remote:true,roller:false});a.pos.set(0,0,0);a.grounded=true;
 const m=f.bind(nm,[a]);f.G.match=m;m.mode='clams';
 m.ranked=new f.RankedEngine('clams',{id:'fixture',clams:{spawns:[],goals:[[0,1,30],[0,1,-30]]}});
 m.rankedWorld={zoneCoverage:()=>[],floorAt:()=>0,blocked};m.rankedBarrierHits=[];m.rankedGains=[0,0];m.playRankedEvents=()=>{};
 const rule=m.ranked.rule;rule.state.clams=[{id:'field-power',kind:'power',team:0,pos:power,velocity:[0,0,0],grounded:true,age:0,expiresIn:null,persistent:false,counterPower:false,thrower:null,pass:false,bounces:0}];
 let seq=0,packets=0,ticks=0;
 function send(pos=[0,0,0],{throwClam=false,from='p2',flags=17,tp=0,mutate=null,life=0,ts=f.clock.now()}={}){
  const row=f.packActor(a,{x:pos[0],y:pos[1],z:pos[2],f:flags,tp});if(mutate)mutate(row);
  const d={k:'t',ts,r:2,u:Math.round(ts*60),l:{0:life},a:[row],rki:{match:nm.cfg.id,id:'0',seq:++seq,fire:false,throw:throwClam,aim:[0,0,1],special:null,specialDeployed:false,clamDrop:0}};
  nm.onMessage(from,f.parseWire(JSON.stringify(d)));packets++;return d;
 }
 function tick(n=1){for(let i=0;i<n;i++){f.clock.advance(1/60);f.G.time=f.clock.now();nm.update(1/60);nm.applyRemote(a,1/60);m.ranked.update(1/60,f.buildFrame(m,f));ticks++;}}
 function result(){return {label,packets,ticks,actorPos:a.pos.toArray(),rankedPose:nm.rankedPose?.get('0')??null,inventory:rule.state.inventories['0']??null,counts:[...m.ranked.counts],events:JSON.parse(JSON.stringify(m.ranked.events)),buffer:a.net.buf.map(s=>({t:s.t,p:s.p?.toArray?.()??s.p})),field:JSON.parse(JSON.stringify(rule.state.clams))};}
 return {nm,a,m,rule,send,tick,result};
}


function packet(r,{seq=null,life=0,from=r.a.owner,throwClam=true,drop=7,special=r.a.weapon.special}={}){
 f.clock.advance(.05);f.G.time=f.clock.now();
 const d={k:'t',ts:f.clock.now(),r:2,u:Math.round(f.clock.now()*60),l:{0:life},a:[f.packActor(r.a,{x:0,y:0,z:0,f:17,tp:0})]};
 if(seq!==null)d.rki={match:r.nm.cfg.id,id:'0',seq,fire:true,throw:throwClam,aim:[0,0,1],special,specialDeployed:true,clamDrop:drop};
 r.nm.onMessage(from,f.parseWire(JSON.stringify(d)));
}
function change(r,kind){
 if(kind==='owner')r.a.owner='p3';
 if(kind==='session')r.nm.s={...r.nm.s};
 if(kind==='matchId')r.nm.cfg={...r.nm.cfg,id:r.nm.cfg.id+'-next'};
 if(kind==='match'){r.m={...r.m};r.nm.match=r.m;f.G.match=r.m;}
 if(kind==='actor'){const a=f.makeActor({nid:0,owner:'p2',remote:true,roller:false});a.pos.set(0,0,0);a.grounded=true;r.a=a;r.m.actors=[a];r.nm.byNid.set(0,a);r.nm._setupActor(a);}
 return kind==='life'?1:0;
}
const frame=r=>f.buildFrame(r.m,f);
for(const kind of ['owner','life','session','actor','match','matchId'])test('ranked input epoch '+kind+' rejects old edges and accepts fresh seq1',()=>{
 const r=rig(kind);try{
  packet(r,{seq:9});assert.equal(r.nm.rankedInputs.get('0').throw,true);
  const life=change(r,kind);packet(r,{life});
  const empty=frame(r);assert.equal(empty.actors[0].alive,true,'new native pose admitted');
  assert.equal(empty.inputs['0'],undefined,'old epoch cannot fire/throw/aim');
  assert.equal(empty.actors[0].special,null,'old guest special absent');assert.equal(empty.actors[0].clamDrop,0,'old drop counter absent');
  packet(r,{seq:1,life,drop:1});const fresh=frame(r);
  assert.equal(fresh.inputs['0'].throw,true,'first valid new epoch edge retained');assert.equal(fresh.inputs['0'].fire,true);
  assert.equal(fresh.actors[0].special,r.a.weapon.special);assert.equal(fresh.actors[0].clamDrop,1,'no old max counter contamination');
  assert.equal(r.nm.rankedInputs.get('0').seq,1);
  assert.equal(frame(r).inputs['0'].throw,false,'edge consumed exactly once');
 }finally{r.nm.dispose();}
});
test('same epoch fresh pose preserves pending edge and monotonic sequence',()=>{
 const r=rig('same');try{
  packet(r,{seq:9});packet(r);const held=frame(r);assert.equal(held.inputs['0'].throw,true);assert.equal(held.actors[0].clamDrop,7);
  assert.equal(frame(r).inputs['0'].throw,false);
  packet(r,{seq:8,drop:1});assert.equal(r.nm.rankedInputs.get('0').seq,9);assert.equal(frame(r).inputs['0'].throw,false);
  packet(r,{seq:10,drop:8});assert.equal(frame(r).inputs['0'].throw,true);assert.equal(r.nm.rankedInputs.get('0').clamDrop,8);
 }finally{r.nm.dispose();}
});
test('native first new-life packet retains its own edge without merging old edge',()=>{
 const r=rig('new-life-input');try{
  packet(r,{seq:9});packet(r,{seq:1,life:1,throwClam:false,drop:1,special:null});
  const next=frame(r);assert.equal(next.actors[0].alive,true);assert.equal(next.inputs['0'].throw,false);
  assert.equal(next.actors[0].special,null);assert.equal(next.actors[0].clamDrop,1);assert.equal(r.nm.rankedInputs.get('0').seq,1);
 }finally{r.nm.dispose();}
});
for(const life of [null,-1,0])test('invalid or stale life input cannot pregrant a future epoch '+life,()=>{
 const r=rig('invalid-'+life);try{
  packet(r,{seq:1,life:1,throwClam:false,drop:0,special:null});
  const before=r.nm.rankedInputs.get('0');
  packet(r,{seq:99,life});
  assert.equal(r.nm.rankedInputs.get('0'),before);assert.equal(frame(r).inputs['0'].throw,false);
 }finally{r.nm.dispose();}
});

// Pure capability controls use a separate module instance from the native VM.
import {bindRankedInput,rankedInputFor} from '../runtime/ranked/pose-admission.mjs';
test('unbound/null and observed retired input capabilities cannot revive',()=>{
 const actor={owner:'p2',net:{lastLife:0}},match={},nm={s:{},match,cfg:{id:'fixture'}};
 assert.equal(bindRankedInput(true,actor,match,nm),null);
 assert.equal(bindRankedInput({}, {...actor,owner:null},match,nm),null);
 const input=bindRankedInput({seq:1},actor,match,nm);
 assert.equal(rankedInputFor({...input},actor,match,nm),null);
 assert.equal(rankedInputFor(input,actor,match,nm),input);
 actor.owner='p3';assert.equal(rankedInputFor(input,actor,match,nm),null);
 actor.owner='p2';assert.equal(rankedInputFor(input,actor,match,nm),null);
 assert.deepEqual(JSON.parse(JSON.stringify(input)),{seq:1},'identity capabilities are not wire fields');
});
