import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {FixedClock} from '../runtime/clock.mjs';
import {damageTenths,finalWeaponDamage} from '../runtime/final-damage.mjs';
import {slosherFallDamage,slosherUnits,wrapSloshAngle} from '../runtime/slosher.mjs';
const DT=1/60,near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function setup(f){const a=f.make('slosher'),ps=new f.Projectiles(new f.THREE.Scene());a.aimPoint.set(0,1.05,14.5);a.aimDir.set(0,0,1);a.aimYaw=0;f.G.actors=[a];f.G.projectiles=ps;f.G.camera={position:new f.THREE.Vector3()};f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};return{a,ps};}

test('#258: actual fireSlosh emits two immutable 4+5 units at sourced delay offsets before network recording',async()=>{
 const f=await fixture(),{a,ps}=setup(f),recorded=[];f.G.netm={recProj:p=>recorded.push({delay:p.delay,damage:p.damage,velocity:p.vel.toArray(),size:p.size})};
 ps.fireSlosh(a,a.weapon);assert.equal(ps.list.length,9);
 assert.deepEqual(Array.from(ps.list,p=>p.damage),[70,70,70,70,50,50,50,50,50]);
 ps.list.forEach((p,i)=>{near(p.delay,[0,1,2,3,4,6,8,10,12][i]*DT);assert.equal(p.vol,ps.list[0].vol);assert.equal(p.s3DamageGroup,ps.list[0].s3DamageGroup);near(p.vel.distanceTo(new f.THREE.Vector3(...recorded[i].velocity)),0);near(p.size,recorded[i].size);});
 const snapshot=ps.list.map(p=>p.vel.toArray());a.aimYaw=2;a.aimPoint.set(20,10,-20);a.vel.set(50,-10,5);a.setWeapon('shooter');
 assert.deepEqual(ps.list.map(p=>p.vel.toArray()),snapshot);
});

test('#258: last-tick yaw history sweeps left/right, clamps per-tick input, wraps pi, and never follows later aim',async()=>{
 const traces=[];
 for(const previous of [0,-.1,.1,-1]){
  const f=await fixture(),{a,ps}=setup(f);a.aimYaw=previous;
  for(let i=0;i<12;i++)a.weaponRunner.update(DT,{fire:true});
  a.aimYaw=0;a.weaponRunner.update(DT,{fire:true});
  assert.equal(ps.list.length,9);traces.push(ps.list.map(p=>Math.atan2(p.vel.x,p.vel.z)));
 }
 assert.ok(traces[0].every(y=>Math.abs(y)<1e-8));assert.ok(traces[1].at(-1)>0);assert.ok(traces[2].at(-1)<0);
 near(traces[1][1],.1);near(traces[2][1],-.1);near(traces[3][1],Math.PI/18);
 near(wrapSloshAngle(-Math.PI+.02-(Math.PI-.02)),.04);
});

test('#258: main/tail speed and radius ratios are per-unit, with the existing base calibrated separately',async()=>{
 const f=await fixture(),{a,ps}=setup(f);ps.fireSlosh(a,a.weapon);const p=ps.list;
 const speed=q=>Math.hypot(q.vel.x,q.vel.y-q.grav/120,q.vel.z);
 near(speed(p[1])/speed(p[0]),(1.7609-.16)/1.7609);near(speed(p[4])/speed(p[0]),1.1/1.7609);
 near(p[3].size/p[0].size,(.97-.12*3)/.97);near(p[8].size/p[0].size,(.57-.05*4)/.97);
});

test('#217: slosher head applies monotone 70-to-50 drop model, tail stays 50, via actual hit-to-HP path',async()=>{
 const f=await fixture(),{a,ps}=setup(f),w=a.weapon;
 for(const [drop,expected]of [[-5,70],[0,70],[1.5,70],[4.5625,60],[7.625,50],[20,50]]){
  const e=f.make();e.team=1;e.invuln=0;e.hp=100;
  const p={owner:a,s3Weapon:w,s3DamageGroup:new Map(),head:true,s3SloshGroup:0,wid:'slosher',type:'slosh',start:new f.THREE.Vector3(0,10,0)};
  f.applyProjectileHit(ps,p,e,70,new f.THREE.Vector3(0,10-drop,0));near(e.hp,100-expected);
  near(slosherFallDamage(w,drop,false),50);
 }
});

