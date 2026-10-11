import {hurtboxRadius} from '../runtime/player-hurtbox.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {fixture as baseFixture} from './source-fixture.mjs';
async function fixture(){const f=await baseFixture({extraExports:"export {installWeaponsFidelity,fidelityPlayerCollisionRadius} from './patches/splatoon3/runtime/weapons-fidelity.mjs';"});f.installWeaponsFidelity(f,f.profile);return f;}
import { FixedClock } from '../runtime/clock.mjs';
import { projectilePlayerRadius } from '../runtime/weapon-gates.mjs';
const DT=1/60, near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const step=(a,n,input={})=>{a.intent.fire=!!input.fire;for(let i=0;i<n;i++)a.weaponRunner.update(DT,input);};

test('#230: post-dodge shots have no catch-up debt and resume one shot every 4F', async()=>{
  for(const phase of [-1,0,.01,.07]) for(const chained of [false,true]){
    const f=await fixture(),a=f.make('dualies'),r=a.weaponRunner; a.intent.fire=true;
    r.cooldown=phase; assert.ok(r.tryDodge({x:1,z:0})); const ticks=[];
    let tick=0,previous=0,end;
    f.G.projectiles.fireDualies=()=>ticks.push(tick);
    for(tick=1;tick<=70;tick++){
      const was=!!r.dodge; r.update(DT,{fire:true});
      assert.ok(ticks.length-previous<=1);previous=ticks.length;
      if(was&&!r.dodge){end=tick;if(chained&&r.rollsLeft){assert.ok(r.tryDodge({x:1,z:0}));}}
    }
    assert.equal(ticks[0]-end,4);
    assert.ok(ticks.every((t,i)=>i===0||t-ticks[i-1]===4),String(ticks));
  }
});

test('#230: releasing during travel does not replay missed shots when firing resumes',async()=>{
  const f=await fixture(),a=f.make('dualies'),r=a.weaponRunner;a.intent.fire=true;r.tryDodge({x:1,z:0});
  step(a,50);assert.equal(f.shots.length,0);
  step(a,1,{fire:true});assert.equal(f.shots.length,0);
  step(a,2,{fire:true});assert.equal(f.shots.length,1);
  step(a,1,{fire:true});assert.equal(f.shots.length,1);
  // Holding still after dropping ZR leaves the native normal mode (5F).
  step(a,1,{fire:true});assert.equal(f.shots.length,1);
  step(a,3,{fire:true});assert.equal(f.shots.length,2);
});

test('#232: real Actor resource order holds slide ink through 69F, allows 70F, no double clock',async()=>{
  for(const geared of [false,true]){
    const f=await fixture(),a=f.make('dualies'),r=a.weaponRunner;
    if(geared){a.s3.loadout=Array.from({length:3},()=>({main:'inkRecovery',subs:Array(3).fill('inkRecovery')}));a.setWeapon('dualies');}
    a.intent.fire=true; assert.ok(r.tryDodge({x:1,z:0}));a.intent.fire=false;
    f.tick(a,69);near(a.ink,93);near(r.s3DodgeInkRemaining,DT);
    f.tick(a);assert.ok(a.ink>93);near(r.s3DodgeInkRemaining,0);
  }
});

test('#232: accepted chained slide restarts 70F; rejected slide and ordinary shots cannot shorten it',async()=>{
 const f=await fixture(),a=f.make('dualies'),r=a.weaponRunner;a.intent.fire=true;r.tryDodge({x:1,z:0});
 f.tick(a,20);assert.ok(r.tryDodge({x:0,z:1}));const ink=a.ink;assert.equal(r.tryDodge({x:1,z:0}),false);
 a.intent.fire=false;f.tick(a,69);near(a.ink,ink);f.tick(a);assert.ok(a.ink>ink);
 a.reset();near(r.s3DodgeInkRemaining,0);
});

