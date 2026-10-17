import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
function world(){
 const {G}=f;G.projectiles.clear();G.actors=[];G.netm=null;G.net=null;G.time=0;G.mode='match';
 G.match={state:'playing',mode:'turf',playing:()=>true,canRespawn:()=>false};G.paint={sample:()=>0,splat:()=>0};
 G.level=new f.Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-80,0,0],[80,0,0]],spawnBarrier:0,
  single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]}],half:[]});G.physics=new f.Physics(G.level);
 const a=f.make(),v=f.make();v.team=1;v.hp=1000;v.invuln=0;v.pos.set(0,0,20);
 Object.assign(a,{nid:77,owner:'owner',invuln:0});a.weapon={...a.weapon,special:'killerWail',specialCost:100};a.special=100;
 a.aimYaw=0;a.aimPitch=0;a.aimPoint.set(0,.75,100);a._startSpecial();
 return {G,a,v};
}
for(const hz of [30,60,120])test(`Killer Wail follows the interpolated 0.5-second target trace at ${hz}Hz`,()=>{
 const {G,a,v}=world(),lasers=[];
 const off=f.on('all:special',e=>{if(e.actor===a&&e.action==='laser'&&e.index===0)lasers.push(e);});
 try{
  for(let i=1;i<=2*hz;i++){G.time=i/hz;v.pos.x=2*G.time;a._updateSpecial(1/hz);}
  const chosen=lasers.filter(e=>e.tick>=10&&e.tick<=15);assert.ok(chosen.length>=5);
  for(const e of chosen){
   const first=a._s3AllSpecialState.beamPairs[0],sourceTime=first.start+e.tick*5/60;
   const [x,y,z]=e.pos,[ex,ey,ez]=e.target;
   const atTargetZ=x+(ex-x)*(20-z)/(ez-z); // emitted endpoints use native two-decimal wire quantization
   assert.ok(Math.abs(atTargetZ-2*(sourceTime-.5))<2e-4,`tick ${e.tick} must aim at the delayed path, got ${atTargetZ}`);
  }
 }finally{off?.();}
});
for(const hz of [30,60,120])test(`Killer Wail's launched pair continues after death and expires once at ${hz}Hz`,()=>{
 const {G,a,v}=world(),events=[];
 const off=f.on('all:special',e=>{if(e.actor===a)events.push(e);});
 try{
  for(let i=0;i<hz;i++){G.time+=1/hz;a._updateSpecial(1/hz);}
  assert.equal(a._s3AllSpecialState.beamPairs.length,1);a.splat(v,'shooter');
  assert.equal(a.alive,false);assert.equal(a.specialActive,null);assert.equal(G.projectiles._s3WailTails.length,1);
  const before=v.hp,afterDeath=events.length;
  for(let i=0;i<hz*4;i++){G.time+=1/hz;G.projectiles.update(1/hz);}
  const later=events.slice(afterDeath).filter(e=>e.action==='laser');
  assert.ok(later.length>0);assert.ok(v.hp<before,'committed lasers still use actual Projectiles.applyHit after owner death');
  assert.ok(later.every(e=>e.index<2),'death prevents the unlaunched second and third pairs');
  assert.equal(events.filter(e=>e.action==='laser'&&e.index===0).length,36,'180F / 5F gives 36 ticks for the one committed beam');
  assert.equal(G.projectiles._s3WailTails.length,0,'the independent pair has a bounded source lifetime');
  const count=events.length;G.projectiles.update(1/60);assert.equal(events.length,count);
 }finally{off?.();}
});
test('Wail tails cease authority on ownership handoff and are removed by world teardown',()=>{
 const {G,a,v}=world();for(let i=0;i<60;i++)a._updateSpecial(1/60);a.splat(v,'shooter');a.remote=true;
 const before=v.hp;G.projectiles.update(1/60);assert.equal(v.hp,before);assert.equal(G.projectiles._s3WailTails.length,0);
 const next=world();for(let i=0;i<60;i++)next.a._updateSpecial(1/60);next.a.splat(next.v,'shooter');
 assert.equal(G.projectiles._s3WailTails.length,1);G.projectiles.clear();assert.equal(G.projectiles._s3WailTails.length,0);
});
for(const hz of [30,60,120])test(`Wail's native Super Jump stops new pairs, keeps fired beams and clears remaining gauge on landing at ${hz}Hz`,()=>{
 const {G,a,v}=world();
 G.paint.splat=()=>6;
 for(let i=0;i<hz;i++){G.time+=1/hz;a._updateSpecial(1/hz);}
 assert.ok(a.special>0&&a.special<100,'Wail consumes its reserved gauge gradually');
 assert.equal(a.canSuperJump(),true);assert.equal(a.superJump(new f.THREE.Vector3(0,0,0)),true);
 assert.equal(a.specialActive,null);assert.equal(a.superJumpState.phase,'charge');assert.equal(a.form,'squid');
 assert.equal(G.projectiles._s3WailTails[0].state.beamPairs.length,1);
 const initial=a.special,events=[],off=f.on('all:special',e=>{if(e.actor===a&&e.action==='laser')events.push(e);});
 try{
  let count=0;while(a.superJumpState&&count++<hz*6){G.time+=1/hz;
   const before=a.special;a.addTurf(4);assert.equal(a.special,before,'delayed turf cannot refill Wail during Super Jump');
   a._updateSuperJump(1/hz);G.projectiles.update(1/hz);}
  assert.equal(a.superJumpState,null,'the real native charge/flight reaches its destination');assert.ok(count<hz*6);
  assert.equal(a.special,0,'landing consumes the Wail remainder before its ordinary duration');
  assert.ok(events.length>0);assert.ok(events.every(e=>e.index<2),'no second or third pair launches during the jump');
  assert.ok(initial>0);assert.ok(v.hp<1000);
 }finally{off?.();}
});
test('world clear without Actor reset retires Wail and cannot relaunch old pairs on the next frame',()=>{
 const {G,a}=world(),events=[],off=f.on('all:special',e=>{if(e.actor===a&&e.action==='laser')events.push(e);});
 try{
  for(let i=0;i<50;i++){G.time+=1/60;a._updateSpecial(1/60);}
  assert.equal(a._s3AllSpecialState.beamPairs.length,1);assert.ok(events.length>0);
  G.projectiles.clear();assert.equal(a.specialActive,null);assert.equal(a._s3AllSpecialState,null);assert.equal(a.special,0);
  const count=events.length;
  for(let i=0;i<30;i++){G.time+=1/60;a.update(1/60);G.projectiles.update(1/60);}
  assert.equal(G.projectiles._s3WailTails.length,0);assert.equal(events.length,count,'no post-clear laser can respawn from an old actor state');
 }finally{off?.();}
});
test('Wail cannot re-author old pairs after owner, life or match replacement',()=>{
 for(const boundary of ['owner','life','snapshot-life','match']){
  const {G,a}=world(),events=[],off=f.on('all:special',e=>{if(e.actor===a&&e.action==='laser')events.push(e);});
  try{
   for(let i=0;i<50;i++){G.time+=1/60;a._updateSpecial(1/60);}
   assert.equal(a._s3AllSpecialState.beamPairs.length,1);const count=events.length;a.special=17;
   if(boundary==='owner')a.owner='replacement';
   else if(boundary==='life')a.netLife=(a.netLife||0)+1;
   else if(boundary==='snapshot-life')a.net={lastLife:8};
   else G.match={...G.match};
   // An accepted replacement token must remain owned by the receiver.
   const replacement={...a.specialActive,t:0};a.specialActive=replacement;
   for(let i=0;i<20;i++){G.time+=1/60;a.update(1/60);G.projectiles.update(1/60);}
   assert.equal(a.specialActive,replacement,boundary);assert.equal(a.special,17,boundary);
   assert.equal(G.projectiles._s3WailTails?.length||0,0,boundary);assert.equal(events.length,count,`${boundary}: no old pair is captured under the new authority`);
  }finally{off?.();}
 }
 const {G,a,v}=world();for(let i=0;i<50;i++)a._updateSpecial(1/60);a.splat(v,'shooter');
 assert.equal(G.projectiles._s3WailTails.length,1);G.match={...G.match};G.projectiles.update(1/60);
 assert.equal(G.projectiles._s3WailTails.length,0,'an already committed dead-owner tail also cannot cross matches');
});
test('rejected Super Jump retains Wail state; death stops its gauge clock without erasing committed lasers',()=>{
 const {G,a,v}=world();for(let i=0;i<60;i++)a._updateSpecial(1/60);const token=a.specialActive;
 assert.equal(a.superJump({x:NaN,y:0,z:0}),false);assert.equal(a.specialActive,token);assert.equal(G.projectiles._s3WailTails?.length||0,0);
 a.splat(v,'shooter');const remainder=a.special;assert.ok(remainder>0);
 for(let i=0;i<120;i++){G.time+=1/60;G.projectiles.update(1/60);}
 assert.equal(a.special,remainder,'only the normal death saver changes the remaining gauge');
 const crab=world().a;crab.specialActive={id:'crabTank'};assert.equal(crab.canSuperJump(),false,'Crab retains native jump rejection');
});
test('a committed Wail lock cannot acquire a later respawn of the same native Actor',()=>{
 const {G,a,v}=world();for(let i=0;i<60;i++){G.time+=1/60;a._updateSpecial(1/60);}
 const pair=a._s3AllSpecialState.beamPairs[0],last=Array.from(pair.trace.at(-1).pos.toArray());
 v.splat(a,'shooter');a._updateSpecial(1/60);assert.equal(pair.targetRetired,true);v.respawn();
 for(let i=0;i<15;i++){G.time+=1/60;a._updateSpecial(1/60);}
 assert.deepEqual(Array.from(pair.trace.at(-1).pos.toArray()),last);
 assert.notDeepEqual(Array.from(v.pos.toArray()),last,'the test actually respawned the reused Actor at a different place');
});
test('Wail launches six distinct yaw-rotated source-radius origins and locks their world coordinates',()=>{
 const {G,a}=world();a.pos.set(3,0,4);a.aimYaw=Math.PI/2;a.aimPoint.set(30,.75,4);
 for(let i=0;i<110;i++){G.time+=1/60;a._updateSpecial(1/60);}
 const origins=a._s3AllSpecialState.beamPairs.flatMap(p=>p.origins),positions=origins.map(p=>Array.from(p.toArray()));
 assert.equal(new Set(positions.map(p=>p.join(','))).size,6);
 for(const o of origins){assert.ok(Math.abs(o.x-(3-.6))<1e-10);assert.ok(Math.abs(Math.hypot(o.z-4,o.y-1.7)-1.3)<1e-10);}
 a.pos.set(20,0,20);a._updateSpecial(1/60);
 assert.deepEqual(origins.map(p=>Array.from(p.toArray())),positions,'subsequent actor movement never relocates the speakers');
});
