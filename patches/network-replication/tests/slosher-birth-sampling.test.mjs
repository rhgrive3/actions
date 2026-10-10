import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './robustness-fixture.mjs';

const DT=1/60;
const close=(a,b,eps=1e-8)=>Math.abs(a-b)<=eps;
const angleDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));

function scheduleFor(profile){
  const result=[];
  for(const unit of profile.weaponsFidelityCompletion.weapons.slosher.UnitGroupParam.Unit){
    for(let index=0;index<(unit.BulletNum??1);index++){
      const delayFrames=(unit.UnitDelayFrame||0)+index*(unit.AfterOffsetDelayFrame||0);
      result.push({
        delayFrames,delay:delayFrames/60,index,
        ground:((unit.SpawnSpeedGround||0)+index*(unit.AfterOffsetSpawnSpeed||0))*60,
        air:((unit.SpawnSpeedAir||0)+index*(unit.AfterOffsetSpawnSpeed||0))*60,
      });
    }
  }
  return result.sort((a,b)=>a.delayFrames-b.delayFrames);
}

function createActor(f,{nid=0,owner='me',remote=false,native=false}={}){
  let actor;
  if(native){
    class CharacterStub{
      constructor(){this.root={visible:true};this.aimReady=()=>1;}
      setWeapon(){}
      trigger(){}
      getMuzzle(out){return out;}
    }
    actor=new f.Actor({team:0,name:'Me',weapon:'slosher',isLocal:false,CharacterClass:CharacterStub});
  }else actor=f.makeActor({nid,owner,remote,roller:false});
  Object.assign(actor,{nid,owner,remote,team:0,alive:true,grounded:true,form:'kid',isLocal:false});
  actor.weapon=f.WEAPONS.slosher;
  actor.weaponId='slosher';
  actor.aimDir.set(0,0,1);
  actor.character.getMuzzle=out=>{
    out.copy(actor.pos).addScaledVector(actor.aimDir,0.3);
    out.y=actor.pos.y+1.05;
    return out;
  };
  return actor;
}

async function runVolley({hz=60,network=true,move=false,aimChangeAt=null,flipGroundAt=null,flipTo=false,initialGrounded=true,invalid=null,turnDelta=0}={}){
  const f=await fixture({network:true});
  const a=createActor(f,{native:invalid==='reset'});
  (a.weaponRunner||={}).s3SloshTurnDelta=turnDelta;
  a.grounded=initialGrounded;
  f.G.actors.push(a);
  const nm=network?f.makeNetMatch(f.makeSession('me','me',[['me','Me']])):null;
  if(nm)f.bind(nm,[a]);
  else f.G.netm=null;
  f.G.time=0;f.clock.set(1000);
  const prepared=new WeakMap(),births=[];
  const push=f.projectiles._push.bind(f.projectiles);
  f.projectiles._push=p=>{
    const result=push(p);
    if(p.type==='slosh'&&p._s3SloshBirthPending){
      prepared.set(p,{yaw:Math.atan2(p.vel.x,p.vel.z),seed:p.seed,delay:p._s3SloshBirthDelay});
    }
    return result;
  };
  const capture=p=>{
    const before=prepared.get(p)||{};
    births.push({
      tick:Math.round(f.G.time*60),start:p.start.toArray(),pos:p.pos.toArray(),
      vel:[p.vel.x,p.vel.y,p.vel.z],speed:Math.hypot(p.vel.x,p.vel.z),
      yaw:Math.atan2(p.vel.x,p.vel.z),preparedYaw:before.yaw,seed:p.seed,preparedSeed:before.seed,
      scheduledDelay:p._s3SloshBirthDelay,grounded:p.owner.grounded,
      ownerPos:p.owner.pos.toArray(),aim:p.owner.aimDir.toArray(),projectile:p,
    });
  };
  if(nm){
    const recProj=nm.recProj.bind(nm);
    nm.recProj=p=>{if(p.type==='slosh'&&p._s3SloshBirthPending)capture(p);return recProj(p);};
    nm.out.length=0;
  }else{
    const step=f.projectiles._step.bind(f.projectiles);
    f.projectiles._step=(p,dt)=>{
      const pending=p._s3SloshBirthPending,result=step(p,dt);
      if(pending&&!result)capture(p);
      return result;
    };
  }

  f.projectiles.fireSlosh(a,a.weapon);
  const packetsAtFire=nm?nm.out.filter(e=>e[1]==='p').length:0;
  if(invalid==='dead'){a.alive=false;a.hp=0;}
  if(invalid==='special')a.specialActive={id:'special'};
  if(invalid==='replace'){a.weapon=f.WEAPONS.shooter;a.weaponId='shooter';}
  if(invalid==='stale'){a.remote=true;a.owner='transferred';f.G.actors.length=0;}
  if(invalid==='removed')f.G.actors.length=0;
  if(invalid==='reset')a.reset();

  let simTick=0,accumulator=0;
  const renders=16*hz/60;
  for(let render=0;render<renders;render++){
    accumulator+=1/hz;
    while(accumulator+1e-12>=DT){
      accumulator-=DT;simTick++;f.G.time=simTick*DT;f.clock.set(1000+f.G.time);
      if(move)a.pos.z+=0.04;
      if(aimChangeAt===simTick)a.aimDir.set(1,0,1).normalize();
      if(flipGroundAt===simTick)a.grounded=flipTo;
      f.projectiles.update(DT);
    }
  }
  const packets=nm?nm.out.filter(e=>e[1]==='p'):[];
  return {f,a,nm,births,packets,packetsAtFire,liveSlosh:f.projectiles.list.filter(p=>p.type==='slosh')};
}

