import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

const F=1/60;
const near=(a,b,label)=>assert.ok(Math.abs(a-b)<1e-7,`${label}: ${a} != ${b}`);
let cached;
async function world(){
  cached ||= fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
    extraExports:`export {inkVacState,inkVacAbsorbCandidate,disposeInkVac,INK_VAC_CALIBRATION,replayInkVac,installInkVacSenderValidator,INK_VAC_EVENTS} from './patches/splatoon3/runtime/kit-ink-vac.mjs';
      export {bigBubblerDomes,bigBubblerRemoteDomes,tickBigBubblers,tickRemoteBigBubblers,replayBigBubbler,clearBigBubblers,BIG_BUBBLER_RAW} from './patches/splatoon3/runtime/kit-big-bubbler.mjs';
      export {tacticoolerGaugeLocked,specialGaugeLocked} from './patches/splatoon3/runtime/tacticooler-gauge.mjs';
      export {advanceTenacity} from './patches/splatoon3/runtime/tenacity.mjs';`});
  const f=await cached,{G,THREE}=f;
  f.clearBigBubblers('test');G.netm=null;G.time=0;G.actors=[];G.fx=null;G.audio=null;
  G.scene=new THREE.Scene();G.camera=new THREE.PerspectiveCamera();
  G.match={state:'playing',mode:'turf',playing:()=>true,canRespawn:()=>false};
  G.level=new f.Level({bounds:{minX:-50,maxX:50,minZ:-50,maxZ:50},spawnPads:[[0,0,0],[0,0,30]],spawnBarrier:0,
    single:[{kind:'box',min:[-50,-1,-50],max:[50,0,50]}],half:[]});
  G.physics=new f.Physics(G.level);G.paint={sample:()=>1,splat:()=>0};G.projectiles=new f.Projectiles(G.scene);
  return f;
}
function owner(f,weapon='charger'){
  const a=f.make(weapon);a.nid=7;a.owner='local';a.isLocal=true;a.pos.set(0,0,0);a.aimDir.set(0,0,1);
  a.aimPoint.set(0,1,30);return a;
}
function startVac(f){const a=owner(f);a.special=a.specialCost();a._startSpecial();a.intent.fire=true;
  for(let i=0;i<90;i++){f.G.time+=F;a.update(F);}return a;}
function placeCooler(f,pos=[0,0,3],team=1){
  const b=owner(f,'support');b.nid=9;b.team=team;b.remote=true;b.owner='peer';b.pos.set(...pos);
  const nm=Object.create(f.NetMatch.prototype);nm.byNid=new Map([[9,b]]);nm.match=f.G.match;f.G.netm=nm;
  nm._play('peer',[0,'ks','c',9,1,...pos,b.netLife||0,1020]);f.G.netm=null;
  b.pos.set(30,0,30); // isolate the deployed cover from the caster's actor capsule
  const stand=f.G.projectiles._s3SupportCoolers.at(-1);assert.ok(stand,'real authenticated stand replay deploys');return stand;
}

test('Vac wind protects a covered teammate from lateral and outgoing attacks, while back/LOS/team remain bounded',async()=>{
  const f=await world(),a=startVac(f),V=f.THREE.Vector3;
  for(const [start,end,vel] of [[new V(-3,1,5),new V(3,1,5),new V(60,0,0)],
    [new V(0,1,4),new V(0,1,6),new V(0,0,60)]]){
    const p={owner:{team:1},team:1,damage:30,vel};
    const c=f.inkVacAbsorbCandidate(a,start,end,p);assert.ok(c,'volume crossing, not travel direction, admits absorption');
    c.onHit();assert.equal(p.damage,0);
  }
  const p={team:1,damage:30,vel:new V(0,0,60)};
  assert.equal(f.inkVacAbsorbCandidate(a,new V(0,1,-4),new V(0,1,-3),p),null,'outside rear space remains vulnerable');
  assert.equal(f.inkVacAbsorbCandidate(a,new V(0,1,4),new V(0,1,5),{...p,team:0}),null,'friendly rounds pass');
  f.G.physics.los=()=>false;
  assert.equal(f.inkVacAbsorbCandidate(a,new V(0,1,4),new V(0,1,5),p),null,'a solid obstruction still wins');
});

