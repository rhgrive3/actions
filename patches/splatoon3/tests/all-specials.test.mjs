import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

const EXTRA=`export {replaySpecial as replayAllSpecials,ALL_SPECIALS,ALL_SPECIALS_STATUS} from './patches/splatoon3/runtime/all-specials.mjs';`;
async function setup(){const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:EXTRA});f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};return f;}
function equip(actor,id){actor.weapon={...actor.weapon,special:id,specialCost:100};actor.special=100;actor.alive=true;actor.remote=false;actor.intent.fire=false;actor.intent.sub=false;actor.intent.jump=false;actor._prevIntent ||= {};Object.assign(actor._prevIntent,{fire:false,sub:false,jump:false,squid:false,booyah:false});}
function tickWorld(f,frames){for(let i=0;i<frames;i++){f.G.time+=1/60;f.G.projectiles.update(1/60);}}
function eventFeed(f,name){const rows=[];f.on(name,e=>rows.push(e));return rows;}

test('missing special inventory is source versioned and Tenta launch uses native rounds and a finite bus record',async()=>{
 const f=await setup(),a=f.make(),victim=f.make();equip(a,'tentaMissiles');a._resolve=()=>{};victim.team=1;victim.pos.set(0,0,5);f.G.actors=[a,victim];
 const rows=eventFeed(f,'all:special'),before=f.G.projectiles.list.length;a._startSpecial();a.intent.fire=true;a._updateSpecial(1/60);
 assert.equal(a.stats.specials,1);assert.equal(a.specialActive?.phase,'volley');assert.equal(f.G.projectiles.list.length-before,1,'first rocket, not instantaneous volley');
 a.intent.fire=false;for(let i=0;i<40&&a.specialActive;i++)a._updateSpecial(1/60);
 assert.equal(a.specialActive,null);assert.equal(f.G.projectiles.list.length-before,10);
 assert.ok(rows.some(e=>e.action==='launch'&&e.count===10));
 for(const e of rows){assert.ok([e.pos,...(e.target?[e.target]:[])].flat().every(Number.isFinite));assert.ok(Number.isInteger(e.seed)&&e.seed>=0&&e.seed<=0xffffffff);}
 assert.deepEqual(Object.keys(f.ALL_SPECIALS).sort(),['booyahBomb','crabTank','inkjet','killerWail','krakenRoyale','reefslider','splattercolorScreen','superChump','tentaMissiles','tripleInkstrike','ultraStamp','waveBreaker','zipcaster'].sort());
 assert.match(f.ALL_SPECIALS_STATUS.reference,/11\.3\.0/);assert.match(f.ALL_SPECIALS_STATUS.calibration,/world-unit mapping/);
});

test('Tenta Missiles rise, dive onto the locked ground coordinate, and apply impact damage',async()=>{
 const f=await setup(),a=f.make(),victim=f.make();equip(a,'tentaMissiles');a._resolve=()=>{};victim.team=1;victim.pos.set(0,0,8);f.G.actors=[a,victim];
 a._startSpecial();a.intent.fire=true;a._updateSpecial(1/60);a.intent.fire=false;
 for(let i=0;i<40&&a.specialActive;i++)a._updateSpecial(1/60);
 const missiles=f.G.projectiles.list.filter(p=>p.s3AllSpecial==='tentaMissiles');
 assert.equal(missiles.length,10);assert.ok(missiles.every(p=>p.s3TentaTarget instanceof f.THREE.Vector3));
 const target=missiles[0].s3TentaTarget.clone();tickWorld(f,120);
 assert.ok(missiles[0].s3TentaDescending);assert.ok(missiles[0].pos.distanceTo(target)<3.5);
 assert.ok(victim.hp<100,'the descended native missile round reaches its locked target and damages it');
});

