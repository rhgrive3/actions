import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './controls-fixture.mjs';
const STEP = 1 / 60;
async function rig(kind) {
  const f = await fixture(), a = f.make(kind), r = a.weaponRunner;
  f.G.projectiles.throwBomb = () => f.shots.push({kind: 'bomb'});
  f.G.projectiles.fireSlosh = () => f.shots.push({kind: 'slosher'});
  a.ink = 100;
  function step(input={}) { f.G.time += STEP; a.lastFire += STEP; a.intent.fire=!!input.fire; a.intent.sub=!!input.sub; r.update(STEP, input); }
  return {...f,a,r,step};
}
for (const kind of ['shooter','charger','roller','splatling','dualies','slosher','blaster']) {
  test(`#530 ${kind}: admitted bomb hold and release own the main dispatcher`, async () => {
    const h = await rig(kind);
    for(let i=0;i<20;i++) h.step({sub:true,fire:true,firePressed:i===0});
    assert.equal(h.r.aimingSub,true);
    assert.equal(h.shots.length,0,'no main attack while aiming');
    assert.equal(h.r.charging,false); assert.equal(h.r.streaming,false); assert.equal(h.r.rolling,false);
    assert.equal(h.a.ink,100,'no main ink spent during aim');
    h.step({subReleased:true,fire:true,firePressed:true});
    assert.deepEqual(h.shots.map(s=>s.kind),[], '#1037 uses one independent fixed tick after admission');
    assert.equal(h.r.s3SubReady?.pending,true,'admitted release survives the use-startup boundary');
    h.step();
    assert.deepEqual(h.shots.map(s=>s.kind),['bomb'],'only the bomb emits on the next fixed tick');
    assert.equal(h.a.ink,100-h.SUB.bomb.inkCost);
    for(let i=0;i<120;i++) h.step();
    assert.deepEqual(h.shots.map(s=>s.kind),['bomb'],'aborted or released aim leaves no main action queued');
  });
}
for (const kind of ['charger','splatling']) test(`#530 ${kind}: entering sub cancels an existing charge without firing`, async()=>{
  const h=await rig(kind);for(let i=0;i<20;i++)h.step({fire:true,firePressed:i===0});assert.equal(h.r.charging,true);
  const ink=h.a.ink;h.step({sub:true});assert.equal(h.r.charging,false);assert.equal(h.r.streaming,false);assert.equal(h.r.s3Stored,null);assert.equal(h.shots.length,0);assert.equal(h.a.ink,ink);
  h.step();for(let i=0;i<60;i++)h.step();assert.equal(h.shots.length,0,'abort does not release a latent main charge');
});
test('#530 a cancelled prepaid stream refunds only its recorded unspent balance and never reappears',async()=>{
  const h=await rig('splatling');for(let i=0;i<72;i++)h.step({fire:true});h.step();assert.equal(h.r.streaming,true);
  const ink=h.a.ink,unspent=h.r.s3Spin.unspent;h.step({sub:true});assert.equal(h.r.streaming,false);assert.equal(h.a.ink,Math.min(100,ink+unspent));const shots=h.shots.length;
  h.step();for(let i=0;i<120;i++)h.step();assert.equal(h.shots.length,shots);
});
for(const kind of ['roller','slosher','blaster'])test(`#530 ${kind}: committed attack completes before admitting a fresh sub hold`,async()=>{
  const h=await rig(kind);h.step({fire:true,firePressed:true});
  const pending=()=>h.r.flick>=0||h.r.slosh>=0||h.r.s3BlasterWindup>0;
  assert.ok(pending());let ticks=0;while(pending()&&ticks++<180){h.step({sub:true});assert.equal(h.r.aimingSub,false);}
  assert.ok(ticks<180);assert.deepEqual(h.shots.map(s=>s.kind),[kind]);const lock=Math.max(h.r.s3FlickPostSub||0,h.r.s3PostShotRemaining||0);assert.ok(lock>0,'current release owns its post-shot sub gate');for(let age=1;age<=Math.ceil((lock+1e-9)/STEP)+1&&!h.r.aimingSub;age++)h.step({sub:true});assert.equal(h.r.aimingSub,true);
  h.step({subReleased:true,fire:true,firePressed:true});
  const releaseKinds=h.shots.map(s=>s.kind);
  // A long held Sub may have already completed its independent ready/use
  // clocks. A freshly admitted release completes on the following tick.
  // Either way, only one Bomb may be created and no main attack can replay.
  assert.ok(
    JSON.stringify(releaseKinds)===JSON.stringify([kind]) ||
    JSON.stringify(releaseKinds)===JSON.stringify([kind,'bomb']),
    'commit must not replay main or duplicate a Bomb',
  );
  h.step();assert.deepEqual(h.shots.map(s=>s.kind),[kind,'bomb']);
});
test('#530 sub aim preserves elapsed cooldown/recovery and low-ink Bomb rejection',async()=>{
  const h=await rig('shooter');h.a.ink=1;h.r.cooldown=.5;h.r.flickRecover=.4;
  for(let i=0;i<10;i++)h.step({sub:true,fire:true});assert.ok(Math.abs(h.r.cooldown-(.5-10*STEP))<1e-12);assert.ok(Math.abs(h.r.flickRecover-(.4-10*STEP))<1e-12);
  h.step({subReleased:true,fire:true});assert.equal(h.a.ink,1);assert.equal(h.shots.length,0);
});
test('#530 the fixed action history does not depend on render cadence',async()=>{
  let reference;
  for(const hz of [30,60,120,144]){const h=await rig('shooter'),clock=new h.FixedClock(),history=[];let tick=0;
    for(let frame=0;frame<hz*2;frame++)clock.advance(1/hz,()=>{tick++;h.step({sub:tick<=30,subReleased:tick===31,fire:tick<=31});history.push([tick,h.r.aimingSub,h.a.ink,h.shots.length]);});
    if(reference)assert.deepEqual(history,reference);else reference=history;
  }
});
test('#530 actual Actor discards a buffered #527 Roller emergence tap when sub takes ownership',async()=>{
  const h=await rig('roller'),a=h.a;a._surface=()=>{};a._horizontal=()=>{};a._updateClimb=()=>{};
  a.form='squid';a.intent.squid=true;a._prevIntent.squid=true;a._squidPressT=-1;a.intent.fire=true;h.tick(a);assert.ok(a.fireBuffer>0);
  a.intent.fire=false;a.intent.squid=false;a.intent.sub=true;h.tick(a);assert.equal(h.r.aimingSub,true);assert.equal(a.fireBuffer,0);
  a.intent.sub=false;h.tick(a);h.tick(a,80);assert.deepEqual(h.shots.map(s=>s.kind),['bomb']);assert.equal(h.r.flick,-1);
});
test('#530 an in-flight Dualies dodge and its native lock keep advancing before sub admission',async()=>{
  const h=await rig('dualies');h.a.intent.fire=true;assert.equal(h.r.tryDodge(new h.THREE.Vector3(1,0,0)),true);const ink=h.a.ink;let ticks=0;
  while((h.r.dodge||h.r.lockT>0)&&ticks++<180){h.step({sub:true});assert.equal(h.r.aimingSub,false);}
  assert.ok(ticks<180);assert.equal(h.a.ink,ink);assert.equal(h.shots.length,0);h.step({sub:true});assert.equal(h.r.aimingSub,true);
});
test('#530 a long sub hold accrues no main-shot debt on the next legitimate press',async()=>{
 const h=await rig('shooter');for(let i=0;i<120;i++)h.step({sub:true});
 h.step({subReleased:true});h.step(); // settle the independent #1037 use tick
 const control=await rig('shooter');
 const normal=()=>h.shots.filter(s=>s.kind==='shooter').length;
 const fresh=()=>control.shots.filter(s=>s.kind==='shooter').length;
 for(let i=0;i<16;i++){
   const input={fire:true,firePressed:i===0};
   h.step(input);control.step(input);
   assert.equal(normal(),fresh(),`Sub hold cannot create early/main-shot debt at frame ${i}`);
 }
 assert.ok(normal()>0,'normal held main fire eventually emits');
});
test('#530 completed Roller release is cancelled visually instead of replayed during sub aim',async()=>{
 const f=await fixture({character:true});f.installWalkMotion(f,f.profile);f.installRollerMotion(f,f.profile);const a=new f.Actor({team:0,name:'sub visual',weapon:'roller',CharacterClass:f.Character}),r=a.weaponRunner,ch=a.character;
 a.grounded=true;ch.actor=a;ch.onEvent=null;ch.tr.fill(99);const tick=input=>{r.update(STEP,input);ch.update(STEP,{form:'kid',grounded:true,speed:0,vy:0,firing:false,rolling:false,localMove:{x:0,z:0},subAim:r.aimingSub});};
 tick({fire:true,firePressed:true});while(r.flick>=0)tick({});const releaseDrum=ch.weapon.drumW;assert.ok(Number.isFinite(releaseDrum)&&releaseDrum>0);assert.ok(r.s3RollerAttack);
 for(let i=0;i<60;i++)tick({sub:true});assert.equal(r.s3RollerAttack,null);assert.equal(ch.s3RollerFlick,null);assert.ok(ch.weapon.drumW<=releaseDrum,'no repeated release impulse');assert.equal(f.shots.length,1);
});
test('#530 rejected Bomb release keeps the actual Blaster recovery owner',async()=>{
 const h=await rig('blaster');h.step({fire:true,firePressed:true});for(let i=0;i<13;i++)h.step({sub:true});h.step({subReleased:true});
 assert.deepEqual(h.shots.map(s=>s.kind),['blaster']);assert.equal(h.a.s3.recoverStopRemaining,h.a.weapon.inkRecoverStop);
});
test('#530 sub plus fire during Dualies travel keeps the existing fire suppression',async()=>{
 const h=await rig('dualies');h.a.intent.fire=true;assert.equal(h.r.tryDodge(new h.THREE.Vector3(1,0,0)),true);const ink=h.a.ink;
 for(let i=0;i<60;i++)h.step({sub:true,fire:true});assert.equal(h.shots.length,0);assert.equal(h.a.ink,ink);assert.equal(h.r.rollsLeft,2);assert.equal(h.r.aimingSub,true);
});
