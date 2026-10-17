import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { AUTOBOMB, autobombTarget } from '../runtime/kit-autobomb.mjs';

// Reference: S3 11.3.0, ordinary versus, GP0. Source fields and community
// observations are separated in the runtime specs. These are actual installed
// projectile paths with stubbed terrain, not Switch side-by-side measurements.
for (const hz of [30, 60, 120]) test(`Angle Shooter preserves its pitched zero-gravity trajectory at ${hz} Hz`, async () => {
  const f = await fixture({ fullRuntime:true, realProjectiles:true });
  const owner = f.make('shooter'); owner.weapon = {...owner.weapon, sub:'angleShooter'};
  owner.pos.set(50,0,50); owner.aimPitch = .4;
  f.G.physics.segment = (_start,_end,hit) => { hit.hit=false; return hit; };
  const marker = f.G.projectiles.throwBomb(owner), y = marker.pos.y, vy=marker.vel.y;
  assert.ok(vy>0, 'the actual launch contains the upward aim');
  for(let i=0;i<hz/30;i++)f.G.projectiles.update(1/hz);
  assert.ok(Math.abs(marker.vel.y-vy)<1e-8, 'zero gravity keeps vertical velocity');
  assert.ok(Math.abs(marker.pos.y-y-vy/30)<1e-8, 'the dart travels along the launch pitch');
});

test('Toxic Mist bottle waits for terrain instead of opening in midair after 1.2 seconds', async () => {
  const f = await fixture({ fullRuntime:true, realProjectiles:true });
  const owner=f.make('shooter'); owner.weapon={...owner.weapon,sub:'toxicMist'};
  owner.pos.set(30,0,30);
  let terrain=false;
  f.G.physics.segment=(_start,end,hit)=>{hit.hit=terrain;if(terrain){hit.point.copy(end);hit.normal.set(0,1,0);}return hit;};
  const bottle=f.G.projectiles.throwBomb(owner);bottle.pos.set(0,100,0);bottle.vel.set(0,0,0);
  for(let i=0;i<80;i++){f.G.time+=1/60;f.G.projectiles.update(1/60);}
  assert.equal(bottle.phase,'flight');
  assert.equal(bottle.deployedAt,undefined);
  terrain=true;f.G.time+=1/60;f.G.projectiles.update(1/60);
  assert.equal(bottle.phase,'deployed','terrain impact opens the five-second cloud');
  assert.ok(Math.abs(bottle.expireAt-f.G.time-5)<1e-8);
});

test('Ink Mine marks behind an obstructing wall while its blast damage remains blocked', async () => {
  const f=await fixture({fullRuntime:true,realProjectiles:true});
  const owner=f.make('shooter'),victim=f.make('shooter');owner.team=0;victim.team=1;
  owner.weapon={...owner.weapon,sub:'inkMine'};owner.pos.set(30,0,30);victim.pos.set(2,0,0);
  const mine=f.G.projectiles.throwBomb(owner);mine.phase='deployed';mine.pos.set(0,.7,0);mine.vel.set(0,0,0);mine.activeAt=0;
  f.G.physics.los=()=>false;
  f.G.paint.regionStats=(_x,_y,_z,_radius,_team,out)=>{out.enemy=1;return out;};
  const hp=victim.hp;
  f.G.projectiles.update(1/60);
  assert.equal(mine.dead,true);
  assert.equal(victim.hp,hp,'the wall still blocks the damage blast');
  assert.equal(victim.s3.revealedUntil?.[0],5,'the separate sensor volume crosses the wall');
});

test('Autobomb search uses the Wiki 2.5-line radius converted to the existing world scale', () => {
  assert.equal(AUTOBOMB.acquireRadius,12.5);
  const owner={team:0,pos:{x:0,y:0,z:0}},bomb={owner,team:0,pos:{x:0,y:0,z:0}};
  const enemy={team:1,alive:true,pos:{x:0,y:0,z:12.4}};
  assert.equal(autobombTarget(owner,bomb,{actors:[owner,enemy]}),enemy);
  enemy.pos.z=12.6;
  assert.equal(autobombTarget(owner,bomb,{actors:[owner,enemy]}),null);
});