test('Wave Breaker keeps source pulse schedule and owner-owned device survives owner death',async()=>{
 const f=await setup(),a=f.make(),victim=f.make();equip(a,'waveBreaker');victim.team=1;victim.pos.set(0,0,17);f.G.actors=[a,victim];
 const hits=[],apply=f.G.projectiles.applyHit;let paint=0;f.G.projectiles.applyHit=function(...args){hits.push(args);return apply.apply(this,args);};f.G.paint.splat=()=>{paint++;return 1;};
 a._startSpecial();a.intent.fire=true;a._updateSpecial(1/60);
 const device=f.G.projectiles._s3AllSpecialObjects.find(o=>o.kind==='wave');assert.ok(device);assert.equal(device.hp,480);
 assert.deepEqual(Array.from(device.pulseFrames),[90/60,240/60,390/60]);assert.equal(device.maxWaveFrame,160/60);
 const contact=f.make();contact.team=1;contact.hp=1000;contact.pos.copy(device.pos);victim.pos.copy(device.pos);victim.pos.z+=1.5;f.G.actors.push(contact);
 tickWorld(f,100);assert.ok(hits.some(h=>h[1]===victim&&h[3]==='waveBreaker'&&h[2]===45));assert.ok(hits.filter(h=>h[1]===contact&&h[3]==='waveBreaker'&&h[2]===30).length>=3);
 assert.ok(device.waves.length>=1);assert.ok(victim.s3.revealedUntil[a.team]>=f.G.time+7.8);assert.equal(paint,0,'Wave Breaker pulses do not paint ink');
 a.alive=false;tickWorld(f,200);assert.ok(f.G.projectiles._s3AllSpecialObjects.includes(device));
 tickWorld(f,310);assert.equal(f.G.projectiles._s3AllSpecialObjects.includes(device),false);
});

test('Wave Breaker marks nearby placement for 45 frames and holds until a manual deploy input',async()=>{
 const f=await setup(),a=f.make(),victim=f.make();equip(a,'waveBreaker');victim.team=1;f.G.actors=[a,victim];
 a._startSpecial();for(let i=0;i<120;i++)a._updateSpecial(1/60);
 assert.equal((f.G.projectiles._s3AllSpecialObjects||[]).filter(o=>o.kind==='wave').length,0,'holding the placement does not auto-deploy');
 a.intent.fire=true;a._updateSpecial(1/60);const device=f.G.projectiles._s3AllSpecialObjects.find(o=>o.kind==='wave');assert.ok(device);
 victim.pos.copy(device.pos);tickWorld(f,4);const until=victim.s3?.revealedUntil?.[a.team];assert.ok(until>f.G.time);
 victim.pos.z+=100;tickWorld(f,44);assert.ok(victim.s3.revealedUntil[a.team]>f.G.time);tickWorld(f,2);
 assert.ok(victim.s3.revealedUntil[a.team]<=f.G.time+1e-9,'the generator placement mark expires after 45 frames');
});

test('Wave Breaker pulse misses a jumping player above the source height limit',async()=>{
 const f=await setup(),a=f.make(),victim=f.make();equip(a,'waveBreaker');victim.team=1;victim.pos.set(0,2.5,18.5);f.G.actors=[a,victim];
 const hits=[],apply=f.G.projectiles.applyHit;f.G.projectiles.applyHit=function(...args){hits.push(args);return apply.apply(this,args);};
 a._startSpecial();a.intent.fire=true;a._updateSpecial(1/60);tickWorld(f,120);
 assert.equal(hits.filter(h=>h[1]===victim&&h[2]===45&&h[3]==='waveBreaker').length,0,'the player is above DamageYMax after the height offset');
});

test('Booyah Bomb armor and delayed expanding damage are timed independently from impact',async()=>{
 const f=await setup(),a=f.make(),victim=f.make();equip(a,'booyahBomb');victim.team=1;victim.pos.set(0,0,.2);f.G.actors=[a,victim];
 const stateEvents=eventFeed(f,'actor:armorhit');a._startSpecial();a._updateSpecial(1/60);
 const hp=a.hp;a.damage(100,null,'shooter');assert.equal(a.hp,hp);assert.equal(a._s3AllSpecialState.armorHP,370);assert.equal(stateEvents.at(-1).absorbed,100);
 a.intent.sub=true;a._updateSpecial(1/60);assert.equal(a.specialActive,null);
 const p=f.G.projectiles.list.at(-1);assert.equal(p.s3AllSpecial,'booyahBomb');
 f.G.projectiles._blastBurst(p,new f.THREE.Vector3(0,.08,0),null);
 const blast=f.G.projectiles._s3AllSpecialObjects.find(o=>o.kind==='booyahBlast');assert.ok(blast);assert.equal(blast.startDelay,40/60);assert.equal(blast.expand,40/60);
 const before=victim.hp;tickWorld(f,39);assert.equal(victim.hp,before,'no blast damage during the sourced delay');
 tickWorld(f,45);assert.ok(victim.hp<before,'expanding blast applies continuous damage after its delay');
});

