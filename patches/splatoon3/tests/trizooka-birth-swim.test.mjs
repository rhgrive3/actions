import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const F=1/60;
let cached;
async function world({motion=false}={}) {
  cached ||= fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
    extraExports:"export {throwVolley,trizookaSpecialWeapon,TRIZOOKA_SWIM_CALIBRATION} from './patches/splatoon3/runtime/kit-trizooka.mjs';"});
  const f=await cached,{G,THREE}=f;
  G.netm=null;G.time=0;G.actors=[];G.fx=null;G.audio=null;G.camera=new THREE.PerspectiveCamera();
  G.match={state:'playing',playing:()=>true,canRespawn:()=>false};
  G.level=new f.Level({bounds:{minX:-40,maxX:40,minZ:-40,maxZ:40},spawnPads:[[0,0,0],[0,0,20]],spawnBarrier:0,
    single:[{kind:'box',min:[-40,-1,-40],max:[40,0,40]}],half:[]});
  G.physics=new f.Physics(G.level);G.paint={sample:()=>1,splat:()=>0};
  G.projectiles=new f.Projectiles(new THREE.Scene());
  const a=f.make('shooter');a.pos.set(0,0,0);a.vel.set(0,0,0);a.aimDir.set(0,0,1);a.aimPoint.set(0,1.05,30);
  a.nid=7;a.owner='local';a.isLocal=true;
  a.character.root.position.copy(a.pos);a.character.update=()=>{};
  if(motion){a._integrate=f.Actor.prototype._integrate;a._finishFrame=f.Actor.prototype._finishFrame;a._probeGround();}
  return {...f,a,p:G.projectiles};
}
function network(f){
  const n=new f.NetMatch({myId:'local',hostId:'peer',isHost:false,_members:new Map([['peer','peer']])},{});
  n.byNid=new Map([[7,f.a]]);n.out=[];n.mute=0;n.applying=false;
  const births=[],record=n._rec;
  n._rec=function(e){if(e[0]==='p')births.push({t:f.G.time,index:e[27],event:e});return record.call(this,e);};
  f.G.netm=n;return {n,births};
}
function tickProjectiles(f,n=1,dt=F){for(let i=0;i<n;i++){f.G.time+=dt;f.p.update(dt);}}
function stationaryVolley(f){
  const globs=f.throwVolley(f.p,f.a,f.trizookaSpecialWeapon());
  for(const p of globs){p.pos.set(0,10,0);p.prev.copy(p.pos);p.start.copy(p.pos);p.vel.set(0,0,0);}
  return globs;
}

test('native 0/4/8F births gate physics, draw and real recProj independently',async()=>{
  const f=await world(),{n,births}=network(f),globs=stationaryVolley(f);
  assert.equal(n.out.filter(e=>e[1]==='p').length,1,'unborn globs have no wire birth');
  tickProjectiles(f,3);assert.deepEqual(Array.from(globs,p=>p.age),[3*F,0,0]);assert.equal(f.p.blobs.count,1);
  tickProjectiles(f);assert.equal(globs[1].s3TrizookaBirthPending,false);assert.equal(globs[1].age,0);
  assert.equal(f.p.blobs.count,2,'second glob is drawn at its exact birth, before movement');
  tickProjectiles(f,4);assert.equal(globs[2].s3TrizookaBirthPending,false);assert.equal(globs[2].age,0);
  assert.equal(f.p.blobs.count,3);
  assert.deepEqual(births.map(x=>Math.round(x.t*60)),[0,4,8]);
  const packets=JSON.parse(JSON.stringify(n.out.filter(e=>e[1]==='p')));
  assert.deepEqual(packets.map(e=>e[11]),[0,0,0],'true-birth packets carry no second launch delay');
  tickProjectiles(f,2);assert.equal(n.out.filter(e=>e[1]==='p').length,3,'no duplicate records after birth');
});

test('render rates 20/30/60/120 preserve 4F births on the production fixed source clock',async()=>{
  for(const hz of [20,30,60,120]){
    const f=await world(),{births}=network(f),globs=stationaryVolley(f),clock=new f.FixedClock();
    for(let i=0;i<hz/2;i++)clock.advance(1/hz,()=>tickProjectiles(f));
    assert.deepEqual(births.map(x=>Math.round(x.t*60)),[0,4,8],`${hz} Hz`);
    assert.ok(Math.abs((globs[0].age-globs[1].age)-4*F)<1e-9);
    assert.ok(Math.abs((globs[1].age-globs[2].age)-4*F)<1e-9);
  }
});