test('Vac source muzzle sphere catches its own rim, resets with suction, and never widens the far wind',async()=>{
  const f=await world(),a=startVac(f),V=f.THREE.Vector3;
  const shot={team:1,damage:30,vel:new V(0,0,-60)};
  const inside=new V(1.15,1,1),outside=new V(1.201,1,1);
  assert.ok(f.inkVacAbsorbCandidate(a,inside,inside,shot),'source Radius1.2 exceeds the .967 wind radius at z1');
  assert.equal(f.inkVacAbsorbCandidate(a,outside,outside,shot),null,'muzzle radius has an exact outside boundary');
  const far=new V(3.31,1,15);assert.equal(f.inkVacAbsorbCandidate(a,far,far,shot),null);
  a.intent.fire=false;a.update(F);assert.equal(f.inkVacAbsorbCandidate(a,inside,inside,shot),null,'release has no muzzle defense');
});

test('Vac native countershot adds source vertical spawn speed without changing its separate blast radii',async()=>{
  const f=await world(),a=owner(f);
  for(const charge of [0,.5,1]){
    const p=f.G.projectiles.fireInkVacExhale(a,{charge});
    near(p.vel.y,.08*60,'SpawnSpeedY');near(p.vel.z,(.55+.15*charge)*60,'SpawnSpeedZ');
    near(p.radius,6+5*charge,'separate paint/burst radius');near(p.s3SpecialWeapon.splashRadius,6+5*charge,'damage radius');
    const y=p.pos.y;f.G.actors=[a];f.G.projectiles._step(p,F);
    assert.ok(p.pos.y>y,'the actual native flight rises on its first active frame');
  }
});

test('Vac carrying the main weapon away cannot discharge an already charged native Charger',async()=>{
  const f=await world(),a=owner(f);let main=0;f.G.projectiles.fireCharger=()=>{main++;};
  const arm=()=>{Object.assign(a.weaponRunner,{charging:true,charge:1,chargeT:1,cooldown:0,
    s3ChargerSpent:a.weapon.inkFull,s3ChargerHeldTime:1,s3ReleaseHold:false});a.kidT=1;};
  arm();a.intent.fire=false;for(let i=0;i<2;i++){f.G.time+=F;a.update(F);}
  assert.equal(main,1,'negative control really releases the paid native main charge');
  main=0;arm();a.special=a.specialCost();a._startSpecial();
  for(let i=0;i<40;i++)a.update(F);
  assert.equal(main,0,'special carry cancels ordinary main release');
  assert.equal(a.weaponRunner.charging,false,'discarded charge cannot emerge when the special ends');
});

test('Vac explicit zero-charge player radius reaches a grazing capsule and excludes the next outside capsule',async()=>{
  for(const [x,hit] of [[.7,true],[.81,false]]){
    const f=await world(),a=owner(f),victim=f.make();victim.team=1;victim.invuln=0;victim.hp=1000;victim.pos.set(x,0,0);
    const p=f.G.projectiles.fireInkVacExhale(a,{charge:0});p.vel.set(0,0,0);
    assert.equal(p.size,.4);assert.equal(p.vis,.2,'body contact does not enlarge the existing draw shell');
    const done=f.G.projectiles._step(p,F);
    assert.equal(done,hit);assert.equal(victim.hp,hit?780:1000,'native capsule admission uses the explicit minimum radius');
  }
});

test('Bubbler spends TimeDamage each source frame with identical AP/Tower duration at 30/60/120 Hz',async()=>{
  for(const hz of [30,60,120])for(const [ap,tower] of [[0,false],[57,false],[0,true]]){
    const f=await world(),a=owner(f,'roller');a.s3.modifiers.specialPowerAP=ap;
    if(tower){f.G.match.mode='tower';f.G.match.rankedWorld={_inTowerVolume:()=>true};}
    a.special=a.specialCost();a._startSpecial();const d=f.bigBubblerDomes()[0],max=d.hp;
    f.tickBigBubblers(15*F);near(d.hp,max,'ignition owns no earlier burn time');
    f.tickBigBubblers(F);const rate=(tower?1842:921)*2;near(d.hp,max-rate*F,'first live source frame spends HP');
    for(let i=0;i<hz;i++)f.tickBigBubblers(1/hz);
    near(d.hp,max-rate*(1+F),'one second of frame-rate independent TimeDamage');
    const endFrames=Math.ceil(max/rate*60-1e-10),elapsedFrames=61;
    for(let i=elapsedFrames;i<endFrames-1;i++)f.tickBigBubblers(F);
    assert.ok(f.bigBubblerDomes().includes(d),'the penultimate natural-life frame is still alive');
    f.tickBigBubblers(F);assert.equal(f.bigBubblerDomes().includes(d),false,'exact final source frame destroys it');
  }
});