test('Splattercolor Screen applies the recipient color and mark timers on a real crossing',async()=>{
 const f=await setup(),owner=f.make(),victim=f.make();equip(owner,'splattercolorScreen');victim.team=1;victim.isLocal=true;victim.pos.set(0,0,3.2);f.G.actors=[owner,victim];
 const hits=[],apply=f.G.projectiles.applyHit;f.G.projectiles.applyHit=function(...args){hits.push(args);return apply.apply(this,args);};
 owner._startSpecial();owner.intent.fire=true;owner._updateSpecial(1/60);assert.ok(owner.specialActive===null);
 tickWorld(f,90);
 assert.ok(victim.s3.splattercolorUntil>f.G.time);assert.ok(victim.s3.splattercolorMarkUntil>f.G.time);
 assert.ok(Math.abs(victim.s3.splattercolorUntil-victim.s3.splattercolorMarkUntil-4)<1e-9);
 assert.ok(hits.some(h=>h[1]===victim&&h[2]===40&&h[3]==='splattercolorScreen'));
});

test('Splattercolor Screen does not stop a native enemy shot from reaching a player behind it',async()=>{
 const f=await setup(),owner=f.make(),shooter=f.make(),victim=f.make();equip(owner,'splattercolorScreen');
 owner.aimPoint.set(0,1,20);shooter.team=1;shooter.pos.set(0,0,5);shooter.aimDir.set(0,0,-1);shooter.aimPoint.set(0,.75,1);victim.team=0;victim.pos.set(0,0,1);f.G.actors=[owner,shooter,victim];
 owner._startSpecial();for(let i=0;i<13;i++)owner._updateSpecial(1/60);
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
 f.G.match={playing:()=>true};a.aimPoint=new f.THREE.Vector3(0,1,5);
 const events=eventFeed(f,'all:special'),hits=[],apply=f.G.projectiles.applyHit;f.G.projectiles.applyHit=function(...args){hits.push(args);return apply.apply(this,args);};
 a._startSpecial();const state=a._s3AllSpecialState,origin=a.pos.clone();
 a.intent.sub=true;a._updateSpecial(1/60);assert.equal(state.phase,'zip',JSON.stringify({held:state.held,sub:a.intent.sub,phase:state.phase,fuel:state.inkFuel,t:state.t}));assert.ok(state.inkFuel<150);
 a.intent.sub=false;for(let i=0;i<45;i++)a._updateSpecial(1/60);
 assert.equal(state.phase,'ready');assert.ok(state.zips===1);assert.ok(hits.some(h=>h[1]===victim&&h[3]==='zipcaster'));
 const shots=f.G.projectiles.list.length,normalInk=a.ink,fuel=state.inkFuel;victim.pos.set(a.pos.x,0,a.pos.z+6);a.intent.fire=true;let fireFrames=0;
 while(f.G.projectiles.list.length===shots&&fireFrames<30){a._updateSpecial(1/60);fireFrames++;}
 assert.ok(f.G.projectiles.list.length>shots&&f.G.projectiles.list.some(p=>p.owner===a&&!p.s3AllSpecial),'fire goes through the equipped native main weapon');
 assert.ok(hits.some(h=>h[1]===victim&&h[3]==='zipcaster'),'hook impact remains the Zipcaster damage source');
 assert.equal(a.ink,normalInk,'the temporary Zipcaster tank does not overwrite the normal tank');assert.ok(state.inkFuel<fuel-state.inkDrainPerSecond*fireFrames/60-.5,'main firing and time drain consume the single special tank');
 a.intent.sub=true;a.intent.fire=false;a._updateSpecial(1/60);assert.equal(state.phase,'zip','a second sub press starts another hook');
 state.duration=state.t+1/60;a.intent.sub=false;a._updateSpecial(1/60);
 assert.equal(a.specialActive,null);assert.ok(a.superJumpState);assert.deepEqual(a.superJumpState.target.toArray(),origin.toArray());
});

test('Kraken Royale initializes its charge direction and completes a real charge dash hit',async()=>{
 const f=await setup(),a=f.make(),victim=f.make();equip(a,'krakenRoyale');victim.team=1;victim.pos.set(0,0,1);f.G.actors=[a,victim];a._resolve=()=>{};a.aimPoint=new f.THREE.Vector3(0,1,20);
 const hits=[],apply=f.G.projectiles.applyHit;f.G.projectiles.applyHit=function(...args){hits.push(args);return apply.apply(this,args);};
 a._startSpecial();const state=a._s3AllSpecialState;assert.ok(state.direction instanceof f.THREE.Vector3);
 a.intent.fire=true;a._updateSpecial(1/60);assert.equal(state.phase,'charge');assert.ok(state.direction.z>.99);
 for(let i=0;i<35;i++)a._updateSpecial(1/60);assert.equal(state.phase,'dash');
 a._updateSpecial(1/60);assert.ok(hits.some(h=>h[1]===victim&&h[2]===120&&h[3]==='krakenRoyale'),'charge dash uses its attack path and owner hit routing');
});

