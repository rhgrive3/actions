import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

const EXTRA=`export {replaySpecial as replayAllSpecials,ALL_SPECIALS,ALL_SPECIALS_STATUS} from './patches/splatoon3/runtime/all-specials.mjs';`;
async function setup(){const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:EXTRA});f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};return f;}
function equip(actor,id){actor.weapon={...actor.weapon,special:id,specialCost:100};actor.special=100;actor.alive=true;actor.remote=false;actor._resolve=()=>{};actor.intent.fire=false;actor.intent.sub=false;actor.intent.jump=false;actor._prevIntent ||= {};Object.assign(actor._prevIntent,{fire:false,sub:false,jump:false,squid:false,booyah:false});}
function deployedWall(f,owner,pos){owner.weapon={...owner.weapon,sub:'splashWall'};const wall=f.G.projectiles.throwBomb(owner);wall.phase='deployed';wall.pos.set(...pos);wall.prev.copy(wall.pos);wall.vel.set(0,0,0);wall.activeAt=Infinity;wall.deployedAt=f.G.time;wall.expireAt=Infinity;wall.yaw=0;return wall;}
function tickWorld(f,frames){for(let i=0;i<frames;i++){f.G.time+=1/60;f.G.projectiles.update(1/60);}}
function tickActorWorld(f,a,frames){for(let i=0;i<frames;i++){a._updateSpecial(1/60);f.G.time+=1/60;f.G.projectiles.update(1/60);}}
function tickWorldAtHz(f,hz,sourceFrames){const dt=1/hz;for(let i=0;i<sourceFrames*hz/60;i++){f.G.time+=dt;f.G.projectiles.update(dt);}}
function tickActorWorldAtHz(f,a,hz,sourceFrames){const dt=1/hz;for(let i=0;i<sourceFrames*hz/60;i++){a._updateSpecial(dt);f.G.time+=dt;f.G.projectiles.update(dt);}}
function tickActorOnlyAtHz(a,hz,sourceFrames){const dt=1/hz;for(let i=0;i<sourceFrames*hz/60;i++)a._updateSpecial(dt);}
function stepProjectileAtHz(f,p,hz,sourceFrames){const dt=1/hz;for(let i=0;i<sourceFrames*hz/60;i++)f.G.projectiles._step(p,dt);}
function ready(actor){actor._startSpecial();const st=actor._s3AllSpecialState;if(!st)return;
 if(st.id==='booyahBomb'){for(let i=0;i<30;i++)actor._updateSpecial(1/60);st.charge=1;}
 if(st.id==='krakenRoyale')for(let i=0;i<60;i++)actor._updateSpecial(1/60);
 if(st.id==='inkjet')st.nextShot=0;
}
function deployInput(actor){const id=actor.specialActive?.id;
 if(['waveBreaker','splattercolorScreen','tripleInkstrike','ultraStamp','booyahBomb'].includes(id)){actor.intent.sub=true;actor._updateSpecial(1/60);actor.intent.sub=false;actor._updateSpecial(1/60);for(let i=0;i<16&&actor.specialActive;i++)actor._updateSpecial(1/60);}
 else{actor.intent.fire=true;actor._updateSpecial(1/60);}
}
function eventFeed(f,name){const rows=[];f.on(name,e=>rows.push(e));return rows;}

test('missing special inventory is source versioned and Tenta stages ten source-cadence rounds',async()=>{
 const f=await setup(),a=f.make(),victim=f.make();equip(a,'tentaMissiles');victim.team=1;victim.pos.set(0,0,5);f.G.actors=[a,victim];
 const rows=eventFeed(f,'all:special'),before=f.G.projectiles.list.length;ready(a);deployInput(a);
 assert.equal(a.stats.specials,1);assert.ok(a.specialActive);assert.equal(f.G.projectiles.list.length-before,1);
 tickActorWorld(f,a,36);const missiles=f.G.projectiles.list.filter(p=>p.s3AllSpecial==='tentaMissiles');
 assert.equal(missiles.length,10);assert.equal(a.specialActive,null);
 assert.equal(JSON.stringify(missiles.slice(1).map(p=>Math.round((p.s3TentaLaunchedAt-missiles[0].s3TentaLaunchedAt)*60))),JSON.stringify([4,8,12,16,20,24,28,32,36]));
 assert.ok(rows.some(e=>e.action==='launch'&&e.count===10));
 for(const e of rows){assert.ok([e.pos,...(e.target?[e.target]:[])].flat().every(Number.isFinite));assert.ok(Number.isInteger(e.seed)&&e.seed>=0&&e.seed<=0xffffffff);}
 assert.deepEqual(Object.keys(f.ALL_SPECIALS).sort(),['booyahBomb','crabTank','inkjet','killerWail','krakenRoyale','reefslider','splattercolorScreen','superChump','tentaMissiles','tripleInkstrike','ultraStamp','waveBreaker','zipcaster'].sort());
 assert.match(f.ALL_SPECIALS_STATUS.reference,/11\.3\.0/);assert.match(f.ALL_SPECIALS_STATUS.calibration,/world-unit mapping/);
});

test('Tenta Missiles rise, dive onto the locked ground coordinate, and apply impact damage',async()=>{
 const f=await setup(),a=f.make(),victim=f.make();equip(a,'tentaMissiles');victim.team=1;victim.pos.set(0,0,8);f.G.actors=[a,victim];
 ready(a);deployInput(a);const missiles=f.G.projectiles.list.filter(p=>p.s3AllSpecial==='tentaMissiles');
 assert.equal(missiles.length,1);assert.ok(missiles.every(p=>p.s3TentaTarget instanceof f.THREE.Vector3));
 tickActorWorld(f,a,36);const all=f.G.projectiles.list.filter(p=>p.s3AllSpecial==='tentaMissiles');
 assert.equal(all.length,10);const target=all[0].s3TentaTarget.clone();tickWorld(f,120);
 assert.ok(all[0].s3TentaDescending);assert.ok(all[0].pos.distanceTo(target)<3.5);
 assert.ok(victim.hp<100,'the descended native missile round reaches its locked target and damages it');
});

test('Wave Breaker keeps source pulse schedule and owner-owned device survives owner death',async()=>{
 const f=await setup(),a=f.make(),victim=f.make();equip(a,'waveBreaker');victim.team=1;victim.pos.set(0,0,17);f.G.actors=[a,victim];
 const hits=[],apply=f.G.projectiles.applyHit;let paint=0;f.G.projectiles.applyHit=function(...args){hits.push(args);return apply.apply(this,args);};f.G.paint.splat=()=>{paint++;return 1;};
 ready(a);deployInput(a);
 const device=f.G.projectiles._s3AllSpecialObjects.find(o=>o.kind==='wave');assert.ok(device);assert.equal(device.hp,480);
 assert.deepEqual(Array.from(device.pulseFrames),[90/60,240/60,390/60]);assert.equal(device.maxWaveFrame,160/60);
 const contact=f.make();contact.team=1;contact.hp=1000;contact.pos.copy(device.pos);victim.pos.copy(device.pos);victim.pos.z+=1.5;f.G.actors.push(contact);
 tickWorld(f,100);assert.ok(hits.some(h=>h[1]===victim&&h[3]==='waveBreaker'&&h[2]===45));assert.ok(hits.filter(h=>h[1]===contact&&h[3]==='waveBreaker'&&h[2]===30).length>=3);
 assert.ok(f.G.projectiles._s3AllSpecialObjects.some(o=>o.kind==='waveFront'),'each emitted wave owns a lifetime independent of the device');
 assert.ok(victim.s3.revealedUntil[a.team]>=f.G.time+7.8);assert.equal(paint,0,'Wave Breaker pulses do not paint ink');
 a.alive=false;tickWorld(f,200);assert.ok(f.G.projectiles._s3AllSpecialObjects.includes(device));
 tickWorld(f,310);assert.equal(f.G.projectiles._s3AllSpecialObjects.includes(device),false);
});

test('Wave Breaker device destruction cancels later emissions but preserves the emitted annulus',async()=>{
 const f=await setup(),a=f.make(),enemy=f.make();equip(a,'waveBreaker');enemy.team=1;f.G.actors=[a,enemy];
 ready(a);deployInput(a);const device=f.G.projectiles._s3AllSpecialObjects.find(o=>o.kind==='wave');assert.ok(device);
 tickWorld(f,92);const front=f.G.projectiles._s3AllSpecialObjects.find(o=>o.kind==='waveFront');assert.ok(front);
 enemy.pos.copy(device.pos);enemy.pos.z+=5;
 const from=device.pos.clone().add(new f.THREE.Vector3(0,0,-2)),to=device.pos.clone().add(new f.THREE.Vector3(0,0,2));
 const shot={owner:enemy,team:1,damage:1000,prev:from,pos:to,size:.1,ghost:false};
 const hit=f.G.projectiles.kitDefenseCandidate(shot,from,to);assert.equal(hit?.kind,'wave-breaker');assert.equal(hit.onHit(),true);
 assert.equal(f.G.projectiles._s3AllSpecialObjects.includes(device),false);assert.ok(f.G.projectiles._s3AllSpecialObjects.includes(front));
 const hits=[],apply=f.G.projectiles.applyHit;f.G.projectiles.applyHit=function(...args){hits.push(args);return apply.apply(this,args);};
 tickWorld(f,48);assert.ok(hits.some(h=>h[1]===enemy&&h[2]===45&&h[3]==='waveBreaker'),'the already emitted expanding wave survives its generator');
 tickWorld(f,120);assert.equal(f.G.projectiles._s3AllSpecialObjects.filter(o=>o.kind==='waveFront').length,0,'destroying the device prevents future waves and the first front expires independently');
});

