import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from './source-fixture.mjs';
import { absorbArmor } from '../runtime/movement.mjs';
import { emptyLoadout } from '../runtime/gear.mjs';
import { adaptSource } from '../adapter.mjs';
import { FixedClock } from '../runtime/clock.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function armor(){return {armorTime:.3,armorHP:30,armorThreshold:100};}
function roll(f,wall=false){
  const a=f.make();a.form='squid';a.intent.squid=true;a.submerged=!wall;
  a.climbing=wall;a.wallN.set(0,0,1);a.vel.set(0,0,11.52);a.intent.move.set(0,0,wall?1:-1);
  assert.equal(f.beforeActions(a,1/60,true),true);return a;
}
function wallFixture(f,a){
  let paint=1;f.G.paint.sample=()=>paint;
  f.G.physics.raycast=(_origin,_dir,_length,out)=>{
    out.hit=true;out.face=0;out.normal.set(0,0,1);out.u=out.v=0;return out;
  };
  a.form='squid';a.intent.squid=true;a.grounded=false;a.submerged=false;
  a.climbing=true;a.wallN.set(0,0,1);a.pos.set(0,5,-.05);a.intent.move.set(0,0,-1);
  return value=>{paint=value;};
}
function burst(f,a){
  a.intent.jump=true;
  for(let i=0;i<45;i++){a._updateClimb(1/60,true);f.beforeActions(a,1/60,false);}
  a.intent.jump=false;f.beforeActions(a,1/60,false);
  assert.equal(a.s3.surge.phase,'burst');close(a.vel.y,15);
}

test('#208 durability is separate from per-hit penetration for repeated and large hits',()=>{
  for(const [hits,expected] of [[[40,40,40],[0,40,40]],[[20,90],[0,0]],[[30,30],[0,30]],[[100],[0]],[[101],[1]],[[180],[80]],[[250],[150]]]){
    const s=armor();assert.deepEqual(hits.map(d=>absorbArmor(s,d)),expected);
  }
  const s=armor();close(absorbArmor(s,-5),-5);close(s.armorHP,30);
});

test('#208 actual Actor receives armor overflow and consumes the shield on the first breaking hit',async()=>{
  const f=await fixture(),a=roll(f);a.damage(40,null,'shooter');close(a.hp,100);
  a.damage(40,null,'shooter');close(a.hp,60);a.damage(40,null,'shooter');close(a.hp,20);
  const b=roll(f);b.damage(20,null,'shooter');b.damage(90,null,'shooter');close(b.hp,100);
  const c=roll(f);c.damage(180,null,'bomb');close(c.hp,20);
  const d=roll(f);d.damage(250,null,'charger');assert.equal(d.alive,true,'current lethal decision waits one fixed tick');f.tick(d);assert.equal(d.alive,false);
});

test('#208 floor 18F and wall 45F armor outlive the 15F roll motion without extending it',async()=>{
  const f=await fixture();
  for(const wall of [false,true]){
    const a=roll(f,wall),shield=a.s3.actions.armor,frames=wall?45:18;
    close(shield.armorTime,frames/60);
    for(let i=0;i<frames-1;i++)f.beforeActions(a,1/60,false);
    assert.equal(a.s3.roll,null);assert.ok(shield.armorTime>0);
    a.damage(20,null,'shooter');close(a.hp,100);
    f.beforeActions(a,1/60,false);close(shield.armorTime,0);
    a.damage(20,null,'shooter');close(a.hp,80);
  }
});

test('#208 surge armor retains its independent45F clock after boost; partial charge is covered too',async()=>{
  const f=await fixture(),a=f.make();wallFixture(f,a);burst(f,a);
  const shield=a.s3.actions.armor;close(shield.armorTime,.75);
  for(let i=0;i<44;i++)f.beforeActions(a,1/60,false);
  assert.equal(a.s3.surge.phase,'auto-climb');close(a.s3.surge.time,0);assert.ok(shield.armorTime>0);
  a.damage(20,null,'shooter');close(a.hp,100);
  f.beforeActions(a,1/60,false);a.damage(20,null,'shooter');close(a.hp,80);
  const b=f.make();wallFixture(f,b);b.intent.jump=true;f.beforeActions(b,1/60,false);
  b.intent.jump=false;f.beforeActions(b,1/60,false);assert.ok(b.s3.actions.armor.armorTime>0);
  b.damage(20,null,'shooter');close(b.hp,100);
});

test('#208 ink bypasses the shield and form/death/reset/special/jump transitions cancel it',async()=>{
  const f=await fixture(),ink=roll(f);ink.damage(5,null,'ink');close(ink.hp,95);close(ink.s3.actions.armor.armorHP,30);
  for(const cause of ['form','death','reset','special','jump']){
    const a=roll(f);
    if(cause==='form'){a.form='kid';f.beforeActions(a,1/60,false);}
    if(cause==='death')a.splat();
    if(cause==='reset')a.reset();
    if(cause==='special'){a.special=a.specialCost();a._startSpecial();}
    if(cause==='jump')assert.equal(a.superJump(new f.THREE.Vector3(0,0,5)),true);
    assert.ok(!a.s3.actions?.armor,`${cause} clears independent armor`);
  }
});