test('Inkjet fires native rounds, descends in squid form, and starts a Super Jump return at expiry',async()=>{
 const f=await setup(),a=f.make();equip(a,'inkjet');f.G.match={playing:()=>true};
 const origin=a.pos.clone(),events=eventFeed(f,'all:special');a._resolve=()=>{};a._startSpecial();a.intent.squid=true;a._updateSpecial(1/60);
 assert.equal(a.form,'squid');assert.ok(a.vel.y<7.4,'holding squid drives a fast descent');
 a.intent.squid=false;a.intent.fire=true;a._updateSpecial(1/60);
 assert.ok(f.G.projectiles.list.some(p=>p.s3AllSpecial==='inkjet'));
 assert.ok(events.some(e=>e.action==='shot'));
 const state=a._s3AllSpecialState;state.duration=state.t+2/60;a.intent.fire=false;a._updateSpecial(1/60);a._updateSpecial(1/60);
 assert.equal(a.specialActive,null);assert.ok(a.superJumpState);assert.deepEqual(a.superJumpState.target.toArray(),origin.toArray());
});

test('Ultra Stamp uses jump swings and blocks a projectile through its forward guard',async()=>{
 const f=await setup(),a=f.make(),victim=f.make(),shooter=f.make();equip(a,'ultraStamp');victim.team=1;victim.pos.set(0,0,2);shooter.team=1;f.G.actors=[a,victim,shooter];
 const hits=[],apply=f.G.projectiles.applyHit;f.G.projectiles.applyHit=function(...args){hits.push(args);return apply.apply(this,args);};
 const events=eventFeed(f,'all:special');a._resolve=()=>{};a._startSpecial();for(let i=0;i<4;i++)a._updateSpecial(1/60);a.intent.fire=true;a._updateSpecial(1/60);
 assert.ok(hits.some(h=>h[1]===victim&&h[2]===100&&h[3]==='ultraStamp'));
 a.intent.jump=true;a._updateSpecial(1/60);assert.ok(events.some(e=>e.action==='jumpSwing'));
 const incoming={owner:shooter,team:shooter.team,prev:new f.THREE.Vector3(0,.78,3),pos:new f.THREE.Vector3(0,.78,.2),damage:20,size:.15,ghost:false};
 const guard=f.G.projectiles.kitDefenseCandidate(incoming);assert.equal(guard?.kind,'ultra-stamp-guard');assert.equal(guard.onHit(),true);
 assert.ok(events.some(e=>e.action==='block'));
});

test('Crab Tank fires shooter and cannon rounds and exposes ball posture while squid is held',async()=>{
 const f=await setup(),a=f.make();equip(a,'crabTank');a._resolve=()=>{};const events=eventFeed(f,'all:special');a._startSpecial();
 a.intent.fire=true;for(let i=0;i<23;i++)a._updateSpecial(1/60);
 const shooter=f.G.projectiles.list.find(p=>p.s3AllSpecial==='crabTank'&&p.s3AllSpecialMode==='shooter');assert.ok(shooter);assert.equal(shooter.damage,32);
 a.intent.fire=false;a.intent.sub=true;a._updateSpecial(1/60);assert.equal(a.specialActive.pose,'cannon');
 a.intent.sub=false;for(let i=0;i<21;i++)a._updateSpecial(1/60);
 const cannon=f.G.projectiles.list.find(p=>p.s3AllSpecial==='crabTank'&&p.s3AllSpecialMode!=='shooter');assert.ok(cannon);assert.equal(cannon.damage,50);
 a.intent.squid=true;a._updateSpecial(1/60);assert.equal(a._s3AllSpecialState.ballMode,true);assert.equal(a.specialActive.pose,'ball');
 const before=f.G.projectiles.list.length;a.intent.fire=true;a._updateSpecial(1/60);assert.equal(f.G.projectiles.list.length,before,'ball mode suppresses both weapon lanes');
 assert.ok(events.some(e=>e.action==='cannon'));
 const hp=a.hp,front=f.make(),rear=f.make();front.pos.set(0,0,5);rear.pos.set(0,0,-5);
 a.damage(10,front,'shooter');assert.equal(a._s3AllSpecialState.armorHP,490);assert.equal(a.hp,hp);
 a.damage(10,rear,'shooter');assert.equal(a.hp,hp-10,'the rear core bypasses shell armor');
});