test('#219: ground and direct-impact splash preserve ink/FX but cannot damage neighboring players or boss',async()=>{
 const f=await fixture(),{a,ps}=setup(f),e=f.make();e.team=1;e.pos.set(1,0,0);f.G.actors=[a,e];let hits=0,boss=0,paint=0,fx=0;
 f.G.boss={splash(){boss++}};f.G.paint.splat=()=>{paint++;return 1;};f.G.fx={muzzle(){},burst(){fx++},ring(){fx++}};ps.applyHit=()=>hits++;
 ps.fireSlosh(a,a.weapon);const p=ps.list[0],at=new f.THREE.Vector3();
 ps._sloshSplash(p,at,null);ps._sloshSplash(p,at,e);ps._sloshSplash(p,at,'boss');
 ps._impact(p,{point:at,normal:new f.THREE.Vector3(0,1,0)});
 assert.equal(hits,0);assert.equal(boss,0);assert.ok(paint>0);assert.ok(fx>0);
});

test('#261: 10F/10F/18F shooter hits leave .1 HP, with one victim-side quantizer',async()=>{
 const f=await fixture(),{ps}=setup(f),a=f.make('shooter'),e=f.make();e.team=1;e.invuln=0;
 for(const age of [10,10,18])f.applyProjectileHit(ps,{owner:a,s3Weapon:a.weapon,age:age*DT,wid:'shooter'},e,36);
 near(e.hp,.1);assert.equal(e.alive,true);assert.equal(e.stats.deaths,0);
 for(const x of [0,.1,.3,34.8,70,100])near(damageTenths(x),x);
 near(damageTenths(34.899),34.8);near(damageTenths(34.9-1e-14),34.9);
});

test('#261: grouped fractional max hits retain a single rounding remainder after defensive scaling',async()=>{
 const f=await fixture(),{ps}=setup(f),a=f.make('roller'),e=f.make();e.team=1;e.invuln=0;
 ps.applyHit(a,e,30.39,'roller',17);ps.applyHit(a,e,3.92,'roller',17);near(e.hp,65.7);
 e.reset();e.team=1;e.invuln=0;e.specialActive={armor:true};
 ps.applyHit(a,e,30.39,'roller',18);ps.applyHit(a,e,3.92,'roller',18);near(e.hp,100-8.5);
 assert.equal(e.s3PendingHitGroup,null);
});

test('#261: raw hit transport avoids r2 pre-rounding and carries group credit to authoritative receiver',async()=>{
 const f=await fixture(),{ps}=setup(f),a=f.make('shooter'),e=f.make();a.nid=1;e.nid=2;e.team=1;e.invuln=0;e.owner='remote';
 const packets=[],net=new f.NetMatch({myId:'local',tr:{sendTo:(_owner,p)=>packets.push(JSON.parse(JSON.stringify(p)))}},{});
 net.shouldApplyHit=()=>net._applyingHit?'local':'send';net.byNid.set(1,a);net.byNid.set(2,e);f.G.netm=net;
 ps.applyHit(a,e,34.899,'shooter');assert.equal(packets[0].d,34.899);near(e.hp,100);
 e.remote=false;net._hit(packets[0]);near(e.hp,65.2);
 e.reset();e.team=1;e.invuln=0;e.owner='remote';
 ps.applyHit(a,e,30.39,'roller',32);ps.applyHit(a,e,3.92,'roller',32);
 net._hit(packets[1]);net._hit(packets[2]);near(e.hp,65.7);
});

test('#261: final rounding never quantizes ink contact, HP recovery, or an unrelated attack group',async()=>{
 const f=await fixture(),{ps}=setup(f),a=f.make('shooter'),e=f.make();e.team=1;e.invuln=0;
 e.damage(.019,a,'ink');near(e.hp,99.981);
 ps.applyHit(a,e,.39,'shooter',1);ps.applyHit(a,e,.39,'shooter',2);near(e.hp,99.381);
});

