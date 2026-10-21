import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
const DT=1/60;
async function world(remote=false){
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
 const owner=f.make(),target=f.make();Object.assign(owner,{nid:1,owner:'a',netLife:0,team:0,remote});Object.assign(target,{nid:2,owner:'b',netLife:0,team:1,invuln:0});
 owner.pos.set(0,0,26);target.pos.set(0,0,38);owner.aimDir.set(0,0,1);owner.weapon={...owner.weapon,sub:'torpedo'};
 f.G.level={...f.G.level,blocks:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,out)=>{out.length=0;return out;}};f.G.physics=new f.installedRuntime.Physics(f.G.level);
 f.G.actors=[owner,target];f.G.netm=remote?{byNid:new Map([[1,owner],[2,target]])}:null;
 const events=[];f.on('all:sub',e=>{const {actor,paintSource,...wire}=e;events.push(JSON.parse(JSON.stringify({...wire,actorId:actor?.nid})));});
 const step=()=>{f.G.time+=DT;f.G.projectiles.update(DT);};return {f,owner,target,events,step};
}
async function pair(unchased=false){
 const tx=await world(),rx=await world(true);const object=tx.f.G.projectiles.throwBomb(tx.owner);assert.ok(object);
 object.pos.set(0,2,30);object.prev.copy(object.pos);object.vel.set(0,0,0);
 if(unchased)tx.target.pos.set(100,0,100);
 const phases=new Set();
 if(unchased){tx.target.pos.set(0,0,30);object.pos.set(-1,.7,30);object.prev.copy(object.pos);object.vel.set(120,0,0);tx.step();assert.equal(object.dead,true);assert.ok(!object.chasedTarget);}
 else{for(let i=0;i<51;i++){tx.step();phases.add(object.phase);}assert.ok(phases.has('torpedoRotate'));assert.ok(phases.has('torpedoWait'));assert.equal(object.phase,'chase');
 tx.target.pos.set(0,0,30);object.pos.set(-1,.7,30);object.prev.copy(object.pos);object.vel.set(120,0,0);tx.step();assert.equal(object.dead,true);}
 const row=phase=>{const e=tx.events.find(x=>x.phase===phase);assert.ok(e,phase);return e;};
 const spawn=row('spawn'),lock=unchased?null:row('torpedoLock'),launch=unchased?null:row('torpedoLaunch'),burst=row('burst');
 assert.equal(rx.f.installedRuntime.replaySub(spawn),true);const ghost=rx.f.G.projectiles._s3SubObjects.find(x=>x.subId==='torpedo');assert.ok(ghost?.ghost);
 return {tx,rx,ghost,spawn,lock,launch,burst};
}
const drops=w=>(w.rx.f.G.projectiles._s3TorpedoSplashes||[]).filter(d=>d.kind==='chase').length;
for(const mode of ['legal','early','malformed','identity','unchased'])test(`Torpedo replay phase boundary ${mode}`,async()=>{
 const w=await pair(mode==='unchased');const {rx,ghost,lock,launch,burst}=w,play=e=>rx.f.installedRuntime.replaySub(e);
 try{
  if(mode==='unchased'){
   // Unlocked rolling/contact Torpedoes legitimately have no launch event.
   assert.ok(!ghost.chasedTarget);assert.equal(play(burst),true);assert.equal(drops(w),0);assert.equal(play(burst),false);return;
  }
  assert.equal(play(lock),true);assert.equal(ghost.phase,'torpedoRotate');
  if(mode==='early'){
   const before=ghost.pos.clone();assert.equal(play(burst),false);assert.equal(ghost.phase,'torpedoRotate');assert.equal(ghost.pos.distanceTo(before),0);assert.equal(drops(w),0);assert.ok(!ghost.torpedoBurstReplayed);
   // An unrelated bounce must not turn a prelaunch replica into a valid chased burst.
   assert.equal(play({...lock,phase:'bounce'}),true);assert.equal(play(burst),false);return;
  }
  if(mode==='identity'){
   for(const e of [{...launch,life:1},{...launch,sourceLife:1},{...launch,actorId:99},{...launch,seq:launch.seq+1}])assert.equal(play(e),false);
   assert.ok(!ghost.torpedoLaunchReplayed);
  }
  assert.equal(play(launch),true);assert.equal(ghost.phase,'chase');assert.equal(play(launch),false);
  if(mode==='malformed')for(const bad of [{...burst,x:NaN},{...burst,y:undefined},{...burst,z:Infinity}]){assert.equal(play(bad),false);assert.ok(!ghost.torpedoBurstReplayed);assert.equal(drops(w),0);}
  if(mode==='identity')for(const e of [{...burst,life:1},{...burst,sourceLife:1},{...burst,actorId:99},{...burst,seq:burst.seq+1}])assert.equal(play(e),false);
  // A real replica actor contact may precede the owner's terminal event.
  rx.target.pos.set(0,0,30);ghost.pos.set(-1,.7,30);ghost.prev.copy(ghost.pos);ghost.vel.set(120,0,0);rx.step();assert.equal(ghost.phase,'ghostWait');
  const hp=rx.target.hp;assert.equal(play(burst),true);assert.equal(drops(w),8);assert.equal(rx.target.hp,hp);assert.equal(play(burst),false);assert.equal(drops(w),8);
 }finally{w.tx.f.G.projectiles.clear();w.rx.f.G.projectiles.clear();}
});