test('Bubbler replay source-frame burn changes displayed health without mutating HP or authoring expiry',async()=>{
  const f=await world(),a=owner(f,'roller');a.remote=true;a.owner='peer';
  const payload={domeId:'peer-deep',serial:1,team:0,pos:[0,0,3],hp:30720,fieldHp:15360,t:0};
  assert.equal(f.replayBigBubbler('deploy',a,payload).ok,true);const d=f.bigBubblerRemoteDomes()[0];
  f.tickRemoteBigBubblers(15*F);f.tickRemoteBigBubblers(F);
  near(d.shell.material.uniforms.health.value,1-(1842*F)/30720,'same first-frame displayed burn');
  assert.equal(d.hp,30720);assert.equal(d.fieldHp,15360);assert.equal(d.damageProgress,0);
  f.tickRemoteBigBubblers(30);assert.equal(d.dead,false,'only owner expire can remove a replica');assert.equal(d.hp,30720);
});

test('Tacticooler source overlap removes either team stand, unlocks only that clock, and keeps already received drinks',async()=>{
  for(const [distance,removed] of [[1.8,true],[1.8001,false]]){
    const f=await world(),a=owner(f,'support');a.aimDir.set(0,-1,0);
    a.special=a.specialCost();a._startSpecial();a.specialActive.phase='throw';a.specialActive.t=13*F;a._updateSpecial(F);
    for(let i=0;i<30&&!f.G.projectiles._s3SupportCoolers?.length;i++){f.G.time+=F;f.G.projectiles.update(F);}
    const old=f.G.projectiles._s3SupportCoolers[0];assert.ok(old);assert.equal(f.tacticoolerGaugeLocked(a),true);
    a.s3.drink=true;a.s3.drinkUntil=f.G.time+17;
    const b=owner(f,'support');b.nid=8;b.team=1;b.remote=true;b.owner='peer';b.pos.copy(old.pos);
    const nm=Object.create(f.NetMatch.prototype);nm.byNid=new Map([[8,b]]);nm.match=f.G.match;f.G.netm=nm;
    const event=[0,'ks','c',8,1,old.pos.x+distance,old.pos.y,old.pos.z,b.netLife||0,1020];
    nm._play('peer',event);
    assert.equal(f.G.projectiles._s3SupportCoolers.includes(old),!removed);
    assert.equal(f.tacticoolerGaugeLocked(a),!removed,'only a physically retired stand unlocks');
    assert.equal(a.s3.drink,true);assert.equal(b.s3TacticoolerGauge,undefined,'remote stand cannot own a gauge');
    const count=f.G.projectiles._s3SupportCoolers.length;nm._play('peer',event);
    assert.equal(f.G.projectiles._s3SupportCoolers.length,count,'duplicate wire placement cannot retire its replacement');
  }
});

test('native Shooter and InkFlight Splatling heads stop at either team cooler before a farther victim',async()=>{
  for(const kind of ['shooter','splatling'])for(const team of [0,1]){
    const f=await world(),a=owner(f,kind),stand=placeCooler(f,[0,0,3],team),target=f.make();
    target.team=1;target.hp=1000;target.invuln=0;target.pos.set(0,0,6);
    const system=f.G.projectiles;
    if(kind==='splatling')system.fireSplatling(a,a.weapon,0);else system.fireShooter(a,a.weapon,0);
    const p=system.list.at(-1);p.pos.set(0,.65,0);p.prev.copy(p.pos);p.vel.set(0,0,600);
    if(kind==='splatling')assert.ok(p.inkProfile,'this case really takes InkFlight.stepHead');
    assert.equal(system._step(p,F),true,'native first-contact ends the head');assert.equal(target.hp,1000);
    assert.equal(stand.s3Retired,undefined,'ordinary shots cannot destroy cover');
  }
});