test('#258: native update consumes delay once and does not move later units on the preceding tick',async()=>{
 const f=await fixture(),{a,ps}=setup(f);ps.fireSlosh(a,a.weapon);const first=new Map();let tick=0;
 ps._draw=()=>{};ps._step=(p,dt)=>{if(!first.has(p))first.set(p,{tick,dt});return false;};
 for(tick=1;tick<=13;tick++)ps.update(DT);
 assert.deepEqual(Array.from(ps.list,p=>first.get(p).tick),[1,2,3,4,5,7,9,11,13]);
 ps.list.forEach(p=>near(first.get(p).dt,DT));
});

test('#258: committed volley survives owner death/swap without retargeting; clear discards all pending units',async()=>{
 const f=await fixture(),{a,ps}=setup(f);ps.fireSlosh(a,a.weapon);a.alive=false;a.setWeapon('shooter');
 const first=new Set();ps._draw=()=>{};ps._step=p=>{first.add(p);return false;};
 for(let t=0;t<13;t++)ps.update(DT);assert.equal(first.size,9);
 ps.clear();assert.equal(ps.list.length,0);ps.update(DT);assert.equal(ps.list.length,0);
});

test('#217/#261: tail then decreasing/greater heads gives one quantized maximum, not summed pellets',async()=>{
 const f=await fixture(),{a,ps}=setup(f),e=f.make();e.team=1;e.invuln=0;ps.fireSlosh(a,a.weapon);
 const [head,,,head2,tail]=ps.list;
 f.applyProjectileHit(ps,tail,e,50,new f.THREE.Vector3(0,tail.start.y,0));near(e.hp,50);
 f.applyProjectileHit(ps,head,e,70,new f.THREE.Vector3(0,head.start.y-4.5625,0));near(e.hp,40);
 f.applyProjectileHit(ps,head2,e,70,new f.THREE.Vector3(0,head2.start.y,0));near(e.hp,30);
 f.applyProjectileHit(ps,tail,e,50,new f.THREE.Vector3(0,tail.start.y,0));near(e.hp,30);
});

test('#258: real NetMatch transmits exact slosher delay and remote ghosts never resample the unit schedule',async()=>{
 const f=await fixture(),{a,ps}=setup(f);a.nid=1;const net=new f.NetMatch({myId:'local'},{});f.G.netm=net;
 ps.fireSlosh(a,a.weapon);const packets=JSON.parse(JSON.stringify(net.out));assert.equal(packets.length,9);
 const local=ps.list.map(p=>p.delay);packets.forEach((p,i)=>near(p[11],local[i]));
 const remote=new f.Projectiles(new f.THREE.Scene());packets.forEach(p=>remote.ghostProjectile(a,p));
 remote.list.forEach((p,i)=>near(p.delay,local[i]));assert.equal(net.out.length,9);
});

test('30/60/120Hz rendering gives identical native per-tick slosh spawn, position and velocity traces',async()=>{
 const traces=[];
 for(const hz of [30,60,120]){
  const f=await fixture(),{a,ps}=setup(f),clock=new FixedClock(),rows=[];ps._draw=()=>{};
  for(let frame=0;frame<hz;frame++)clock.advance(1/hz,dt=>{
   const tick=rows.length;a.aimYaw=tick===11?-.1:0;
   a.weaponRunner.update(dt,{fire:tick<13});ps.update(dt);
   rows.push(Array.from(ps.list,p=>[p.s3SloshGroup,p.s3SloshIndex,p.delay,p.age,...p.pos.toArray(),...p.vel.toArray()]));
  });traces.push(rows);
 }
 assert.deepEqual(traces[0],traces[1]);assert.deepEqual(traces[1],traces[2]);
});

test('Slosher retains the native one-volley boss direct-hit cap while removing radial splash',async()=>{
 const f=await fixture(),{a,ps}=setup(f);let direct=0,splash=0;f.G.boss={hit(_a,d){direct+=d;},splash(){splash++;}};
 ps.fireSlosh(a,a.weapon);const target={};const hit={point:new f.THREE.Vector3(0,0,1),target};
 for(const p of ps.list)ps._bossImpact(p,hit);
 near(direct,70);assert.equal(splash,0);
});

