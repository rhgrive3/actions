import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from './source-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';
import { adaptSource } from '../adapter.mjs';
const EPS = 1e-8;
const close = (a,b) => assert.ok(Math.abs(a-b)<EPS, `${a} != ${b}`);

async function floor() {
  const f = await fixture(), a = f.make();
  a.form = 'squid'; a.intent.squid = true; a.submerged = true;
  return {...f,a};
}
// Only geometry queries and display are fixtures; native update, climb, action
// dispatch, velocity and climb integration all run unchanged through the adapter.
async function wall(angle=0, normal=[0,0,-1]) {
  const f = await floor(), {a,G,THREE} = f, n = new THREE.Vector3(...normal);
  a.grounded=false; a.ground.hit=false; a.submerged=false; a.climbing=true;
  a.pos.set(0,5,0); a.wallN.copy(n);
  const r=angle*Math.PI/180, tangent=new THREE.Vector3(-n.z,0,n.x);
  a.intent.move.copy(n).multiplyScalar(Math.cos(r)).addScaledVector(tangent,Math.sin(r));
  G.physics.raycast = (_p,_d,_length,h) => {h.hit=true;h.face=0;h.normal.copy(n);h.u=h.v=0;return h;};
  G.physics.collideBody = (p,_r,_l,_h,c) => {
    c.ceiling=c.wall=false;
    const penetration=p.dot(n);
    if(penetration<0){p.addScaledVector(n,-penetration);c.wall=true;c.wallNormal.copy(n);}
    return c;
  }; // plane collision fixture; wall is infinitely wide/tall
  G.physics.groundProbe = (_x,_y,_z,_u,_d,_r,h) => {h.hit=false;return h;};
  delete a._integrate;
  return f;
}

test('#257 minimum speed uses the fixed 1.45/1.92 base-swim ratio, not gear-scaled maximum', async()=>{
  const {profile,rollEligible}=await floor(), cfg=profile.movement.roll;
  close(cfg.minimumSpeed/profile.player.swimSpeed,1.45/1.92);
  for(const [ratio,wanted] of [[.74,false],[.76,true],[.78,true],[1,true]])
    assert.equal(rollEligible({x:0,z:profile.player.swimSpeed*ratio},{x:0,z:-1},cfg),wanted);
  assert.equal(rollEligible({x:0,z:cfg.minimumSpeed-EPS},{x:0,z:-1},cfg),false);
  assert.equal(rollEligible({x:0,z:cfg.minimumSpeed},{x:0,z:-1},cfg),true);
});

test('#242 every nonzero post-deadzone shallow reversal is admitted, zero and forward are not', async()=>{
  for(const depth of [0,.0001,.20,.29,.31,1]) {
    const f=await floor(), {a}=f;a.vel.set(0,0,f.PLAYER.swimSpeed);
    a.intent.move.set(0,0,-depth);a.intent.jump=true;f.tick(a);
    assert.equal(!!a.s3.roll,depth>0,`depth=${depth}`);
  }
  const f=await floor();f.a.vel.set(0,0,f.PLAYER.swimSpeed);f.a.intent.move.set(0,0,1);f.a.intent.jump=true;f.tick(f.a);
  assert.equal(!!f.a.s3.roll,false);
});

test('#233 speed history permits ticks 1..10 but not 11 and retains velocity direction',async()=>{
  for(const age of [1,5,9,10,11]) {
    const f=await floor(),{a}=f;
    a.vel.set(0,0,f.profile.movement.roll.minimumSpeed);a.intent.move.set(0,0,1);
    f.beforeActions(a,1/60,false);
    for(let tick=1;tick<=age;tick++) {
      // Actual stopped velocity is insufficient; admission must use history.
      a.vel.set(0,0,0);a.intent.move.set(0,0,-.2);
      f.beforeActions(a,1/60,tick===age);
    }
    assert.equal(!!a.s3.roll,age<=10,`history age=${age}`);
  }
});

