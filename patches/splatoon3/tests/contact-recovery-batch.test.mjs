import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {FixedClock} from '../runtime/clock.mjs';
const DT=1/60,near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function box(f,id,x,z,wx,wz,yaw=0){
 const V=f.THREE.Vector3,center=new V(x,1,z),half=new V(wx/2,1,wz/2),c=Math.cos(yaw),s=Math.sin(yaw);
 return {id,solid:true,center,half,axes:[new V(c,0,s),new V(0,1,0),new V(-s,0,c)],faces:Array(6).fill(-1)};
}
function world(f,blocks){
 const level={blocks,faces:[],queryBlocks:(_x,_z,_xx,_zz,out)=>{out.length=0;out.push(...blocks.map(b=>b.id));return out;},groundHeight:()=>0};
 level.pointInside=p=>blocks.some(b=>b.axes.every((ax,i)=>Math.abs(p.clone().sub(b.center).dot(ax))<(i===0?b.half.x:i===1?b.half.y:b.half.z)));
 f.G.physics=new f.Physics(level);f.G.level=level;return level;
}
function rolling(f){
 const a=f.make('roller');f.G.actors=[];a.vel.set(0,0,3);a.intent.fire=true;a._prevIntent.fire=true;a.weaponRunner.update(DT,{fire:true});return a;
}
function spentRoll(f,a){a.pos.z+=.3;f.tick(a);return a.ink;}

test('#200/#73: actual roll contact deals125 on open ground, and thin/rotated walls block it',async()=>{
 for(const [wall,hit] of [['none',true],['thin',false],['rotated',false]]){
  const f=await fixture(),a=rolling(f),e=f.make();e.team=1;e.pos.set(0,0,1);f.G.actors=[a,e];let damage=[];f.G.projectiles.applyHit=(_a,_e,d)=>damage.push(d);
  world(f,wall==='none'?[]:[box(f,0,0,.45,4,.03,wall==='rotated'?.25:0)]);
  a.weaponRunner.update(DT,{fire:true});assert.equal(damage.length,hit?1:0,wall);if(hit)near(damage[0],125);
  if(!hit){f.G.physics.level.blocks.length=0;a.weaponRunner.update(DT,{fire:true});assert.deepEqual(damage,[125]);}
 }
});

test('#73: corner-side contact uses the nearest drum point; a blocked drum path cannot start beyond cover',async()=>{
 for(const [targetX,wallX,expected]of [[1,0,true],[1,1,false],[0,0,false]]){
  const f=await fixture(),a=rolling(f),e=f.make();e.team=1;e.pos.set(targetX,0,1);f.G.actors=[e];let hits=0;f.G.projectiles.applyHit=()=>hits++;
  world(f,[box(f,0,wallX,.75,.25,.08)]);a.weaponRunner.update(DT,{fire:true});assert.equal(hits,expected?1:0);
 }
});

test('#73: team/dead/range gates and repeat contact interval stay unchanged',async()=>{
 const f=await fixture(),a=rolling(f),e=f.make();e.pos.set(0,0,1);f.G.actors=[e];world(f,[]);let hits=0;f.G.projectiles.applyHit=()=>hits++;
 a.weaponRunner.update(DT,{fire:true});assert.equal(hits,0);e.team=1;e.alive=false;a.weaponRunner.update(DT,{fire:true});assert.equal(hits,0);
 e.alive=true;e.pos.z=3;a.weaponRunner.update(DT,{fire:true});assert.equal(hits,0);e.pos.z=1;f.G.time=1;
 a.weaponRunner.update(DT,{fire:true});assert.equal(hits,1);f.G.time=1.4;a.weaponRunner.update(DT,{fire:true});assert.equal(hits,1);f.G.time=1.6;a.weaponRunner.update(DT,{fire:true});assert.equal(hits,2);
});

test('#176: last actual roll ink use reaches first refill at20F, not inherited43F',async()=>{
 for(const form of ['kid','squid']){
  const f=await fixture(),a=rolling(f),ink=spentRoll(f,a);assert.ok(ink<100);a.intent.fire=false;a.intent.squid=form==='squid';
  for(let i=1;i<20;i++){f.tick(a);near(a.ink,ink);}f.tick(a);assert.ok(a.ink>ink);near(a.weapon.rollInkRecoverStop,20/60);
 }
});

test('#176: horizontal43F / vertical58F swing stops retain their own boundaries',async()=>{
 for(const [grounded,frames]of [[true,43],[false,58]]){
  const f=await fixture(),a=f.make('roller');a.grounded=grounded;a.intent.fire=true;f.tick(a);const ink=a.ink;near(ink,91.5);a.intent.fire=false;
  for(let i=1;i<frames;i++){f.tick(a);near(a.ink,ink);}f.tick(a);assert.ok(a.ink>ink,`${frames}F`);assert.equal(a.s3.rollerRefillMode,false);
 }
});