test('Wave Breaker marks nearby placement for 45 frames and holds until a manual deploy input',async()=>{
 const f=await setup(),a=f.make(),victim=f.make();equip(a,'waveBreaker');victim.team=1;f.G.actors=[a,victim];
 ready(a);for(let i=0;i<120;i++)a._updateSpecial(1/60);
 assert.equal((f.G.projectiles._s3AllSpecialObjects||[]).filter(o=>o.kind==='wave').length,0,'holding the placement does not auto-deploy');
 deployInput(a);const device=f.G.projectiles._s3AllSpecialObjects.find(o=>o.kind==='wave');assert.ok(device);
 victim.pos.copy(device.pos);tickWorld(f,4);const until=victim.s3?.revealedUntil?.[a.team];assert.ok(until>f.G.time);
 victim.pos.z+=100;tickWorld(f,39);assert.ok(victim.s3.revealedUntil[a.team]>f.G.time);tickWorld(f,2);
 assert.ok(victim.s3.revealedUntil[a.team]<=f.G.time+1e-9,'the generator placement mark expires after 45 frames');
});

test('Wave Breaker pulse misses a jumping player above the source height limit',async()=>{
 const f=await setup(),a=f.make(),victim=f.make();equip(a,'waveBreaker');victim.team=1;victim.pos.set(0,2.5,18.5);f.G.actors=[a,victim];
 const hits=[],apply=f.G.projectiles.applyHit;f.G.projectiles.applyHit=function(...args){hits.push(args);return apply.apply(this,args);};
 ready(a);deployInput(a);tickWorld(f,120);
 assert.equal(hits.filter(h=>h[1]===victim&&h[2]===45&&h[3]==='waveBreaker').length,0,'the player is above DamageYMax after the height offset');
});

test('Wave Breaker annulus damages a live Super Chump device through the special-object path',async()=>{
 const f=await setup(),waveOwner=f.make(),chumpOwner=f.make();equip(waveOwner,'waveBreaker');equip(chumpOwner,'superChump');chumpOwner.team=1;f.G.actors=[waveOwner,chumpOwner];
 ready(chumpOwner);deployInput(chumpOwner);
 const decoy=f.G.projectiles._s3AllSpecialObjects.find(o=>o.id==='superChump'&&o.kind==='decoy');assert.ok(decoy);decoy.phase='active';
 ready(waveOwner);deployInput(waveOwner);
 const device=f.G.projectiles._s3AllSpecialObjects.find(o=>o.kind==='wave');assert.ok(device);decoy.pos.copy(device.pos);decoy.pos.z+=5;
 tickWorld(f,130);assert.equal(decoy.hp,15,'the ShockSonar_Wave source row applies one 45-damage annulus hit to the decoy');
});

test('special object area routing preserves exact attack-phase damage rows',async()=>{
 const f=await setup(),owner=f.make(),enemy=f.make();equip(owner,'waveBreaker');enemy.team=1;f.G.actors=[owner,enemy];
 ready(owner);deployInput(owner);const device=f.G.projectiles._s3AllSpecialObjects.find(o=>o.kind==='wave');assert.ok(device);
 const attack={owner:enemy,team:1,pos:enemy.pos,s3AllSpecial:'ultraStamp',type:'shot'};
 assert.equal(f.G.projectiles.s3DamageSpecialObjects(attack,device.pos,1,()=>1,'UltraStamp_Swing'),true);assert.equal(device.hp,460);
 assert.equal(f.G.projectiles.s3DamageSpecialObjects(attack,device.pos,1,()=>1,'UltraStamp_Throw'),true);assert.equal(device.hp,457.818);
});

test('native and ordinary blast bursts damage both deployed object arrays with the projectile source row',async()=>{
 const f=await setup(),defender=f.make(),attacker=f.make('blaster'),V=f.THREE.Vector3;defender.team=0;attacker.team=1;
 const at=new V(0,.7,0),device={id:'waveBreaker',kind:'device',owner:defender,team:0,dead:false,hp:480,pos:at.clone(),serial:77,activation:1};
 const wall={subId:'splashWall',phase:'deployed',owner:defender,team:0,dead:false,hp:1000,pos:at.clone(),yaw:0,spec:{wallWidth:2,wallHeight:3}};
 f.G.projectiles._s3AllSpecialObjects||=[];f.G.projectiles._s3AllSpecialObjects.push(device);f.G.projectiles._s3SubObjects||=[];f.G.projectiles._s3SubObjects.push(wall);f.G.actors=[];
 const burst=(source,weapon)=>({owner:attacker,team:1,type:'blast',age:0,life:1,damage:0,radius:4,size:.1,ghost:false,wid:source,pos:at.clone(),prev:at.clone(),start:at.clone(),vel:new V(),...(weapon?{s3SpecialWeapon:weapon}:{})});
 f.G.projectiles._blastBurst({...burst('blaster'),s3Weapon:attacker.weapon},at,null);
 assert.equal(device.hp,340,'ordinary Blaster splash uses its 70-damage inner band and Blaster_BlasterMiddle Wave Breaker rate');
 assert.equal(wall.hp,860,'the same ordinary blast reaches deployed sub-device HP through the sub-object adapter');
 wall.hp=1000;device.hp=480;
 f.G.projectiles._blastBurst(burst('trizooka',{id:'trizooka',splashRadius:4,splashBands:[[2.5,53],[4,35]]}),at,null);
 assert.equal(wall.hp,682,'native Trizooka splash uses UltraShot ×6 against Splash Wall');
 device.id='crabTank';device.hp=1000;
 f.G.projectiles._blastBurst(burst('inkjet',{id:'inkjet',splashRadius:5,splashBands:[[2.55,50],[5,30]]}),at,null);
 assert.equal(device.hp,825,'native Inkjet blast uses Jetpack_BombCore ×3.5 against Crab Tank');
 device.hp=1000;
 f.G.projectiles._blastBurst(burst('inkVac',{id:'inkVac',splashRadius:2,splashBands:[[2,40]]}),at,null);
 assert.equal(device.hp,888,'native Ink Vac blast uses BlowerExhale_BombCore ×2.8 against Crab Tank');
 device.hp=1000;const ghost=burst('inkjet',{id:'inkjet',splashRadius:5,splashBands:[[2.55,50],[5,30]]});ghost.ghost=true;
 f.G.projectiles._blastBurst(ghost,at,null);assert.equal(device.hp,1000,'replayed projectiles do not author device HP damage');
});

test('Booyah Bomb armor and delayed expanding damage are timed independently from impact',async()=>{
 const f=await setup(),a=f.make(),victim=f.make();equip(a,'booyahBomb');victim.team=1;victim.pos.set(0,0,.2);f.G.actors=[a,victim];
 const stateEvents=eventFeed(f,'actor:armorhit');ready(a);a._updateSpecial(1/60);
 const hp=a.hp;a.damage(100,null,'shooter');assert.equal(a.hp,hp);assert.equal(a._s3AllSpecialState.armorHP,370);assert.equal(stateEvents.at(-1).absorbed,100);
 deployInput(a);assert.equal(a.specialActive,null);
 const p=f.G.projectiles.list.at(-1);assert.equal(p.s3AllSpecial,'booyahBomb');
 f.G.projectiles._blastBurst(p,new f.THREE.Vector3(0,.08,0),null);
 const blast=f.G.projectiles._s3AllSpecialObjects.find(o=>o.kind==='booyahBlast');assert.ok(blast);assert.equal(blast.startDelay,40/60);assert.equal(blast.expand,40/60);
 const before=victim.hp;tickWorld(f,39);assert.equal(victim.hp,before,'no blast damage during the sourced delay');
 tickWorld(f,45);assert.ok(victim.hp<before,'expanding blast applies continuous damage after its delay');
});

