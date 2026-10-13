import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const EXTRA="export {SUPER_CHUMP_DECOY_COUNT,superChumpReleaseFrame,replaySpecial as replayAllSpecials} from './patches/splatoon3/runtime/all-specials.mjs';";
async function setup(){
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:EXTRA});
  f.G.physics.segment=(_from,_to,hit)=>{hit.hit=false;return hit;};
  const actor=f.make();
  actor.weapon={...actor.weapon,special:'superChump',specialCost:100};
  actor.special=100;actor._resolve=()=>{};actor.alive=true;actor.remote=false;
  f.G.actors=[actor];
  const events=[];f.on('all:special',e=>events.push(e));
  actor._startSpecial();actor.intent.fire=true;actor._updateSpecial(1/60);
  return {f,actor,events,objects:f.G.projectiles._s3AllSpecialObjects.filter(o=>o.kind==='decoy')};
}
test('S3 Super Chump schedules 12 decoys at 4F separation after 80F preparation',async()=>{
  const {f,objects}=await setup();
  assert.equal(f.SUPER_CHUMP_DECOY_COUNT,12);
  assert.equal(objects.length,12);
  assert.deepEqual(objects.map(o=>Math.round(o.startDelay*60)),Array.from({length:12},(_,i)=>80+4*i));
  for(const [i,obj] of objects.entries()){
    assert.equal(obj.phase,'queued');
    assert.equal(obj.mesh.visible,false);
    assert.equal(obj.hp,60);
    assert.ok(Math.abs(obj.dur-(f.superChumpReleaseFrame(i)+108+210)/60)<1e-8);
  }
  assert.equal(f.superChumpReleaseFrame(-1),null);
  assert.equal(f.superChumpReleaseFrame(12),null);
});
test('scheduled decoys stay hidden until their own launch, then travel before exploding',async()=>{
  const {f,objects}=await setup();
  for(let i=0;i<79;i++)f.G.projectiles.update(1/60);
  assert.equal(objects[0].phase,'queued');
  f.G.projectiles.update(1/60);
  assert.equal(objects[0].phase,'flight');
  assert.equal(objects[0].mesh.visible,true);
  assert.equal(objects[11].phase,'queued');
  for(let i=80;i<124;i++)f.G.projectiles.update(1/60);
  assert.equal(objects[11].phase,'flight');
  assert.equal(objects[11].mesh.visible,true);
});
test('remote decoy replay preserves source launch delay and does not reveal queued meshes',async()=>{
  const {f,events,objects}=await setup();
  const deployed=events.find(e=>e.kind==='decoy'&&e.action==='deploy');
  assert.ok(deployed && deployed.startDelay>0);
  const remote=f.make();remote.team=0;remote.remote=true;
  assert.equal(f.replayAllSpecials(f,{...deployed,actor:remote}),true);
  const ghost=f.G.projectiles._s3AllSpecialObjects.find(o=>o.owner===remote && o.kind==='decoy');
  assert.ok(ghost);
  assert.equal(ghost.startDelay,objects[0].startDelay);
  assert.equal(ghost.phase,'queued');
  assert.equal(ghost.mesh.visible,false);
});