test('#176: active roll never refills, and an outstanding longer lock is not shortened',async()=>{
 const f=await fixture(),a=rolling(f);spentRoll(f,a);const ink=a.ink;f.tick(a,30);near(a.ink,ink);
 a.s3.recoverStopRemaining=1;spentRoll(f,a);const next=a.ink;a.intent.fire=false;
 for(let i=1;i<59;i++){f.tick(a);near(a.ink,next);}f.tick(a);assert.ok(a.ink>next);
 a.reset();assert.equal(a.s3.rollerRefillMode,false);
});

function blast(f){
 const ps=new f.Projectiles(new f.THREE.Scene()),a=f.make('blaster');f.G.projectiles=ps;f.G.camera={position:new f.THREE.Vector3()};f.G.actors=[];
 const p=ps._new();Object.assign(p,{type:'blast',owner:a,team:0,radius:1,seed:.5,wid:'blaster'});p.vel.set(0,0,1);return {ps,p,a,at:new f.THREE.Vector3(0,.7,0)};
}
test('#221: actual terrain impact cuts player admission to0.4234 at floor/wall/slope contacts, not air bursts',async()=>{
 for(const normal of [[0,1,0],[0,0,-1],[0,.8,-.6]]){
  const f=await fixture(),{ps,p,a,at}=blast(f),e=f.make();e.team=1;f.G.actors=[e];let damage=[];ps.applyHit=(_a,_e,d)=>damage.push(d);
  const limit=a.weapon.splashRadius*.4234;const n=new f.THREE.Vector3(...normal);
  for(const [distance,expected]of [[limit-.001,1],[limit+.001,0],[a.weapon.splashRadius-.001,0]]){e.pos.set(distance,0,0);damage=[];ps._impact(p,{point:at,normal:n});assert.equal(damage.length,expected);}
  e.pos.set(a.weapon.splashRadius-.001,0,0);damage=[];ps._blastBurst(p,at,null);assert.equal(damage.length,1);assert.equal(!!p.s3TerrainBurst,false);
 }
});

test('#221: direct-hit exclusion, terrain LOS, boss splash and paint/visual sizes keep their owners',async()=>{
 const f=await fixture(),{ps,p,a,at}=blast(f),e=f.make(),other=f.make();e.team=other.team=1;e.pos.set(.5,0,0);other.pos.set(2,0,0);f.G.actors=[e,other];let hits=[],boss=[];ps.applyHit=(_a,e,d)=>hits.push([e,d]);
 const paint=[],visual=[];f.G.paint.splat=(_p,r)=>{paint.push(r);return 0;};f.G.fx={explosion:(_p,_c,r)=>visual.push(r),burst:()=>{}};
 f.G.physics.raycast=(from,dir,_d,out)=>{out.hit=dir.y<-.9;if(out.hit){out.point.copy(from).setY(0);out.normal.set(0,1,0);}return out;};
 f.G.boss={splash:(...args)=>boss.push(args)};ps._blastBurst(p,at,e);assert.equal(hits.length,1);assert.equal(hits[0][0],other);
 f.G.physics.los=()=>false;hits=[];ps._impact(p,{point:at,normal:new f.THREE.Vector3(0,1,0)});assert.equal(hits.length,0);near(boss.at(-1)[2],a.weapon.splashRadius);
 near(a.weapon.directDamage,125);near(a.weapon.terrainSplashRadiusRate,.4234);near(paint[0],a.weapon.impactRadius);near(paint.at(-1),a.weapon.impactRadius);assert.ok(visual.length>=2);for(const radius of visual)near(radius,a.weapon.burstRadius);
});

test('#221: impact cause is scoped to the call and clears even if a paint hook throws',async()=>{
 const f=await fixture(),{ps,p,at}=blast(f);f.G.paint.splat=()=>{throw Error('paint failure');};
 assert.throws(()=>ps._impact(p,{point:at,normal:new f.THREE.Vector3(0,1,0)}),/paint failure/);assert.equal(!!p.s3TerrainBurst,false);
});

test('contact/refill traces are render-rate independent through the public FixedClock',async()=>{
 const traces=[];
 for(const hz of [30,60,120]){const f=await fixture(),a=rolling(f);spentRoll(f,a);a.intent.fire=false;const clock=new FixedClock(),trace=[];
 for(let i=0;i<hz/2;i++)clock.advance(1/hz,dt=>{f.G.time+=dt;a.update(dt);trace.push(a.ink);});traces.push(trace);}
 assert.deepEqual(traces[0],traces[1]);assert.deepEqual(traces[1],traces[2]);
});

