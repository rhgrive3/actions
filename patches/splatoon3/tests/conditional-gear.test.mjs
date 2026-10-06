import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { abilityAllowed, emptyLoadout, normalizeLoadout, abilityPoints, gearCurve } from '../runtime/gear.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const extra=`export * from './inkwave-public/src/game/match.js'; export * from './inkwave-public/src/net/netmatch.js';`;
async function setup(duration=180){
  const f=await fixture(extra),m=new f.Match({duration});f.G.match=m;
  // Isolate these ability windows from the separate Flow activation threshold.
  // Real Flow+gear stacking is exercised by conditional-gear-composition.mjs.
  f.profile.flow.threshold=1e6;
  f.G.level.spawnPads=[new f.THREE.Vector3(),new f.THREE.Vector3()];
  f.G.physics.groundProbe=(_x,_y,_z,_u,_d,_r,h)=>{h.hit=false;return h;};
  f.G.paint.coverage=()=>[.5,.5];m.setState('playing');return {...f,m};
}
function equip(a, head='none', ability='none', ap=0){
  const l=emptyLoadout();l[0].main=head;
  if(ap===3)l[0].subs[0]=ability;
  if(ap===10)l[1].main=ability;
  if(ap===47||ap===57){for(const p of l)p.subs.fill(ability);l[1].main=l[2].main=ability;if(ap===57)l[0].main=ability;}
  a.s3.loadout=l;a.setWeapon(a.weaponId);return l;
}
function enemy(f){const a=f.make();a.team=1;return a;}
function death(f,a,cause='weapon',attacker=enemy(f)){a.splat(attacker,cause);a.respawn();}
test('three special abilities are head-main only; sub resistance occupies ordinary slots',()=>{
  for(const id of ['lastDitchEffort','comeback','openingGambit']){
    const l=Array.from({length:3},()=>({main:id,subs:[id,id,id]}));
    assert.equal(normalizeLoadout(l)[0].main,id);
    assert.equal(abilityPoints(l)[id],10);
    for(let p=0;p<3;p++)for(let s=0;s<4;s++)assert.equal(abilityAllowed(id,p,s),p===0&&s===0);
  }
  const l=Array.from({length:3},()=>({main:'subResistance',subs:Array(3).fill('subResistance')}));
  assert.equal(abilityPoints(l).subResistance,57);
});
test('last ditch activates at the final30 seconds in real90/180 second Match objects',async()=>{
  for(const duration of [90,180]){
    const f=await setup(duration),a=f.make();equip(a,'lastDitchEffort');const weapon=a.weapon,base=a.weapon.inkPerShot;
    f.m.time=30+1/60;f.tick(a);close(a.weapon.inkPerShot,base);
    f.m.time=30;f.tick(a);close(a.weapon.inkPerShot,base*gearCurve(18,...f.profile.gear.inkSaverMain));
    close(a.s3.modifiers.inkRecovery,gearCurve(18,...f.profile.gear.inkRecovery));
    assert.equal(a.weapon,weapon);assert.equal(f.m.duration,duration);
    f.m.setState('finish');f.tick(a);close(a.weapon.inkPerShot,base);
  }
});
test('last ditch combines with equipment at cap57, persists after death and clears next match',async()=>{
  const f=await setup(),a=f.make();equip(a,'lastDitchEffort','inkSaverMain',47);f.m.time=20;f.tick(a);
  close(a.s3.modifiers.inkSaverMain,f.profile.gear.inkSaverMain[2]);assert.equal(abilityPoints(a.s3.loadout).inkSaverMain,47);
  death(f,a);close(a.s3.modifiers.inkSaverMain,f.profile.gear.inkSaverMain[2]);
  f.G.match=new f.Match({duration:90});f.G.match.setState('playing');f.tick(a);
  close(a.s3.modifiers.inkSaverMain,gearCurve(47,...f.profile.gear.inkSaverMain));
});
test('last ditch reaches actual main consumption and both existing recovery consumers',async()=>{
  const f=await setup(),a=f.make();equip(a,'lastDitchEffort');f.m.time=20;f.tick(a);
  a.grounded=true;a.ink=100;a.intent.fire=true;const before=a.ink;f.tick(a,Math.round(a.weapon.firstShotDelay*60));close(before-a.ink,a.weapon.inkPerShot);
  a.intent.fire=false;a.lastFire=99;a.weaponRunner.reset();a.s3.recoverStopRemaining=0;a.ink=0;a.form='kid';
  f.updateResources(a,1);close(a.ink,f.profile.resources.inkRefillKid*a.s3.modifiers.inkRecoveryKid);
  a.ink=0;a.form='squid';a.grounded=true;f.updateResources(a,1);
  close(a.ink,f.profile.resources.inkRefillSwim*a.s3.modifiers.inkRecoverySwim);
});
test('comeback begins at an enemy-caused respawn and expires after1200 fixed ticks',async()=>{
  const f=await setup(),a=f.make();equip(a,'comeback');close(a.s3.modifiers.runSpeed,1);death(f,a);
  close(a.s3.modifiers.runSpeed,gearCurve(10,...f.profile.gear.runSpeed));
  close(a.s3.modifiers.specialCharge,gearCurve(10,...f.profile.gear.specialCharge));
  f.tick(a,1199);assert.ok(a.s3.conditionalGear.comeback>0);
  f.tick(a);assert.ok(a.s3.conditionalGear.comeback<1e-10);close(a.s3.modifiers.runSpeed,1);
});
test('comeback never starts on initial respawn, no attacker, ally, water or fall',async()=>{
  const f=await setup();
  for(const cause of ['initial','weapon-null','ally','water','fall']){
    const a=f.make();equip(a,'comeback');
    if(cause==='initial')a.respawn();else death(f,a,cause==='weapon-null'?'weapon':cause,cause==='weapon-null'?null:cause==='ally'?f.make():enemy(f));
    close(a.s3.conditionalGear.comeback,0);close(a.s3.modifiers.runSpeed,1);
  }
});
test('comeback conservative residual policy clears an old life; enemy respawn grants a fresh20 seconds',async()=>{
  const f=await setup(),a=f.make();equip(a,'comeback');death(f,a);f.tick(a,60);
  death(f,a,'water',null);close(a.s3.conditionalGear.comeback,0);
  death(f,a);close(a.s3.conditionalGear.comeback,20);
  // This environmental-death residual choice is a bounded internal policy;
  // its exact Splatoon counterpart remains unverified in the report.
});
test('comeback refresh preserves filled special fraction, weapon identity and action clocks',async()=>{
  const f=await setup(),a=f.make();equip(a,'comeback');death(f,a);a.special=.4*a.specialCost();
  const w=a.weapon,r=a.weaponRunner;r.s3Stored=.7;r.firingT=.3;a.s3.conditionalGear.comeback=1/60;
  f.tick(a);close(a.specialFrac(),.4);assert.equal(a.weapon,w);assert.equal(a.weaponRunner,r);assert.equal(r.s3Stored,.7);
  const before=a.specialFrac();a.addTurf(10);close(a.specialFrac()-before,10/a.specialCost());
});
test('opening gambit excludes intro, countdown, attract and pause; all four abilities activate in play',async()=>{
  const f=await setup(),a=f.make('blaster');equip(a,'openingGambit');
  for(const state of ['intro','countdown']){f.m.setState(state);f.tick(a,60);close(a.s3.modifiers.runSpeed,1);}
  f.m.setState('playing');f.tick(a);close(a.s3.modifiers.actionIntensify,gearCurve(30,...f.profile.gear.actionIntensify));
  f.m.attract=true;f.tick(a);close(a.s3.modifiers.runSpeed,1);f.m.attract=false;
  f.m.time=f.m.duration-29;f.m.paused=true;f.tick(a,600);assert.ok(a.s3.modifiers.runSpeed>1);
  f.m.paused=false;f.m.time=f.m.duration-30;f.tick(a);close(a.s3.modifiers.runSpeed,1);
});
test('opening kill and real Flow assist credits extend once per victim life and never restart expiry',async()=>{
  const f=await setup(),a=f.make(),killer=f.make(),v=enemy(f);equip(a,'openingGambit');
  f.m.time=f.m.duration-20;f.emit('damage',{attacker:a,victim:v,amount:20,source:'shooter'});
  v.splat(killer);assert.equal(a.s3.conditionalGear.openingEnd,45);
  f.emit('splatted',{attacker:killer,victim:v});assert.equal(a.s3.conditionalGear.openingEnd,45);
  const second=enemy(f);second.splat(a);assert.equal(a.s3.conditionalGear.openingEnd,60);
  f.emit('splatted',{attacker:a,victim:second});assert.equal(a.s3.conditionalGear.openingEnd,60);
  f.m.time=f.m.duration-60;const late=enemy(f);late.splat(a);assert.equal(a.s3.conditionalGear.openingEnd,60);
  f.tick(a);close(a.s3.modifiers.runSpeed,1);
});
test('opening extension survives respawn without restarting and resets for a new match',async()=>{
  const f=await setup(),a=f.make();equip(a,'openingGambit');enemy(f).splat(a);assert.equal(a.s3.conditionalGear.openingEnd,45);
  f.m.time=f.m.duration-40;death(f,a);assert.equal(a.s3.conditionalGear.openingEnd,45);
  f.m.time=f.m.duration-46;f.tick(a);close(a.s3.modifiers.runSpeed,1);
  f.G.match=new f.Match({duration:90});f.G.match.setState('playing');f.tick(a);assert.equal(a.s3.conditionalGear.openingEnd,30);
});
test('sub resistance applies to real far-band HP at0/3/10/57 AP and keeps canonical damage cause',async()=>{
  for(const [ap,expected] of [[0,30],[3,28.5],[10,25.4],[57,15]]){
    const f=await setup(),owner=f.make(),v=enemy(f);equip(v,'none','subResistance',ap);v.pos.set(0,-.7,5);v.invuln=0;
    f.G.actors=[owner,v];let event;f.on('damage',x=>{event=x;});
    new f.Projectiles(new f.THREE.Scene())._explodeBomb({owner,team:0,pos:new f.THREE.Vector3()});
    close(100-v.hp,expected);assert.equal(event.source,'bomb');assert.equal(v.s3SubResistanceHit,undefined);
  }
});
test('sub resistance excludes near180, other weapons, allies, cover and invulnerability',async()=>{
  const f=await setup(),owner=f.make(),v=enemy(f);equip(v,'none','subResistance',57);v.invuln=0;f.G.actors=[owner,v];
  const system=new f.Projectiles(new f.THREE.Scene());v.pos.set(0,-.7,2);let damage;f.on('damage',e=>{damage=e.amount;});
  system._explodeBomb({owner,team:0,pos:new f.THREE.Vector3()});assert.equal(damage,180);
  for(const source of ['shooter','slosher','blaster','storm','ink']){v.reset();v.invuln=0;v.damage(30,owner,source);close(v.hp,70);}
  v.reset();v.invuln=1;v.pos.set(0,-.7,5);system._explodeBomb({owner,team:0,pos:new f.THREE.Vector3()});close(v.hp,100);
  v.invuln=0;f.G.physics.los=()=>false;system._explodeBomb({owner,team:0,pos:new f.THREE.Vector3()});close(v.hp,100);
  f.G.physics.los=()=>true;v.team=0;system._explodeBomb({owner,team:0,pos:new f.THREE.Vector3()});close(v.hp,100);
});
test('sub resistance is applied before armor and only quantized at the final HP boundary',async()=>{
  const f=await setup(),owner=f.make(),v=enemy(f);equip(v,'none','subResistance',3);v.invuln=0;v.specialActive={armor:true};
  v.damage(30,owner,'splat-bomb-far');close(v.hp,92.9);
  v.hp=100;v.damage(180,owner,'bomb');close(v.hp,55);
  v.specialActive=null;v.hp=100;v.form='squid';v.submerged=v.grounded=true;v.vel.set(0,0,12);v.intent.move.set(0,0,-1);f.beforeActions(v,1/60,true);assert.ok(v.s3.actions.armor);
  v.damage(180,owner,'bomb');close(v.hp,20);
});
test('network routing sends the unreduced band and victim owner applies its own gear once',async()=>{
  const f=await setup(),owner=f.make(),v=enemy(f);equip(owner,'none','subResistance',57);equip(v,'none','subResistance',3);
  v.pos.set(0,-.7,5);v.invuln=0;v.nid=1;owner.nid=2;owner.remote=true;f.G.actors=[owner,v];
  const system=new f.Projectiles(new f.THREE.Scene());f.G.projectiles=system;let packet;
  f.G.netm={shouldApplyHit:()=> 'send',sendHit:(a,t,d,w)=>packet={a:a.nid,v:t.nid,d,w}};
  system._explodeBomb({owner,team:0,pos:new f.THREE.Vector3()});close(v.hp,100);close(packet.d,30);assert.equal(packet.w,'splat-bomb-far');
  const net=new f.NetMatch({myId:'local'},{});net.byNid.set(1,v);net.byNid.set(2,owner);f.G.netm=net;
  net._hit(packet);close(v.hp,71.5);assert.equal(net._applyingHit,false);
});
test('actor isolation and30/60/120Hz fixed partitions preserve expiry and boundary results',async()=>{
  const traces=[];
  for(const hz of [30,60,120]){
    const f=await setup(90),a=f.make(),b=f.make();equip(a,'comeback');death(f,a);a.s3.conditionalGear.comeback=.5;
    let acc=0,ticks=0,expired=0;for(let frame=0;frame<hz;frame++){acc+=1/hz;while(acc+1e-10>=1/60){f.tick(a);ticks++;acc-=1/60;if(!expired&&a.s3.modifiers.runSpeed===1)expired=ticks;}}
    traces.push([expired,a.weapon.inkPerShot,b.s3.modifiers.runSpeed]);
  }
  assert.deepEqual(traces[0],traces[1]);assert.deepEqual(traces[1],traces[2]);assert.equal(traces[0][0],30);
});
