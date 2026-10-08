import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';
import {fixture as wireFixture,ROOT} from '../../../scripts/weapons-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';
const close = (a,b,e=1e-8) => assert.ok(Math.abs(a-b)<e, `${a} != ${b}`);
async function setup(kind) {
 const f=await fixture(),a=f.make(kind);f.G.camera={position:new f.THREE.Vector3(0,20,0)}; f.G.actors=[a]; f.G.match.canRespawn=()=>false;
 return {...f,a};
}
function projectiles(f){const ps=new f.Projectiles(new f.THREE.Scene());f.G.projectiles=ps;return ps;}
function trace(f,frames){const out=[];for(let i=1;i<=frames;i++){const n=f.shots.length;f.tick(f.a);if(n!==f.shots.length)out.push([i,f.shots.length-n]);}return out;}
test('dualies stable human starts on recognized frame 3, then every 5F without early ink',async()=>{
 const f=await setup('dualies');f.tick(f.a,600);f.a.intent.fire=true;
 f.tick(f.a);assert.equal(f.shots.length,0);assert.equal(f.a.ink,100);f.tick(f.a);assert.equal(f.shots.length,0);assert.equal(f.a.ink,100);
 assert.deepEqual(trace(f,20),[[1,1],[6,1],[11,1],[16,1]]);close(f.a.ink,97.12);
});
test('dualies release/repress starts a fresh gate; one-frame taps are canceled without stored bullets',async()=>{
 const f=await setup('dualies');f.a.intent.fire=true;f.tick(f.a);f.a.intent.fire=false;f.tick(f.a,20);assert.equal(f.shots.length,0);
 f.a.intent.fire=true;assert.deepEqual(trace(f,13),[[3,1],[8,1],[13,1]]);f.a.intent.fire=false;f.tick(f.a,30);f.a.intent.fire=true;assert.deepEqual(trace(f,3),[[3,1]]);
});
test('dualies waiting shot cancels for sub, squid, death/reset, special and weapon replacement',async()=>{
 for(const cancel of ['sub','squid','death','special','weapon']){
  const f=await setup('dualies'),a=f.a;a.intent.fire=true;f.tick(a);a.intent.fire=false;
  if(cancel==='sub'){a.intent.sub=true;f.tick(a,6);a.intent.sub=false;a._prevIntent.sub=false;}
  if(cancel==='squid'){a.intent.squid=true;f.tick(a,6);a.intent.squid=false;f.tick(a,10);}
  if(cancel==='death'){a.weaponRunner.onDeath();a.alive=false;f.tick(a,6);a.alive=true;}
  if(cancel==='special'){a.specialActive={};a._updateSpecial=()=>{};f.tick(a,6);a.specialActive=null;}
  if(cancel==='weapon'){a.setWeapon('shooter');a.setWeapon('dualies');}
  f.tick(a,20);assert.equal(f.shots.length,0,cancel);a.intent.fire=true;assert.deepEqual(trace(f,3),[[3,1]],cancel);
 }
});
test('dualies emerging timing remains separate; turret continues every 4F',async()=>{
 const f=await setup('dualies');f.a.intent.squid=true;f.tick(f.a,10);f.a.intent.fire=true;
 assert.deepEqual(trace(f,18),[[13,1],[18,1]]);
 const g=await setup('dualies');g.a.weaponRunner.s3Turret=true;g.a.weaponRunner.cooldown=1/60;g.a.intent.fire=true;assert.deepEqual(trace(g,13),[[1,1],[5,1],[9,1],[13,1]]);
});
test('30/60/120Hz rendering produces exactly the same fixed-step initial and repeat ticks',async()=>{
 const all=[];for(const hz of [30,60,120]){const f=await setup('dualies'),clock=new FixedClock(),out=[];f.a.intent.fire=true;for(let i=0;i<hz;i++)clock.advance(1/hz,()=>{const n=f.shots.length;f.tick(f.a);if(n!==f.shots.length)out.push(clock.ticks+1);});all.push(out);}
 assert.deepEqual(all[0],all[1]);assert.deepEqual(all[1],all[2]);assert.deepEqual(all[0].slice(0,4),[3,8,13,18]);
});
test('released ZR plus directional Jump does not roll from stale firingT',async()=>{
 const f=await setup('dualies'),a=f.a,ink=a.ink,rolls=a.weaponRunner.rollsLeft;
 a.weaponRunner.firingT=.35;a._prevIntent.fire=true;a.intent.fire=false;
 a.intent.move.set(1,0,0);a.intent.jump=true;
 f.tick(a);
 assert.equal(a.weaponRunner.dodge,null);
 assert.equal(a.ink,ink);assert.equal(a.weaponRunner.rollsLeft,rolls);
 assert.ok(a.character.events.some(([name])=>name==='jump'));
 assert.equal(a.character.events.some(([name])=>name==='dodge'),false);
});
test('current Dualies fire intent still admits one directional Dodge Roll',async()=>{
 const f=await setup('dualies'),a=f.a,ink=a.ink,rolls=a.weaponRunner.rollsLeft;
 a.weaponRunner.firingT=0;a.intent.fire=true;a.intent.move.set(1,0,0);a.intent.jump=true;
 f.tick(a);
 assert.ok(a.weaponRunner.dodge);
 close(a.ink,ink-a.weapon.rollInk);assert.equal(a.weaponRunner.rollsLeft,rolls-1);
 assert.equal(a.character.events.some(([name])=>name==='jump'),false);
});
test('remote Dualies released-fire Jump does not manufacture a roll from stale firingT',async()=>{
 const f=await setup('dualies'),a=f.a,ink=a.ink,rolls=a.weaponRunner.rollsLeft;
 a.remote=true;a.weaponRunner.firingT=.35;a._prevIntent.fire=true;a.intent.fire=false;
 a.intent.move.set(1,0,0);a.intent.jump=true;
 f.tick(a);
 assert.equal(a.weaponRunner.dodge,null);
 assert.equal(a.ink,ink);assert.equal(a.weaponRunner.rollsLeft,rolls);
 assert.ok(a.character.events.some(([name])=>name==='jump'));
});
test('splatling yaw and pitch have independent signed ground boundaries on arbitrary aim rays',async()=>{
 const f=await setup('splatling'),ps=projectiles(f),a=f.a;
 for(const yaw of [0,1.2])for(const pitch of [0,.7,-.6])for(const [theta,axis,limit] of [[0,'yaw',3.3],[.5,'yaw',-3.3],[.25,'pitch',1.6],[.75,'pitch',-1.6]]){
  const dir=new f.THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));a.aimDir.copy(dir);a.aimPoint.copy(a.pos).add(new f.THREE.Vector3(0,1.05,.3)).addScaledVector(dir,100);
  let n=0;const draws=[.5,1-1e-12,theta]; // neutral #64 speed RNG, then inherited speed RNG if present, then yaw/pitch spread draws
  f.setRandom(()=>draws[n++]??.5);ps.fireSplatling(a,a.weapon,3.3);const v=ps.list.at(-1).vel.clone().normalize(),right=dir.clone().set(-dir.z,0,dir.x).normalize(),up=dir.clone().cross(right);
  const side=Math.atan2(v.dot(axis==='yaw'?right:up),v.dot(dir))*180/Math.PI;close(side,limit);close(v.dot(axis==='yaw'?up:right),0);
 }
});
test('splatling retained horizontal scalar does not infer or rescale vertical1.6; air stays unchanged',async()=>{
 const f=await setup('splatling'),ps=projectiles(f),a=f.a;a.aimPoint.set(0,1.05,100);a.aimDir.set(0,0,1);
 for(const [ground,spread,expected] of [[true,1.98,1.6],[true,3.3,1.6],[false,7,Math.atan(.55*Math.tan(7*Math.PI/180))*180/Math.PI]]){
  a.grounded=ground;let n=0;const draws=[.5,1-1e-12,.25]; // isolate pitch boundary from independent speed randomness
  f.setRandom(()=>draws[n++]??.5);ps.fireSplatling(a,a.weapon,spread);const p=ps.list.at(-1),v=p.vel.clone();close(Math.abs(Math.atan2(v.y,Math.hypot(v.x,v.z))*180/Math.PI),expected);
  a.grounded=!ground;a.weapon.spreadPitchGround=1.6;assert.ok(p.vel.equals(v));
 }
});
function blast(f,ps){const p=ps._new();Object.assign(p,{type:'blast',owner:f.a,team:0,radius:1,seed:.5,wid:'blaster'});p.vel.set(0,0,1);return p;}
test('terrain floor/wall/slope contact caps at35; air70 and direct exclusion remain',async()=>{
 const f=await setup('blaster'),ps=projectiles(f),e=f.make();e.team=1;e.invuln=0;f.G.actors.push(e);const p=blast(f,ps),at=new f.THREE.Vector3(0,.7,0);
 for(const normal of [new f.THREE.Vector3(0,1,0),new f.THREE.Vector3(0,0,-1),new f.THREE.Vector3(0,.8,.6)]){
  e.hp=100;e.pos.set(.1,0,0);ps._impact(p,{point:at,normal});assert.equal(e.hp,100,'#729 no radial damage in the contact tick');ps.flushBlastImpacts();close(e.hp,65);assert.equal(p.s3TerrainBurst,false);
  e.hp=100;ps._blastBurst(p,at,null);close(e.hp,30);e.hp=100;ps._blastBurst(p,at,e);close(e.hp,100);
 }
});
test('terrain bands are normalized before half damage and 0.1HP floor, with LOS and boundary controls',async()=>{
 const f=await setup('blaster'),ps=projectiles(f),e=f.make();e.team=1;e.invuln=0;f.G.actors.push(e);const p=blast(f,ps),w=f.WEAPONS.blaster,at=new f.THREE.Vector3(0,.7,0),normal=new f.THREE.Vector3(0,1,0);
 const rate=w.terrainSplashRadiusRate??1;
 for(const [d,want] of [[0,35],[1.025,35],[2.205,30],[3.385,25]]){e.hp=100;e.pos.set(d*rate,0,0);ps._impact(p,{point:at,normal});ps.flushBlastImpacts();close(100-e.hp,want);}
 e.hp=100;e.pos.set(w.splashRadius*rate+.001,0,0);ps._impact(p,{point:at,normal});ps.flushBlastImpacts();close(e.hp,100);
 e.pos.set(.1,0,0);f.G.physics.los=()=>false;ps._impact(p,{point:at,normal});ps.flushBlastImpacts();close(e.hp,100);
});
test('terrain cause restored on exception and pooled reuse; paint/FX/boss dimensions stay native',async()=>{
 const f=await setup('blaster'),ps=projectiles(f),p=blast(f,ps),at=new f.THREE.Vector3(),normal=new f.THREE.Vector3(0,1,0);const paint=[],fx=[],boss=[];
 f.G.paint.splat=(_p,r)=>{paint.push(r);return 0;};f.G.fx={burst(){},explosion:(_p,_c,r)=>fx.push(r)};f.G.boss={splash:(...args)=>boss.push(args)};
 ps._impact(p,{point:at,normal});ps.flushBlastImpacts();close(fx[0],f.WEAPONS.blaster.burstRadius);close(boss[0][2],f.WEAPONS.blaster.splashRadius);close(boss[0][3],70);assert.ok(paint.length);
 f.G.paint.splat=()=>{throw Error('test impact failure');};assert.throws(()=>ps._impact(p,{point:at,normal}),/test impact failure/);assert.equal(p.s3TerrainBurst,false);p.s3TerrainBurst=true;p.s3FlickUnit=1;ps.pool.push(p);const reused=ps._new();assert.equal(reused.s3TerrainBurst,false);assert.equal(reused.s3FlickUnit,0);
});
test('terrain damage routes final35 to network, without halving native125 direct hit',async()=>{
 const f=await setup('blaster'),ps=projectiles(f),e=f.make();e.team=1;e.invuln=0;e.pos.set(.1,0,0);f.G.actors.push(e);const sent=[];f.G.netm={shouldApplyHit:()=> 'send',sendHit:(_a,_e,d)=>sent.push(d)};
 ps._impact(blast(f,ps),{point:new f.THREE.Vector3(0,.7,0),normal:new f.THREE.Vector3(0,1,0)});ps.flushBlastImpacts();ps.applyHit(f.a,e,125,'blaster');assert.deepEqual(sent,[35,125]);assert.equal(e.hp,100);
});
test('roller release adds separate12+1 unit, shared max group, one8.5 ink payment and unchanged release',async()=>{
 const f=await setup('roller'),ps=projectiles(f),a=f.a;f.setRandom(()=>.5);a.weaponRunner.update(1/60,{fire:false,firePressed:true});
 for(let i=0;i<20;i++)a.weaponRunner.update(1/60,{fire:false});assert.equal(ps.list.length,0);a.weaponRunner.update(1/60,{fire:false});assert.equal(ps.list.length,13);close(a.ink,91.5);
 assert.equal(ps.list.filter(p=>p.s3FlickUnit===0).length,12);const near=ps.list.find(p=>p.s3FlickUnit===1);close(near.vel.length()/a.weapon.flickSpeed,.48/1.05);assert.equal(new Set(ps.list.map(p=>p.s3DamageGroup)).size,1);
 const enemy=f.make();enemy.team=1;enemy.invuln=0;enemy.hp=1000;const amounts=[];ps.applyHit=(_a,_e,d)=>amounts.push(d);for(const p of ps.list)f.applyProjectileHit(ps,p,enemy,150,p.start);assert.deepEqual(amounts,[150]);
});
test('roller near unit signed angle/width/speed envelopes; main12 seed sequence and vertical5 preserved',async()=>{
 const f=await setup('roller'),ps=projectiles(f),a=f.a;
  for(const rng of [0,.5,1-1e-12]){f.setRandom(()=>rng);ps.fireFlick(a,a.weapon);const p=ps.list.find(p=>p.s3FlickUnit===1);close(p.vel.length(),a.weapon.flickSpeed*(.48+(2*rng-1)*.11)/1.05);close(Math.atan2(p.vel.x,p.vel.z)*180/Math.PI,(2*rng-1)*(4+a.weapon.nearFlickUnit.swerveRate*180/Math.PI));close(p.start.x,(rng-.5)*.4);ps.clear();}
 f.setRandom(()=>.5);ps.fireFlick(a,a.weapon);const main=ps.list.filter(p=>p.s3FlickUnit===0).map(p=>p.vel.toArray());ps.clear();const u=a.weapon.nearFlickUnit;a.weapon.nearFlickUnit=null;ps.fireFlick(a,a.weapon);assert.deepEqual(ps.list.map(p=>p.vel.toArray()),main);a.weapon.nearFlickUnit=u;ps.clear();a.weaponRunner.s3FlickVertical=true;ps.fireFlick(a,a.weapon);assert.equal(ps.list.length,5);assert.ok(ps.list.every(p=>p.s3FlickUnit===0));
});
test('launch packets include13 once; ghosts use transmitted velocity without resampling spread/unit',async()=>{
 for(const kind of ['roller','splatling']){
  const f=await wireFixture({site:`${ROOT}.edge-wire-source`,fidelity:true,network:true}),a=f.make(kind),ps=f.projectiles;a.isLocal=true;a.nid=1;const nm=Object.create(f.NetMatch.prototype);nm.mute=0;nm.out=[];nm.eventSeq=0;nm.isMine=()=>true;f.G.netm=nm;
  if(kind==='roller')ps.fireFlick(a,a.weapon);else ps.fireSplatling(a,a.weapon,3.3);
  const packets=nm.out.filter(e=>e[1]==='p');assert.equal(packets.length,kind==='roller'?13:1);const initial=packets.map(e=>new f.THREE.Vector3(e[8],e[9],e[10]));ps.clear();
  for(const packet of packets)ps.ghostProjectile(a,packet);assert.equal(ps.list.length,packets.length);ps.list.forEach((p,i)=>{assert.ok(p.ghost);for(const axis of ['x','y','z'])close(p.vel[axis],initial[i][axis],.011);});assert.equal(nm.out.length,packets.length);
 }
});
test('near-unit real native integration hits nearby floor and wall through actual OBB segment queries',async()=>{
 for(const wall of [false,true]){
  const f=await setup('roller'),ps=projectiles(f),V=f.THREE.Vector3;
  const b={id:0,solid:true,center:wall?new V(0,1,1.7):new V(0,-.1,0),half:wall?new V(10,4,.1):new V(100,.1,100),axes:[new V(1,0,0),new V(0,1,0),new V(0,0,1)],faces:[-1,-1,-1,-1,-1,-1]};
  const level={blocks:[b],queryBlocks:(_x,_z,_xx,_zz,out)=>{out.length=0;out.push(0);return out;}};f.G.level=level;f.G.physics=new f.Physics(level);f.setRandom(()=>.5);
  ps.fireFlick(f.a,f.a.weapon);const near=ps.list.find(p=>p.s3FlickUnit===1);ps.list.splice(0,ps.list.length,near);let impacts=0,paint=0;const impact=ps._impact;ps._impact=function(p,h){assert.equal(p,near);assert.ok(h.hit);impacts++;return impact.call(this,p,h);};f.G.paint.splat=()=>{paint++;return 0;};
  let wallDrop=null;const flightBudget=Math.ceil(near.life*60)+2;
  for(let i=0;i<flightBudget&&ps.list.length&&!wallDrop;i++){ps.update(1/60);wallDrop=near.fidelityWallDrop;}
  if(wall){
   assert.ok(wallDrop,'actual wall contact enters retained wall-drop instead of generic terminal impact');
   assert.equal(impacts,0,'wall-drop shock is not a second generic impact');assert.ok(paint>0,'sourced wall shock paints at contact');
   for(let i=0;i<wallDrop.totalFrames+2&&ps.list.length;i++)ps.update(1/60);
   assert.equal(wallDrop.done,true,'sourced wall-drop duration completes');assert.equal(impacts,0);
  }else assert.equal(impacts,1,'floor remains a single terminal native impact');
  assert.ok(paint>0);assert.equal(ps.list.length,0);
 }
});
test('zero-time update does not advance pending shot; separate actors and reset never share start state',async()=>{
 const f=await setup('dualies'),b=f.make('dualies');f.a.intent.fire=true;f.tick(f.a);const left=f.a.weaponRunner.s3DualiesStart;f.a.weaponRunner.update(0,{fire:true});close(f.a.weaponRunner.s3DualiesStart,left);assert.equal(f.shots.length,0);
 b.intent.fire=true;f.tick(b);f.tick(f.a);assert.equal(f.shots.length,0);f.tick(f.a);assert.equal(f.shots.length,1);f.tick(b);assert.equal(f.shots.length,1);f.tick(b);assert.equal(f.shots.length,2);
});
// #385: Splattershot wall contacts never reached the pinned WallDropMove /
// WallDropCollisionPaintParam phase. Real OBB wall/floor + the real native
// Physics, so this exercises the installed wall-hit path and not a stub.
async function shooterWallDrop({floor=true,dt=1/60,ghost=false}={}){
 const f=await setup('shooter'),ps=projectiles(f),V=f.THREE.Vector3;
 f.a.aimPoint.set(0,1.05,20);f.setRandom(()=>.5);
 const axes=[new V(1,0,0),new V(0,1,0),new V(0,0,1)],faces=[-1,-1,-1,-1,-1,-1];
 const blocks=[{id:0,solid:true,center:new V(0,1,4),half:new V(10,4,.1),axes,faces}];
 if(floor)blocks.push({id:1,solid:true,center:new V(0,-.1,0),half:new V(100,.1,100),axes,faces});
 const level={blocks,queryBlocks:(_x,_z,_xx,_zz,out)=>{out.length=0;for(const b of blocks)out.push(b.id);return out;}};
 f.G.level=level;f.G.physics=new f.Physics(level);
 const paints=[],owned=[];
 f.G.paint.splat=(point,radius)=>{paints.push({radius,y:point.y});return 1;};
 f.a.addTurf=area=>{owned.push(area);};
 let impacts=0;const impact=ps._impact;ps._impact=function(p,h){impacts++;return impact.call(this,p,h);};
 ps.fireShooter(f.a,f.a.weapon,0);
 const p=ps.list[0];if(ghost)p.ghost=true;
 let state=null,contact=null;
 for(let i=0;i<600&&ps.list.length;i++){
  f.G.time+=dt;ps.update(dt);
  if(!state&&p.fidelityWallDrop){contact=p.pos.clone();const s=p.fidelityWallDrop;
   assert.ok(p.prev.distanceTo(p.pos)<1e-9,'contact frame starts at the wall, not overshoot');
   state={firstFrames:s.firstFrames,secondFrames:s.secondFrames,lastFrames:s.lastFrames,totalFrames:s.totalFrames,
    firstSpeed:s.firstSpeed,secondSpeed:s.secondSpeed,shockRadius:s.shockRadius,fallRadius:s.fallRadius,groundRadius:s.groundRadius,
    y0:p.pos.y};}
 }
 return {f,ps,p,state,contact,impacts,paints,owned,live:ps.list.includes(p)};
}
test('splattershot wall contact runs the pinned WallDropMove/CollisionPaint phase, not one generic splat',async()=>{
 const r=await shooterWallDrop(),s=r.state;
 assert.ok(s,'actual Splattershot wall contact enters retained wall-drop');
 // The pinned S3 11.3.0 mirror already held these records; only family admission was missing.
 assert.ok(s.firstFrames>=20&&s.firstFrames<=40,'first period 20-40f');assert.equal(s.secondFrames,10);
 assert.ok(s.lastFrames>=15&&s.lastFrames<=35,'last period 15-35f');
 close(s.firstSpeed,.06);close(s.secondSpeed,.06);close(s.shockRadius,1.56);close(s.fallRadius,.65);close(s.groundRadius,.6);
 assert.equal(r.impacts,0,'wall-drop is not a second generic terminal impact');
 const at=radius=>r.paints.filter(p=>Math.abs(p.radius-radius)<1e-9).length;
 assert.equal(at(1.56),1,'shock paints once at the pinned contact radius');
 assert.ok(at(.65)>=1,'falling ink retains the pinned PaintRadiusFall');
 assert.ok(at(.6)>=1,'terminal ground phase paints the pinned PaintRadiusGround');
 assert.ok(r.paints.every(p=>[1.56,.65,.6].some(x=>Math.abs(p.radius-x)<1e-9)),'no generic impact radius is used');
 // one authoritative owner credit per owned splat
 assert.equal(r.owned.length,r.paints.length,'CPU owner is credited exactly once per owned splat');
 assert.ok(r.paints[0].y>r.paints[r.paints.length-1].y,'ink is laid top-down from the contact point');
 assert.equal(r.p.fidelityWallDrop.done,true,'sourced wall-drop retires');assert.equal(r.live,false);
 assert.equal(r.f.a.ink,100,'wall-drop never spends shooter ink');
});
test('splattershot wall-drop completes on its own source frames with no floor, and 30/60/120 Hz agree',async()=>{
 const r=await shooterWallDrop({floor:false});
 assert.ok(r.state,'no-floor wall still enters wall-drop');
 assert.equal(r.p.fidelityWallDrop.done,true,'retires on totalFrames, not on a terminal impact');
 assert.equal(r.impacts,0);assert.ok(r.paints.some(p=>Math.abs(p.radius-.65)<1e-9));
 const cadence=[];
 for(const dt of [1/30,1/60,1/120]){const c=await shooterWallDrop({floor:false,dt});
  cadence.push([c.state.firstFrames,c.state.secondFrames,c.state.lastFrames,c.paints.length]);}
 assert.deepEqual(cadence,[cadence[0],cadence[0],cadence[0]],'source periods and paint count are cadence-independent');
});
test('splattershot ghost replays the retained wall-drop without authority or paint credit',async()=>{
 const local=await shooterWallDrop(),ghost=await shooterWallDrop({ghost:true});
 assert.ok(ghost.state,'ghost reaches the same retained wall-drop');
 assert.equal(ghost.state.firstFrames,local.state.firstFrames);
 assert.equal(ghost.state.lastFrames,local.state.lastFrames);
 close(ghost.state.y0,local.state.y0,1e-9);
 assert.equal(ghost.paints.length,0,'ghost wall-drop cannot mutate turf');
 assert.equal(ghost.owned.length,0,'ghost wall-drop never credits the CPU owner');
 assert.ok(local.paints.length>0);
});
test('splattershot pool recycle and dispose clear retain no wall-drop state',async()=>{
 const r=await shooterWallDrop({floor:false});
 assert.equal(r.p.fidelityWallDrop.done,true);
 // the retired round returns to the pool; the next borrow must start clean
 r.ps.fireShooter(r.f.a,r.f.a.weapon,0);const reused=r.ps.list[0];
 assert.equal(reused,r.p,'pool reuse returns the same round');assert.equal(reused.fidelityWallDrop,null);
 r.ps.update(1/60);
 for(let i=0;i<600&&r.ps.list.length;i++)r.ps.update(1/60);
 assert.equal(r.ps.list.length,0,'reused round retires normally');
 assert.ok(reused.fidelityWallDrop,'reused round re-enters wall-drop cleanly');
 // a round discarded mid-wall-drop must not leak its retained state either
 r.ps.fireShooter(r.f.a,r.f.a.weapon,0);const mid=r.ps.list[0];
 for(let i=0;i<30&&r.ps.list.length&&!mid.fidelityWallDrop;i++)r.ps.update(1/60);
 assert.ok(mid.fidelityWallDrop,'discarded round is mid wall-drop');
 r.ps.clear();assert.equal(r.ps.list.length,0);
 r.ps.fireShooter(r.f.a,r.f.a.weapon,0);
 assert.equal(r.ps.list[0].fidelityWallDrop,null,'dispose clear retains no wall-drop');
});
test('ordinary floor contact stays a single generic impact for every family',async()=>{
 // Admitting shooter must not turn ground contact into a wall-drop: the shared
 // eligibility rule already rejects near-horizontal normals, so every family
 // keeps exactly one native terminal impact on the floor.
 const rounds={shooter:1,dualies:2,blaster:1,splatling:1};
 for(const [kind,expected] of Object.entries(rounds)){
  const f=await setup(kind),ps=projectiles(f),V=f.THREE.Vector3;
  f.a.aimPoint.set(0,0.02,20);f.setRandom(()=>.5);
  const axes=[new V(1,0,0),new V(0,1,0),new V(0,0,1)];
  const blocks=[{id:0,solid:true,center:new V(0,-.1,0),half:new V(100,.1,100),axes,faces:[-1,-1,-1,-1,-1,-1]}];
  const level={blocks,queryBlocks:(_x,_z,_xx,_zz,out)=>{out.length=0;out.push(0);return out;}};
  f.G.level=level;f.G.physics=new f.Physics(level);
  let paint=0;f.G.paint.splat=()=>{paint++;return 0;};
  let impacts=0;const impact=ps._impact;ps._impact=function(p,h){impacts++;return impact.call(this,p,h);};
  if(kind==='shooter')ps.fireShooter(f.a,f.a.weapon,0);
  else if(kind==='blaster')ps.fireBlaster(f.a,f.a.weapon,0);
  else if(kind==='splatling'){f.a.weaponRunner.fidelitySplatlingCharge=1;ps.fireSplatling(f.a,f.a.weapon,0);}
  else for(const hand of ['s3DualiesLeft','s3DualiesRight'])ps.fireDualies(f.a,f.a.weapon,0,hand);
  const live=[...ps.list];
  for(let i=0;i<200&&ps.list.length;i++)ps.update(1/60);
  assert.ok(live.every(p=>p.fidelityWallDrop===null),kind+' floor contact never enters wall-drop');
  assert.equal(impacts,expected,kind+' floor stays one generic impact per round');
  assert.ok(paint>=expected,kind+' floor still paints');
 }
});