for(const hz of [30,60,120]) test(`Fizzy waits for ground contact and each hop returns before bursting at ${hz} Hz`,async()=>{
  const f=await fixture({fullRuntime:true,realProjectiles:true});
  const owner=f.make('shooter');owner.weapon={...owner.weapon,sub:'fizzy'};owner.pos.set(50,0,50);owner.weaponRunner.s3SubHold=2;
  f.G.physics.segment=(start,end,hit)=>{
    hit.hit=start.y>=0&&end.y<=0;
    if(hit.hit){const t=start.y/(start.y-end.y);hit.point.lerpVectors(start,end,t);hit.normal.set(0,1,0);hit.dist=start.distanceTo(hit.point);}
    return hit;
  };
  const bomb=f.G.projectiles.throwBomb(owner);bomb.pos.set(0,20,0);bomb.prev.copy(bomb.pos);bomb.vel.set(0,0,0);
  const bursts=[];const off=f.on('all:sub',e=>{if(e.phase==='burst'&&e.seq===bomb.seq)bursts.push({time:f.G.time,y:e.y});});
  const advance=seconds=>{for(let i=0;i<Math.round(seconds*hz);i++){f.G.time+=1/hz;f.G.projectiles.update(1/hz);}};
  advance(.5);
  assert.equal(bursts.length,0,'the former release-time fuse cannot explode a flying bottle');
  assert.equal(bomb.fuse,.5,'airborne flight does not count towards the first ground fuse');
  bomb.pos.set(0,.001,0);bomb.vel.set(0,-1,0);
  advance(1/30);
  assert.equal(bomb.grounded,true,'initial floor impact starts the ground-only warning');
  assert.equal(bursts.length,0,'floor impact does not burst immediately');
  advance(.4);
  assert.equal(bursts.length,0,'initial warning has not completed');
  advance(.1);
  assert.equal(bursts.length,1);
  assert.equal(bomb.grounded,false,'the next burst requires a fresh landing');
  advance(.1);
  assert.equal(bursts.length,1,'a one-frame wait cannot pop the next stage in midair');
  advance(2);
  assert.ok(bursts.length>=2,'a returning hop detonates after contact');
  assert.ok(bursts.every(e=>e.y<.1),'every pop originates on the ground');
  off?.();
});

test('Angle Shooter leaves a visible harmless line that marks a later crossing until the release-based deadline',async()=>{
  const f=await fixture({fullRuntime:true,realProjectiles:true});f.G.scene=new f.THREE.Scene();
  const owner=f.make('shooter'),victim=f.make('shooter');owner.team=0;victim.team=1;owner.nid=1;victim.nid=2;
  owner.weapon={...owner.weapon,sub:'angleShooter'};owner.pos.set(60,0,60);victim.pos.set(10,0,4);
  f.G.physics.segment=(_a,_b,hit)=>{hit.hit=false;return hit;};
  const marker=f.G.projectiles.throwBomb(owner);marker.pos.set(0,1,0);marker.prev.copy(marker.pos);marker.vel.set(0,0,378);
  const events=[];const off=f.on('all:sub',e=>events.push(e));const advance=n=>{for(let i=0;i<n;i++){f.G.time+=1/60;f.G.projectiles.update(1/60);}};
  advance(7);
  assert.equal(marker.phase,'line');assert.equal(marker.mesh.visible,false,'the dart has finished flying');
  assert.ok(marker.lineMesh?.parent===f.G.scene,'the residual path has a rendered line');
  assert.equal(marker.lineSegments.length,7);
  const hp=victim.hp;advance(30);victim.pos.x=0;advance(1);
  assert.equal(victim.hp,hp,'touching the residual path does not repeat the 40 damage');
  assert.ok(Math.abs(victim.s3.revealedUntil[0]-5)<1e-8,'late contact uses the remaining five seconds measured from release');
  const mark=events.find(e=>e.phase==='mark');assert.equal(mark.markAgeFrames,38);assert.equal(mark.frames,300);
  const deadline=victim.s3.revealedUntil[0];advance(10);assert.equal(victim.s3.revealedUntil[0],deadline,'continued contact cannot renew the same line');
  const line=marker.lineMesh;advance(50);assert.equal(marker.dead,true);assert.equal(line.parent,null,'retirement frees the residual visual');off?.();
});