test('#233 no-B, dry/enemy floor, air, form change, reset and takeover cannot reuse speed history',async()=>{
  for(const invalid of ['noB','dry','enemy','air','kid','reset','special','jump']) {
    const f=await floor(),{a}=f;a.vel.set(0,0,11.52);a.intent.move.set(0,0,1);
    f.beforeActions(a,1/60,false);assert.ok(a.s3.actions.floorSpeed);
    a.vel.set(0,0,0);a.intent.move.set(0,0,-1);
    if(invalid==='dry'||invalid==='enemy')a.submerged=false;
    if(invalid==='air')a.grounded=false;
    if(invalid==='kid')a.form='kid';
    if(invalid==='reset')a.reset();
    if(invalid==='special')a.specialActive={};
    if(invalid==='jump')a.superJumpState={};
    f.beforeActions(a,1/60,invalid!=='noB');assert.equal(!!a.s3.roll,false,invalid);
    if(invalid!=='noB')assert.equal(a.s3.actions.floorSpeed,null,invalid);
  }
});

test('#213 native fresh wall validation precedes roll, and the valid cone is ±45 degrees',async()=>{
  for(const n of [[0,0,-1],[0,0,1],[1,0,0],[-1,0,0]])for(const angle of [0,30,45,46,60,65,70,72,90]) {
    const f=await wall(angle,n);f.a.intent.jump=true;f.tick(f.a);
    assert.equal(!!f.a.s3.roll,angle<=45,`${n} angle=${angle}`);
    if(angle<=45){assert.equal(f.a.climbing,false);assert.equal(f.a.jumpBuffer,0);assert.equal(f.a.character.events.filter(x=>x[0]==='squidroll').length,1);}
  }
});

test('#213 B-less detach and freshly repainted walls never become wall rolls',async()=>{
  const noB=await wall();noB.tick(noB.a);assert.equal(noB.a.climbing,false);assert.equal(!!noB.a.s3.roll,false);
  for(const ink of [0,2]) {
    const f=await wall();f.G.paint.sample=()=>ink;f.a.intent.jump=true;f.tick(f.a);
    assert.equal(!!f.a.s3.roll,false);assert.equal(f.a.climbing,false);
  }
});

test('#224 native airborne input changes roll trajectory and can accelerate toward equipped swim speed',async()=>{
  const outcomes=[];
  for(const move of [[0,0],[0,-1],[1,0],[0,1]]) {
    const f=await floor(),{a}=f;a.vel.set(0,0,11.52);a.intent.move.set(0,0,-1);a.intent.jump=true;f.tick(a);
    a.intent.jump=false;a.intent.move.set(move[0],0,move[1]);f.tick(a,10);
    outcomes.push(a.vel.toArray());assert.ok(a.s3.roll);
  }
  assert.ok(Math.abs(outcomes[0][2])<Math.abs(outcomes[1][2]),'neutral brakes');
  assert.ok(outcomes[2][0]>0,'sideways steering');
  assert.ok(outcomes[3][2]>outcomes[0][2],'reversal brakes more strongly');
  const f=await floor(),{a}=f;a.vel.set(0,0,8.8);a.intent.move.set(0,0,-1);a.intent.jump=true;f.tick(a);
  const speed=Math.abs(a.vel.z);a.intent.jump=false;f.tick(a,8);assert.ok(Math.abs(a.vel.z)>speed);
});

test('#224 collision clipping is not replaced by saved launch speed; scoped shared tuning is restored',async()=>{
  const f=await floor(),{a}=f;a.vel.set(0,0,11.52);a.intent.move.set(0,0,-1);a.intent.jump=true;f.tick(a);
  a.vel.x=a.vel.z=0;a.intent.jump=false;const original=f.PLAYER.squidDrySpeed;f.tick(a);
  assert.ok(Math.hypot(a.vel.x,a.vel.z)>0&&Math.hypot(a.vel.x,a.vel.z)<1,'new input starts at bounded native acceleration');
  assert.equal(f.PLAYER.squidDrySpeed,original);
});