test('Booyah Bomb uses source growth and damage frames at 30, 60, and 120 Hz',async()=>{
 const results=[];
 for(const hz of [30,60,120]){
  const f=await setup(),owner=f.make(),center=f.make(),far=f.make();equip(owner,'booyahBomb');center.team=far.team=1;
  center.pos.set(0,-.47,0);far.pos.set(6,-.47,0);f.G.actors=[owner,center,far];
  ready(owner);deployInput(owner);
  const p=f.G.projectiles.list.find(x=>x.s3AllSpecial==='booyahBomb');assert.ok(p);
  f.G.projectiles._blastBurst(p,new f.THREE.Vector3(0,.08,0),null);
  f.G.projectiles.list.splice(f.G.projectiles.list.indexOf(p),1);
  center.hp=far.hp=1000;const hits=[],apply=f.G.projectiles.applyHit;
  f.G.projectiles.applyHit=function(...args){hits.push(args);return apply.apply(this,args);};
  const blast=f.G.projectiles._s3AllSpecialObjects.find(o=>o.kind==='booyahBlast');assert.ok(blast);
  tickWorldAtHz(f,hz,80);
  results.push({hz,center:center.hp,far:far.hp,centerHits:hits.filter(h=>h[1]===center&&h[3]==='booyahBomb').length,
    farHits:hits.filter(h=>h[1]===far&&h[3]==='booyahBomb').length,paintFrame:blast.paintFrame,paintedRadius:blast.paintedRadius});
 }
 for(const result of results){assert.equal(result.centerHits,40);assert.equal(result.farHits,21);assert.ok(Math.abs(result.center-868)<1e-8);assert.ok(Math.abs(result.far-930.7)<1e-8);assert.equal(result.paintFrame,6);assert.equal(result.paintedRadius,13.5);}
 assert.ok(results.every(x=>Math.abs(x.center-868)<1e-8&&Math.abs(x.far-930.7)<1e-8&&x.centerHits===40&&x.farHits===21&&x.paintedRadius===13.5));
});

test('Splattercolor Screen applies the recipient color and mark timers on a real crossing',async()=>{
 const f=await setup(),owner=f.make(),victim=f.make();equip(owner,'splattercolorScreen');victim.team=1;victim.isLocal=true;victim.pos.set(0,0,3.2);f.G.actors=[owner,victim];
 const hits=[],apply=f.G.projectiles.applyHit;f.G.projectiles.applyHit=function(...args){hits.push(args);return apply.apply(this,args);};
 ready(owner);deployInput(owner);assert.ok(owner.specialActive===null);
 tickWorld(f,90);
 assert.ok(victim.s3.splattercolorUntil>f.G.time);assert.ok(victim.s3.splattercolorMarkUntil>f.G.time);
 assert.ok(Math.abs(victim.s3.splattercolorUntil-victim.s3.splattercolorMarkUntil-4)<1e-9);
 assert.ok(hits.some(h=>h[1]===victim&&h[2]===40&&h[3]==='splattercolorScreen'));
});

test('Splattercolor Screen does not stop a native enemy shot from reaching a player behind it',async()=>{
 const f=await setup(),owner=f.make(),shooter=f.make(),victim=f.make();equip(owner,'splattercolorScreen');
 owner.aimPoint.set(0,1,20);shooter.team=1;shooter.pos.set(0,0,5);shooter.aimDir.set(0,0,-1);shooter.aimPoint.set(0,.75,1);victim.team=0;victim.pos.set(0,0,1);f.G.actors=[owner,shooter,victim];
 ready(owner);deployInput(owner);for(let i=0;i<13&&owner.specialActive;i++)owner._updateSpecial(1/60);
 const screen=f.G.projectiles._s3AllSpecialObjects.find(o=>o.kind==='screen');assert.ok(screen);assert.ok(screen.normal.z>.99);
 const before=victim.hp;f.G.projectiles.fireShooter(shooter,shooter.weapon,0);tickWorld(f,12);
 assert.ok(victim.hp<before,'the native projectile passes through the Screen and damages the player behind it');
});

test('remote screen replay creates presentation and recipient status without authoring hits or paint',async()=>{
 const f=await setup(),ghost=f.make(),victim=f.make();ghost.remote=true;ghost.team=1;ghost.nid=44;victim.team=0;victim.isLocal=true;victim.pos.set(0,0,3.2);f.G.actors=[ghost,victim];
 let hits=0,paint=0;f.G.projectiles.applyHit=()=>{hits++;};f.G.paint.splat=()=>{paint++;return 1;};
 const event={actor:ghost,id:'splattercolorScreen',activation:1,action:'deploy',pos:[0,.08,2.5],target:[0,.08,3.5],seed:9,object:1,index:0,hp:0,radius:15,duration:680/60,kind:'screen',width:15,height:9};
 assert.equal(f.replayAllSpecials(f,event),true);tickWorld(f,90);
 assert.ok(victim.s3.splattercolorUntil>f.G.time);assert.ok(victim.s3.splattercolorMarkUntil>f.G.time);
 assert.ok(Math.abs(victim.s3.splattercolorUntil-victim.s3.splattercolorMarkUntil-4)<1e-9);assert.equal(hits,0);assert.equal(paint,0);
});

test('Zipcaster repeats hooks, fires the equipped main from its special ink tank, and returns through native Super Jump',async()=>{
 const f=await setup(),a=f.make(),victim=f.make();equip(a,'zipcaster');victim.team=1;victim.pos.set(0,0,5);f.G.actors=[a,victim];
 f.G.match={playing:()=>true};f.G.physics.raycast=(_o,_d,_distance,h)=>{h.hit=false;return h;};a.aimDir.set(0,0,1);a.aimPoint=new f.THREE.Vector3(0,1,5);
 const events=eventFeed(f,'all:special'),hits=[],apply=f.G.projectiles.applyHit;f.G.projectiles.applyHit=function(...args){hits.push(args);return apply.apply(this,args);};
 ready(a);const state=a._s3AllSpecialState,origin=a.pos.clone();
 a.intent.sub=true;a._updateSpecial(1/60);assert.equal(state.phase,'hookFlight','a real sub press launches the source-speed hook before player pull');assert.ok(state.inkFuel<150);
 a.intent.sub=false;for(let i=0;i<45;i++)a._updateSpecial(1/60);
 assert.equal(state.phase,'ready');assert.ok(state.zips===1);assert.ok(hits.some(h=>h[1]===victim&&h[3]==='zipcaster'));
 const shots=f.G.projectiles.list.length,normalInk=a.ink,fuel=state.inkFuel;victim.pos.set(a.pos.x,0,a.pos.z+6);a.intent.fire=true;let fireFrames=0;
 while(f.G.projectiles.list.length===shots&&fireFrames<30){a._updateSpecial(1/60);fireFrames++;}
 assert.ok(f.G.projectiles.list.length>shots&&f.G.projectiles.list.some(p=>p.owner===a&&!p.s3AllSpecial),'fire goes through the equipped native main weapon');
 assert.ok(hits.some(h=>h[1]===victim&&h[3]==='zipcaster'),'hook impact remains the Zipcaster damage source');
 assert.equal(a.ink,normalInk,'the temporary Zipcaster tank does not overwrite the normal tank');assert.ok(state.inkFuel<fuel-state.inkDrainPerSecond*fireFrames/60-.5,'main firing and time drain consume the single special tank');
 a.aimPoint.set(a.pos.x,a.pos.y+1,a.pos.z+5);a.intent.sub=true;a.intent.fire=false;a._updateSpecial(1/60);assert.equal(state.phase,'hookFlight','a second sub press starts another source-speed hook flight');
 state.duration=state.t+1/60;a.intent.sub=false;a._updateSpecial(1/60);
 assert.equal(a.specialActive,null);assert.ok(a.superJumpState);assert.deepEqual(a.superJumpState.target.toArray(),origin.toArray());
});

test('Kraken Royale charges while held, starts its 35F dash on release, and supports the 34F cancel',async()=>{
 const f=await setup(),a=f.make(),victim=f.make();equip(a,'krakenRoyale');victim.team=1;victim.pos.set(0,0,1);f.G.actors=[a,victim];a._resolve=()=>{};a.aimPoint=new f.THREE.Vector3(0,1,20);
 const hits=[],apply=f.G.projectiles.applyHit;f.G.projectiles.applyHit=function(...args){hits.push(args);return apply.apply(this,args);};
 ready(a);const state=a._s3AllSpecialState;assert.ok(state.direction instanceof f.THREE.Vector3);
 deployInput(a);assert.equal(state.phase,'charge');assert.ok(state.direction.z>.99);
 for(let i=0;i<35;i++)a._updateSpecial(1/60);assert.equal(state.phase,'charge','holding after the charge threshold does not start the dash');
 a.intent.fire=false;a._updateSpecial(1/60);assert.equal(state.phase,'dash','release after35F begins the dash');
 a._updateSpecial(1/60);assert.ok(hits.some(h=>h[1]===victim&&h[2]===120&&h[3]==='krakenRoyale'),'charge dash uses its attack path and owner hit routing');

 const cancel=f.make();equip(cancel,'krakenRoyale');f.G.actors.push(cancel);ready(cancel);deployInput(cancel);
 for(let i=0;i<34;i++)cancel._updateSpecial(1/60);cancel.intent.fire=false;cancel._updateSpecial(1/60);
 assert.equal(cancel._s3AllSpecialState.phase,'active','release before35F cancels the charged attack');
});