test('#290: real Charger keeps60F charge,6F recharge and the composed1F release gap',async()=>{
 const f=await fixture(),a=f.make('charger'),r=a.weaponRunner,ticks=[];let tick=0;
 f.G.projectiles.fireCharger=()=>ticks.push(tick);
 for(tick=1;tick<=200;tick++){a.intent.fire=r.charge<1;f.G.time+=DT;r.update(DT,{fire:a.intent.fire});}
 assert.deepEqual(ticks,[63,130,197]); // fresh1F +60F charge +release edge/gap; repeat60+6+1
 a.reset();a.grounded=true;step(a,60,{fire:true});assert.ok(r.charge<1);step(a,1,{fire:true});assert.equal(r.charge,1);
 step(a,1,{fire:false});assert.equal(r.s3ReleaseHold,true);step(a,1,{fire:false});near(r.cooldown,6*DT);step(a,5,{fire:true});assert.equal(r.charging,false);
 step(a,1,{fire:true});assert.equal(r.charging,true);near(r.chargeT,DT);
});

// The community v10.0.1 front/back-lag table distinguishes Slosher sub 15F
// from squid 16F; these are separate destinations, not a tolerant shared gate.
// https://wikiwiki.jp/splatoon3mix/検証/メインウェポン/前隙・後隙
for(const [kind,delay,squidDelay] of [['blaster',22,22],['slosher',15,16]]){
 test(`#214: ${kind} post-shot lock blocks same-tick sub and expires at ${delay}F`,async()=>{
  const f=await fixture(),a=f.make(kind),r=a.weaponRunner;let fired=0,bombs=0;
  f.G.projectiles[kind==='blaster'?'fireBlaster':'fireSlosh']=()=>fired++;
  f.G.projectiles.throwBomb=()=>bombs++;
  for(let t=0;t<60&&!fired;t++){
   const releasing=kind==='blaster' ? r.s3BlasterWindup>0&&r.s3BlasterWindup<=DT+1e-8 : r.slosh>=0&&r.slosh+DT>=a.weapon.windup-1e-8;
   r.update(DT,{fire:true,sub:!releasing,subReleased:releasing});
  }
  assert.ok(fired);assert.equal(bombs,0);assert.equal(r.busy(),true);near(r.s3PostShotRemaining,delay*DT);
  near(a.s3.recoverStopRemaining,a.weapon.inkRecoverStop);
  step(a,delay-1,{sub:true,subReleased:true});assert.equal(bombs,0);assert.equal(r.busy(),true);
  step(a,1,{sub:true,subReleased:true});assert.equal(bombs,1);near(r.s3PostShotRemaining,0);
  if(kind==='slosher'){near(r.s3SloshPostShot,DT);assert.equal(r.busy(),true,
    'sub is admitted at 15F while the independent 16F squid lock retains one frame');}
 });
 test(`#214: ${kind} real Actor admits held squid exactly at ${squidDelay}F`,async()=>{
  const f=await fixture(),a=f.make(kind),r=a.weaponRunner;let fired=0;
  f.G.projectiles[kind==='blaster'?'fireBlaster':'fireSlosh']=()=>fired++;
  a.intent.fire=true;for(let i=0;i<60&&!fired;i++)f.tick(a);
  assert.ok(fired);a.intent.fire=false;a.intent.squid=true;
  f.tick(a,squidDelay-1);assert.equal(a.form,'kid',`squid remains blocked at ${squidDelay-1}F`);
  if(kind==='slosher'){near(r.s3PostShotRemaining,0);near(r.s3SloshPostShot,DT);}
  f.tick(a);assert.equal(a.form,'squid',`squid is admitted at ${squidDelay}F`);
 });
}

test('#214: empty main creates no post-shot lock; resetting removes old gates',async()=>{
 for(const kind of ['blaster','slosher']){
  const f=await fixture(),a=f.make(kind),r=a.weaponRunner;f.G.projectiles.fireSlosh=()=>{};a.ink=0;step(a,60,{fire:true});
  near(r.s3PostShotRemaining||0,0);a.ink=100;
  for(let i=0;i<60&&!r.s3PostShotRemaining;i++)step(a,1,{fire:true});
  assert.ok(r.s3PostShotRemaining);a.reset();near(r.s3PostShotRemaining,0);
 }
});