test('#275 charge and full-charge hold allow bounded slow movement; release still bursts',async()=>{
  for(const direction of [[0,0,1],[1,0,0],[-1,0,0]]) {
    const f=await wall(),{a}=f;a.intent.move.set(...direction);a.intent.jump=true;
    const original=[f.PLAYER.climbSpeed,f.PLAYER.climbSideSpeed];f.tick(a,30);
    const first=a.pos.clone();assert.ok(first.distanceTo(new f.THREE.Vector3(0,5,0))>0);
    f.tick(a,30);assert.equal(a.s3.surge.charge,1);assert.ok(a.pos.distanceTo(first)>0);
    assert.ok(Math.abs(a.vel.y)<=original[0]*f.profile.movement.surge.chargeMoveScale+EPS);
    assert.ok(Math.abs(a.vel.x)<=original[1]*f.profile.movement.surge.chargeMoveScale+EPS);
    assert.deepEqual([f.PLAYER.climbSpeed,f.PLAYER.climbSideSpeed],original);
    a.intent.jump=false;f.tick(a);assert.equal(a.s3.surge.phase,'burst');close(a.vel.y,f.profile.movement.surge.velocity);
  }
});

test('new wall adapter connections fail closed when native contact/admission hooks change',()=>{
  const source=fs.readFileSync(new URL('../../../inkwave-public/src/game/actor.js',import.meta.url),'utf8');
  for(const hook of ['  _updateClimb(dt, isSquid) {','    if (into < P.climbDetachDot) {']) {
    assert.throws(()=>adaptSource('src/game/actor.js',source.replace(hook,'// removed native anchor')));
    assert.throws(()=>adaptSource('src/game/actor.js',source+'\n'+hook));
  }
});

for(const scenario of ['roll','charge'])test(`fixed simulation ${scenario} agrees at 30/60/120Hz`,async()=>{
  let reference;
  for(const hz of [30,60,120]) {
    const f=scenario==='roll'?await floor():await wall(),{a}=f,clock=new FixedClock(),rows=[];
    if(scenario==='roll'){a.vel.set(0,0,11.52);a.intent.move.set(0,0,-1);}
    else a.intent.move.set(1,0,0);
    for(let frame=0;frame<hz;frame++)clock.advance(1/hz,()=>{
      a.intent.jump=scenario==='roll'?clock.ticks===0:clock.ticks<50;
      if(scenario==='roll'&&clock.ticks>0)a.intent.move.set(1,0,0);
      f.tick(a);rows.push({pos:[...a.pos.toArray()],vel:[...a.vel.toArray()],roll:!!a.s3.roll,charge:a.s3.surge?.charge??0});
    });
    if(reference)assert.deepEqual(rows,reference);else reference=rows;
  }
});

test('#233 late B works after actual native reversal braking, without a second input queue',async()=>{
  const f=await floor(),{a}=f;a.vel.set(0,0,11.52);a.intent.move.set(0,0,-1);
  f.tick(a,8);assert.ok(Math.hypot(a.vel.x,a.vel.z)<f.profile.movement.roll.minimumSpeed);
  a.intent.jump=true;f.tick(a);assert.ok(a.s3.roll);assert.equal(a.jumpBuffer,0);
  const count=a.character.events.filter(x=>x[0]==='squidroll').length;
  f.tick(a,3);assert.equal(a.character.events.filter(x=>x[0]==='squidroll').length,count,'held B does not relaunch');
});

test('actual Super Jump admission discards floor speed grace before its early-return phase',async()=>{
  const f=await floor(),{a}=f;a.vel.set(0,0,11.52);f.beforeActions(a,1/60,false);
  assert.ok(a.s3.actions.floorSpeed);assert.equal(a.superJump(new f.THREE.Vector3(0,0,10)),true);
  assert.equal(a.s3.actions.floorSpeed,null);
});

test('#213 lost wall cannot be rescued by the pending roll input',async()=>{
  const f=await wall(),{a}=f;
  f.G.physics.raycast=(_p,_d,_len,h)=>{h.hit=false;return h;};
  a.intent.jump=true;f.tick(a);assert.equal(a.climbing,false);assert.equal(!!a.s3.roll,false);
});
