import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { makePaintWorld } from './paint-authority-fixture.mjs';
const STEP=1/60;
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
// S3 11.3.0 GP0. Wiki: fixed local throw trajectory, floor deployment,
// approximately1s from throw to active even on an uphill early landing, and
//400F lifetime/replacement only after the new curtain opens. The1s is a
// community approximation, not an extracted exact activation frame.
// https://wikiwiki.jp/splatoon3mix/ブキ/サブウェポン/スプラッシュシールド#Explanation
async function world(){
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});makePaintWorld(f,{wall:true});
  const owner=f.make(),enemy=f.make();Object.assign(owner,{nid:1,team:0,netLife:0});Object.assign(enemy,{nid:2,team:1,netLife:0});
  owner.pos.set(0,0,2);enemy.pos.set(35,0,60);owner.weapon={...owner.weapon,sub:'splashWall'};owner.weaponRunner.reset();
  function fire(){
    owner.ink=100;for(let i=0;i<40;i++)owner.weaponRunner.update(STEP,{sub:false});
    for(let i=0;i<8;i++)owner.weaponRunner.update(STEP,{sub:true});
    owner.weaponRunner.update(STEP,{sub:false,subReleased:true});owner.weaponRunner.update(STEP,{sub:false});
    const b=f.G.projectiles._s3SubObjects.filter(o=>o.subId==='splashWall').at(-1);
    assert.ok(b);assert.equal(owner.ink,40);return b;
  }
  const step=(dt=STEP)=>{f.G.time+=dt;f.G.projectiles.update(dt);};
  const probe=b=>f.G.projectiles.kitBarrierCandidate({owner:enemy,team:1,size:.01,damage:20,
    prev:b.pos.clone().add(new f.THREE.Vector3(0,1,-2)),pos:b.pos.clone().add(new f.THREE.Vector3(0,1,2))});
  return {f,owner,enemy,fire,step,probe};
}

test('Splash Wall velocity stays fixed relative to heading without movement inheritance or aim pitch arcs',async()=>{
  const w=await world(),velocities=[];
  for(const pitch of [-.9,0,.9]){
    w.f.G.projectiles.clear();w.owner.aimPitch=pitch;w.owner.vel.set(12,6,18);w.owner.weaponRunner.reset();
    velocities.push(w.fire().vel.clone());
  }
  assert.ok(velocities.every(v=>v.distanceTo(velocities[0])<1e-9));
  near(velocities[0].y,.07*60);near(velocities[0].z,.3*60);
});

for(const hz of [30,60,120])test(`Splash Wall bounces a real vertical wall, opens after landing and preserves400F active life at ${hz}Hz`,async()=>{
  const w=await world(),b=w.fire();let bounced=false,pending=false;
  for(let i=0;i<hz*1.1;i++){
    w.step(1/hz);
    if(b.phase==='flight'&&b.vel.z<0)bounced=true;
    if(b.phase==='wallPending'){
      pending=true;assert.equal(b.hp,800,'landed folded device does not lose active HP');assert.equal(w.probe(b),null,'folded device is not an active barrier');
    }
  }
  assert.equal(bounced,true);assert.equal(pending,true);assert.equal(b.phase,'deployed');
  assert.ok(b.pos.y<.1,'only floor contact places the device');
  assert.ok(b.deployedAt>=1-1e-8&&b.deployedAt<=1+1/hz+1e-8,'approximate release clock prevents uphill/wall contact from opening early');
  near(b.hp,800-(b.age-b.wallReadyAge)*60*2);
  assert.equal(w.probe(b)?.object,b);
  for(let i=0;i<hz*7;i++)w.step(1/hz);assert.equal(b.dead,true);
});

test('the old Splash Wall remains active during replacement preparation, then retires exactly once at activation',async()=>{
  const w=await world(),first=w.fire();while(first.phase!=='deployed')w.step();
  w.owner.pos.x=10;const second=w.fire();
  while(second.phase==='flight')w.step();assert.equal(second.phase,'wallPending');
  assert.equal(first.dead,false);assert.equal(w.probe(first)?.object,first);
  assert.equal(w.probe(second),null);
  const before=second.age;w.step();near(second.age-before,STEP);
  while(second.phase!=='deployed')w.step();
  assert.equal(first.dead,true);assert.equal(second.hp,800,'retiring an earlier list entry cannot tick the new wall twice');
  assert.equal(w.f.G.projectiles._s3SubObjects.filter(o=>o.subId==='splashWall'&&o.phase==='deployed').length,1);
});