test('Inkjet fires native rounds, descends in squid form, and starts a Super Jump return at expiry',async()=>{
 const f=await setup(),a=f.make();equip(a,'inkjet');f.G.match={playing:()=>true};
 const origin=a.pos.clone(),events=eventFeed(f,'all:special');a._resolve=()=>{};ready(a);a.intent.squid=true;a._updateSpecial(1/60);
 assert.equal(a.form,'squid');assert.equal(a.form,'squid','holding squid turns off the jets');
 a.intent.squid=false;deployInput(a);
 assert.ok(f.G.projectiles.list.some(p=>p.s3AllSpecial==='inkjet'));
 assert.ok(events.some(e=>e.action==='shot'));
 const state=a._s3AllSpecialState;state.duration=state.t+2/60;a.intent.fire=false;a._updateSpecial(1/60);a._updateSpecial(1/60);
 assert.equal(a.specialActive,null);assert.ok(a.superJumpState);assert.deepEqual(a.superJumpState.target.toArray(),origin.toArray());
});

test('Inkjet exhaust applies Jetpack_Jet damage once per source frame at 30, 60, and 120 Hz',async()=>{
 const results=[];
 for(const hz of [30,60,120]){
  const f=await setup(),owner=f.make(),victim=f.make(),outside=f.make(),deviceOwner=f.make();equip(owner,'inkjet');owner._resolve=()=>{};victim.team=outside.team=deviceOwner.team=1;
  victim.pos.set(0,0,.5);outside.pos.set(1.4,0,.5);f.G.actors=[owner,victim,outside];f.G.physics.los=()=>true;
  const wave={id:'waveBreaker',kind:'device',owner:deviceOwner,team:1,dead:false,hp:1000,pos:new f.THREE.Vector3(0,1,.3)};
  f.G.projectiles._s3AllSpecialObjects||=[];f.G.projectiles._s3AllSpecialObjects.push(wave);
  const wall=deployedWall(f,deviceOwner,[0,.8,.3]),wallHp=wall.hp;
  ready(owner);owner.pos.y=2.5;owner.vel.y=0;f.G.level.groundHeight=()=>-2.5;
  for(let i=0;i<hz;i++){owner._updateSpecial(1/hz);owner.pos.y=2.5;owner.vel.y=0;f.G.level.groundHeight=()=>-2.5;}
  results.push({hz,victim:victim.hp,outside:outside.hp,wave:wave.hp,wall:wall.hp,wallHp});
 }
 for(const result of results){
  assert.ok(Math.abs(result.victim-70)<1e-7,`${result.hz} Hz applies sixty .5 damage ticks`);
  assert.equal(result.outside,100,'the under-jet cylinder excludes targets outside its calibrated footprint');
  assert.ok(Math.abs(result.wave-916)<1e-7,'Wave Breaker consumes Jetpack_Jet ×2.8 once for each source frame');
  assert.ok(Math.abs(result.wall-(result.wallHp-84))<1e-7,'Splash Wall consumes Jetpack_Jet ×2.8 once for each source frame');
 }
});

test('Inkjet exhaust stops during squid descent and return',async()=>{
 const f=await setup(),owner=f.make(),victim=f.make();equip(owner,'inkjet');owner._resolve=()=>{};victim.team=1;victim.pos.set(0,0,.5);f.G.actors=[owner,victim];ready(owner);owner.pos.y=2.5;owner.vel.y=0;f.G.level.groundHeight=()=>-2.5;
 owner.intent.squid=true;for(let i=0;i<12;i++)owner._updateSpecial(1/60);assert.equal(victim.hp,100);
 owner.intent.squid=false;owner._s3AllSpecialState.duration=owner._s3AllSpecialState.t+1/60;owner._updateSpecial(1/60);assert.equal(owner.specialActive,null);assert.equal(victim.hp,100,'return begins before another exhaust tick can be authored');
});

test('Ultra Stamp uses jump swings and blocks a projectile through its forward guard',async()=>{
 const f=await setup(),a=f.make(),victim=f.make(),shooter=f.make();equip(a,'ultraStamp');victim.team=1;victim.pos.set(0,0,2);shooter.team=1;f.G.actors=[a,victim,shooter];
 const hits=[],apply=f.G.projectiles.applyHit;f.G.projectiles.applyHit=function(...args){hits.push(args);return apply.apply(this,args);};
 const events=eventFeed(f,'all:special');a._resolve=()=>{};ready(a);for(let i=0;i<17;i++)a._updateSpecial(1/60);a.intent.fire=true;a._updateSpecial(1/60);
 assert.ok(hits.some(h=>h[1]===victim&&h[2]===100&&h[3]==='ultraStamp'));
 a.intent.jump=true;for(let i=0;i<30;i++)a._updateSpecial(1/60);assert.ok(events.some(e=>e.action==='jumpSwing'));
 const incoming={owner:shooter,team:shooter.team,prev:new f.THREE.Vector3(0,.78,3),pos:new f.THREE.Vector3(0,.78,.2),damage:20,size:.15,ghost:false};
 const guard=f.G.projectiles.kitDefenseCandidate(incoming);assert.equal(guard?.kind,'ultra-stamp-guard');assert.equal(guard.onHit(),true);
 assert.ok(events.some(e=>e.action==='block'));
});

test('Crab Tank fires shooter and cannon rounds and exposes ball posture while squid is held',async()=>{
 const f=await setup(),a=f.make();equip(a,'crabTank');a._resolve=()=>{};const events=eventFeed(f,'all:special');ready(a);
 a.intent.fire=true;for(let i=0;i<23;i++)a._updateSpecial(1/60);
 const shooter=f.G.projectiles.list.find(p=>p.s3AllSpecial==='crabTank'&&p.s3AllSpecialMode==='shooter');assert.ok(shooter);assert.equal(shooter.damage,32);
 a.intent.fire=false;a.intent.sub=true;a._updateSpecial(1/60);assert.equal(a.specialActive.pose,'cannon');
 a.intent.sub=false;for(let i=0;i<21;i++)a._updateSpecial(1/60);
 const cannon=f.G.projectiles.list.find(p=>p.s3AllSpecial==='crabTank'&&p.s3AllSpecialMode!=='shooter');assert.ok(cannon);assert.equal(cannon.damage,50);
 a.intent.squid=true;a._updateSpecial(1/60);assert.equal(a._s3AllSpecialState.ballMode,true);assert.equal(a.specialActive.pose,'ball');
 const before=f.G.projectiles.list.length;deployInput(a);assert.equal(f.G.projectiles.list.length,before,'ball mode suppresses both weapon lanes');
 assert.ok(events.some(e=>e.action==='cannon'));
 const hp=a.hp,front=f.make(),rear=f.make();front.pos.set(0,0,5);rear.pos.set(0,0,-5);
 a.damage(10,front,'shooter');assert.equal(a._s3AllSpecialState.armorHP,490);assert.equal(a.hp,hp);
 a.damage(10,rear,'shooter');assert.equal(a.hp,hp-10,'the rear core bypasses shell armor');
});

test('Reefslider waits for grounded 38F startup, gates cancel to15F, and deals dash contact damage',async()=>{
 const f=await setup(),a=f.make(),victim=f.make();equip(a,'reefslider');victim.team=1;victim.pos.set(0,0,5);f.G.actors=[a,victim];
 a._resolve=()=>{};
 const hits=[],apply=f.G.projectiles.applyHit;f.G.projectiles.applyHit=function(...args){hits.push(args);return apply.apply(this,args);};
 const events=eventFeed(f,'all:special');a.grounded=false;ready(a);for(let i=0;i<45;i++)a._updateSpecial(1/60);
 assert.equal(a._s3AllSpecialState.phase,'startup','airborne activation waits for the grounded startup');
 a.grounded=true;for(let i=0;i<38;i++)a._updateSpecial(1/60);assert.equal(a._s3AllSpecialState.phase,'dash');
 a.intent.fire=true;for(let i=0;i<14;i++)a._updateSpecial(1/60);assert.ok(a.specialActive,'early cancel remains locked until movement frame15');
 a.intent.fire=false;a._updateSpecial(1/60);a.intent.fire=true;a._updateSpecial(1/60);
 assert.equal(a._s3AllSpecialState.phase,'brake','15F cancel starts 38F preburst, not instant impact');
 assert.equal(events.some(e=>e.action==='impact'),false);
 a.intent.fire=false;for(let i=0;i<38;i++)a._updateSpecial(1/60);
 assert.equal(a._s3AllSpecialState.phase,'recovery');
 assert.ok(events.some(e=>e.action==='impact'));
 assert.ok(hits.some(h=>h[1]===victim&&h[2]===220&&h[3]==='reefslider'),'the dash capsule applies the sourced220 contact hit');
 for(let i=0;i<28;i++)a._updateSpecial(1/60);assert.equal(a.specialActive,null);
});