test('#228: normal/post player-radius ratio is captured at emission without changing field/paint/boss size',async()=>{
 const f=await fixture(),a=f.make('dualies'),ps=new f.Projectiles(new f.THREE.Scene());
 a.aimPoint.set(0,1.05,80);a.aimDir.set(0,0,1);f.G.actors=[a];
 ps.fireDualies(a,a.weapon,0,0);const normal=ps.list[0];a.weaponRunner.s3Turret=true;
 ps.fireDualies(a,a.weapon,0,0);const post=ps.list[1];
 near(f.fidelityPlayerCollisionRadius(post)/f.fidelityPlayerCollisionRadius(normal),.335/.31);
 for(const key of ['radius','trailRadius','vis'])assert.equal(post[key],normal[key]);assert.deepEqual(post.fidelityFieldCollision,normal.fidelityFieldCollision);near(normal.size,.31);near(post.size,.335);
 a.weaponRunner.s3Turret=false;a.setWeapon('shooter');near(f.fidelityPlayerCollisionRadius(post),.335);
});

test('fixed-clock 30/60/120Hz traces agree for post-dodge shots and ink clocks',async()=>{
 const traces=[];
 for(const hz of [30,60,120]){
  const f=await fixture(),a=f.make('dualies'),r=a.weaponRunner,clock=new FixedClock(),rows=[];
  a.intent.fire=true;r.tryDodge({x:1,z:0});
  for(let i=0;i<hz*2;i++)clock.advance(1/hz,()=>{f.tick(a);rows.push([a.ink,f.shots.length,r.s3DodgeInkRemaining,r.s3DodgeShotRemaining]);});
  traces.push(rows);
 }
 assert.deepEqual(traces[0],traces[1]);assert.deepEqual(traces[1],traces[2]);
});

test('#228: actual native swept-player hit has a post-roll-only grazing band',async()=>{
 const f=await fixture(),a=f.make('dualies'),e=f.make('shooter'),ps=new f.Projectiles(new f.THREE.Scene());
 e.team=1;e.invuln=0;f.G.actors=[a,e];f.G.physics.segment=(_a,_b,hit)=>{hit.hit=false;return hit;};a.aimPoint.set(0,1.05,80);a.aimDir.set(0,0,1);
 const normal=.31,post=.335,offset=hurtboxRadius(e,f.PLAYER)+(normal+post)/2;
 // The canonical capsule solver adds the authoritative Actor radius to each sourced projectile radius.
 let hits=0;ps.applyHit=()=>hits++;
 for(const turret of [false,true]){
  a.weaponRunner.s3Turret=turret;ps.fireDualies(a,a.weapon,0,0);const p=ps.list.at(-1);
  p.pos.set(0,1.05,0);p.vel.set(0,0,60);p.grav=p.drag=0;p.straight=1;
  e.pos.set(offset,0,.5);a.weaponRunner.s3Turret=false;
  ps._step(p,DT);assert.equal(hits,turret?1:0);
 }
});

test('#214: a sub released during the lock is discarded, while holding past the boundary can aim anew',async()=>{
 const f=await fixture(),a=f.make('blaster'),r=a.weaponRunner;let bombs=0;
 f.G.projectiles.throwBomb=()=>bombs++;
 while(!r.s3PostShotRemaining)step(a,1,{fire:true});
 step(a,1,{subReleased:true});step(a,30);assert.equal(bombs,0);assert.equal(r.aimingSub,false);
 step(a,1,{sub:true});assert.equal(r.aimingSub,true);step(a,5,{sub:true});step(a,1,{subReleased:true});assert.equal(bombs,0);step(a,1,{});assert.equal(bombs,1);
});