function pairwiseSpread(points){
  let max=0;
  for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++){
    const a=points[i],b=points[j];
    max=Math.max(max,Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]));
  }
  return max;
}

test('stationary Slosher births retain profile speeds, cadence, and prepared sweep direction',async()=>{
  for(const grounded of [true,false]){
    const r=await runVolley({initialGrounded:grounded}),schedule=scheduleFor(r.f.profile);
    assert.equal(schedule.length,9);
    assert.deepEqual(r.births.map(b=>b.tick),schedule.map(s=>s.delayFrames+1));
    assert.equal(r.packetsAtFire,0);
    assert.equal(r.packets.length,9);
    assert.equal(new Set(r.births.map(b=>b.projectile.s3DamageGroup)).size,1,'the existing volley damage group stays shared');
    for(let i=0;i<schedule.length;i++){
      const b=r.births[i],s=schedule[i];
      assert.ok(close(b.speed,grounded?s.ground:s.air,1e-8),`profile speed for glob ${i}`);
      assert.ok(close(b.scheduledDelay,s.delay,1e-10),`profile delay for glob ${i}`);
      assert.ok(Math.abs(angleDelta(b.yaw,b.preparedYaw))<1e-10,`prepared sweep yaw for glob ${i}`);
      assert.equal(b.seed,b.preparedSeed,`no birth-time RNG draw for glob ${i}`);
    }
  }
});