test('#208 actual Squid Returner ceiling contact ends armor without resetting collision velocity',async()=>{
  const f=await fixture(),a=roll(f);delete a._integrate;
  a.climbing=true;f.G.physics.level={blocks:[{squidReturner:true}]};f.G.physics.collideBody=(_p,_r,_l,_h,c)=>{c.ceiling=true;c.ceilingBlock=0;return c;};
  a._integrate(1/60,true,false);close(a.vel.y,0);assert.equal(a.s3.actions.armor,null);
  a.damage(40,null,'shooter');close(a.hp,60);
});

test('#249 unpainted surge boundary preserves current momentum and permits immediate reattachment',async()=>{
  const f=await fixture(),a=f.make();const paint=wallFixture(f,a);burst(f,a);
  paint(0);a._updateClimb(1/60,true);assert.equal(a.climbing,false);close(a.vel.y,15);close(a.climbExit,0);
  assert.equal(a.s3.surge.phase,'burst');
  a.vel.y=12;paint(1);a._updateClimb(1/60,true);assert.equal(a.climbing,true);
  f.beforeActions(a,1/60,false);close(a.vel.y,15);
});

test('#249 a large unpainted gap falls ballistically and cannot acquire virtual wall support',async()=>{
  const f=await fixture(),a=f.make();const paint=wallFixture(f,a);burst(f,a);paint(0);a._updateClimb(1/60,true);
  delete a._integrate;a._resolve=()=>{};let maximum=a.pos.y;
  for(let i=0;i<120;i++){
    a._updateClimb(1/60,true);f.beforeActions(a,1/60,false);a._integrate(1/60,true,false);
    assert.equal(a.climbing,false);maximum=Math.max(maximum,a.pos.y);
  }
  assert.equal(a.s3.surge,null);assert.ok(a.vel.y<0);assert.ok(a.pos.y<maximum);
});

test('#249 normal swim, enemy paint, outward cancellation and wall top keep distinct native paths',async()=>{
  const f=await fixture();
  for(const mode of ['ordinary','enemy','outward']){
    const a=f.make();const paint=wallFixture(f,a);
    if(mode!=='ordinary')burst(f,a);else a.vel.y=15;
    paint(mode==='enemy'?2:0);if(mode==='outward')a.intent.move.set(0,0,1);
    a._updateClimb(1/60,true);assert.equal(a.climbing,false);close(a.vel.y,1.5);close(a.climbExit,.2);
  }
  const a=f.make();wallFixture(f,a);burst(f,a);let top=0;
  a._ledgePop=()=>{top++;};f.G.physics.raycast=(_o,_d,_l,h)=>{h.hit=false;return h;};
  a._updateClimb(1/60,true);assert.equal(top,1);
});

function gear(a,ap,ability='runSpeed'){
  a.s3.loadout=emptyLoadout();
  if(ap===57)for(const part of a.s3.loadout){part.main=ability;part.subs.fill(ability);}
  if(ap===10)a.s3.loadout[0].main=ability;
  if(ap===3)a.s3.loadout[0].subs[0]=ability;
  a.setWeapon(a.weaponId);
}
test('#243 full and partial charger movement use equipped firing Run Speed Up exactly once',async()=>{
  const f=await fixture();
  for(const charge of [.2,.5,1]){
    const results=[];
    for(const ap of [0,3,10,57]){
      const a=f.make('charger');gear(a,ap);a.weaponRunner.charging=true;a.weaponRunner.charge=charge;
      results.push(a.weaponRunner.moveSpeed());
      close(results.at(-1)/results[0],a.s3.modifiers.runSpeedFiring);
    }
    close(results[3]/results[0],1.25);assert.ok(results[0]<results[1]&&results[1]<results[2]);
  }
  const a=f.make('roller');gear(a,57);a.weaponRunner.rolling=true;
  const withGear=a.weaponRunner.moveSpeed();gear(a,0);a.weaponRunner.rolling=true;close(a.weaponRunner.moveSpeed(),withGear);
});

test('#243 enemy contact excludes the new charger gear multiplier and dry walking restores its own curve',async()=>{
  const f=await fixture(),a=f.make('charger');gear(a,57);a.weaponRunner.charging=true;a.weaponRunner.charge=1;
  const geared=a.weaponRunner.moveSpeed();a.onEnemy=true;close(a.weaponRunner.moveSpeed(),geared/1.25);
  a.onEnemy=false;a.weaponRunner.charging=false;close(a.weaponRunner.moveSpeed(),f.PLAYER.runSpeed*a.s3.modifiers.runSpeed);
  a.weaponRunner.charging=true;a.weaponRunner.charge=1;a.s3.flow.active=true;
  close(a.weaponRunner.moveSpeed(),geared*f.profile.flow.runMultiplier);
});