test('#261: exact decimal-tenth lethal totals cannot leave a floating-point sliver alive',async()=>{
 const f=await fixture(),{ps}=setup(f),a=f.make('shooter'),e=f.make();e.team=1;e.invuln=0;
 for(const d of [33.3,33.3,33.4])ps.applyHit(a,e,d,'shooter');
 assert.equal(e.hp,0);assert.equal(e.alive,false);assert.equal(e.stats.deaths,1);
});

test('#261: owner handoff and respawn isolate fractional group credit',async()=>{
 const f=await fixture(),{ps}=setup(f),a=f.make('shooter'),e=f.make();e.team=1;e.invuln=0;
 a.owner='peer-a';ps.applyHit(a,e,.39,'shooter',1);a.owner='host';ps.applyHit(a,e,.39,'shooter',1);near(e.hp,99.4);
 e.reset();e.team=1;e.invuln=0;ps.applyHit(a,e,.39,'shooter',1);near(e.hp,99.7);
});

test('#293: all9 units snapshot separate player collision endpoints and5F growth without changing field/visual size',async()=>{
 const {slosherPlayerCollisionRadius}=await import('../runtime/slosher.mjs');
 const f=await fixture(),{a,ps}=setup(f);ps.fireSlosh(a,a.weapon);const sizes=ps.list.map(p=>p.size);
 ps.list.forEach((p,i)=>{const g=i<4?0:1,k=i<4?i:i-4,lo=(g ? .057 : .097)-k*(g ? .005 : .012),hi=(g ? .57 : .97)-k*(g ? .05 : .12);
  assert.ok(Object.isFrozen(p.s3SloshPlayerCollision));assert.equal(p.fidelityPlayerCollision,p.s3SloshPlayerCollision);
  for(const [frames,t]of [[0,0],[2.5,.5],[5,1],[10,1]]){p.age=frames*DT;near(slosherPlayerCollisionRadius(p),lo+(hi-lo)*t);near(p.size,sizes[i]);}
 });
});

test('#293: actual player path misses .50 at spawn but hits .80 after5F; field query retains its old radius',async()=>{
 for(const [age,x,expected]of [[0,.50,0],[5*DT,.80,1]]){
  const f=await fixture(),{a,ps}=setup(f),e=f.make();e.team=1;e.pos.set(x,0,5);f.G.actors=[e];ps.fireSlosh(a,a.weapon);const p=ps.list[0];p.pos.set(0,.8,5);p.vel.set(0,0,0);p.age=age;p.trailEvery=0;
  let hits=0;ps.applyHit=()=>hits++;ps._step(p,0);assert.equal(hits,expected);near(p.size,.2);
 }
});

test('#293: launch snapshot survives owner swap and projectile pooling clears it',async()=>{
 const {slosherPlayerCollisionRadius}=await import('../runtime/slosher.mjs');
 const f=await fixture(),{a,ps}=setup(f);ps.fireSlosh(a,a.weapon);const p=ps.list[0];a.setWeapon('shooter');p.age=5*DT;near(slosherPlayerCollisionRadius(p),.97);
 ps.list.length=0;ps.pool.push(p);const reused=ps._new();assert.equal(reused,p);assert.equal(reused.s3SloshPlayerCollision,null);assert.equal(reused.fidelityPlayerCollision,null);reused.size=.15;near(slosherPlayerCollisionRadius(reused),.15);
});

test('#293: delayed units grow by flight age only with identical30/60/120Hz traces',async()=>{
 const {slosherPlayerCollisionRadius}=await import('../runtime/slosher.mjs');const results=[];
 for(const hz of [30,60,120]){
  const f=await fixture(),{a,ps}=setup(f);ps.fireSlosh(a,a.weapon);const units=ps.list.slice(),clock=new FixedClock(),rows=[];ps._draw=()=>{};
  for(let i=0;i<hz/2;i++)clock.advance(1/hz,dt=>{ps.update(dt);rows.push(Array.from(units,p=>[p.age,slosherPlayerCollisionRadius(p)]));});results.push(rows);
  near(rows[4][8][0],0);near(rows[4][8][1],.037);near(rows[16][8][1],.37);
 }
 assert.deepEqual(results[0],results[1]);assert.deepEqual(results[1],results[2]);
});