function saverLoadout(gp){
 for(let main=0;main<=3;main++){const sub=(gp-main*10)/3;if(Number.isInteger(sub)&&sub>=0&&sub<=9)return Array.from({length:3},(_,i)=>({main:i<main?'inkSaverMain':'none',subs:Array.from({length:3},(_,j)=>i*3+j<sub?'inkSaverMain':'none')}));}
 throw Error('not an equipment AP count');
}
function saver(a,gp){a.s3.loadout=saverLoadout(gp);a.setWeapon('dualies');a.intent.fire=true;}

test('#346: actual slide payment uses main-saver curve once at 0/3/6/10/20/30/57 AP, preserving shot cost and 70F lock',async()=>{
 for(const gp of [0,3,6,10,20,30,57]){
  const f=await fixture(),a=f.make('dualies');saver(a,gp);const factor=f.gearCurve(gp,1,.775,.55),cost=7*factor;
  near(a.weapon.rollInk,cost);near(a.weapon.inkPerShot,.72*factor);assert.ok(a.weaponRunner.tryDodge({x:1,z:0}));near(a.ink,100-cost);near(a.weaponRunner.s3DodgeInkRemaining,70/60);near(f.WEAPONS.dualies.rollInk,7);
 }
});

test('#346: 57 AP can pay from 5 ink while 0/10 AP cannot; exact boundary accepts and meaningful shortage rejects',async()=>{
 for(const gp of [0,10,57]){
  const f=await fixture(),a=f.make('dualies');saver(a,gp);a.ink=5;assert.equal(a.weaponRunner.tryDodge({x:1,z:0}),gp===57);near(a.ink,gp===57?1.15:5);
  a.weaponRunner.reset();a.intent.fire=true;const cost=a.weapon.rollInk;a.ink=cost-1e-6;assert.equal(a.weaponRunner.tryDodge({x:1,z:0}),false);near(a.ink,cost-1e-6);
  a.ink=gp===0?7:gp===57?3.85:cost;assert.ok(a.weaponRunner.tryDodge({x:1,z:0}));assert.ok(a.ink>=0);near(a.ink,0);assert.equal(a.weaponRunner.tryDodge({x:1,z:0}),false);
 }
});

test('#346: actor isolation, repeated equip and reset cannot compound the main saver',async()=>{
 const f=await fixture(),a=f.make('dualies'),b=f.make('dualies');saver(a,57);saver(b,0);const base=f.WEAPONS.dualies.rollInk;
 for(let i=0;i<3;i++){a.setWeapon('dualies');near(a.weapon.rollInk,3.85);near(b.weapon.rollInk,7);near(f.WEAPONS.dualies.rollInk,base);a.reset();near(a.weapon.rollInk,3.85);}
 a.setWeapon('shooter');assert.equal(a.weapon.rollInk,undefined);a.setWeapon('dualies');near(a.weapon.rollInk,3.85);
 b.intent.fire=true;assert.ok(b.weaponRunner.tryDodge({x:1,z:0}));near(b.ink,93);
});

test('#346: normalized AP is bounded and Flow cannot multiply slide cost a second time',async()=>{
 const f=await fixture(),a=f.make('dualies');a.s3.loadout=Array.from({length:3},()=>({main:'inkSaverMain',subs:Array(12).fill('inkSaverMain')}));a.setWeapon('dualies');near(f.abilityPoints(a.s3.loadout).inkSaverMain,57);near(a.weapon.rollInk,3.85);
 a.s3.flow.active=true;a.s3.flow.remaining=30;a.intent.fire=true;assert.ok(a.weaponRunner.tryDodge({x:1,z:0}));near(a.ink,96.15);near(a.weapon.rollInk,3.85);near(a.weapon.rollInkRecoverStop,70/60);
 a.s3.loadout=Array(8).fill({main:'inkSaverMain',subs:Array(12).fill('inkSaverMain')});a.setWeapon('dualies');assert.equal(f.abilityPoints(a.s3.loadout).inkSaverMain,undefined);near(a.weapon.rollInk,7);
});
