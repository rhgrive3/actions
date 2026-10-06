import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from './source-fixture.mjs';
import { emptyLoadout, normalizeLoadout, abilityAllowed } from '../runtime/gear.mjs';
import { adaptSource } from '../adapter.mjs';
import { FixedClock } from '../runtime/clock.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const extra=`
 export * from './patches/splatoon3/runtime/swim-stealth.mjs';
 export * from './inkwave-public/src/fx/swimWake.js';
 export * from './inkwave-public/src/fx/fxHooks.js';
 export * from './inkwave-public/src/net/netmatch.js';`;
function loadout(ap,ability='quickRespawn'){
  for(let main=0;main<=3;main++){
    const subs=(ap-main*10)/3;if(!Number.isInteger(subs)||subs<0||subs>9)continue;
    const value=emptyLoadout();for(let i=0;i<main;i++)value[i].main=ability;
    for(let i=0;i<subs;i++)value[Math.floor(i/3)].subs[i%3]=ability;return value;
  }throw Error('AP topology');
}
function equip(a,ap=0,ability='quickRespawn',ninja=false){
  a.s3.loadout=loadout(ap,ability);if(ninja)a.s3.loadout[1].main='ninjaSquid';a.setWeapon(a.weaponId);
}
function respawnServices(f){
  f.G.level.spawnPads=[new f.THREE.Vector3(),new f.THREE.Vector3()];
  f.G.physics.groundProbe=(_x,_y,_z,_u,_d,_r,h)=>{h.hit=false;return h;};
}
function enemy(f){const a=f.make();a.team=1;return a;}
function swim(f,a,speed=11.52){
  a.form='squid';a.intent.squid=true;a.submerged=true;a.grounded=true;a.climbing=false;a.groundTeam=1;
  a.anim.form='swim';a.vel.set(0,0,speed);f.updateSwimStealth(a);
}
function uniforms(f){
  const vecs=n=>({value:Array.from({length:n},()=>new f.THREE.Vector4())});
  return {uWake:vecs(48),uWakeB:vecs(4),uSwimH:vecs(4),uSwimF:vecs(4)};
}

test('#296 Ninja Squid is clothing-main-only and cannot stack in head/shoes/sub slots',()=>{
  const value=emptyLoadout();for(const p of value){p.main='ninjaSquid';p.subs.fill('ninjaSquid');}
  assert.deepEqual(normalizeLoadout(value),[{main:'none',subs:['none','none','none']},{main:'ninjaSquid',subs:['none','none','none']},{main:'none',subs:['none','none','none']}]);
  for(let piece=0;piece<3;piece++)for(let slot=0;slot<4;slot++)assert.equal(abilityAllowed('ninjaSquid',piece,slot),piece===1&&slot===0);
});

test('#296 actual horizontal movement applies a single 0.9 multiplier with swim gear and Flow',async()=>{
  const f=await fixture(extra);
  for(const ap of [0,3,10])for(const flow of [false,true]){
    const speeds=[];
    for(const ninja of [false,true]){
      const a=f.make();equip(a,ap,'swimSpeed',ninja);a.s3.flow.active=flow;swim(f,a,0);a.intent.move.set(0,0,1);
      for(let i=0;i<600;i++)a._horizontal(1/60,true,false);
      speeds.push(a.vel.z);close(f.PLAYER.swimSpeed,f.profile.player.swimSpeed);
    }close(speeds[1]/speeds[0],.9);
  }
});

test('#229 uses effective swim-speed ratio for local, ally and enemy actors, including gear/Flow',async()=>{
  const f=await fixture(extra);
  for(const team of [0,1])for(const local of [false,true])for(const flow of [false,true]){
    const a=f.make();a.team=team;a.isLocal=local;equip(a,10,'swimSpeed');a.s3.flow.active=flow;
    const top=f.profile.player.swimSpeed*f.swimSpeedMultiplier(a);
    for(const ratio of [.3,.599,.6,.601,1]){
      swim(f,a,top*ratio);assert.equal(f.swimTrailVisible(a),ratio>.6);assert.equal(f.swimSplashVisible(a),ratio>.6);
    }
  }
});

test('#296 delay starts at transformation, not movement, and preserves visible surface trails',async()=>{
  const f=await fixture(extra),a=f.make();equip(a,0,'swimSpeed',true);swim(f,a,10);
  f.G.time=29/60;assert.equal(f.swimSplashVisible(a),true);
  f.G.time=30/60;assert.equal(f.swimSplashVisible(a),false);assert.equal(f.swimTrailVisible(a),true);
  a.form='kid';f.updateSwimStealth(a);f.G.time=1;swim(f,a,0);
  f.G.time=1.5;a.vel.z=10;assert.equal(f.swimSplashVisible(a),false,'waiting stationary already consumes the delay');
  a.climbing=true;a.submerged=false;a.anim.form='climb';assert.equal(f.swimSplashVisible(a),true);
  a.reset();assert.equal(a.s3.swimStealth,null);
});

test('#229 actual surface-wake uniforms remain empty at 30% speed and old fast trails decay naturally',async()=>{
  const f=await fixture(extra),a=f.make(),w=new f.SwimWake(),u=uniforms(f);f.G.match.actors=[a];
  swim(f,a,3.456);
  for(let i=0;i<60;i++){f.G.time+=1/60;a.pos.z+=a.vel.z/60;w.update(1/60,u,a.pos);}
  assert.equal(w.slots.some(s=>s.actor),false);close(u.uSwimH.value[0].w,0);close(u.uWakeB.value[0].w,0);
  a.vel.z=11.52;for(let i=0;i<30;i++){f.G.time+=1/60;a.pos.z+=a.vel.z/60;w.update(1/60,u,a.pos);}
  const slot=w.slots.find(s=>s.actor===a);assert.ok(slot.pts.length>0);const count=slot.pts.length;
  a.vel.z=0;f.G.time+=1/60;w.update(1/60,u,a.pos);assert.ok(slot.pts.length>=count,'retained historical ripple points');
  for(let i=0;i<100;i++){f.G.time+=1/60;w.update(1/60,u,a.pos);}
  assert.equal(w.slots.some(s=>s.actor),false);
});

test('#296 native Actor wake particles and hard-turn splash are suppressed without removing dive events',async()=>{
  const f=await fixture(extra),a=f.make();let wake=0,carve=0,dives=0;
  f.G.fx={wake(){wake++;},swimCarve(){carve++;}};
  f.G.camera={position:new f.THREE.Vector3()};f.on('actor:dive',()=>dives++);
  a.character.update=()=>{};delete a._finishFrame;swim(f,a,3.456);
  for(let i=0;i<20;i++){f.G.time+=1/60;a._finishFrame(1/60);}
  close(wake,0);assert.ok(dives>0);
  equip(a,0,'swimSpeed',true);a.vel.z=10;f.G.time=1;a._finishFrame(1/60);
  const hooks=f.initFxHooks(f.G);hooks._actor(a,1/60);
  for(let i=0;i<20;i++){
    const angle=i*.8;a.vel.set(Math.sin(angle)*10,0,Math.cos(angle)*10);
    f.G.time+=1/60;a._finishFrame(1/60);hooks._actor(a,1/60);
  }
  close(wake,0);close(carve,0);
  equip(a,0);for(let i=0;i<20;i++){
    const angle=i*.8;a.vel.set(Math.sin(angle)*10,0,Math.cos(angle)*10);
    f.G.time+=1/60;a._finishFrame(1/60);hooks._actor(a,1/60);
  }
  assert.ok(wake>0&&carve>0,'unchanged native effects at full speed without Ninja Squid');
});

test('#229/#296 actual network packet and proxy preserve distinct splash/trail visibility',async()=>{
  const f=await fixture(extra),owner=f.make(),remote=f.make();equip(owner,0,'swimSpeed',true);
  owner.nid=4;swim(f,owner,10);f.G.time=1;let packet;
  const net=new f.NetMatch({myId:'local',isHost:false,tr:{broadcast(m){packet=m;}}},{});
  net.byNid.set(4,owner);net._sendTick();const p=packet.a[0],F=f.NET_FLAGS;
  assert.ok(p[10]&F.swimVisibility);assert.ok(p[10]&F.quietSplash);assert.equal(p[10]&F.quietTrail,0);
  remote.remote=true;remote.net={ready:true,err:new f.THREE.Vector3(),prevGrounded:true,prevVy:0,
    cur:{x:0,y:0,z:0,vx:0,vy:0,vz:10,yaw:0,aimYaw:0,aimPitch:0,f:p[10],hp:100,ink:100,sp:0,turf:0,ch:0,lock:0}};
  net.applyRemote(remote,1/60);assert.equal(f.swimSplashVisible(remote),false);assert.equal(f.swimTrailVisible(remote),true);
  owner.vel.z=3;net._sendTick();remote.net.cur.f=packet.a[0][10];net.applyRemote(remote,1/60);
  assert.equal(f.swimSplashVisible(remote),false);assert.equal(f.swimTrailVisible(remote),false);
  remote.net.cur.f=F.alive|F.squid|F.sub|F.grounded|F.gt1;net.applyRemote(remote,1/60);
  assert.equal(remote.s3.netSwimVisibility,null,'legacy packets use local fallback instead of stale flags');
});

test('#260 separately floors both camera phases for correct 0/3/6/10/20/30/57AP reduction',async()=>{
  const f=await fixture(),killer=enemy(f);respawnServices(f);
  for(const [ap,frames] of [[0,0],[3,24],[6,46],[10,74],[20,134],[30,180],[57,240]]){
    const a=f.make();equip(a,ap);a.splat(killer);const base=a.respawnTimer;a.respawn();a.splat(killer);
    close((base-a.respawnTimer)*60,frames);close(a.s3.modifiers.quickRespawnReduction*60,frames);
  }
});

test('#205 kill/death/no-kill/death becomes eligible immediately after the ineligible death',async()=>{
  const f=await fixture(),a=f.make(),killer=enemy(f);equip(a,57);respawnServices(f);
  f.emit('splatted',{victim:killer,attacker:a});a.splat(killer);const base=a.respawnTimer;
  a.respawn();a.splat(killer);close(a.respawnTimer,base-4);
  a.respawn();f.emit('splatted',{victim:killer,attacker:a});a.splat(killer);close(a.respawnTimer,base);
  a.respawn();a.splat(killer);close(a.respawnTimer,base-4);
});

test('#205 initial and environmental deaths do not qualify; environment preserves an existing interval',async()=>{
  const f=await fixture(),a=f.make(),killer=enemy(f);equip(a,57);respawnServices(f);
  const base=f.PLAYER.respawnTime;
  a.splat(null,'water');close(a.respawnTimer,f.profile.respawn.water);a.respawn();a.splat(killer);close(a.respawnTimer,base);
  a.respawn();a.splat(killer,'water');close(a.respawnTimer,f.profile.respawn.water);a.respawn();a.splat(killer);close(a.respawnTimer,base-4);
  a.respawn();f.emit('splatted',{victim:killer,attacker:a});a.splat(null,'fall');a.respawn();a.splat(killer);close(a.respawnTimer,base);
});

test('#205 assists do not block but posthumous final splats affect the next death; new match resets history',async()=>{
  const f=await fixture(),a=f.make(),killer=enemy(f),ally=f.make();equip(a,57);respawnServices(f);
  a.splat(killer);a.respawn();f.emit('damage',{victim:killer,attacker:a,amount:20,source:'shooter'});
  f.emit('splatted',{victim:killer,attacker:ally});a.splat(killer);const reduced=a.respawnTimer;
  f.emit('splatted',{victim:killer,attacker:a});close(a.respawnTimer,reduced);
  a.respawn();a.splat(killer);close(a.respawnTimer,f.PLAYER.respawnTime);
  a.reset();a.splat(killer);close(a.respawnTimer,f.PLAYER.respawnTime);
});

test('stealth adapter hooks fail closed on native wake, carving, trail and network changes',()=>{
  for(const [file,anchor] of [
    ['src/game/actor.js',"    if (a.form === 'swim' && hs > 2 && G.fx) {"],
    ['src/fx/fxHooks.js',"      if (form === 'swim' && hs > 4.5) {"],
    ['src/fx/swimWake.js',"        if (f !== 'swim' && f !== 'climb') continue;"],
    ['src/net/netmatch.js','  if (a.onEnemy) f |= F.enemy;'],
  ]){
    const source=fs.readFileSync(new URL('../../../inkwave-public/'+file,import.meta.url),'utf8');
    assert.throws(()=>adaptSource(file,source.replace(anchor,'')),/patch conflict/);
    assert.throws(()=>adaptSource(file,source.replace(anchor,anchor+'\n'+anchor)),/patch conflict/);
  }
});


test('swim stealth timing and native wake output agree across 30/60/120Hz render partitions',async()=>{
  const results=[];
  for(const hz of [30,60,120]){
    const f=await fixture(extra),a=f.make(),w=new f.SwimWake(),u=uniforms(f),clock=new FixedClock();
    equip(a,0,'swimSpeed',true);swim(f,a,10);a.character.update=()=>{};delete a._finishFrame;
    f.G.match.actors=[a];const trace=[];
    for(let i=0;i<hz;i++)clock.advance(1/hz,dt=>{
      f.G.time+=dt;a.pos.z+=a.vel.z*dt;a._finishFrame(dt);w.update(dt,u,a.pos);
      trace.push([f.swimSplashVisible(a),f.swimTrailVisible(a),u.uSwimH.value[0].w]);
    });
    assert.equal(trace[28][0],true);assert.equal(trace[29][0],false);assert.equal(trace[59][1],true);
    results.push(trace);
  }
  assert.deepEqual(results[0],results[1]);assert.deepEqual(results[1],results[2]);
});
