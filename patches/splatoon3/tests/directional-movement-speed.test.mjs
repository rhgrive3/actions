import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { shooterMovementActive } from '../runtime/shooter-movement.mjs';
import { boot, pad } from '../../reliability/tests/pause-fixture.mjs';
const DT = 1 / 60;
const near = (a, b, label = '') => assert.ok(Math.abs(a - b) < 1e-8, `${label}: ${a} != ${b}`);
const loadout = points => Array.from({length:3}, (_, i) => ({
  main: points === 57 || points === 10 && i === 0 ? 'runSpeed' : 'none',
  subs: Array(3).fill(points === 57 ? 'runSpeed' : 'none'),
}));

test('actual PlayerController preserves radial magnitude for keyboard, pad and touch at rotated camera headings', async () => {
  const h=await boot();
  for(const yaw of [0,.37,Math.PI/2,-2.4]) {
    h.rig.yaw=yaw;
    for(const keys of [['KeyW'],['KeyA'],['KeyS'],['KeyD'],['KeyW','KeyA'],['KeyW','KeyD'],['KeyS','KeyA'],['KeyS','KeyD']]) {
      h.input.keys.clear();for(const key of keys)h.input.keys.add(key);h.input.lastDevice='kbm';
      h.controller.update(DT);near(h.actor.intent.move.length(),1,`keyboard ${keys} yaw${yaw}`);
    }
    h.input.keys.clear();
    for(const magnitude of [.25,.5,1])for(let angle=0;angle<Math.PI*2;angle+=Math.PI/12) {
      h.input.lastDevice='pad';h.input.pad=pad()[0];
      const raw=.14+magnitude*(.95-.14);
      h.input.pad.axes=[Math.sin(angle)*raw,-Math.cos(angle)*raw,0,0];
      h.controller.update(DT);near(h.actor.intent.move.length(),magnitude,'pad radial response');
      h.input.lastDevice='touch';
      Object.assign(h.input.mobile,{active:true,visible:true,root:{querySelectorAll:()=>[],classList:{toggle(){},add(){},remove(){}}},moveX:Math.sin(angle)*magnitude,
        moveY:Math.cos(angle)*magnitude,lookDX:0,lookDY:0,mapOpen:false});
      h.controller.update(DT);near(h.actor.intent.move.length(),magnitude,'touch radial response');
    }
  }
});

async function world() {
  const f = await fixture({productionComposition:true, realProjectiles:true});
  f.G.mode = 'match';
  f.G.scene = new f.THREE.Scene();
  f.G.level = new f.Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},
    spawnPads:[[-90,0,0],[90,0,0]],spawnBarrier:0,half:[],
    single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]}]});
  f.G.physics = new f.Physics(f.G.level);
  f.G.paint.sample = () => 0;
  return f;
}

test('all seven actual movement targets are radial at 72 angles, micro/full inputs and 0/10/57 AP', async () => {
  const f = await world();
  for (const kind of Object.keys(f.profile.weapons)) for (const ap of [0,10,57]) {
    const a = f.make(kind), r = a.weaponRunner;
    a.s3.loadout = loadout(ap); a.setWeapon(kind); a.pos.set(0,0,0);
    const states = kind === 'roller' ? ['walk','swing','recover','roll','dash']
      : kind === 'charger' || kind === 'splatling' ? ['walk','charge','fire'] : ['walk','fire'];
    for (const state of states) {
      r.reset(); a.form = 'kid'; a.grounded = true; a.intent.fire = false; a.onEnemy = false;
      if (state === 'swing') r.flick = .1;
      if (state === 'recover') r.flickRecover = .12;
      if (state === 'roll' || state === 'dash') { r.rolling = true; r.rollT = state === 'dash' ? 2 : .5; }
      if (state === 'charge') { r.charging = true; r.charge = .5; r.chargeT = a.weapon.chargeTime * .5; }
      if (state === 'fire') {
        if (kind === 'shooter') r.s3ShooterMoveRemaining = 4 / 60;
        else if (kind === 'blaster') r.s3BlasterMoveRemaining = .2;
        else if (kind === 'splatling') r.streaming = true;
        else r.firingT = .2;
      }
      const target = r.moveSpeed();
      if (state === 'roll') near(target,6.48,'roll unaffected by Run Speed Up');
      if (state === 'dash') near(target,7.92,'dash unaffected by Run Speed Up');
      if (state === 'swing' || state === 'recover') near(target,2.88 * a.s3.modifiers.runSpeedFiring,state);
      for (const magnitude of [.1,.5,1]) for (let degrees = 0; degrees < 360; degrees += 5) {
        const angle = degrees * Math.PI / 180;
        a.intent.move.set(Math.sin(angle)*magnitude,0,Math.cos(angle)*magnitude);
        a.vel.set(0,0,0);
        // Rolling travels along the body heading (never square to the drum), so
        // radial speed is measured with the body already turned to the stick.
        if (state === 'roll' || state === 'dash') a.yaw = angle;
        for (let i=0;i<30;i++) a._horizontal(DT,false,false);
        near(a.vel.x,Math.sin(angle)*target*magnitude,`${kind}/${state}/${ap}AP/${degrees}deg X`);
        near(a.vel.z,Math.cos(angle)*target*magnitude,`${kind}/${state}/${ap}AP/${degrees}deg Z`);
      }
    }
  }
});

