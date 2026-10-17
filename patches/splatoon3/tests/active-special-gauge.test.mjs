import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:`
 export {specialGaugeLocked} from './patches/splatoon3/runtime/tacticooler-gauge.mjs';
 export {interruptSpecialForObjective} from './patches/splatoon3/runtime/all-specials.mjs';
 export {advanceTenacity as advanceActorTenacity} from './patches/splatoon3/runtime/tenacity.mjs';
 export {advanceTenacity as advanceMatchTenacity} from './patches/local-quality/tenacity.mjs';
 export {Match} from './inkwave-public/src/game/match.js';
 export {BotBrain} from './inkwave-public/src/game/bots.js';
 export {NetSession} from './inkwave-public/src/net/session.js';
 export {installRanked} from './patches/splatoon3/runtime/ranked/install.mjs';
 export {RankedEngine} from './patches/splatoon3/runtime/ranked/engine.mjs';
 export {acceptState} from './patches/splatoon3/runtime/ranked/network.mjs';
`});
const IDS=['booyahBomb','ultraStamp','inkjet','krakenRoyale','tripleInkstrike','zipcaster'];
const near=(got,want,label)=>assert.ok(Math.abs(got-want)<1e-8,`${label}: ${got} != ${want}`);
function world(id,saver=false,power=0){
 const {G}=f;G.projectiles.clear();G.actors=[];G.time=0;G.net=G.netm=null;G.mode='match';
 G.match={mode:'zones',state:'playing',time:180,playing:()=>true,canRespawn:()=>false};
 G.level=new f.Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-80,0,0],[80,0,0]],spawnBarrier:0,
  single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]}],half:[]});G.physics=new f.Physics(G.level);
 G.paint={sample:()=>0,splat:()=>0};
 const a=f.make(),enemy=f.make();enemy.team=1;enemy.pos.set(50,0,50);enemy.invuln=0;
 Object.assign(a,{nid:7,owner:'local',isLocal:true,netLife:3,invuln:0});
 a.s3.loadout=power===57?Array.from({length:3},()=>({main:'specialPower',subs:Array(3).fill('specialPower')})):f.emptyLoadout();
 if(saver)a.s3.loadout[0].main='specialSaver';a.s3RefreshGear();
 a.weapon={...a.weapon,special:id,specialCost:100};a.special=100;
 a.intent.fire=a.intent.sub=a.intent.squid=a.intent.jump=a.intent.booyah=false;a._prevIntent={};
 a._startSpecial();assert.equal(a.specialActive?.id,id);return {G,a,enemy};
}
function tick(a,count,hz=60){for(let i=0;i<count;i++){f.G.time+=1/hz;a._updateSpecial(1/hz);}}
function fraction(s){return s.id==='zipcaster'?s.inkFuel/150:Math.max(0,1-s.t/s.duration);}
for(const hz of [30,60,120])test(`six native active gauges stop on death before ordinary loss / Special Saver at ${hz}Hz`,()=>{
 for(const id of IDS)for(const saver of [false,true]){
  const {a}=world(id,saver);near(a.special,100,`${id} begins with its reserved gauge`);assert.equal(a.specialReady(),false);
  const before=a.stats.specials;a._startSpecial();assert.equal(a.stats.specials,before,'reserved gauge cannot start a second action');
  tick(a,hz,hz);const state=a._s3AllSpecialState,remaining=100*fraction(state),keep=a.s3.modifiers.specialSaver;
  assert.ok(remaining>0&&remaining<100);near(a.special,remaining,`${id} canonical action depletion`);
  if(saver)assert.ok(keep>.5,'real equipped Special Saver changes the native death multiplier');
  a.splat(null,'water');assert.equal(a.alive,false);assert.equal(a.specialActive,null);
  near(a.special,remaining*keep,`${id} passes remaining points to existing gear.splat`);
  assert.equal(f.specialGaugeLocked(a),false,'death ends body depletion instead of creating a deployed lock');
  const death=a.special;for(let i=0;i<20;i++)a.update(1/hz);near(a.special,death,'no stale body timer consumes saved charge');
 }
});
test('Zipcaster gauge includes the actual native shot and successful hook ink debits',()=>{
 const {a}=world('zipcaster');const state=a._s3AllSpecialState;
 a.intent.fire=true;tick(a,10);assert.ok(state.inkFuel<150-state.inkDrainPerSecond*10/60,'native runner spends from the special tank');
 near(a.special,100*state.inkFuel/150,'main debit updates native gauge in the same frame');
 a.intent.fire=false;f.G.physics.raycast=(origin,direction,length,hit)=>{
  hit.hit=true;hit.dist=5;hit.point.copy(origin).addScaledVector(direction,5);hit.normal.set(0,0,-1);return hit;
 };
 const before=state.inkFuel;a.intent.sub=true;tick(a,1);assert.equal(state.phase,'hookFlight');
 near(before-state.inkFuel,state.inkDrainPerSecond/60+state.hookInkCost,'only a successful hook consumes source hook ink');
 near(a.special,100*state.inkFuel/150,'hook debit updates native gauge immediately');
});
for(const hz of [30,60,120])test(`Zipcaster lifetime follows the source tank/drain and a last empty hook reaches impact at ${hz}Hz`,()=>{
 for(const [power,seconds]of [[0,10],[57,12.5]]){
  const {a}=world('zipcaster',false,power),state=a._s3AllSpecialState;
  near(state.inkDrainPerSecond,power===0?15:12,'source per-second tank cost');
  tick(a,9*hz,hz);assert.equal(a.specialActive?.id,'zipcaster','raw 540 is not a hard active cutoff');assert.ok(state.inkFuel>0);
  tick(a,Math.round((seconds-9)*hz)-1,hz);assert.equal(a.specialActive?.id,'zipcaster','one scheduler frame before tank exhaustion');
  tick(a,1,hz);assert.equal(a.specialActive,null);assert.ok(a.superJumpState);near(a.special,0,'exhausted reserve');
 }
 const {G,a,enemy}=world('zipcaster'),state=a._s3AllSpecialState,impacts=[];
 G.physics.raycast=(origin,direction,length,hit)=>{hit.hit=true;hit.dist=20;hit.point.copy(origin).addScaledVector(direction,20);hit.normal.set(0,0,-1);return hit;};
 const off=f.on('all:special',e=>{if(e.actor===a&&e.action==='hookImpact')impacts.push(e);});
 try{
  state.inkFuel=1;assert.ok(state.inkFuel<state.hookInkCost,'last hook has less than its full cost');a.intent.sub=true;tick(a,1,hz);
  assert.equal(state.phase,'hookFlight');near(state.inkFuel,0,'last hook clamps at zero');near(a.special,0,'visible/native gauge is empty');
  assert.equal(a.superJumpState,null,'hook flight does not recall prematurely');a.intent.sub=false;
  let pulled=false,steps=0;enemy.pos.copy(state.zipTarget);enemy.pos.y-=.75;enemy.hp=500;
  while(a.specialActive&&steps++<2*hz){
   tick(a,1,hz);if(state.phase==='zip')pulled=true;
   if(a.specialActive){assert.equal(a.superJumpState,null);assert.equal(impacts.length,0,'only actual arrival emits the landing blast');}
  }
  assert.ok(pulled,'a zero-ink hook still uses the actual player pull');assert.ok(steps<2*hz);
  assert.equal(impacts.length,1,'arrival blast is retained exactly once before recall');assert.ok(enemy.hp<500,'the impact still uses actual damage');
  assert.ok(a.superJumpState);assert.equal(a.specialActive,null);near(a.pos.distanceTo(state.zipTarget),0,'recall begins only at hook destination');
 }finally{off?.();}
});
test('turf, both Tenacity lanes, Ranked gain and cheer cannot refill an active gauge or repay it later',()=>{
 const {G,a}=world('ultraStamp');tick(a,60);const remaining=a.special,turf=a.stats.turf;
 a.addTurf(9);near(a.stats.turf-turf,9,'paint score remains native');near(a.special,remaining,'paint earns no charge');
 a.s3.loadout[0].main='tenacity';const extra=f.make();extra.team=1;G.match.actors=G.actors;
 // The runner uses this same temporary mask for a legal native shot. Keep
 // suppression tied to the private action state across that exact interval.
 const token=a.specialActive;a.specialActive=null;
 try{
  a.addTurf(7);near(a.special,remaining,'runner masking cannot allow delayed paint charge');
  near(f.advanceActorTenacity(a,1/60,f),0,'actor Tenacity');f.advanceMatchTenacity(G.match,1/60,f.emit);near(a.special,remaining,'match Tenacity');
  const caster=f.make();Object.assign(caster,{remote:true,nid:11,netLife:4,s3CatalogueBooyah:{activation:9}});
  const cheer={actor:a,id:'booyahBomb',action:'cheer',activation:9,ownerNid:11,ownerLife:4,seed:101,call:1};
  f.emit('all:special',cheer);near(a.special,remaining,'cheer nocharge');
  f.context.structuredClone=structuredClone;f.installRanked({...f.installedRuntime,Match:f.Match,BotBrain:f.BotBrain,NetSession:f.NetSession,structuredClone});
  const m=G.match;m.ranked=new f.RankedEngine('zones',{id:'active-gauge',zones:[{center:[0,0,0],size:[6,6]}]});
  m.rankedGains=[0,0];m.rankedWorld={update(){}};m.rankedEffects={event(){}};
  f.Match.prototype.playRankedEvents.call(m,[{kind:'special-gain',team:0,points:10}]);near(a.special,remaining,'host Ranked gain');
  const host=new f.RankedEngine('zones',{id:'active-gauge',zones:[{center:[0,0,0],size:[6,6]}]});host.revision=2;
  assert.equal(f.acceptState({match:m,cfg:{id:'g'},s:{hostId:'host'}},{match:'g',host:'host',state:host.snapshot(),gains:[20,0]}),true);
  near(a.special,remaining,'follower Ranked gain');
  a.specialActive=token;f.interruptSpecialForObjective(f.installedRuntime,a);near(a.special,0,'objective pickup consumes remainder');
  f.emit('all:special',cheer);near(a.special,0,'duplicate cheer earned during depletion stays consumed');
  f.emit('all:special',{...cheer,seed:102,call:2});near(a.special,3,'new eligible cheer may earn points after completion');
 }finally{if(a._s3AllSpecialState)a.specialActive=token;}
});
test('body gauge clocks cannot overwrite remote, new-owner, new-life or new-match native points',()=>{
 for(const boundary of ['remote','owner','life','snapshot-life','match']){
  const {G,a}=world('inkjet');tick(a,20);a.special=17;
  if(boundary==='remote')a.remote=true;
  else if(boundary==='owner')a.owner='new-owner';
  else if(boundary==='life')a.netLife++;
  else if(boundary==='snapshot-life')a.net={lastLife:8};
  else G.match={...G.match};
  assert.equal(f.specialGaugeLocked(a),false,boundary);a._updateSpecial(1/60);
  near(a.special,17,`${boundary} receives no write from the old action`);
  if(boundary==='remote')a.remote=false;
  a.update(1/60);near(a.special,17,`${boundary} cannot revive an old action clock`);
 }
});
test('early throws and third Inkstrike release empty the native remainder while committed projectiles survive',()=>{
 for(const id of ['booyahBomb','ultraStamp','tripleInkstrike']){
  const {G,a}=world(id);tick(a,30);if(id==='booyahBomb')a._s3AllSpecialState.charge=1;
  const count=id==='tripleInkstrike'?3:1;
  for(let i=0;i<count;i++){
   a.intent.sub=true;tick(a,1);a.intent.sub=false;tick(a,1);
   for(let n=0;n<60&&a.specialActive;n++)tick(a,1);
  }
  assert.equal(a.specialActive,null,id);near(a.special,0,`${id} early finish consumes remainder`);
  assert.ok(G.projectiles.list.some(p=>p.s3AllSpecial===id)||(G.projectiles._s3AllSpecialObjects||[]).some(o=>o.id===id),'the committed attack survives native gauge completion');
  a.addTurf(4);near(a.special,4,'only new post-completion turf may refill');
 }
});
test('timeout, objective pickup, reset and world clear empty tracked points, without changing Crab or Reef',()=>{
 for(const id of IDS)for(const finish of ['timeout','objective','reset','clear']){
  const {G,a}=world(id);tick(a,20);assert.ok(a.special>0);
  if(finish==='timeout'){let limit=0;while(a.specialActive&&limit++<720)tick(a,1);assert.equal(a.specialActive,null,`${id} really completes`);}
  else if(finish==='objective')f.interruptSpecialForObjective(f.installedRuntime,a);
  else if(finish==='reset')a.reset();
  else {G.actors=[];G.projectiles.clear();assert.equal(a.specialActive,null,'clear retires the canonical action even after roster removal');}
  near(a.special,0,`${id}/${finish}`);assert.equal(f.specialGaugeLocked(a),false,`${id}/${finish}`);
 }
 for(const id of ['crabTank','reefslider']){const {a}=world(id);near(a.special,0,`${id} previous consumption unchanged`);}
});
test('a temporary native point-cost change preserves the canonical active fraction',()=>{
 const {a}=world('ultraStamp');tick(a,60);a.weapon={...a.weapon,specialCost:200};tick(a,1);
 near(a.special/200,fraction(a._s3AllSpecialState),'depletion uses current native point denomination');
 const before=a.special;a.splat(null,'water');near(a.special,before*.5,'death operates on the same denomination');
});