test('native cooler cover preserves its pedestal gap and a nearer stage wall owns the contact',async()=>{
  const f=await world(),a=owner(f,'shooter'),stand=placeCooler(f),s=f.G.projectiles;
  const p=s._new();Object.assign(p,{type:'shot',wid:'gap-control',owner:a,team:0,damage:10,size:.02,fieldRadius:.02,
    radius:.02,life:1,age:0,straight:1,grav:0,drag:0,trailEvery:0,s3SpecialWeapon:{id:'gap-control',kind:'special'}});
  p.pos.set(0,.1,0);p.prev.copy(p.pos);p.start.copy(p.pos);p.vel.set(0,0,600);s._push(p);
  assert.equal(s._step(p,F),false,'a small real projectile passes below the calibrated main body');
  assert.ok(p.pos.z>stand.pos.z+1);
  const V=f.THREE.Vector3;
  f.G.level=new f.Level({bounds:{minX:-50,maxX:50,minZ:-50,maxZ:50},spawnPads:[[0,0,0],[0,0,30]],spawnBarrier:0,
    single:[{kind:'box',min:[-50,-1,-50],max:[50,0,50]},{kind:'box',min:[-2,0,1.4],max:[2,3,1.6]}],half:[]});
  f.G.physics=new f.Physics(f.G.level);
  let contacts=0;const candidate=s.kitDefenseCandidate;
  s.kitDefenseCandidate=function(round){const c=candidate.call(this,round);if(c?.kind==='tacticooler'){
    const hit=c.onHit;c.onHit=()=>{contacts++;return hit();};}return c;};
  s.fireShooter(a,a.weapon,0);const wallShot=s.list.at(-1);wallShot.pos.set(0,.65,0);wallShot.prev.copy(wallShot.pos);wallShot.vel.set(0,0,600);
  assert.equal(s._step(wallShot,F),false);assert.ok(wallShot.fidelityWallDrop,'the nearer real stage wall owns retained wall-drop');
  assert.equal(contacts,0,'the farther stand cannot steal this stage contact');
});

test('the native actor controller blocks human bodies, permits squid and active Dualies slides, and creates no roof',async()=>{
  for(const form of ['human','squid','slide']){
    const f=await world(),a=owner(f,form==='slide'?'dualies':'shooter');placeCooler(f);
    a._integrate=f.Actor.prototype._integrate;a._probeGround();a.form=form==='squid'?'squid':'kid';
    if(form==='slide')a.weaponRunner.dodge={dur:1,t:0};
    for(let i=0;i<60;i++){a.vel.set(0,0,6);a._integrateMovementStep(F,form==='squid',false);}
    if(form==='human'){assert.ok(a.pos.z<2.3,'native movement is clipped at the stand side');assert.equal(a.contacts.wall,true);}
    else assert.ok(a.pos.z>5,'pass-through uses the same native integration');
    near(a.pos.y,0,'stand is not a walkable roof');
  }
});

test('native timed bombs bounce off cooler cover without detonation, attachment or an extra fuse',async()=>{
  for(const sub of ['bomb','suction','sprinkler','autobomb']){
    const f=await world(),a=owner(f);a.weapon={...a.weapon,sub};placeCooler(f);const s=f.G.projectiles;
    s.throwBomb(a);const b=s.bombs.at(-1);assert.ok(b,`${sub} uses the real native bomb array`);
    const fuse=b.fuse;
    b.pos.set(0,.65,0);b.prev?.copy(b.pos);b.vel.set(0,0,300);let explosions=0;s._explodeBomb=()=>{explosions++;};
    s._updateBombs(F);assert.equal(s.bombs.includes(b),true,`${sub} remains in flight after contact`);
    assert.ok(b.vel.z<0,`${sub} actually rebounds`);assert.equal(explosions,0);
    if(fuse<0)assert.equal(b.fuse,fuse,`${sub} cover contact cannot start a fuse`);
    assert.ok(!['stuck','sprinkling','chasing'].includes(b.s3Mode),`${sub} cannot attach/arm/search on cover`);
  }
});

test('native Blaster hitting cooler uses one terrain burst, and a ghost never hurts the victim',async()=>{
  for(const ghost of [false,true]){
    const f=await world(),a=owner(f,'blaster');placeCooler(f);const s=f.G.projectiles;
    const victim=f.make();victim.team=1;victim.hp=1000;victim.invuln=0;victim.pos.set(0,0,3.4);
    s.fireBlaster(a,a.weapon,0);const p=s.list.at(-1);p.pos.set(0,.65,0);p.prev.copy(p.pos);p.vel.set(0,0,600);p.ghost=ghost;
    let bursts=0,terrain=false;const native=s._blastBurst;
    s._blastBurst=function(round,...args){bursts++;terrain=round.s3TerrainBurst;return native.call(this,round,...args);};
    assert.equal(s._step(p,F),true);assert.equal(bursts,1);assert.equal(terrain,true,'cover is a physical impact, not an air burst');
    if(ghost)assert.equal(victim.hp,1000,'replay never authors splash damage');
  }
});