test('#251 actual normal jump caps only a held full Splat Charger; enemy-ink gear cannot raise it',async()=>{
  const f=await fixture();
  for(const enemy of [false,true])for(const ap of [0,3,10,57]){
    f.G.paint.sample=()=>enemy?2:0;
    const a=f.make('charger');gear(a,ap,'inkResistance');a.intent.fire=true;
    f.tick(a,80);assert.equal(a.weaponRunner.charge,1);a.intent.jump=true;f.tick(a);
    close(a.vel.y,4.2);assert.equal(a.grounded,false);
  }
  f.G.paint.sample=()=>0;
  for(const charge of [0,.5]){
    const a=f.make('charger');a.weaponRunner.charging=charge>0;a.weaponRunner.charge=charge;
    a.intent.fire=charge>0;a.intent.jump=true;f.tick(a);close(a.vel.y,f.PLAYER.jumpVel);
  }
  const b=f.make('shooter');b.intent.jump=true;f.tick(b);close(b.vel.y,f.PLAYER.jumpVel);
});

test('#251 actual integrate produces a lower full-charge apex at 30/60/120Hz rendering',async()=>{
  const values=[];
  for(const hz of [30,60,120]){
    const f=await fixture(),a=f.make('charger');a.intent.fire=true;f.tick(a,80);a.intent.jump=true;f.tick(a);
    delete a._integrate;a._resolve=()=>{};
    const clock=new FixedClock();let apex=a.pos.y;
    for(let i=0;i<hz;i++)clock.advance(1/hz,dt=>{a._integrate(dt,false,false);apex=Math.max(apex,a.pos.y);});
    values.push(apex);assert.ok(apex>0&&apex<.5);
  }
  close(values[0],values[1]);close(values[1],values[2]);
});

test('new native adapter connections fail closed when jump or wall anchors change',()=>{
  const source=fs.readFileSync(new URL('../../../inkwave-public/src/game/actor.js',import.meta.url),'utf8');
  for(const anchor of ['      this.vel.y = jv;','    if (!inked) {                                                        // ink ran out under us: let go']){
    assert.throws(()=>adaptSource('src/game/actor.js',source.replace(anchor,'')),/patch conflict/);
    assert.throws(()=>adaptSource('src/game/actor.js',source.replace(anchor,anchor+'\n'+anchor)),/patch conflict/);
  }
});

test('#249 native Physics crosses a sampled narrow band but falls from a large real-wall gap',async()=>{
  for(const high of [5.8,18]){
    const f=await fixture(),{THREE}=f,a=f.make();
    const axes=[new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)];
    const floor={id:0,solid:true,center:new THREE.Vector3(0,-.5,0),half:new THREE.Vector3(20,.5,20),
      axes,faces:[-1,-1,-1,-1,-1,-1],aabbMin:new THREE.Vector3(-20,-1,-20),aabbMax:new THREE.Vector3(20,0,20)};
    const wall={id:1,solid:true,center:new THREE.Vector3(0,10,-.7),half:new THREE.Vector3(3,10,.2),
      axes,faces:[0,0,0,0,0,0],aabbMin:new THREE.Vector3(-3,0,-.9),aabbMax:new THREE.Vector3(3,20,-.5)};
    f.G.level={blocks:[floor,wall],faces:[{origin:new THREE.Vector3(),u:axes[0],v:axes[1]}],groundHeight:()=>0,
      queryBlocks:(_a,_b,_c,_d,out)=>{out.length=0;out.push(0,1);return out;}};
    f.G.physics=new f.Physics(f.G.level);let unpainted=false, gapSamples=0;
    f.G.paint.sample=(_face,_u,v)=>{
      if(unpainted&&v>=5.2&&v<high){gapSamples++;return 0;}return 1;
    };
    a.form='squid';a.intent.squid=true;a.grounded=false;a.climbing=true;a.wallN.set(0,0,1);
    a.pos.set(0,5,-.05);a.intent.move.set(0,0,-1);burst(f,a);delete a._integrate;unpainted=true;
    let detached=false,reattached=false,reattachedAbove=false,highest=a.pos.y;
    for(let i=0;i<90;i++){
      a._updateClimb(1/60,true);f.beforeActions(a,1/60,false);
      if(!a.climbing){detached=true;a._horizontal(1/60,true,false);}
      else if(detached){reattached=true;reattachedAbove ||= a.pos.y+.3>=high;}
      a._integrate(1/60,true,false);highest=Math.max(highest,a.pos.y);
    }
    assert.ok(gapSamples>0,'the ray actually sampled the unpainted band');assert.ok(detached);
    if(high===5.8)assert.ok(reattached&&highest>high,'native own-ink attachment beyond narrow gap');
    else {assert.equal(reattachedAbove,false);assert.ok(highest<high);assert.ok(a.pos.y<highest);}
  }
});