test('Killer Wail beams tick through terrain and the main weapon remains live during the special',async()=>{
 const f=await setup(),a=f.make(),victim=f.make();equip(a,'killerWail');victim.team=1;victim.pos.set(0,1,5);f.G.actors=[a,victim];
 f.G.physics.los=()=>false;const hits=[],apply=f.G.projectiles.applyHit;f.G.projectiles.applyHit=function(...args){hits.push(args);return apply.apply(this,args);};
 ready(a);a.intent.fire=true;for(let i=0;i<40;i++)a._updateSpecial(1/60);
 assert.ok(f.G.projectiles.list.some(p=>p.owner===a&&!p.s3AllSpecial),'main fire still uses the native weapon runner');
 const beam=hits.find(h=>h[1]===victim&&h[3]==='killerWail');assert.ok(beam);assert.equal(beam[2],3.5,'Wail damage is a 3.5 tick, not a one-hit burst');
});

test('Killer Wail applies MicroLaser object rows through walls to special and sub devices',async()=>{
 const f=await setup(),owner=f.make(),enemy=f.make();equip(owner,'killerWail');enemy.team=1;enemy.pos.set(100,0,100);owner.aimDir.set(0,0,1);owner.aimPoint.set(0,1,27);f.G.actors=[owner,enemy];f.G.physics.los=()=>false;
 const wave={id:'waveBreaker',kind:'device',owner:enemy,team:1,dead:false,hp:1000,pos:new f.THREE.Vector3(.65,1.7,8)};
 const wall=deployedWall(f,enemy,[0,.08,8]),wallStart=wall.hp,wallAge=wall.age;
 f.G.projectiles._s3AllSpecialObjects||=[];f.G.projectiles._s3AllSpecialObjects.push(wave);
 const subHits=[],projectiles=f.G.projectiles,damageSubs=projectiles.s3DamageSubObjects;projectiles.s3DamageSubObjects=function(...args){if(args[4]==='MicroLaser'){const damageAt=args[3];args[3]=(d,o)=>{const amount=damageAt(d,o);if(amount)subHits.push({d,amount,subId:o.subId});return amount;};}return damageSubs.apply(this,args);};
 ready(owner);for(let i=0;i<45;i++)owner._updateSpecial(1/60);
 const waveLoss=1000-wave.hp,wallLoss=wallStart-wall.hp-wall.wallHpInitial*(wall.age-wallAge)/(wall.spec.hpDecayFrames/60);
 assert.ok(waveLoss>0&&wallLoss>0,'the piercing beam reaches both device arrays despite blocked ordinary LOS');
 assert.ok(Math.abs(waveLoss-16.8)<1e-7,'the two emitted laser ticks apply 3.5×MicroLaser 2.4 to Wave Breaker');
 assert.equal(subHits.length,4,'both beam segments sweep the deployed wall on each of two ticks');
 assert.ok(subHits.every(hit=>hit.amount===3.5&&hit.subId==='splashWall'),'each wall callback receives the sourced 3.5 tick damage');
 assert.ok(Math.abs(wallLoss-subHits.length*3.5*2.4)<1e-7,'the piercing beam applies the MicroLaser 2.4 object rate once per wall contact');
});

test('Splattercolor Screen moving plane damages deployed Splash Wall with Chimney row',async()=>{
 const f=await setup(),owner=f.make(),enemy=f.make();equip(owner,'splattercolorScreen');enemy.team=1;enemy.pos.set(100,0,100);
 const wall=deployedWall(f,enemy,[0,.08,5]),before=wall.hp,age=wall.age;ready(owner);deployInput(owner);tickWorld(f,130);
 const damage=before-wall.hp-wall.wallHpInitial*(wall.age-age)/(wall.spec.hpDecayFrames/60);
 assert.ok(Math.abs(damage-120)<1e-6,'one plane crossing applies 40×Chimney 3 after subtracting normal wall decay');
});

test('direct Crab cannon and thrown Stamp hits retain their source rows on actor armor',async()=>{
 for(const [special,expectedCause] of [['crabTank','Default'],['ultraStamp','UltraStamp_Throw']]){
  const f=await setup(),attacker=f.make(),victim=f.make();equip(attacker,special);attacker.team=1;equip(victim,'booyahBomb');victim.team=0;
  ready(victim);victim._updateSpecial(1/60);const seen=[],damage=victim.damage;
  victim.damage=function(amount,source,kind){seen.push(source?._s3AllSpecialDamageCause);return damage.call(this,amount,source,kind);};
  ready(attacker);
  if(special==='crabTank'){for(let i=0;i<20;i++)attacker._updateSpecial(1/60);attacker.intent.sub=true;attacker._updateSpecial(1/60);}
  else{deployInput(attacker);}
  const p=f.G.projectiles.list.find(projectile=>projectile.s3AllSpecial===special);assert.ok(p,`${special} emits a projectile`);
  f.G.projectiles._blastBurst=()=>true;p.pos.set(victim.pos.x,victim.pos.y+.8,victim.pos.z);p.prev.copy(p.pos);p.vel.set(0,0,0);p.grav=0;p.drag=0;p.straight=10;p.age=0;
  f.G.projectiles._step(p,1/60);
  assert.ok(seen.includes(expectedCause),`${special} direct impact preserves ${expectedCause} through local armor damage`);
 }
});

test('Crab Tank rolling body actor damage carries Chariot_Body cause',async()=>{
 const f=await setup(),owner=f.make(),victim=f.make();equip(owner,'crabTank');owner.team=1;equip(victim,'booyahBomb');victim.team=0;victim.pos.set(0,0,.5);
 ready(victim);victim._updateSpecial(1/60);const seen=[],damage=victim.damage;
 victim.damage=function(amount,source,kind){seen.push(source?._s3AllSpecialDamageCause);return damage.call(this,amount,source,kind);};
 ready(owner);victim.pos.y=0;owner.intent.squid=true;for(let i=0;i<18;i++)owner._updateSpecial(1/60);
 assert.ok(seen.includes('Chariot_Body'),'rolling contact armor path uses the source body row');
});

test('Tenta and Inkjet special paint channels stamp the sourced cross and satellites',async()=>{
 {
  const f=await setup(),owner=f.make();equip(owner,'tentaMissiles');owner._resolve=()=>{};const target=f.make();target.team=1;target.pos.set(0,0,8);f.G.actors=[owner,target];ready(owner);deployInput(owner);
  const p=f.G.projectiles.list.find(projectile=>projectile.s3AllSpecial==='tentaMissiles');assert.ok(p);const calls=[];
  f.G.paint.splat=(at,radius)=>{calls.push({at:at.clone(),radius});return 1;};f.G.projectiles._blastBurst(p,new f.THREE.Vector3(2,0,2),null);
  const cross=calls.filter(call=>call.radius===2);assert.equal(cross.length,4,'Tenta cross paint makes four radius-2 stamps');
  assert.ok(cross.every(call=>Math.abs(Math.abs(call.at.x-2)+Math.abs(call.at.z-2)-3)<1e-9),'cross stamps use the sourced 3-unit check length');
 }
 {
  const f=await setup(),owner=f.make();equip(owner,'inkjet');owner._resolve=()=>{};ready(owner);deployInput(owner);
  const p=f.G.projectiles.list.find(projectile=>projectile.s3AllSpecial==='inkjet');assert.ok(p);const calls=[];
  f.G.paint.splat=(at,radius)=>{calls.push(radius);return 1;};f.G.projectiles._blastBurst(p,new f.THREE.Vector3(2,0,2),null);
  assert.equal(calls.filter(radius=>radius===.63).length,10,'Inkjet splash-around radius .63 produces the sourced ten paint satellites');
 }
});

test('Super Chump expiry paints sourced cross and satellite channels',async()=>{
 const f=await setup(),owner=f.make();equip(owner,'superChump');owner._resolve=()=>{};ready(owner);deployInput(owner);
 const decoys=f.G.projectiles._s3AllSpecialObjects.filter(o=>o.id==='superChump'&&o.kind==='decoy');assert.equal(decoys.length,12);
 const calls=[];f.G.paint.splat=(at,radius)=>{calls.push({at:at.clone(),radius});return 1;};tickWorld(f,320);
 const cross=calls.filter(call=>call.radius===2.5),satellites=calls.filter(call=>call.radius===1.116);
 assert.equal(cross.length,48,'each of twelve decoys emits four radius-2.5 cross stamps at expiry');
 assert.equal(satellites.length,12,'each decoy emits one sourced radius-1.116 satellite stamp');
 for(const decoy of decoys){
  const stamps=cross.filter(call=>Math.abs(Math.abs(call.at.x-decoy.pos.x)+Math.abs(call.at.z-decoy.pos.z)-2.5)<1e-9);
  assert.equal(stamps.length,4,'the calibrated cross places four stamps at the sourced check length');
 }
});