test('real continuous Splattershot emissions never regain walking speed between six-frame rounds', async () => {
  for (const ap of [0,10,57]) {
    const f = await world(), a = f.make('shooter'), r = a.weaponRunner;
    a.s3.loadout = loadout(ap); a.setWeapon('shooter');
    a.intent.fire = true; a.intent.move.set(Math.SQRT1_2,0,Math.SQRT1_2); a.kidT = 1;
    let shots = 0;
    for (let frame=0;frame<90;frame++) {
      const before = f.G.projectiles.list.length;
      f.tick(a);
      if (f.G.projectiles.list.length > before) shots++;
      if (shots && frame > 12) {
        near(r.moveSpeed(),a.weapon.moveSpeedFiring*a.s3.modifiers.runSpeedFiring,`AP${ap} frame${frame}`);
        near(a.vel.length(),a.weapon.moveSpeedFiring*a.s3.modifiers.runSpeedFiring,`AP${ap} root frame${frame}`);
      }
    }
    assert.ok(shots >= 10,'runner emitted a continuous native stream');
    a.intent.fire = false;
    f.tick(a,6);
    near(r.moveSpeed(),f.PLAYER.runSpeed*a.s3.modifiers.runSpeed,'released stream');
    r.reset(); a.ink=0; a.intent.fire=true;
    f.tick(a,12);
    assert.equal(shooterMovementActive(r),false,'empty held trigger never establishes shooting movement');
    near(r.moveSpeed(),f.PLAYER.runSpeed*a.s3.modifiers.runSpeed,'dry trigger');
  }
});

test('the first emitted tick selects shot speed without selecting it during startup, dry input or reset', async () => {
  const f=await world(),a=f.make('shooter'),r=a.weaponRunner;
  a.kidT=1;a.intent.fire=true;a.intent.move.set(0,0,1);
  const original=r.moveSpeed,observed=[];
  r.moveSpeed=function(){const value=original.call(this);if(this.s3MovementStepDt>0)observed.push(value);return value;};
  let emitted=false;
  for(let i=0;i<9;i++) {
    observed.length=0;
    const before=f.G.projectiles.list.length;
    f.tick(a);
    emitted ||= f.G.projectiles.list.length>before;
    near(observed.at(-1),emitted?a.weapon.moveSpeedFiring:f.PLAYER.runSpeed,`first-fire tick${i}`);
    assert.equal(r.s3MovementStepDt,undefined,'movement dt never leaks after the step');
    assert.equal(r.s3MovementEmergeDelay,undefined,'form gate never leaks after the step');
  }
  assert.ok(emitted);
  r.reset();a.ink=0;observed.length=0;f.tick(a);
  near(observed.at(-1),f.PLAYER.runSpeed,'no dry startup speed');
});

test('an admitted roll immediately uses normal roll speed despite residual visual flick recovery', async () => {
  const f = await world(), a = f.make('roller'), r = a.weaponRunner;
  a.intent.fire=true; a.intent.move.set(0,0,1); a.kidT=1;
  let observed = false;
  for(let i=0;i<60;i++) {
    f.tick(a);
    if(r.rolling && r.flickRecover>1e-10) {
      observed=true;
      near(r.moveSpeed(),6.48,'admitted rolling has one speed owner');
    }
  }
  assert.ok(observed,'native swing-to-roll crosses the old recovery timer');
});

test('actual collision travel at every 15-degree angle has the same length for walk, fire and rolling', async () => {
  const f=await world();
  for(const mode of ['walk','fire','roll','dash']) {
    const a=f.make(mode==='roll'||mode==='dash'?'roller':'shooter'),r=a.weaponRunner;
    a._integrate=f.Actor.prototype._integrate;
    let reference;
    for(let degrees=0;degrees<360;degrees+=15) {
      r.reset(); a.pos.set(0,0,0);a.vel.set(0,0,0);a.grounded=true;
      a.hardLand=0;a.form='kid';a.onEnemy=false;
      const angle=degrees*Math.PI/180;
      a.intent.move.set(Math.sin(angle),0,Math.cos(angle));
      if(mode==='fire')r.s3ShooterMoveRemaining=.1;
      if(mode==='roll'||mode==='dash'){r.rolling=true;r.rollT=mode==='dash'?2:0;a.yaw=angle;}
      for(let i=0;i<60;i++){a._horizontal(DT,false,false);a._integrate(DT,false,false);}
      const distance=Math.hypot(a.pos.x,a.pos.z);
      if(reference===undefined)reference=distance;
      near(distance,reference,`${mode} ${degrees}deg real flat floor`);
    }
  }
});

test('continuous diagonal firing, release, reversal and roll transition agree across render schedules', async () => {
  const traces=[];
  for(const hz of [30,60,120,144]) {
    const f=await world(),a=f.make('shooter'),clock=new f.FixedClock(),rows=[];
    a.kidT=1;
    for(let frame=0;frame<hz*3;frame++)clock.advance(1/hz,dt=>{
      const i=rows.length;
      if(i===90){a.setWeapon('roller');a.kidT=1;}
      a.intent.fire=i<60||i>=90;
      const angle=i<45?Math.PI/4:i<120?-3*Math.PI/4:Math.PI/6;
      a.intent.move.set(Math.sin(angle),0,Math.cos(angle));
      f.G.time+=dt;a.update(dt);
      rows.push([a.vel.x,a.vel.z,a.weaponRunner.moveSpeed(),a.ink,a.weaponRunner.rollT,f.G.projectiles.list.length]);
    });
    assert.equal(rows.length,180);traces.push(rows);
  }
  for(const trace of traces.slice(1))for(let i=0;i<180;i++)for(let j=0;j<6;j++)near(trace[i][j],traces[0][i][j],`schedule tick${i}/${j}`);
});