test('native InkFlight participates in Vac absorption instead of bypassing the shared defense lane',async()=>{
  const f=await world(),vac=startVac(f),a=owner(f,'splatling');a.team=1;a.pos.set(0,0,8);a.aimDir.set(0,0,-1);a.aimPoint.set(0,1,0);
  const s=f.G.projectiles;s.fireSplatling(a,a.weapon,0);const p=s.list.at(-1);assert.ok(p.inkProfile);
  p.pos.set(0,1,8);p.prev.copy(p.pos);p.vel.set(0,0,-120);
  const before=f.inkVacState(vac).absorbedDamage||0;
  assert.equal(s._step(p,F),true);assert.ok(f.inkVacState(vac).absorbedDamage>before,'real head credits the intake');
});

test('Screen absorption uses its own pinned 400 tag locally and validates the same ceiling on authenticated proposals',async()=>{
  let f=await world(),vac=startVac(f),state=f.inkVacState(vac),V=f.THREE.Vector3;
  const p={team:1,damage:400,wid:'splattercolorScreen',s3SpecialWeapon:{id:'splattercolorScreen'},vel:new V(0,0,-1)};
  f.inkVacAbsorbCandidate(vac,new V(0,1,5),new V(0,1,4),p).onHit();near(state.absorbedDamage,400,'local Screen tag');
  f=await world();vac=startVac(f);state=f.inkVacState(vac);const attacker=owner(f);attacker.team=1;attacker.remote=true;attacker.owner='peer';
  attacker.weapon={...attacker.weapon,special:'splattercolorScreen'};
  f.installInkVacSenderValidator((a,peer)=>a.owner===peer);
  const event={actor:attacker,target:vac,kit:'inkVac',serial:state.serial,key:'screen:1',special:'splattercolorScreen',damage:400};
  const result=f.replayInkVac(f.INK_VAC_EVENTS.absorb,attacker,event,{from:'peer'});assert.equal(result.applied,true);
  near(state.absorbedDamage,400,'receiver independently admits the equipped Screen ceiling');
  const invalid=f.replayInkVac(f.INK_VAC_EVENTS.absorb,attacker,{...event,key:'screen:2',damage:401},{from:'peer'});
  assert.equal(invalid.applied,false);near(state.absorbedDamage,400,'above-ceiling payload cannot add credit');
});

test('Vac source 20F foot paint repeats at 30/60/120 Hz, awards turf once and cannot charge the special',async()=>{
  for(const hz of [30,60,120]){
    const f=await world(),a=startVac(f),paints=[];
    f.G.paint.splat=(pos,radius,team,options)=>{paints.push({pos:pos.clone(),radius,team,options});return 2;};
    const turf=a.stats.turf,special=a.special;
    for(let i=0;i<hz;i++){f.G.time+=1/hz;a.update(1/hz);}
    assert.equal(paints.length,3,'one second has three source foot splashes');
    near(a.stats.turf-turf,6,'each native paint result is credited once');near(a.special,special-a.specialCost()/6,'foot ink never offsets constant depletion');
    assert.ok(paints.every(p=>p.radius===1.5&&p.options.claimOwner===a&&p.options.claimMode==='no-special'));
    a.intent.fire=false;for(let i=0;i<30;i++)a.update(F);
    assert.equal(paints.length,3,'release resets the splash scheduler');
  }
});

test('Vac canonical reserve blocks paint, Tenacity and repeat admission while native special presentation is masked',async()=>{
  const f=await world(),a=startVac(f),enemy=f.make(),enemy2=f.make();enemy.team=enemy2.team=1;
  a.s3.loadout=f.emptyLoadout();a.s3.loadout[0].main='tenacity';
  const before=a.special,uses=a.stats.specials;let observed=false;
  const update=a.weaponRunner.update;
  a.weaponRunner.update=function(...args){
    observed=true;assert.equal(a.specialActive,null,'native delegated update really masks presentation');
    assert.equal(f.specialGaugeLocked(a),true,'canonical state keeps the lock through the mask');
    a.addTurf(3);near(a.special,before,'native paint cannot add points inside the masked interval');
    near(f.advanceTenacity(a,F,f),0,'passive gain is blocked inside the same interval');
    assert.equal(a.specialReady(),false);a._startSpecial();assert.equal(a.stats.specials,uses);
    return update.apply(this,args);
  };
  a.update(F);assert.equal(observed,true);near(a.special,before-a.specialCost()/360,'only one depletion frame is spent');
});