test('Reefslider fire can stop the dash early and cause its damage impact',async()=>{
 const f=await setup(),a=f.make(),victim=f.make();equip(a,'reefslider');victim.team=1;victim.pos.set(0,0,5);f.G.actors=[a,victim];
 a._resolve=()=>{};
 const hits=[],apply=f.G.projectiles.applyHit;f.G.projectiles.applyHit=function(...args){hits.push(args);return apply.apply(this,args);};
 const events=eventFeed(f,'all:special');a._startSpecial();for(let i=0;i<38;i++)a._updateSpecial(1/60);
 assert.equal(a._s3AllSpecialState.phase,'dash');
 for(let i=0;i<14;i++)a._updateSpecial(1/60);
 a.intent.fire=true;a._updateSpecial(1/60);a.intent.fire=false;
 assert.equal(a._s3AllSpecialState.phase,'brake','a release after 15F begins sourced braking, not an instant explosion');
 assert.equal(events.some(e=>e.action==='impact'),false);
 for(let i=0;i<38&&a._s3AllSpecialState?.phase==='brake';i++)a._updateSpecial(1/60);
 assert.equal(a._s3AllSpecialState.phase,'recovery');
 assert.ok(events.some(e=>e.action==='impact'));
 assert.ok(hits.some(h=>h[1]===victim&&h[2]===220&&h[3]==='reefslider'));
 for(let i=0;i<28&&a.specialActive;i++)a._updateSpecial(1/60);
 assert.equal(a.specialActive,null,'recovery ends after the full 28F window');
});

test('Killer Wail beams tick through terrain and the main weapon remains live during the special',async()=>{
 const f=await setup(),a=f.make(),victim=f.make();equip(a,'killerWail');victim.team=1;victim.pos.set(0,1,5);f.G.actors=[a,victim];
 f.G.physics.los=()=>false;const hits=[],apply=f.G.projectiles.applyHit;f.G.projectiles.applyHit=function(...args){hits.push(args);return apply.apply(this,args);};
 a._startSpecial();a.intent.fire=true;for(let i=0;i<40;i++)a._updateSpecial(1/60);
 assert.ok(f.G.projectiles.list.some(p=>p.owner===a&&!p.s3AllSpecial),'main fire still uses the native weapon runner');
 const beam=hits.find(h=>h[1]===victim&&h[3]==='killerWail');assert.ok(beam);assert.equal(beam[2],3.5,'Wail damage is a 3.5 tick, not a one-hit burst');
});