function runLoadout(gp){return Array.from({length:3},(_,i)=>({main:gp===57||gp===10&&i===0?'runSpeed':'none',subs:Array.from({length:3},(_,j)=>gp===57||gp===3&&i===0&&j===0?'runSpeed':'none')}));}
test('#350: real tap/held repeated horizontal/vertical flicks use firing gear at 0/3/10/57 AP from first windup frame',async()=>{
 for(const gp of [0,3,10,57])for(const vertical of [false,true])for(const held of [false,true]){
  const f=await fixture(),a=f.make('roller'),b=f.make('roller');a.s3.loadout=runLoadout(gp);a.setWeapon('roller');a.grounded=b.grounded=!vertical;f.G.actors=[];f.G.projectiles.applyHit=()=>{};
  const factor=f.gearCurve(gp,...f.profile.gearExtra.runSpeedFiring);let winding=0,rolling=0;
  for(let i=0;i<130;i++){
   const press=i===0||i===70,input={fire:held||press,firePressed:press};a.weaponRunner.update(DT,input);b.weaponRunner.update(DT,input);
   const r=a.weaponRunner,s=b.weaponRunner;assert.equal(r.flick,s.flick);
   if(r.flick>=0){near(r.moveSpeed()/s.moveSpeed(),factor);winding++;}
   else if(r.rolling){near(r.moveSpeed(),s.moveSpeed());rolling++;}
   else if(r.firingT>0)near(r.moveSpeed()/s.moveSpeed(),factor);
  }
  assert.ok(winding>=40);if(held&&!vertical)assert.ok(rolling>0);near(f.WEAPONS.roller.moveSpeedFiring,2.88);
 }
});
test('#350: idle walking retains normal gear, while reset, re-equip, enemy ink and other actors do not compound it',async()=>{
 const f=await fixture(),a=f.make('roller'),b=f.make('roller');a.s3.loadout=runLoadout(57);a.setWeapon('roller');near(a.weaponRunner.moveSpeed()/b.weaponRunner.moveSpeed(),1.5);
 for(let i=0;i<3;i++){a.weaponRunner.update(DT,{firePressed:true});near(a.weaponRunner.moveSpeed(),2.88*1.25);a.reset();a.setWeapon('roller');near(a.weaponRunner.moveSpeed(),f.PLAYER.runSpeed*1.5);}
 a.weaponRunner.update(DT,{firePressed:true});a.grounded=true;a.intent.fire=true;a.intent.move.set(1,0,0);a.vel.set(a.s3.modifiers.enemyShotSpeed,0,0);a._horizontal(DT,false,true);near(a.vel.x,a.s3.modifiers.enemyShotSpeed);near(b.weaponRunner.moveSpeed(),f.PLAYER.runSpeed);
 a.setWeapon('shooter');near(a.weaponRunner.moveSpeed(),f.PLAYER.runSpeed*1.5);a.weaponRunner.firingT=.2;near(a.weaponRunner.moveSpeed(),a.weapon.moveSpeedFiring*1.25);
});
test('#350: previous firing pose cannot change the same flick-phase gear ratio',async()=>{
 const f=await fixture(),a=f.make('roller'),b=f.make('roller');for(const x of[a,b]){x.s3.loadout=runLoadout(10);x.setWeapon('roller');}
 a.weaponRunner.firingT=.3;
 for(let i=0;i<20;i++){const input={firePressed:i===0};a.weaponRunner.update(DT,input);b.weaponRunner.update(DT,input);near(a.weaponRunner.moveSpeed(),b.weaponRunner.moveSpeed());}
});
test('#350: fixed 30/60/120 Hz schedules keep identical flick-phase caps and real horizontal motion',async()=>{
 const traces=[];for(const hz of [30,60,120]){
  const f=await fixture(),a=f.make('roller'),clock=new FixedClock(),rows=[];a.s3.loadout=runLoadout(57);a.setWeapon('roller');a.intent.move.set(1,0,0);
  for(let i=0;i<hz;i++)clock.advance(1/hz,dt=>{a.weaponRunner.update(dt,{firePressed:rows.length===0});a._horizontal(dt,false,false);rows.push([a.weaponRunner.flick,a.weaponRunner.moveSpeed(),a.vel.x,a.vel.z]);});traces.push(rows);
 }assert.deepEqual(traces[0],traces[1]);assert.deepEqual(traces[1],traces[2]);
});
