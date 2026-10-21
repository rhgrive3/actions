// Real Controller -> Actor -> rule -> installed event consumer. The control
// omits only Clam event notifications; both lanes retain real physical throws.
import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoadedActorFixture} from './source-loaded-actor-fixture.mjs';
const DT=1/60,STAGE={id:'clam-swim-boundary',clams:{spawns:[],goals:[[0,0,80],[0,0,-80]]}},clean=x=>JSON.parse(JSON.stringify(x));
const rawInput=()=>({keys:new Set(),pressed:new Set(),padPressed:new Set(),mouse:{dx:0,dy:0,left:false,right:false},down(k){return this.keys.has(k);},wasPressed(k){return this.pressed.has(k);},padButton:()=>false,padValue:()=>0});
function snapshot(a){const c=a.character;return {pos:a.pos.toArray(),vel:a.vel.toArray(),ink:a.ink,hp:a.hp,alive:a.alive,form:a.form,animForm:a.anim.form,submerged:a.submerged,fireBuffer:a.fireBuffer,weapon:a.weapon.id,P:Array.from(c.P),timers:Array.from(c.tr),springs:Array.from(c.sp),ik:Array.from(c.ikErr),bones:c.boneList.map(b=>b.quaternion.toArray()),source:c.sourceMotion?.diveFrom?.map(b=>b.q.toArray())};}
function muzzle(f,a){const p=new f.THREE.Vector3(),d=new f.THREE.Vector3();f.G.projectiles._muzzle(a,p);f.G.projectiles._aimFrom(a,p,d);return {main:p.toArray(),aim:d.toArray(),left:f.G.projectiles._muzzleHand(a,1,new f.THREE.Vector3()).toArray()};}
for(const source of [false,true])test(`staged Clam has main-only arms through Controller dive/return, duplicate, drop and repeated input (${source?'loaded Player00':'native'})`,async t=>{
 const f=await sourceLoadedActorFixture({random:()=>.5,extraExports:`export {RankedWorld} from './patches/splatoon3/runtime/ranked/world.mjs';`}),rows=[];
 f.G.netm=null;f.G.settings.aimAssist=0;
 for(const scenario of ['quick-return','full-dive','duplicate-drop','late-dive','repeat-return','repeat-switch']){
  const pair=[],shots=[],bombs=[];
  for(let lane=0;lane<2;lane++){
   const a=await f.make();if(!source)a.character.sourceMotion.setEnabled(false);assert.equal(a.character.sourceMotion.enabled,source);
   a.nid=1;a.character.actor=a;a.character.onEvent=null;a.pos.set(0,0,0);a.grounded=a.ground.hit=true;a.ground.block=0;a.groundN.set(0,1,0);a.aimDir.set(0,0,1);a.aimPoint.set(0,1,20);if(!source)f.G.scene.add(a.character.root);
   const m=Object.assign(Object.create(f.Match.prototype),{mode:'clams',state:'playing',ranked:new f.RankedEngine('clams',STAGE),actors:[a],local:a,playing:()=>true,canRespawn:()=>false,rankedGains:[0,0],rankedBarrierHits:[],rankedEffects:{event(){},update(){}}});
   const world=m.rankedWorld=new f.RankedWorld(f,m,STAGE),input=rawInput(),rig={yaw:0,pitch:0,mode:'follow',target:a};
   const controller=new f.PlayerController(a,rig,input);controller.computeAim=()=>{};
   const p={a,m,world,input,rig,controller,events:[],eventJumps:[],eventSolves:[],calls:0,solves:0};pair.push(p);
   const solve=a.character._solveLimb;a.character._solveLimb=function(...args){p.solves++;return solve.apply(this,args);};
   const trigger=a.character.trigger;a.character.trigger=function(name,...args){if(name==='clam-throw')p.calls++;return trigger.call(this,name,...args);};
   m.playRankedEvents=(es,...rest)=>{p.events.push(...clean(es));const before=a.character.bones.handL.getWorldPosition(new f.THREE.Vector3()),count=p.solves;
    const result=f.Match.prototype.playRankedEvents.call(m,lane?es:es.filter(e=>e.kind!=='clam-throw'),...rest);
    if(es.some(e=>e.kind==='clam-throw')){p.eventJumps.push(before.distanceTo(a.character.bones.handL.getWorldPosition(new f.THREE.Vector3())));p.eventSolves.push(p.solves-count);}return result;};
  }
  const [control,shown]=pair;f.G.actors=pair.map(p=>p.a);
  const tick=()=>{f.G.time+=DT;for(const p of pair){f.G.match=p.m;f.G.rig=p.rig;p.controller.update(DT);p.a.update(DT);p.m.advanceRanked(DT);p.input.pressed.clear();}};
  for(let i=0;i<45;i++)tick();
  for(const p of pair){p.m.ranked.rule.state.inventories['1']={team:0,small:scenario.startsWith('repeat')?4:0,power:!scenario.startsWith('repeat')};p.input.keys.add('KeyC');p.input.pressed.add('KeyC');}
  tick();assert.equal(shown.calls,0,'The installed success consumer must not start the deferred arm feature');assert.equal(!!shown.a.character.s3ClamGripActive,false);
  const success=shown.events.find(e=>e.kind==='clam-throw');assert.ok(success);assert.deepEqual(snapshot(control.a),snapshot(shown.a));
  const previousThrow=f.G.projectiles.throwBomb;f.G.projectiles.throwBomb=function(a){const n=this.bombs.length,r=previousThrow.call(this,a);for(const b of this.bombs.slice(n))bombs.push({actor:a,kind:b.kind,pos:b.pos.toArray(),vel:b.vel.toArray()});return r;};
  const stopListening=f.on('weapon:fire',e=>{if(e.muzzle&&e.dir)shots.push({actor:e.actor,weapon:e.weapon,muzzle:e.muzzle.toArray(),dir:e.dir.toArray(),hand:e.hand});});
  let sawSwim=false,sawReturn=false,sawDrop=false;
  const repeat=scenario.startsWith('repeat'),diveFrame=repeat?8:scenario==='late-dive'?3:1,returnFrame=scenario==='full-dive'?10:repeat?10:diveFrame+1,subStart=returnFrame+1,subEnd=returnFrame+4;
  for(let i=1;i<=65;i++){
   if(scenario==='duplicate-drop'&&i===1){f.G.match=shown.m;shown.m.playRankedEvents([success,success]);assert.equal(shown.calls,0);}
   if(scenario==='duplicate-drop'&&i===2)for(const p of pair){p.m.ranked.rule.state.inventories['1']={team:0,small:3,power:true};f.G.match=p.m;f.emit('special:slam',{actor:p.a,pos:p.a.pos.clone(),radius:1});}
   for(const p of pair){
    if(repeat&&[2,4,6].includes(i)){p.input.keys.add('KeyC');p.input.pressed.add('KeyC');}else p.input.keys.delete('KeyC');
    if(i>=diveFrame&&i<returnFrame)p.input.keys.add('ShiftLeft');else p.input.keys.delete('ShiftLeft');
    if(scenario==='repeat-switch'&&i===8)p.a.setWeapon('shooter-01');
    p.input.mouse.right=i>=subStart&&i<subEnd;p.input.mouse.left=i>=subEnd+2&&i<subEnd+8;
   }
   tick();sawSwim||=shown.a.anim.form==='swim';sawReturn||=i>=returnFrame&&shown.a.form==='kid';
   assert.deepEqual(snapshot(control.a),snapshot(shown.a),`${scenario} tick${i}: full bones, source history and simulation`);
   assert.deepEqual(muzzle(f,control.a),muzzle(f,shown.a),`${scenario} tick${i}: actual main/alternate muzzle and aim`);
   assert.deepEqual(clean(control.m.ranked.snapshot()),clean(shown.m.ranked.snapshot()),`${scenario} tick${i}: authority`);
   assert.equal(!!shown.a.character.s3ClamGripActive,false);assert.equal(control.solves,shown.solves,'No extra per-frame solve');
   if(i===returnFrame){f.G.match=shown.m;shown.m.playRankedEvents([success]);assert.equal(shown.calls,0);}
   if(scenario==='duplicate-drop'&&i===2){sawDrop=shown.events.some(e=>e.kind==='clam-drop');assert.ok(sawDrop);}
  }
  const by=(list,a)=>list.filter(b=>b.actor===a).map(({actor,...b})=>b);
  assert.ok(by(bombs,control.a).length>0,'Actual sub hold/release emits an ordinary bomb');assert.deepEqual(by(bombs,control.a),by(bombs,shown.a));
  assert.ok(by(shots,control.a).length>0,'Actual Controller fire emits main rounds');assert.deepEqual(by(shots,control.a),by(shots,shown.a));
  const rounds=a=>f.G.projectiles.list.filter(p=>p.owner===a).map(p=>({pos:p.pos.toArray(),vel:p.vel.toArray(),start:p.start.toArray(),type:p.type}));assert.deepEqual(rounds(control.a),rounds(shown.a));
  assert.ok(sawSwim&&sawReturn);assert.equal(shown.calls,0);assert(shown.eventJumps.every(v=>v===0));assert(shown.eventSolves.every(v=>v===0));
  rows.push({scenario,source,ticks:66,eventJumps:shown.eventJumps,eventSolves:shown.eventSolves,bombCount:by(bombs,shown.a).length,mainShotCount:by(shots,shown.a).length,allBoneDifference:0,sourceHistoryDifference:0});
  f.G.projectiles.throwBomb=previousThrow;if(typeof stopListening==='function')stopListening();pair.forEach(p=>p.world.dispose());f.reset();
 }t.diagnostic(JSON.stringify(rows));
});
