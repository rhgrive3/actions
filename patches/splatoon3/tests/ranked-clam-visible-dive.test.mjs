import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {sourceLoadedActorFixture} from './source-loaded-actor-fixture.mjs';
const STAGE={id:'clam-staged-visible-return',clams:{spawns:[],goals:[[0,0,80],[0,0,-80]]}},clean=x=>JSON.parse(JSON.stringify(x));
const input=()=>({keys:new Set(),pressed:new Set(),padPressed:new Set(),mouse:{dx:0,dy:0,left:false,right:false},down(k){return this.keys.has(k);},wasPressed(k){return this.pressed.has(k);},padButton:()=>false,padValue:()=>0});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const banks=c=>[c.sourceMotion.bank,c.sourceMotion.squidBank].map(b=>({data:hash(Buffer.from(b.data.buffer,b.data.byteOffset,b.data.byteLength)),meta:hash(JSON.stringify(b.meta))}));
test('Controller rethrows during partial return and hidden swim preserve all displayed bones and source banks at 30/60/120Hz',async t=>{
 const f=await sourceLoadedActorFixture({random:()=>.5,extraExports:`export {RankedWorld} from './patches/splatoon3/runtime/ranked/world.mjs';`}),rows=[];f.G.netm=null;f.G.settings.aimAssist=0;
 for(const hz of [30,60,120]){
  const dt=1/hz,pair=[];
  for(let lane=0;lane<2;lane++){
   const a=await f.make();a.nid=1;a.character.onEvent=null;
   const m=Object.assign(Object.create(f.Match.prototype),{mode:'clams',state:'playing',ranked:new f.RankedEngine('clams',STAGE),actors:[a],local:a,rankedGains:[0,0],rankedBarrierHits:[],rankedEffects:{event(){},update(){}},playing:()=>true,canRespawn:()=>false});
   const world=m.rankedWorld=new f.RankedWorld(f,m,STAGE),raw=input(),rig={yaw:0,pitch:0,mode:'follow',target:a},controller=new f.PlayerController(a,rig,raw);controller.computeAim=()=>{};
   const p={a,m,world,raw,rig,controller,jumps:[],solves:0,calls:0};pair.push(p);
   const solve=a.character._solveLimb;a.character._solveLimb=function(...args){p.solves++;return solve.apply(this,args);};const trigger=a.character.trigger;a.character.trigger=function(name,...args){if(name==='clam-throw')p.calls++;return trigger.call(this,name,...args);};
   m.playRankedEvents=es=>{const wrist=a.character.bones.handL.getWorldPosition(new f.THREE.Vector3()),count=p.solves;const r=f.Match.prototype.playRankedEvents.call(m,lane?es:es.filter(e=>e.kind!=='clam-throw'));
    if(es.some(e=>e.kind==='clam-throw')){p.jumps.push(wrist.distanceTo(a.character.bones.handL.getWorldPosition(new f.THREE.Vector3())));assert.equal(p.solves,count,'No event IK');}return r;};
  }
  const tick=()=>{f.G.time+=dt;for(const p of pair){f.G.match=p.m;f.G.rig=p.rig;p.controller.update(dt);p.a.update(dt);p.m.advanceRanked(dt);p.raw.pressed.clear();}};
  for(let i=0;i<45;i++)tick();const before=pair.map(p=>banks(p.a.character));for(const p of pair)p.m.ranked.rule.state.inventories['1']={team:0,small:4,power:false};
  let hidden=false,partialReturn=null;
  for(let i=1;i<=80;i++){
   for(const p of pair){if([1,7,20,45].includes(i)){p.raw.keys.add('KeyC');p.raw.pressed.add('KeyC');}else p.raw.keys.delete('KeyC');if(i>=4&&i<=6||i>=12&&i<40)p.raw.keys.add('ShiftLeft');else p.raw.keys.delete('ShiftLeft');}
   tick();const a=pair[0].a.character,b=pair[1].a.character;
   if(i===7)partialReturn=b.kidScale;if(b.kidScale<=.001)hidden=true;
   assert.deepEqual(a.boneList.map(x=>x.quaternion.toArray()),b.boneList.map(x=>x.quaternion.toArray()),`all displayed bones tick${i} ${hz}Hz`);
   assert.deepEqual(a.sourceMotion.diveFrom.map(x=>x.q.toArray()),b.sourceMotion.diveFrom.map(x=>x.q.toArray()));
   for(const k of ['P','tr','sp','ikErr'])assert.deepEqual(Array.from(a[k]),Array.from(b[k]));
   assert.ok(a.getMuzzle(new f.THREE.Vector3()).equals(b.getMuzzle(new f.THREE.Vector3())));
   assert.deepEqual(clean(pair[0].m.ranked.snapshot()),clean(pair[1].m.ranked.snapshot()));assert.equal(!!b.s3ClamGripActive,false);assert.equal(pair[0].solves,pair[1].solves);
  }
  assert.ok(hidden,'Fixture reaches a fully hidden human');assert.equal(pair[1].jumps.length,4);assert(pair[1].jumps.every(x=>x===0));assert.equal(pair[1].calls,0);
  assert.deepEqual(pair.map(p=>banks(p.a.character)),before,'No animation bank mutation');assert.deepEqual(before[0],before[1]);
  rows.push({hz,ticks:80,partialReturnScale:partialReturn,hiddenReached:hidden,eventJumps:pair[1].jumps,extraSolves:0,allBoneDifference:0,sourceHistoryDifference:0,bankMutation:false});pair.forEach(p=>p.world.dispose());f.reset();
 }t.diagnostic(JSON.stringify(rows));
});