test('birth samples the moving muzzle and current muzzle aim while retaining the fire-time sweep yaw at 30/60/120Hz',async()=>{
  let reference;
  for(const hz of [30,60,120]){
    const r=await runVolley({hz,move:true,aimChangeAt:3}),schedule=scheduleFor(r.f.profile);
    assert.equal(r.packetsAtFire,0,'no precreation packets');
    assert.equal(r.births.length,9);
    assert.equal(r.packets.length,9,'one authoritative packet per actual birth');
    assert.deepEqual(r.births.map(b=>b.tick),schedule.map(s=>s.delayFrames+1));
    assert.equal(new Set(r.packets.map(e=>e.at(-2))).size,9,'packets are timestamped on distinct scheduled ticks');
    assert.equal(new Set(r.packets.map(e=>e.at(-1))).size,9,'packet sequence numbers are unique');
    assert.ok(pairwiseSpread(r.births.map(b=>b.start))>0.2,'later globs follow the translated muzzle');
    for(let i=0;i<r.births.length;i++){
      const b=r.births[i],e=r.packets[i],s=schedule[i];
      assert.ok(close(b.start[0],b.ownerPos[0]+b.aim[0]*0.3,1e-9));
      assert.ok(close(b.start[1],b.ownerPos[1]+1.05,1e-9));
      assert.ok(close(b.start[2],b.ownerPos[2]+b.aim[2]*0.3,1e-9));
      assert.ok(Math.abs(angleDelta(b.yaw,b.preparedYaw))<1e-10,'aim changes do not replace the firing sweep direction');
      assert.equal(b.seed,b.preparedSeed,'birth does not consume a new random draw');
      assert.equal(e[3],'slosh');
      assert.equal(e[11],0,`glob ${i} birth has no remaining delay`);
      assert.equal(e.at(-2),b.tick);
      for(let axis=0;axis<3;axis++){
        assert.ok(Math.abs(e[5+axis]-b.start[axis])<=0.00501,'wire position is the birth origin');
        assert.ok(Math.abs(e[8+axis]-b.vel[axis])<=0.00501,'wire velocity is the birth velocity');
      }
    }
    const signature=r.births.map(b=>b.start.map(v=>Math.round(v*1e6)/1e6));
    if(reference)for(let i=0;i<signature.length;i++)for(let axis=0;axis<3;axis++)
      assert.ok(Math.abs(signature[i][axis]-reference[i][axis])<1e-9,`${hz}Hz render grouping preserves glob ${i} origin`);
    else reference=signature;
  }
});

test('ground/air transitions choose the spawn-state speed for each later glob',async()=>{
  for(const [initialGrounded,flipTo] of [[true,false],[false,true]]){
    const r=await runVolley({initialGrounded,flipGroundAt:3,flipTo}),schedule=scheduleFor(r.f.profile);
    assert.equal(r.births.length,9);
    for(let i=0;i<schedule.length;i++){
      const b=r.births[i],s=schedule[i],wasTransitioned=b.tick>=3;
      const expectedGround=wasTransitioned?flipTo:initialGrounded;
      assert.equal(b.grounded,expectedGround,`owner state at glob ${i} birth`);
      assert.ok(close(b.speed,expectedGround?s.ground:s.air,1e-8),`spawn-state speed for glob ${i}`);
    }
  }
});

test('remote Slosher visual uses packet birth state once without replaying its source delay',async()=>{
  const owner=await runVolley(),schedule=scheduleFor(owner.f.profile);
  const index=schedule.length-1,wire=JSON.parse(JSON.stringify(owner.packets[index]));
  const f=await fixture({network:true}),a=createActor(f,{nid:0,owner:'p2',remote:true});
  f.G.actors.push(a);
  const nm=f.makeNetMatch(f.makeSession());f.bind(nm,[a]);
  nm.onMessage('p2',{k:'t',ts:wire[0],r:2,u:wire.at(-2),l:{0:0},e:[wire]});
  const peer=nm.peers.get('p2');peer.tr=wire[0];nm.update(0);
  const ghost=f.projectiles.list.find(p=>p.type==='slosh'&&p.ghost);
  assert.ok(ghost,'the actual network event creates a remote projectile');
  assert.equal(ghost.delay,0,'birth-time packet delay is not applied a second time');
  assert.equal(ghost._netBornTick,wire.at(-2));
  assert.equal(ghost.fidelitySloshIndex,schedule[index].index);
  for(let axis=0;axis<3;axis++){
    assert.ok(close(ghost.pos.toArray()[axis],wire[5+axis],1e-10));
    assert.ok(close(ghost.vel.toArray()[axis],wire[8+axis],1e-10));
  }
  peer.sim=wire.at(-2);
  f.projectiles.update(DT);
  assert.ok(ghost.age>0,'remote visual advances on the next owner tick');
  assert.equal(ghost._netSteps,1);
});

