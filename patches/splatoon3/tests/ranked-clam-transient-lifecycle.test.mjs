import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoadedActorFixture} from './source-loaded-actor-fixture.mjs';
const stage={id:'clam-staged-lifecycle',clams:{spawns:[],goals:[[0,0,80],[0,0,-80]]}};
const clean=x=>JSON.parse(JSON.stringify(x));
function pose(c,f){return {q:c.boneList.map(b=>b.quaternion.toArray()),p:c.boneList.map(b=>b.position.toArray()),s:c.boneList.map(b=>b.scale.toArray()),P:Array.from(c.P),tr:Array.from(c.tr),sp:Array.from(c.sp),ik:Array.from(c.ikErr),wrist:c.bones.handL.getWorldPosition(new f.THREE.Vector3()).toArray(),dive:c.sourceMotion.diveFrom.map(b=>b.q.toArray())};}
test('deferred Clam arms allocate no transient pose and leave lifecycle, source history and matrices identical to no notification',async t=>{
 const f=await sourceLoadedActorFixture({random:()=>.5,extraExports:`export {RankedWorld} from './patches/splatoon3/runtime/ranked/world.mjs';`}),rows=[];
 for(const action of ['hide','ordinary-bomb','weapon-switch','source-switch','death','dispose']){
  const pair=[];
  for(let lane=0;lane<2;lane++){
   const a=await f.make();a.nid=1;a.character.onEvent=null;
   const m={mode:'clams',state:'playing',ranked:new f.RankedEngine('clams',stage),actors:[a],playing:()=>true,canRespawn:()=>false,rankedGains:[0,0],rankedEffects:{event(){}}};
   const w=m.rankedWorld=new f.RankedWorld(f,m,stage);pair.push({a,m,w});
  }
  for(let i=0;i<45;i++){f.G.time+=1/60;for(const p of pair){f.G.match=p.m;p.a.update(1/60);}}
  const [a,b]=pair;assert.deepEqual(pose(a.a.character,f),pose(b.a.character,f));const c=b.a.character,before=pose(c,f);let calls=0;const trigger=c.trigger;
  c.trigger=function(name,...args){if(name==='clam-throw')calls++;return trigger.call(this,name,...args);};
  for(let i=0;i<4;i++){
   b.m.ranked.rule.state.inventories['1']={team:0,power:true,small:0};b.m.ranked.rule._throw({id:'1',team:0,pos:b.a.pos.toArray(),alive:true},{aim:[0,0,1]},{actors:[],floorAt:()=>0});
   f.G.match=b.m;f.Match.prototype.playRankedEvents.call(b.m,b.m.ranked.events.splice(0));
   assert.deepEqual(pose(c,f),before,'No event pose or stale matrix write');
  }
  assert.equal(calls,0);assert.equal(!!c.s3ClamGripActive,false);const st=c[Symbol.for('inkwave.s3.bomb-motion.install.v1')].states.get(c);assert.ok(!st?.clamGrip&&!st?.clamCache,'No dormant Clam overlay or scratch bank');
  for(const p of pair){f.G.match=p.m;const x=p.a,ch=x.character;
   if(action==='hide')ch.setVisible(false);
   if(action==='ordinary-bomb')ch.trigger('throw');
   if(action==='weapon-switch')x.setWeapon('dualies');
   if(action==='source-switch'){ch.sourceMotion.setEnabled(false);ch._updateStates(0,x.anim);ch.setVisible(false);}
   if(action==='death')x.splat(null,'test');
   if(action==='dispose')ch.dispose();
  }
  assert.deepEqual(clean(pose(a.a.character,f)),clean(pose(c,f)),`${action}: bones and immediate world matrices match`);
  rows.push({action,successfulThrows:4,armCalls:0,allBoneDifference:0,sourceHistoryDifference:0});pair.forEach(p=>p.w.dispose());f.reset();
 }t.diagnostic(JSON.stringify(rows));
});