test('Zipcaster hook movement paints sourced cross marks and a two-frame calibrated trail',async()=>{
 const f=await setup(),a=f.make();equip(a,'zipcaster');a._resolve=()=>{};a.aimDir.set(0,0,1);a.aimPoint=new f.THREE.Vector3(0,1,5);
 f.G.physics.raycast=(_o,_d,_distance,h)=>{h.hit=false;return h;};const calls=[];f.G.paint.splat=(at,radius)=>{calls.push({at:at.clone(),radius,frame});return 1;};
 let frame=0;ready(a);const state=a._s3AllSpecialState;a.intent.sub=true;a._updateSpecial(1/60);frame++;
 assert.equal(state.phase,'hookFlight','a real sub press begins source-speed hook travel');a.intent.sub=false;
 for(let i=0;i<60&&state.phase!=='ready';i++){a._updateSpecial(1/60);frame++;}
 assert.equal(state.phase,'ready','the hook movement and post-zip wait reach impact');
 const trail=calls.filter(call=>call.radius===1.5),trailFrames=[...new Set(trail.map(call=>call.frame))];
 assert.ok(trailFrames.length>=4,'movement produces repeated width-1×depth-scale-1.5 trail stamps');
 assert.ok(trailFrames.slice(1).every((value,index)=>value-trailFrames[index]===2),'trail batches recur every sourced two frames');
 const impact=calls.filter(call=>call.radius===1.4),point=state.zipTarget;
 const cross=impact.filter(call=>Math.abs(Math.abs(call.at.x-point.x)+Math.abs(call.at.z-point.z)-1.4)<1e-8);
 assert.equal(cross.length,4,'hook impact paints four radius-1.4 cross stamps at the source check length');
});

test('Booyah cheer accepts distinct calls up to the source cap and rejects duplicate or stale remote calls',async()=>{
 const f=await setup(),owner=f.make(),ally=f.make(),ally2=f.make();equip(owner,'booyahBomb');
 Object.assign(ally,{team:owner.team,isLocal:true,nid:22,netLife:3});Object.assign(ally2,{team:owner.team,isLocal:true,nid:23,netLife:3});
 owner.nid=11;owner.netLife=4;f.G.actors=[owner,ally,ally2];
 const events=eventFeed(f,'all:special');ready(owner);const state=owner._s3AllSpecialState;state.charge=0;const before=state.charge;
 const allyGauge=ally.special;ally.intent.booyah=true;owner._updateSpecial(1/60);assert.ok(Math.abs(state.charge-Math.min(1,before+.09))<1e-9);assert.equal(ally.special,allyGauge+6);
 ally.intent.booyah=false;owner._updateSpecial(1/60);const secondBefore=state.charge;ally.intent.booyah=true;owner._updateSpecial(1/60);
 assert.ok(Math.abs(state.charge-secondBefore-.046)<1e-9,'a new rising edge from the same ally contributes the second capped amount plus one auto-charge frame');assert.equal(ally.special,allyGauge+9);
 ally.intent.booyah=false;owner._updateSpecial(1/60);const ally2Before=state.charge,ally2Gauge=ally2.special;ally2.intent.booyah=true;owner._updateSpecial(1/60);
 assert.ok(Math.abs(state.charge-ally2Before-.09)<1e-9,'a second ally starts its own five-call contribution schedule');assert.equal(ally2.special,ally2Gauge+6);
 const localCalls=events.filter(e=>e.action==='cheer'&&e.ownerNid===11&&e.ownerLife===4&&e.activation===state.serial);
 const firstAllyCalls=localCalls.filter(e=>e.actor===ally),secondAllyCalls=localCalls.filter(e=>e.actor===ally2);
 assert.equal(firstAllyCalls.length,2);assert.notEqual(firstAllyCalls[0].seed,firstAllyCalls[1].seed);assert.equal(secondAllyCalls.length,1);
 const ghost=f.make();ghost.remote=true;ghost.team=owner.team;ghost.nid=33;f.G.actors.push(ghost);
 owner.netLife=0;owner.net={lastLife:4};
 const replay={actor:ghost,id:'booyahBomb',activation:state.serial,action:'cheer',pos:[0,0,0],target:[0,0,0],seed:77,ownerNid:11,ownerLife:4};
 let after=state.charge;assert.equal(f.replayAllSpecials(f,replay),true);assert.equal(state.charge,Math.min(1,after+.088));
 assert.equal(f.replayAllSpecials(f,replay),false,'duplicate remote cheer has no second effect');
 const second={...replay,seed:78};after=state.charge;assert.equal(f.replayAllSpecials(f,second),true);assert.equal(state.charge,Math.min(1,after+.044),'same ally may make another bounded call');
 const third={...replay,seed:79};after=state.charge;assert.equal(f.replayAllSpecials(f,third),true);assert.equal(state.charge,Math.min(1,after+.022));
 const fourth={...replay,seed:80};after=state.charge;assert.equal(f.replayAllSpecials(f,fourth),true);assert.equal(state.charge,Math.min(1,after+.011));
 const fifth={...replay,seed:81};after=state.charge;assert.equal(f.replayAllSpecials(f,fifth),true);assert.equal(state.charge,Math.min(1,after+.011));
 const capped={...replay,seed:82};after=state.charge;assert.equal(f.replayAllSpecials(f,capped),true);assert.equal(state.charge,after,'calls past this cheerer’s five-call source cap add no charge');
 assert.equal(f.replayAllSpecials(f,{...replay,seed:83,ownerLife:3}),false,'stale owner life is rejected before consuming a replay identity');
 assert.equal(ghost.special,0,'owner-side replay does not award gauge to a remote cheerer');
 const remoteOwner=f.make();remoteOwner.remote=true;remoteOwner.nid=44;remoteOwner.netLife=2;remoteOwner.team=owner.team;remoteOwner.s3CatalogueBooyah=8;f.G.actors.push(remoteOwner);
 const bridged={actor:ally,id:'booyahBomb',activation:8,action:'cheer',pos:[0,0,0],target:[0,0,0],seed:101,ownerNid:44,ownerLife:2,call:1};
 const gaugeBeforeRemoteCast=ally.special;f.emit('all:special',bridged);assert.equal(ally.special,gaugeBeforeRemoteCast+6,'local cheer earns sourced gauge while cheering for a remote caster');
 f.emit('all:special',bridged);assert.equal(ally.special,gaugeBeforeRemoteCast+6,'the local gauge bridge is idempotent by cheer call');
});

test('remote destructible hit proposal validates the owner life using the network last-life fallback',async()=>{
 const f=await setup(),owner=f.make(),shooter=f.make();equip(owner,'waveBreaker');owner.nid=11;owner.netLife=0;owner.net={lastLife:4};shooter.nid=22;shooter.remote=true;shooter.team=1;f.G.actors=[owner,shooter];
 ready(owner);deployInput(owner);
 const device=f.G.projectiles._s3AllSpecialObjects.find(o=>o.kind==='wave');assert.ok(device);const hp=device.hp;
 const event={actor:shooter,id:'waveBreaker',activation:device.activation,action:'objectHit',pos:[0,0,0],target:[0,0,0],seed:91,object:device.serial,index:0,ownerNid:11,ownerLife:4,damage:25,tick:1};
 assert.equal(f.replayAllSpecials(f,event),true);assert.equal(device.hp,hp-25);
 owner.net.lastLife=5;
 const after=device.hp;assert.equal(f.replayAllSpecials(f,{...event,seed:92,tick:2}),false);
 assert.equal(device.hp,after,'stale device owner life cannot alter peer-owned device health');
});

test('local Booyah calls credit gauge for a remote catalogue caster once per call',async()=>{
 const f=await setup(),caster=f.make(),ally=f.make();Object.assign(caster,{remote:true,nid:11,netLife:3,s3CatalogueBooyah:{activation:7}});Object.assign(ally,{isLocal:true,special:0});f.G.actors=[caster,ally];
 const event={actor:ally,id:'booyahBomb',action:'cheer',activation:7,ownerNid:11,ownerLife:3,seed:1};
 f.emit('all:special',event);assert.equal(ally.special,6);f.emit('all:special',event);assert.equal(ally.special,6);
 f.emit('all:special',{...event,seed:2});assert.equal(ally.special,9);f.emit('all:special',{...event,seed:3,ownerLife:2});assert.equal(ally.special,9);
});