test('late Slosher birth packets catch up once and duplicate identities do not respawn a glob',async()=>{
  const owner=await runVolley(),wire=JSON.parse(JSON.stringify(owner.packets.at(-1)));
  const f=await fixture({network:true}),a=createActor(f,{nid:0,owner:'p2',remote:true});
  f.G.actors.push(a);
  const nm=f.makeNetMatch(f.makeSession());f.bind(nm,[a]);
  const birthTick=wire.at(-2),arrival=wire[0]+3*DT;
  nm.onMessage('p2',{k:'t',ts:arrival,r:2,u:birthTick+3,l:{0:0},e:[wire]});
  const peer=nm.peers.get('p2');peer.tr=arrival;nm.update(0);
  const ghost=f.projectiles.list.find(p=>p.type==='slosh'&&p.ghost);
  assert.ok(ghost,'late owner event still creates the birth visual');
  assert.equal(ghost.delay,0);
  f.projectiles.update(DT);
  assert.ok(ghost._netSteps>0,'late visual catches up on the owner clock');
  const nextArrival=arrival+DT;
  nm.onMessage('p2',{k:'t',ts:nextArrival,r:2,u:birthTick+4,l:{0:0},e:[wire]});
  peer.tr=nextArrival;nm.update(0);
  assert.equal(f.projectiles.list.filter(p=>p.type==='slosh'&&p.ghost).length,1,'duplicate projectile identity is ignored');
});

test('plain battle still samples births without network and invalid owner births are retired',async()=>{
  const plain=await runVolley({network:false,move:true});
  assert.equal(plain.births.length,9);
  assert.ok(pairwiseSpread(plain.births.map(b=>b.start))>0.2);
  assert.equal(plain.packets.length,0);
  for(const invalid of ['dead','special','replace','stale','removed','reset']){
    const r=await runVolley({invalid});
    assert.equal(r.packetsAtFire,0,`${invalid}: no preparation packet`);
    assert.equal(r.packets.length,0,`${invalid}: canceled births are not published`);
    assert.equal(r.births.length,0,`${invalid}: no invalid projectile reaches birth`);
    assert.equal(r.liveSlosh.length,0,`${invalid}: pending projectile is retired`);
    if(invalid==='reset')assert.ok(r.a._s3SlosherBirthEpoch>=2,'the composed native Actor.reset advances its generation');
  }
});

test('#1152 / #258 two/three clients preserve swept velocities and nine true births at every display rate',async()=>{
  for(const hz of [30,60,120])for(const peers of [1,2]){
    const owner=await runVolley({hz,move:true,flipGroundAt:3,flipTo:false,turnDelta:(peers===1?1:-1)*Math.PI/18});
    assert.equal(owner.packetsAtFire,0);assert.equal(owner.packets.length,9);
    assert.deepEqual(Array.from(owner.packets,e=>e.at(-2)-1),[0,1,2,3,4,6,8,10,12]);
    for(let observer=0;observer<peers;observer++){
      const f=await fixture({network:true}),a=createActor(f,{owner:'p2',remote:true});f.G.actors.push(a);
      const nm=f.makeNetMatch(f.makeSession());f.bind(nm,[a]);
      for(const packet of owner.packets){
        const wire=JSON.parse(JSON.stringify(packet));
        nm.onMessage('p2',{k:'t',ts:wire[0],r:2,u:wire.at(-2),l:{0:0},e:[wire]});
        const peer=nm.peers.get('p2');peer.tr=wire[0];nm.update(0);
      }
      const ghosts=f.projectiles.list.filter(p=>p.ghost&&p.type==='slosh');
      assert.equal(ghosts.length,9,`${hz}Hz observer ${observer}`);
      assert.equal(nm.out.filter(e=>e[1]==='p').length,0,'observer never authors ghosts');
      for(let i=0;i<9;i++){
        assert.equal(ghosts[i].delay,0);
        assert.deepEqual(Array.from(ghosts[i].start.toArray()),Array.from(owner.packets[i].slice(5,8)));
        assert.deepEqual(Array.from(ghosts[i].vel.toArray()),Array.from(owner.packets[i].slice(8,11)));
      }
      nm.dispose();
    }
    owner.nm.dispose();
  }
});