test('Torpedo retains its captured life and last point without jumping to a dead or respawned target',async()=>{
  const f=await fixture({fullRuntime:true,realProjectiles:true});
  const owner=f.make('shooter'),target=f.make('shooter'),other=f.make('shooter');owner.team=0;target.team=other.team=1;
  owner.weapon={...owner.weapon,sub:'torpedo'};owner.pos.set(50,0,50);target.pos.set(0,0,8);target.netLife=4;other.pos.set(30,0,30);
  f.G.physics.segment=(_a,_b,hit)=>{hit.hit=false;return hit;};
  const torpedo=f.G.projectiles.throwBomb(owner);torpedo.pos.set(0,6,0);torpedo.prev.copy(torpedo.pos);torpedo.vel.set(0,0,0);torpedo.age=19/60;
  f.G.projectiles.update(1/60);assert.equal(torpedo.torpedoTarget,target);assert.equal(torpedo.torpedoTargetLife,4);
  const captured=torpedo.torpedoAim.clone();target.alive=false;target.pos.set(80,0,80);other.pos.set(0,0,1);
  f.G.projectiles.update(1/60);assert.ok(torpedo.torpedoAim.equals(captured));assert.equal(torpedo.torpedoTarget,target,'another closer target is not substituted');
  target.alive=true;target.netLife=5;target.pos.set(100,0,100);f.G.projectiles.update(1/60);
  assert.ok(torpedo.torpedoAim.equals(captured),'the reused Actor life cannot move the captured destination');
  torpedo.pos.set(0,50,0);torpedo.age=2.5;let burst;f.on('all:sub',e=>{if(e.phase==='burst'&&e.seq===torpedo.seq)burst=e;});
  f.G.projectiles.update(1/60);assert.ok(burst);assert.equal(burst.y,50,'the fallback bursts at the projectile, not at the remote target');
});

test('Burst Bomb safety retirement without contact never creates an airborne blast',async()=>{
  const f=await fixture({fullRuntime:true,realProjectiles:true});const owner=f.make('shooter');owner.weapon={...owner.weapon,sub:'burst'};owner.pos.set(50,0,50);
  f.G.physics.segment=(_a,_b,hit)=>{hit.hit=false;return hit;};
  const bomb=f.G.projectiles.throwBomb(owner);bomb.pos.set(0,100,0);bomb.vel.set(0,0,0);bomb.age=2.2;
  const events=[];f.on('all:sub',e=>events.push(e));f.G.projectiles.update(1/60);
  assert.equal(bomb.dead,true);assert.equal(events.some(e=>e.phase==='burst'),false);
});

test('Ink Mine actual input places at the feet and rejects airborne/overlapping releases before ink payment',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
  const owner=f.make('shooter');owner.weapon={...owner.weapon,sub:'inkMine'};owner.weaponRunner.reset();
  owner.pos.set(2,1,3);owner.aimPitch=.8;owner.vel.set(12,8,15);owner.ink=100;
  const release=()=>{for(let i=0;i<30;i++)owner.weaponRunner.update(1/60,{sub:true});owner.weaponRunner.update(1/60,{sub:false,subReleased:true});for(let i=0;i<10;i++)owner.weaponRunner.update(1/60,{sub:false});};
  owner.grounded=false;release();assert.equal(owner.ink,100);assert.equal(f.G.projectiles._s3SubObjects?.length||0,0);
  assert.equal(f.G.projectiles.throwBomb(owner),undefined,'direct callers cannot bypass the airborne gate');
  owner.grounded=true;release();
  const mine=f.G.projectiles._s3SubObjects.find(o=>o.subId==='inkMine');assert.ok(mine);assert.equal(owner.ink,40);
  assert.equal(mine.phase,'deployed');assert.equal(mine.pos.x,2);assert.equal(mine.pos.z,3);assert.ok(Math.abs(mine.pos.y-1.02)<1e-8);
  assert.equal(mine.vel.length(),0,'aim and movement cannot turn the feet placement into a throw');
  owner.ink=100;release();assert.equal(owner.ink,100,'overlap rejection precedes the 60% cost');
  assert.equal(f.G.projectiles._s3SubObjects.length,1);assert.equal(f.G.projectiles.throwBomb(owner),undefined);
  owner.pos.x+=mine.spec.sensorRadius+.1;release();assert.equal(owner.ink,40);assert.equal(f.G.projectiles._s3SubObjects.filter(o=>o.subId==='inkMine').length,2);
});