test('unborn globs cannot paint an immediate wall before their own active step',async()=>{
  const f=await world();f.G.actors=[];
  let paint=0;f.G.paint.splat=()=>{paint++;return 0;};
  const globs=f.throwVolley(f.p,f.a,f.trizookaSpecialWeapon());
  // A real field contact is certain on the first active native step.
  for(const p of globs){p.pos.set(0,.01,0);p.prev.copy(p.pos);p.vel.set(0,-60,0);}
  f.p._blastBurst(globs[1],globs[1].pos,null);
  assert.equal(paint,0,'even a direct native burst call cannot give an unborn glob paint');
  tickProjectiles(f,3);assert.ok(paint>0,'the first born glob really paints on native impact');
  assert.equal(f.p.list.includes(globs[0]),false,'first glob has actually completed terrain contact');
  const firstPaint=paint;
  tickProjectiles(f);assert.equal(paint,firstPaint,'birth at frame 4 owns no pre-birth integration');
  tickProjectiles(f,3);assert.ok(paint>firstPaint,'second glob contacts terrain after its frame-4 birth');
});

test('an overlapping victim cannot receive a pending lobe hit before its 4F birth',async()=>{
  const f=await world(),target=f.make();target.team=1;target.invuln=0;target.hp=1000;target.pos.set(0,0,0);
  const globs=f.throwVolley(f.p,f.a,f.trizookaSpecialWeapon());
  globs[0].ghost=true;globs[0].damageOwner=false;
  for(const p of globs){p.pos.set(0,.7,0);p.prev.copy(p.pos);p.vel.set(0,0,0);}
  tickProjectiles(f,4);assert.equal(target.hp,1000,'second glob has no pre-birth hit volume');
  tickProjectiles(f);assert.equal(target.hp,780,'native first active step delivers the full direct hit');
});

test('real wire replay births each ghost once and does not apply the 4F delay again',async()=>{
  const f=await world(),{n}=network(f);stationaryVolley(f);tickProjectiles(f,8);
  const packets=JSON.parse(JSON.stringify(n.out.filter(e=>e[1]==='p')));f.p.clear();n.out=[];
  const ghost=f.make();ghost.nid=7;ghost.team=1;ghost.remote=true;ghost.owner='peer';n.byNid.set(7,ghost);f.G.actors=[ghost];
  for(let i=0;i<packets.length;i++){
    f.NetMatch.prototype._play.call(n,'peer',packets[i]);
    const p=f.p.list.at(-1);assert.equal(p.ghost,true);assert.equal(p.delay,0);assert.equal(p.s3VolleyIndex,i);
    const before=p.pos.clone();f.p._step(p,F);assert.equal(p.age,F,'ghost advances on its first post-birth step');
    assert.ok(p.pos.distanceTo(before)>0,'recorded launch velocity remains live');
  }
  assert.equal(n.out.filter(e=>e[1]==='p').length,0,'ghost births never echo authoritative packets');
});

test('death, clear and pool reuse cannot release an unborn glob into a later life or match',async()=>{
  const f=await world(),{n}=network(f),globs=stationaryVolley(f);
  f.a.splat(null,'test');tickProjectiles(f,8);
  assert.equal(n.out.filter(e=>e[1]==='p').length,1,'death cancels both unborn globs');
  assert.equal(f.p.list.filter(p=>globs.includes(p)).length,1,'already-born glob keeps native flight');
  f.a.alive=true;f.a.hp=100;const pending=stationaryVolley(f);f.p.clear();
  const before=n.out.filter(e=>e[1]==='p').length;tickProjectiles(f,12);
  assert.equal(n.out.filter(e=>e[1]==='p').length,before,'clear removes pending births');
  const recycled=f.p._new();assert.equal(recycled.s3TrizookaBirthPending,undefined);
  assert.equal(recycled.s3TrizookaBirthCancelled,undefined);assert.equal(recycled.delay,0);
  assert.ok(pending.length===3);
});