test('Booyah cheer accepts distinct calls up to the source cap and rejects duplicate or stale remote calls',async()=>{
 const f=await setup(),owner=f.make(),ally=f.make(),ally2=f.make();equip(owner,'booyahBomb');
 Object.assign(ally,{team:owner.team,isLocal:true,nid:22,netLife:3});Object.assign(ally2,{team:owner.team,isLocal:true,nid:23,netLife:3});
 owner.nid=11;owner.netLife=4;f.G.actors=[owner,ally,ally2];
 const events=eventFeed(f,'all:special');owner._startSpecial();const state=owner._s3AllSpecialState,before=state.charge;
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
 owner.intent.fire=true;owner._startSpecial();owner._updateSpecial(1/60);
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
test('Zipcaster special-power AP controls native hook cost and time drain at 30/60/120 Hz',async()=>{
 const f=await setup();const {emptyLoadout,gearCurve}=await import('../runtime/gear.mjs');
 for(const ap of [0,10,57])for(const hz of [30,60,120]){
  const a=f.make();a.s3.loadout=emptyLoadout();if(ap===10)a.s3.loadout[0].main='specialPower';if(ap===57)for(const p of a.s3.loadout){p.main='specialPower';p.subs.fill('specialPower');}a.s3RefreshGear();equip(a,'zipcaster');f.G.actors=[a];
  a._startSpecial();const s=a._s3AllSpecialState,drain=gearCurve(ap,15,13.05,12),hook=gearCurve(ap,4,2.5,1.5);
  for(let i=0;i<hz;i++)a._updateSpecial(1/hz);
  assert.ok(Math.abs(s.inkFuel-(150-drain))<1e-8,`${ap}AP ${hz}Hz drain`);
  const before=s.inkFuel;a.intent.sub=true;a._updateSpecial(1/hz);
  assert.ok(Math.abs(before-s.inkFuel-(hook+drain/hz))<1e-8,`${ap}AP ${hz}Hz hook`);
  assert.equal(s.phase,'zip');
 }
});

test('Reefslider snapshots special-power paint and damage-distance curves without increasing damage',async()=>{
 const f=await setup();const {emptyLoadout,gearCurve}=await import('../runtime/gear.mjs');
 for(const ap of [0,10,57]){
  const a=f.make(),near=f.make(),far=f.make();near.team=far.team=1;near.pos.set(9.7,-.75,0);far.pos.set(16,-.75,0);f.G.actors=[a,near,far];
  a.s3.loadout=emptyLoadout();if(ap===10)a.s3.loadout[0].main='specialPower';if(ap===57)for(const p of a.s3.loadout){p.main='specialPower';p.subs.fill('specialPower');}a.s3RefreshGear();equip(a,'reefslider');a._resolve=()=>{};
  const hits=[],old=f.G.projectiles.applyHit;f.G.projectiles.applyHit=(...args)=>{hits.push(args);};
  a._startSpecial();const s=a._s3AllSpecialState,scale=gearCurve(ap,1,1.1,1.2);
  assert.equal(s.paintRadius,gearCurve(ap,7.51,8.26,9.012));assert.equal(s.damageDistanceRate,scale);
  a.s3.loadout=emptyLoadout();a.s3RefreshGear();assert.equal(s.damageDistanceRate,scale,'activation snapshot');
  s.phase='dash';s.dashT=15/60;s.reefSpeedRaw=0;
  a.intent.fire=true;a._updateSpecial(1/60);a.intent.fire=false;
  assert.equal(s.phase,'brake');
  for(let i=0;i<38&&s.phase==='brake';i++)a._updateSpecial(1/60);
  assert.equal(s.phase,'recovery');
  const hit=hits.find(h=>h[1]===near);assert.ok(hit);assert.ok(hit[2]<=220);assert.equal(hits.some(h=>h[1]===far),16<=14.9*scale);
  f.G.projectiles.applyHit=old;
 }
});

test('Screen source movement follows activation AP and remote device replay preserves it',async()=>{
 const f=await setup();const {emptyLoadout,gearCurve}=await import('../runtime/gear.mjs');
 for(const ap of [0,10,57]){
  const a=f.make();a.s3.loadout=emptyLoadout();if(ap===10)a.s3.loadout[0].main='specialPower';if(ap===57)for(const p of a.s3.loadout){p.main='specialPower';p.subs.fill('specialPower');}a.s3RefreshGear();equip(a,'splattercolorScreen');f.G.actors=[a];
  const events=eventFeed(f,'all:special');a._startSpecial();a.s3.loadout=emptyLoadout();a.s3RefreshGear();a.intent.fire=true;a._updateSpecial(1/60);
  const o=f.G.projectiles._s3AllSpecialObjects.find(x=>x.owner===a&&x.kind==='screen');assert.ok(o);assert.equal(o.moveSpeed,gearCurve(ap,.04,.053,.06)*60);assert.equal(o.specialPowerAP,ap);
  const event=events.find(e=>e.action==='deploy'&&e.kind==='screen');assert.ok(event);assert.equal(event.specialPowerAP,ap);
  const remote=f.make();remote.remote=true;f.replayAllSpecials(f,{...event,actor:remote});const ghost=f.G.projectiles._s3AllSpecialObjects.find(x=>x.owner===remote&&x.kind==='screen');assert.ok(ghost);assert.equal(ghost.moveSpeed,o.moveSpeed);
 }
});

test('Screen travel integrates startup and closing boundaries identically at 30/60/120 Hz',async()=>{
 const f=await setup();const distances=[];
 for(const hz of [30,60,120]){
  f.G.projectiles.clear();const a=f.make();equip(a,'splattercolorScreen');f.G.actors=[a];a._startSpecial();a.intent.fire=true;a._updateSpecial(1/60);
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
  a._startSpecial();a.intent.sub=true;a._updateSpecial(1/60);const p=f.G.projectiles.list.at(-1);f.G.projectiles._blastBurst(p,new f.THREE.Vector3(0,.08,0),null);f.G.projectiles.list.length=0;
  let sum=0;const hit=f.G.projectiles.applyHit;f.G.projectiles.applyHit=(owner,victim,damage,id)=>{if(victim===v&&id==='booyahBomb')sum+=damage;return hit.call(f.G.projectiles,owner,victim,damage,id);};
  for(let i=0;i<2*hz;i++){f.G.time+=1/hz;f.G.projectiles.update(1/hz);}
  f.G.projectiles.applyHit=hit;assert.ok(Math.abs((1000-v.hp)-sum)<1e-7,'actual victim HP');totals.push(sum);
 }
 assert.ok(totals[0]>0);assert.ok(Math.max(...totals)-Math.min(...totals)<1e-8,JSON.stringify(totals));
});

test('recycling a special round cannot give a later main weapon special paint, blast or damage aging',async()=>{
 const f=await setup(),a=f.make();equip(a,'booyahBomb');f.G.actors=[a];a._startSpecial();a.intent.sub=true;a._updateSpecial(1/60);
 const p=f.G.projectiles.list.at(-1);assert.equal(p.s3AllSpecial,'booyahBomb');p.s3DamageReduce={max:32,min:16,start:0,end:1};p.s3TentaTarget=new f.THREE.Vector3(100,100,100);
 f.G.projectiles.clear();const recycled=f.G.projectiles._new();assert.equal(recycled,p);
 for(const key of ['s3AllSpecial','s3AllSpecialPaintRadius','s3AllSpecialActivation','s3AllSpecialSeed','s3DamageReduce','s3TentaTarget'])assert.equal(recycled[key],undefined,key);
});

test('Inkjet power snapshot survives the actual projectile packet and ghost without increasing direct damage',async()=>{
 const f=await setup();const {emptyLoadout,gearCurve}=await import('../runtime/gear.mjs');
 for(const ap of [0,10,57]){
  f.G.projectiles.clear();const a=f.make();a.nid=7;a.s3.loadout=emptyLoadout();if(ap===10)a.s3.loadout[0].main='specialPower';if(ap===57)for(const p of a.s3.loadout){p.main='specialPower';p.subs.fill('specialPower');}a.s3RefreshGear();equip(a,'inkjet');f.G.actors=[a];a._resolve=()=>{};
  a._startSpecial();a.s3.loadout=emptyLoadout();a.s3RefreshGear();a.intent.fire=true;a._updateSpecial(1/60);
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
  f.G.projectiles.clear();f.G.netm=null;const a=f.make();a.nid=7;a._resolve=()=>{};equip(a,id);f.G.actors=[a];if(id==='tentaMissiles'){const target=f.make();target.team=1;target.pos.set(0,0,8);f.G.actors.push(target);}a._startSpecial();a.intent.fire=id==='inkjet';a.intent.sub=id!=='inkjet'&&id!=='crabTank';
  for(let i=0;i<40&&a.specialActive;i++){if(id==='crabTank'&&i===21)a.intent.sub=true;a._updateSpecial(1/60);}
  const p=f.G.projectiles.list.find(x=>x.s3AllSpecial===id);assert.ok(p,id+' emitted');
  const nm=new f.NetMatch({myId:'owner'},{});nm.recProj(p);const packet=JSON.parse(JSON.stringify(nm.out.at(-1)));assert.equal(packet[4],id);
  const remote=f.make();remote.remote=true;remote.nid=7;const before=f.G.projectiles.list.length;f.G.projectiles.ghostProjectile(remote,packet);assert.equal(f.G.projectiles.list.length,before+1,id+' accepted');const ghost=f.G.projectiles.list.at(-1);assert.equal(ghost.s3SpecialWeapon.id,id);assert.equal(ghost.damage,0);
 }
});

test('world effect clock rejects invalid elapsed time and clear removes its remainder',async()=>{
 const f=await setup(),a=f.make();equip(a,'splattercolorScreen');f.G.actors=[a];a._startSpecial();a.intent.fire=true;a._updateSpecial(1/60);
 const sys=f.G.projectiles,o=sys._s3AllSpecialObjects[0];sys.update(1/120);const age=o.age,clock=sys._s3AllSpecialWorldClock;
 for(const dt of [NaN,Infinity,-1,0]){sys.update(dt);assert.equal(o.age,age);assert.equal(sys._s3AllSpecialWorldClock,clock);}
 sys.clear();assert.equal(sys._s3AllSpecialWorldClock,0);assert.equal(sys._s3AllSpecialObjects.length,0);
});

test('Super Chump activation power scales decoy paint and blast reach but never damage or HP',async()=>{
 const f=await setup();const {emptyLoadout,gearCurve}=await import('../runtime/gear.mjs');
 for(const ap of [0,10,57]){
  f.G.projectiles.clear();f.G.netm=null;const a=f.make();a.s3.loadout=emptyLoadout();if(ap===10)a.s3.loadout[0].main='specialPower';if(ap===57)for(const p of a.s3.loadout){p.main='specialPower';p.subs.fill('specialPower');}a.s3RefreshGear();equip(a,'superChump');f.G.actors=[a];
  const events=eventFeed(f,'all:special');a._startSpecial();a.s3.loadout=emptyLoadout();a.s3RefreshGear();a.intent.fire=true;a._updateSpecial(1/60);
  const objects=f.G.projectiles._s3AllSpecialObjects.filter(o=>o.owner===a&&o.kind==='decoy');assert.equal(objects.length,12);assert.deepEqual(objects.map(o=>Math.round(o.startDelay*60)),Array.from({length:12},(_,i)=>80+4*i));
  const o=objects[0],rate=gearCurve(ap,1,1.1,1.2);assert.equal(o.specialPowerAP,ap);assert.equal(o.paintRadius,gearCurve(ap,3.5,3.8,4.1));assert.equal(o.maxRadius,6*rate);assert.deepEqual(JSON.parse(JSON.stringify(o.damageBands)),[[3.6*rate,70],[6*rate,35]]);assert.equal(o.hp,60);
  const event=events.find(e=>e.kind==='decoy'&&e.action==='deploy'),remote=f.make();remote.remote=true;f.replayAllSpecials(f,{...event,actor:remote});const ghost=f.G.projectiles._s3AllSpecialObjects.find(x=>x.owner===remote);assert.equal(ghost.maxRadius,o.maxRadius);assert.equal(ghost.paintRadius,o.paintRadius);
  const v=f.make();v.team=1;v.pos.copy(o.target);v.pos.x+=6.5;v.pos.y-=.75;f.G.actors=[a,v];f.G.projectiles._s3AllSpecialObjects=[o];const hits=[],old=f.G.projectiles.applyHit;f.G.projectiles.applyHit=(...args)=>hits.push(args);o.phase='active';o.pos.copy(o.target);o.age=o.dur-1/60;f.G.projectiles.update(1/60);f.G.projectiles.applyHit=old;
  assert.equal(hits.some(h=>h[1]===v),6.5<=o.maxRadius);for(const h of hits)assert.ok(h[2]<=70);
 }
});

test('Tenta Missiles retain the source paint-power curve in their launch and remote descriptor',async()=>{
 const f=await setup();const {emptyLoadout,gearCurve}=await import('../runtime/gear.mjs');
 for(const ap of [0,10,57]){
  f.G.projectiles.clear();f.G.netm=null;const a=f.make();a.nid=7;a.s3.loadout=emptyLoadout();if(ap===10)a.s3.loadout[0].main='specialPower';if(ap===57)for(const p of a.s3.loadout){p.main='specialPower';p.subs.fill('specialPower');}a.s3RefreshGear();equip(a,'tentaMissiles');const target=f.make();target.team=1;target.pos.set(0,0,8);f.G.actors=[a,target];a._resolve=()=>{};
  a._startSpecial();a.s3.loadout=emptyLoadout();a.s3RefreshGear();a.intent.sub=true;a._updateSpecial(1/60);
  const p=f.G.projectiles.list.find(x=>x.s3AllSpecial==='tentaMissiles'),radius=gearCurve(ap,3.15,3.465,3.78);assert.ok(p);assert.equal(p.s3AllSpecialPaintRadius,radius);assert.equal(p.s3SpecialWeapon.paintRadius,Math.min(3.74,radius));assert.equal(p.s3SpecialWeapon.directDamage,150);
  const nm=new f.NetMatch({myId:'owner'},{});nm.recProj(p);const packet=JSON.parse(JSON.stringify(nm.out.at(-1))),remote=f.make();remote.remote=true;remote.nid=7;
  f.G.projectiles.ghostProjectile(remote,packet);const ghost=f.G.projectiles.list.at(-1);assert.equal(ghost.s3SpecialWeapon.specialPowerAP,ap);assert.equal(ghost.s3SpecialWeapon.paintRadius,p.s3SpecialWeapon.paintRadius);assert.equal(ghost.damage,0);
 }
});