test('Vac death passes its remaining native reserve through ordinary Special Saver at AP0 and AP30',async()=>{
  for(const ap of [0,30]){
    const f=await world(),a=owner(f),control=owner(f);
    for(const actor of [a,control]){
      actor.s3.loadout=f.emptyLoadout();
      for(let i=0;i<ap/10;i++)actor.s3.loadout[i].main='specialSaver';
      actor.setWeapon(actor.weaponId);
    }
    a.special=a.specialCost();a._startSpecial();a.intent.fire=true;
    for(let i=0;i<120;i++)a.update(F);
    const remaining=a.special;assert.ok(remaining>0&&remaining<a.specialCost());
    control.special=remaining;control.splat(null,'water');a.splat(null,'water');
    assert.equal(a.alive,false);near(a.special,control.special,'existing death penalty receives exactly the same remaining points');
    near(a.special,remaining*a.s3.modifiers.specialSaver,'equipped Saver owns retention');
    assert.equal(f.inkVacState(a),null);assert.equal(f.specialGaugeLocked(a),false);
  }
});

test('Vac completion, explicit disposal, reset and clear spend reserve and retire canonical claims',async()=>{
  for(const ending of ['release','dispose','reset','clear']){
    const f=await world(),a=startVac(f);assert.equal(f.specialGaugeLocked(a),true);
    if(ending==='release'){
      a.intent.fire=false;
      for(let i=0;i<600&&f.inkVacState(a);i++)a.update(F);
      assert.equal(f.G.projectiles.list.filter(p=>p.wid==='inkVac').length,1,'ordinary completion emits exactly one return shot');
    }else if(ending==='dispose')f.disposeInkVac(a);
    else if(ending==='reset')a.reset();
    else {f.G.actors.splice(f.G.actors.indexOf(a),1);f.G.projectiles.clear();}
    assert.equal(f.inkVacState(a),null,ending);near(a.special,0,ending);assert.equal(f.specialGaugeLocked(a),false,ending);
  }
});

test('Vac ownership, replica, life and match boundaries cannot consume a replacement authority reserve',async()=>{
  for(const boundary of ['remote','owner','life','lastLife','match']){
    const f=await world(),a=startVac(f);
    if(boundary==='remote')a.remote=true;
    if(boundary==='owner')a.owner='replacement';
    if(boundary==='life')a.netLife=(a.netLife||0)+1;
    if(boundary==='lastLife')a.net={...(a.net||{}),lastLife:(a.netLife||0)+1};
    if(boundary==='match')f.G.match={...f.G.match};
    a.special=17;a.update(F);
    assert.equal(f.inkVacState(a),null,boundary);near(a.special,17,boundary);assert.equal(f.specialGaugeLocked(a),false,boundary);
  }
  const f=await world(),a=owner(f);a.remote=true;a.owner='peer';a.special=17;
  const result=f.replayInkVac(f.INK_VAC_EVENTS.activation,a,{serial:90001,kit:'inkVac',charge:0,power:0});
  assert.equal(result.applied,true);near(a.special,17,'replica allocation does not create native reserve');
  f.disposeInkVac(a);near(a.special,17,'replica disposal does not spend native reserve');
});

test('actual custom Fizzy and untransformed Torpedo rebound from Cooler through their single world-contact owner',async()=>{
  for(const sub of ['fizzy','torpedo'])for(const hz of [30,60,120]){
    const f=await world(),a=owner(f);a.weapon={...a.weapon,sub};placeCooler(f);
    const s=f.G.projectiles,object=s.throwBomb(a);assert.ok(s._s3SubObjects.includes(object));
    object.pos.set(0,.65,0);object.prev.copy(object.pos);object.vel.set(0,0,600);object.age=0;
    for(let i=0;i<Math.ceil(hz/60);i++){f.G.time+=1/hz;s.update(1/hz);}
    assert.equal(s._s3SubObjects.includes(object),true,`${sub} at ${hz}Hz is not consumed by generic defense`);
    assert.ok(object.vel.z<0,`${sub} at ${hz}Hz reaches its actual rebound branch`);
    assert.equal(object.phase,'flight');assert.notEqual(object.grounded,true,'side contact creates no ground support');
  }
});