test('unborn births are cancelled across local life, network life and ownership handoff boundaries',async()=>{
  for(const change of [a=>{a.netLife=(a.netLife||0)+1;},a=>{a.net={...a.net,lastLife:(a.netLife||0)+1};},
    a=>{a.owner='new-owner';},a=>{a.remote=true;}]){
    const f=await world(),{n}=network(f),globs=stationaryVolley(f);
    change(f.a);tickProjectiles(f,8);
    assert.equal(n.out.filter(e=>e[1]==='p').length,1,'an old authority cannot record a new birth');
    assert.equal(f.p.list.filter(p=>globs.includes(p)).length,1,'only the already-born native glob survives');
  }
});

test('active Trizooka delegates native swimming and emergence while suppressing main, sub and Dualies dodge',async()=>{
  for(const hz of [30,60,120]){
    const f=await world({motion:true}),{a}=f;
    let frames=0,main=0,sub=0,dodge=0;
    const finish=a._finishFrame;a._finishFrame=function(dt){frames++;return finish.call(this,dt);};
    f.p.fireShooter=()=>{main++;};f.p.throwBomb=()=>{sub++;};
    a.weaponRunner.tryDodge=()=>{dodge++;a.ink-=10;return true;};
    a.special=a.specialCost();a._startSpecial();const count=a.stats.specials;
    a.intent.squid=true;a.intent.move.set(0,0,1);a.intent.sub=true;
    for(let i=0;i<hz;i++){f.G.time+=1/hz;a.update(1/hz);}
    assert.equal(a.form,'squid');assert.equal(a.submerged,true);assert.equal(a.anim.form,'swim');
    assert.ok(a.pos.z>1,'native integration really moves the swimming actor');
    const expectedSwim=f.PLAYER.swimSpeed*f.TRIZOOKA_SWIM_CALIBRATION.multiplier*a.s3.modifiers.swimSpeed;
    assert.ok(Math.abs(a.vel.z-expectedSwim)<1e-7,'the approximate swim ratio retains the existing weight/gear curve');
    assert.ok(a.s3Trizooka.active);assert.ok(Math.abs(a.s3Trizooka.t-1)<1e-8);
    assert.equal(a.specialActive.t,a.s3Trizooka.t);assert.equal(frames,hz,'finishFrame runs once per actor tick');
    assert.equal(a.stats.specials,count);assert.equal(main,0);assert.equal(sub,0);
    a.intent.fire=true;a.intent.jump=true;
    for(let i=0;i<Math.ceil(hz*.4);i++){f.G.time+=1/hz;a.update(1/hz);}
    assert.equal(a.form,'kid','fresh ZR uses native press ordering to emerge');
    assert.ok(f.p.list.some(p=>p.wid==='trizooka'),'the special fires after emergence');
    assert.equal(main,0);assert.equal(sub,0);assert.equal(dodge,0,'ordinary Dualies dodge cannot bypass the weapon mask');
    assert.match(f.TRIZOOKA_SWIM_CALIBRATION.status,/unverified/);
  }
});

test('swim HP/ink recovery and the special clock execute only once while equipped main remains unchanged',async()=>{
  const f=await world({motion:true}),{a}=f,weapon=a.weapon,runner=a.weaponRunner;
  a.special=a.specialCost();a._startSpecial();a.intent.squid=true;a.ink=20;a.hp=50;a.lastDamage=99;
  const mainUpdate=runner.update,speed=runner.moveSpeed,busy=runner.busy,swim=f.PLAYER.swimSpeed;
  f.G.time+=F;a.update(F);
  assert.ok(Math.abs(a.ink-(20+f.profile.resources.inkRefillSwim*F))<1e-8,'one native ink-refill tick');
  assert.ok(Math.abs(a.hp-(50+f.profile.resources.regenRateSwim*F))<1e-8,'one native HP-recovery tick');
  assert.equal(a.weapon,weapon);assert.equal(runner.update,mainUpdate);assert.equal(runner.moveSpeed,speed);assert.equal(runner.busy,busy);
  assert.equal(f.PLAYER.swimSpeed,swim,'scoped shared speed restores after delegation');
  assert.ok(Math.abs(a.s3Trizooka.t-F)<1e-9);
});