test('source special launch forces advance the same actual projectile at 30/60/120Hz',async()=>{
 for(const [id,mode,speed,gravity,drag] of [['booyahBomb','throw',60,.021*3600,.045],['ultraStamp','throw',51,.013*3600,.03],['crabTank','shooter',201.6,.016*3600,0],['crabTank','cannon',null,.05*3600,.12]]){
  const paths=[];
  for(const hz of [30,60,120]){
   const f=await setup(),a=f.make();equip(a,id);a.aimDir.set(0,0,1);ready(a);
   if(id==='crabTank')tickActorOnlyAtHz(a,60,21);
   if(mode==='shooter')a.intent.fire=true;else {a.intent.sub=true;a._updateSpecial(1/60);if(id==='ultraStamp'||id==='booyahBomb')a.intent.sub=false;}
   let p=f.G.projectiles.list.find(p=>p.s3AllSpecial===id);for(let frame=0;frame<60&&!p;frame++){if(a.specialActive)a._updateSpecial(1/60);p=f.G.projectiles.list.find(p=>p.s3AllSpecial===id);}assert.ok(p,`${id}/${mode} emitted through Actor`);
   const flight=p.s3AllSpecialFlight;assert.ok(flight);if(speed!==null)assert.equal(flight.spawnSpeed,speed);
   assert.equal(flight.gravity,gravity);assert.equal(flight.positionAirResist||flight.airResist||0,drag);
   p.pos.set(0,100,0);p.prev.copy(p.pos);p.start.copy(p.pos);f.G.actors=[];
   stepProjectileAtHz(f,p,hz,30);assert.ok(Math.abs(p.age-.5)<1e-8);
   paths.push([...p.pos.toArray(),...p.vel.toArray()]);
  }
  for(const path of paths.slice(1))path.forEach((v,i)=>assert.ok(Math.abs(v-paths[0][i])<1e-7,`${id}/${mode}: sourced fixed-step flight differs at coordinate ${i}`));
  }
});

test('Zipcaster special-power AP controls native hook cost and time drain at 30/60/120 Hz',async()=>{
 const f=await setup();const {emptyLoadout,gearCurve}=await import('../runtime/gear.mjs');
 for(const ap of [0,10,57])for(const hz of [30,60,120]){
  const a=f.make();a.s3.loadout=emptyLoadout();if(ap===10)a.s3.loadout[0].main='specialPower';if(ap===57)for(const p of a.s3.loadout){p.main='specialPower';p.subs.fill('specialPower');}a.s3RefreshGear();equip(a,'zipcaster');f.G.actors=[a];
  ready(a);const s=a._s3AllSpecialState,drain=gearCurve(ap,15,13.05,12),hook=gearCurve(ap,4,2.5,1.5);
  for(let i=0;i<hz;i++)a._updateSpecial(1/hz);
  assert.ok(Math.abs(s.inkFuel-(150-drain))<1e-8,`${ap}AP ${hz}Hz drain`);
  const before=s.inkFuel;a.intent.sub=true;a._updateSpecial(1/hz);
  assert.ok(Math.abs(before-s.inkFuel-(hook+drain/hz))<1e-8,`${ap}AP ${hz}Hz hook`);
  assert.equal(s.phase,'hookFlight','source hook travel starts before the player pull');
 }
});

test('Reefslider snapshots special-power paint and damage-distance curves without increasing damage',async()=>{
 const f=await setup();const {emptyLoadout,gearCurve}=await import('../runtime/gear.mjs');
 for(const ap of [0,10,57]){
  const a=f.make(),near=f.make(),far=f.make();near.team=far.team=1;near.pos.set(9.7,-.75,0);far.pos.set(16,-.75,0);f.G.actors=[a,near,far];
  a.s3.loadout=emptyLoadout();if(ap===10)a.s3.loadout[0].main='specialPower';if(ap===57)for(const p of a.s3.loadout){p.main='specialPower';p.subs.fill('specialPower');}a.s3RefreshGear();equip(a,'reefslider');a._resolve=()=>{};
  const hits=[],old=f.G.projectiles.applyHit;f.G.projectiles.applyHit=(...args)=>{hits.push(args);};
  ready(a);const s=a._s3AllSpecialState,scale=gearCurve(ap,1,1.1,1.2);
  assert.equal(s.paintRadius,gearCurve(ap,7.51,8.26,9.012));assert.equal(s.damageDistanceRate,scale);
  a.s3.loadout=emptyLoadout();a.s3RefreshGear();assert.equal(s.damageDistanceRate,scale,'activation snapshot');
  // The source Impact input is accepted after the 15F dash-cancel window.
  s.phase='dash';s.dashT=15/60;s.reefSpeedRaw=0;deployInput(a);
  assert.equal(s.phase,'brake');
  for(let i=0;i<38;i++)a._updateSpecial(1/60);
  assert.equal(s.phase,'recovery');
  const hit=hits.find(h=>h[1]===near);assert.ok(hit);assert.ok(hit[2]<=220);assert.equal(hits.some(h=>h[1]===far),16<=14.9*scale);
  f.G.projectiles.applyHit=old;
 }
});

test('Screen source movement follows activation AP and remote device replay preserves it',async()=>{
 const f=await setup();const {emptyLoadout,gearCurve}=await import('../runtime/gear.mjs');
 for(const ap of [0,10,57]){
  const a=f.make();a.s3.loadout=emptyLoadout();if(ap===10)a.s3.loadout[0].main='specialPower';if(ap===57)for(const p of a.s3.loadout){p.main='specialPower';p.subs.fill('specialPower');}a.s3RefreshGear();equip(a,'splattercolorScreen');f.G.actors=[a];
  const events=eventFeed(f,'all:special');ready(a);a.s3.loadout=emptyLoadout();a.s3RefreshGear();deployInput(a);
  const o=f.G.projectiles._s3AllSpecialObjects.find(x=>x.owner===a&&x.kind==='screen');assert.ok(o);assert.equal(o.moveSpeed,gearCurve(ap,.04,.053,.06)*60);assert.equal(o.specialPowerAP,ap);
  const event=events.find(e=>e.action==='deploy'&&e.kind==='screen');assert.ok(event);assert.equal(event.specialPowerAP,ap);
  const remote=f.make();remote.remote=true;f.replayAllSpecials(f,{...event,actor:remote});const ghost=f.G.projectiles._s3AllSpecialObjects.find(x=>x.owner===remote&&x.kind==='screen');assert.ok(ghost);assert.equal(ghost.moveSpeed,o.moveSpeed);
 }
});

test('Screen travel integrates startup and closing boundaries identically at 30/60/120 Hz',async()=>{
 const f=await setup();const distances=[];
 for(const hz of [30,60,120]){
  f.G.projectiles.clear();const a=f.make();equip(a,'splattercolorScreen');f.G.actors=[a];ready(a);deployInput(a);
  const o=f.G.projectiles._s3AllSpecialObjects.find(x=>x.kind==='screen'),start=o.pos.clone();
  for(let i=0;i<11*hz;i++){f.G.time+=1/hz;f.G.projectiles.update(1/hz);}
  distances.push(o.pos.distanceTo(start));assert.ok(Math.abs(distances.at(-1)-2.4*560/60)<1e-8,`${hz} Hz travel`);
 }
 assert.ok(Math.max(...distances)-Math.min(...distances)<1e-8);
});

test('catalogue world damage uses the same 60 Hz samples at 30/60/120 rendering rates',async()=>{
 const f=await setup(),totals=[];
 for(const hz of [30,60,120]){
  f.G.projectiles.clear();const a=f.make(),v=f.make();equip(a,'booyahBomb');v.team=1;v.hp=1000;v.invuln=0;v.pos.set(0,0,.2);f.G.actors=[a,v];f.G.netm=null;
  ready(a);deployInput(a);const p=f.G.projectiles.list.at(-1);f.G.projectiles._blastBurst(p,new f.THREE.Vector3(0,.08,0),null);f.G.projectiles.list.length=0;
  let sum=0;const hit=f.G.projectiles.applyHit;f.G.projectiles.applyHit=(owner,victim,damage,id)=>{if(victim===v&&id==='booyahBomb')sum+=damage;return hit.call(f.G.projectiles,owner,victim,damage,id);};
  for(let i=0;i<2*hz;i++){f.G.time+=1/hz;f.G.projectiles.update(1/hz);}
  f.G.projectiles.applyHit=hit;assert.ok(Math.abs((1000-v.hp)-sum)<1e-7,'actual victim HP');totals.push(sum);
 }
 assert.ok(totals[0]>0);assert.ok(Math.max(...totals)-Math.min(...totals)<1e-8,JSON.stringify(totals));
});

test('recycling a special round cannot give a later main weapon special paint, blast or damage aging',async()=>{
 const f=await setup(),a=f.make();equip(a,'booyahBomb');f.G.actors=[a];ready(a);deployInput(a);
 const p=f.G.projectiles.list.at(-1);assert.equal(p.s3AllSpecial,'booyahBomb');p.s3DamageReduce={max:32,min:16,start:0,end:1};p.s3TentaTarget=new f.THREE.Vector3(100,100,100);
 f.G.projectiles.clear();const recycled=f.G.projectiles._new();assert.equal(recycled,p);
 for(const key of ['s3AllSpecial','s3AllSpecialPaintRadius','s3AllSpecialActivation','s3AllSpecialSeed','s3DamageReduce','s3TentaTarget'])assert.equal(recycled[key],undefined,key);
});