function runGear(a,gp){a.s3.loadout=Array.from({length:3},(_,i)=>({main:gp===57||gp===10&&i===0?'runSpeed':'none',subs:Array(3).fill(gp===57?'runSpeed':'none')}));a.setWeapon('slosher');}
test('#347: real continuous windup and release use one actor-local firing cap at 0/10/57 AP on ground and air',async()=>{
 for(const gp of [0,10,57])for(const grounded of [false,true]){
  const f=await fixture(),a=f.make('slosher'),r=a.weaponRunner;runGear(a,gp);a.grounded=grounded;
  const cap=a.weapon.moveSpeedFiring*f.gearCurve(gp,...f.profile.gearExtra.runSpeedFiring),ticks=[];let tick=0,windups=0;
  near(cap,gp===0?2.4:gp===10?2.5818:3);near(r.moveSpeed(),f.PLAYER.runSpeed*a.s3.modifiers.runSpeed);
  f.G.projectiles.fireSlosh=()=>ticks.push(tick);
  for(tick=1;tick<=80;tick++){r.update(DT,{fire:true});if(r.slosh>=0)windups++;if(r.firingT>0)near(r.moveSpeed(),cap);}
  assert.ok(windups>=24);assert.ok(ticks.length>=3);assert.equal(ticks[0],13);
  for(let i=0;i<60;i++)r.update(DT,{fire:false});assert.equal(r.slosh,-1);near(r.moveSpeed(),f.PLAYER.runSpeed*a.s3.modifiers.runSpeed);
 }
});
test('#347: movement owner retains ground cap, airborne floor and enemy-ink clamp',async()=>{
 const f=await fixture(),a=f.make('slosher'),r=a.weaponRunner;r.update(DT,{fire:true});a.intent.move.set(1,0,0);a.intent.fire=true;
 a.vel.set(2.4,0,0);a._horizontal(DT,false,false);near(a.vel.x,2.4);near(a.vel.z,0);
 a.grounded=false;a.vel.set(f.PLAYER.airMinSpeed,0,0);a._horizontal(DT,false,false);near(a.vel.x,f.PLAYER.airMinSpeed);
 a.grounded=true;a.vel.set(a.s3.modifiers.enemyShotSpeed,0,0);a._horizontal(DT,false,true);near(a.vel.x,a.s3.modifiers.enemyShotSpeed);
});
test('#347: empty input, actor isolation and other weapon move modes are unchanged',async()=>{
 const f=await fixture(),a=f.make('slosher'),b=f.make('slosher');runGear(a,57);runGear(b,0);a.weaponRunner.update(DT,{fire:true});b.weaponRunner.update(DT,{fire:true});near(a.weaponRunner.moveSpeed(),3);near(b.weaponRunner.moveSpeed(),2.4);
 a.reset();a.ink=0;a.weaponRunner.update(DT,{fire:true});assert.equal(a.weaponRunner.slosh,-1);near(a.weaponRunner.moveSpeed(),f.PLAYER.runSpeed*a.s3.modifiers.runSpeed);
 for(const id of ['shooter','dualies','blaster','charger','splatling','roller']){
  const c=f.make(id),r=c.weaponRunner;near(r.moveSpeed(),f.PLAYER.runSpeed);r.firingT=.3;near(r.moveSpeed(),c.weapon.moveSpeedFiring);
  if(id==='dualies'){r.lockT=.2;near(r.moveSpeed(),0);}
  if(id==='roller'){r.firingT=0;r.rolling=true;r.rollT=0;near(r.moveSpeed(),c.weapon.rollBaseSpeed);}
 }
});
test('#347: 30/60/120 Hz rendering shares identical real ground velocity and attack-cap traces',async()=>{
 const traces=[];
 for(const hz of [30,60,120]){
  const f=await fixture(),a=f.make('slosher'),clock=new FixedClock(),rows=[];runGear(a,10);a.intent.move.set(1,0,0);f.G.projectiles.fireSlosh=()=>{};
  for(let frame=0;frame<hz;frame++)clock.advance(1/hz,dt=>{a.weaponRunner.update(dt,{fire:rows.length<40});a._horizontal(dt,false,false);rows.push([a.weaponRunner.slosh,a.weaponRunner.moveSpeed(),a.vel.x,a.vel.z]);});traces.push(rows);
 }
 assert.deepEqual(traces[0],traces[1]);assert.deepEqual(traces[1],traces[2]);
});