test('Inkjet power snapshot survives the actual projectile packet and ghost without increasing direct damage',async()=>{
 const f=await setup();const {emptyLoadout,gearCurve}=await import('../runtime/gear.mjs');
 for(const ap of [0,10,57]){
  f.G.projectiles.clear();const a=f.make();a.nid=7;a.s3.loadout=emptyLoadout();if(ap===10)a.s3.loadout[0].main='specialPower';if(ap===57)for(const p of a.s3.loadout){p.main='specialPower';p.subs.fill('specialPower');}a.s3RefreshGear();equip(a,'inkjet');f.G.actors=[a];a._resolve=()=>{};const v=f.make();v.team=1;v.pos.set(0,0,8);f.G.actors.push(v);
  ready(a);a.s3.loadout=emptyLoadout();a.s3RefreshGear();deployInput(a);
  const p=f.G.projectiles.list.find(x=>x.s3AllSpecial==='inkjet'),d=p.s3SpecialWeapon;assert.equal(d.specialPowerAP,ap);assert.equal(d.splashRadius,5*gearCurve(ap,1,1.15,1.3));assert.equal(d.directDamage,120);assert.ok(d.paintRadius<=3.74);assert.equal(p.s3AllSpecialPaintRadius,gearCurve(ap,3.2,3.6,4));
  const nm=new f.NetMatch({myId:'owner'},{});nm.recProj(p);const packet=JSON.parse(JSON.stringify(nm.out.at(-1)));
  assert.equal(packet.find(x=>x&&typeof x==='object'&&'s3SpecialPowerAP' in x).s3SpecialPowerAP,ap);
  assert.equal(packet[4],'inkjet');const remote=f.make();remote.remote=true;remote.nid=7;const before=f.G.projectiles.list.length;f.G.projectiles.ghostProjectile(remote,packet);assert.equal(f.G.projectiles.list.length,before+1);const ghost=f.G.projectiles.list.at(-1);
  assert.equal(ghost.s3SpecialPowerAP,ap);assert.equal(ghost.s3SpecialWeapon.splashRadius,d.splashRadius);assert.deepEqual(ghost.s3SpecialWeapon.splashBands,d.splashBands);assert.equal(ghost.damage,0);
  const hostile=structuredClone(packet);hostile.find(x=>x&&typeof x==='object'&&'s3SpecialPowerAP' in x).s3SpecialPowerAP=58;f.G.projectiles.ghostProjectile(remote,hostile);assert.equal(f.G.projectiles.list.length,before+1);
 }
});

test('every catalogue-launched special projectile keeps a wire identity accepted by ghost reconstruction',async()=>{
 const f=await setup();
 for(const id of ['tentaMissiles','inkjet','booyahBomb','ultraStamp','crabTank']){
  f.G.projectiles.clear();f.G.netm=null;const a=f.make();a.nid=7;a._resolve=()=>{};equip(a,id);f.G.actors=[a];ready(a);const target=f.make();target.team=1;target.pos.set(0,0,8);f.G.actors.push(target);a.intent.fire=id==='inkjet'||id==='tentaMissiles';a.intent.sub=id==='booyahBomb'||id==='ultraStamp';if(id==='ultraStamp'||id==='booyahBomb'){a._updateSpecial(1/60);a.intent.sub=false;}
  for(let i=0;i<40&&a.specialActive;i++){if(id==='crabTank'&&i===21)a.intent.sub=true;a._updateSpecial(1/60);}
  const p=f.G.projectiles.list.find(x=>x.s3AllSpecial===id);assert.ok(p,id+' emitted');
  const nm=new f.NetMatch({myId:'owner'},{});nm.recProj(p);const packet=JSON.parse(JSON.stringify(nm.out.at(-1)));assert.equal(packet[4],id);
  const remote=f.make();remote.remote=true;remote.nid=7;const before=f.G.projectiles.list.length;f.G.projectiles.ghostProjectile(remote,packet);assert.equal(f.G.projectiles.list.length,before+1,id+' accepted');const ghost=f.G.projectiles.list.at(-1);assert.equal(ghost.s3SpecialWeapon.id,id);assert.equal(ghost.damage,0);
 }
});

test('world effect clock rejects invalid elapsed time and clear removes its remainder',async()=>{
 const f=await setup(),a=f.make();equip(a,'splattercolorScreen');f.G.actors=[a];ready(a);deployInput(a);
 const sys=f.G.projectiles,o=sys._s3AllSpecialObjects[0];sys.update(1/120);const age=o.age,clock=sys._s3AllSpecialWorldClock;
 for(const dt of [NaN,Infinity,-1,0]){sys.update(dt);assert.equal(o.age,age);assert.equal(sys._s3AllSpecialWorldClock,clock);}
 sys.clear();assert.equal(sys._s3AllSpecialWorldClock,0);assert.equal(sys._s3AllSpecialObjects.length,0);
});

test('Super Chump activation power scales decoy paint and blast reach but never damage or HP',async()=>{
 const f=await setup();const {emptyLoadout,gearCurve}=await import('../runtime/gear.mjs');
 for(const ap of [0,10,57]){
  f.G.projectiles.clear();f.G.netm=null;const a=f.make();a.s3.loadout=emptyLoadout();if(ap===10)a.s3.loadout[0].main='specialPower';if(ap===57)for(const p of a.s3.loadout){p.main='specialPower';p.subs.fill('specialPower');}a.s3RefreshGear();equip(a,'superChump');f.G.actors=[a];
  const events=eventFeed(f,'all:special');ready(a);a.s3.loadout=emptyLoadout();a.s3RefreshGear();deployInput(a);
  const objects=f.G.projectiles._s3AllSpecialObjects.filter(o=>o.owner===a&&o.kind==='decoy');assert.equal(objects.length,12);
  const o=objects[0],rate=gearCurve(ap,1,1.1,1.2);assert.equal(o.specialPowerAP,ap);assert.equal(o.paintRadius,gearCurve(ap,3.5,3.8,4.1));assert.equal(o.maxRadius,6*rate);assert.deepEqual(JSON.parse(JSON.stringify(o.damageBands)),[[3.6*rate,70],[6*rate,35]]);assert.equal(o.hp,60);
  const event=events.find(e=>e.kind==='decoy'&&e.action==='deploy'),remote=f.make();remote.remote=true;f.replayAllSpecials(f,{...event,actor:remote});const ghost=f.G.projectiles._s3AllSpecialObjects.find(x=>x.owner===remote);assert.equal(ghost.maxRadius,o.maxRadius);assert.equal(ghost.paintRadius,o.paintRadius);
  const v=f.make();v.team=1;v.pos.copy(o.target);v.pos.x+=6.5;v.pos.y-=.75;f.G.actors=[a,v];f.G.projectiles._s3AllSpecialObjects=[o];const hits=[],old=f.G.projectiles.applyHit;f.G.projectiles.applyHit=(...args)=>hits.push(args);o.phase='active';o.pos.copy(o.target);o.age=o.dur-1/60;f.G.projectiles.update(1/60);f.G.projectiles.applyHit=old;
  assert.equal(hits.some(h=>h[1]===v),6.5<=o.maxRadius);for(const h of hits)assert.ok(h[2]<=70);
 }
});

test('Tenta Missiles retain the source paint-power curve in their launch and remote descriptor',async()=>{
 const f=await setup();const {emptyLoadout,gearCurve}=await import('../runtime/gear.mjs');
 for(const ap of [0,10,57]){
  f.G.projectiles.clear();f.G.netm=null;const a=f.make();a.nid=7;a.s3.loadout=emptyLoadout();if(ap===10)a.s3.loadout[0].main='specialPower';if(ap===57)for(const p of a.s3.loadout){p.main='specialPower';p.subs.fill('specialPower');}a.s3RefreshGear();equip(a,'tentaMissiles');f.G.actors=[a];a._resolve=()=>{};const v=f.make();v.team=1;v.pos.set(0,0,8);f.G.actors.push(v);
  ready(a);a.s3.loadout=emptyLoadout();a.s3RefreshGear();a.intent.fire=true;a._updateSpecial(1/60);
  const p=f.G.projectiles.list.find(x=>x.s3AllSpecial==='tentaMissiles'),radius=gearCurve(ap,3.15,3.465,3.78);assert.ok(p);assert.equal(p.s3AllSpecialPaintRadius,radius);assert.equal(p.s3SpecialWeapon.paintRadius,Math.min(3.74,radius));assert.equal(p.s3SpecialWeapon.directDamage,150);
  const nm=new f.NetMatch({myId:'owner'},{});nm.recProj(p);const packet=JSON.parse(JSON.stringify(nm.out.at(-1))),remote=f.make();remote.remote=true;remote.nid=7;
  f.G.projectiles.ghostProjectile(remote,packet);const ghost=f.G.projectiles.list.at(-1);assert.equal(ghost.s3SpecialWeapon.specialPowerAP,ap);assert.equal(ghost.s3SpecialWeapon.paintRadius,p.s3SpecialWeapon.paintRadius);assert.equal(ghost.damage,0);
 }
});
