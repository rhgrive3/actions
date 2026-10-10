import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

const EXTRA=`export {replaySpecial as replayAllSpecials,ALL_SPECIALS,ALL_SPECIALS_STATUS} from './patches/splatoon3/runtime/all-specials.mjs';`;
async function setup(){const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:EXTRA});f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};return f;}
function equip(actor,id){actor.weapon={...actor.weapon,special:id,specialCost:100};actor.special=100;actor.alive=true;actor.remote=false;actor.intent.fire=false;actor.intent.sub=false;actor.intent.jump=false;actor._prevIntent ||= {};Object.assign(actor._prevIntent,{fire:false,sub:false,jump:false,squid:false,booyah:false});}
function tickWorld(f,frames){for(let i=0;i<frames;i++){f.G.time+=1/60;f.G.projectiles.update(1/60);}}
function eventFeed(f,name){const rows=[];f.on(name,e=>rows.push(e));return rows;}

test('missing special inventory is source versioned and Tenta launch uses native rounds and a finite bus record',async()=>{
 const f=await setup(),a=f.make(),victim=f.make();equip(a,'tentaMissiles');victim.team=1;victim.pos.set(0,0,5);f.G.actors=[a,victim];
 const rows=eventFeed(f,'all:special'),before=f.G.projectiles.list.length;a._startSpecial();a.intent.fire=true;a._updateSpecial(1/60);
 assert.equal(a.stats.specials,1);assert.equal(a.specialActive,null);assert.equal(f.G.projectiles.list.length-before,10);
 assert.ok(rows.some(e=>e.action==='launch'&&e.count===10));
 for(const e of rows){assert.ok([e.pos,...(e.target?[e.target]:[])].flat().every(Number.isFinite));assert.ok(Number.isInteger(e.seed)&&e.seed>=0&&e.seed<=0xffffffff);}
 assert.deepEqual(Object.keys(f.ALL_SPECIALS).sort(),['booyahBomb','crabTank','inkjet','killerWail','krakenRoyale','reefslider','splattercolorScreen','superChump','tentaMissiles','tripleInkstrike','ultraStamp','waveBreaker','zipcaster'].sort());
 assert.match(f.ALL_SPECIALS_STATUS.reference,/11\.3\.0/);assert.match(f.ALL_SPECIALS_STATUS.calibration,/world-unit mapping/);
});

test('Tenta Missiles rise, dive onto the locked ground coordinate, and apply impact damage',async()=>{
 const f=await setup(),a=f.make(),victim=f.make();equip(a,'tentaMissiles');victim.team=1;victim.pos.set(0,0,8);f.G.actors=[a,victim];
 a._startSpecial();a.intent.fire=true;a._updateSpecial(1/60);const missiles=f.G.projectiles.list.filter(p=>p.s3AllSpecial==='tentaMissiles');
 assert.equal(missiles.length,10);assert.ok(missiles.every(p=>p.s3TentaTarget instanceof f.THREE.Vector3));
 const target=missiles[0].s3TentaTarget.clone();tickWorld(f,120);
 assert.ok(missiles[0].s3TentaDescending);assert.ok(missiles[0].pos.distanceTo(target)<3.5);
 assert.ok(victim.hp<100,'the descended native missile round reaches its locked target and damages it');
});

test('Wave Breaker keeps source pulse schedule and owner-owned device survives owner death',async()=>{
 const f=await setup(),a=f.make(),victim=f.make();equip(a,'waveBreaker');victim.team=1;victim.pos.set(0,0,17);f.G.actors=[a,victim];
 const hits=[],apply=f.G.projectiles.applyHit;f.G.projectiles.applyHit=function(...args){hits.push(args);return apply.apply(this,args);};
 a._startSpecial();a.intent.fire=true;a._updateSpecial(1/60);
 const device=f.G.projectiles._s3AllSpecialObjects.find(o=>o.kind==='wave');assert.ok(device);assert.equal(device.hp,480);
 assert.deepEqual(Array.from(device.pulseFrames),[90/60,240/60,390/60]);assert.equal(device.maxWaveFrame,160/60);
 tickWorld(f,100);assert.ok(hits.some(h=>h[3]==='waveBreaker'&&h[2]===45));assert.ok(device.waves.length>=1);
 a.alive=false;tickWorld(f,200);assert.ok(f.G.projectiles._s3AllSpecialObjects.includes(device));
 tickWorld(f,310);assert.equal(f.G.projectiles._s3AllSpecialObjects.includes(device),false);
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
 assert.equal(a.ink,normalInk,'the temporary Zipcaster tank does not overwrite the normal tank');assert.ok(state.inkFuel<fuel-13.05*fireFrames/60-.5,'main firing and time drain consume the single special tank');
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
 assert.equal(a._s3AllSpecialState.phase,'dash');a.intent.fire=true;a._updateSpecial(1/60);
 assert.equal(a.specialActive,null);assert.ok(events.some(e=>e.action==='impact'));
 assert.ok(hits.some(h=>h[1]===victim&&h[2]===220&&h[3]==='reefslider'));
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
 ally.intent.booyah=true;owner._updateSpecial(1/60);assert.ok(Math.abs(state.charge-Math.min(1,before+.09))<1e-9);
 ally.intent.booyah=false;owner._updateSpecial(1/60);const secondBefore=state.charge;ally.intent.booyah=true;owner._updateSpecial(1/60);
 assert.ok(Math.abs(state.charge-secondBefore-.046)<1e-9,'a new rising edge from the same ally contributes the second capped amount plus one auto-charge frame');
 ally.intent.booyah=false;owner._updateSpecial(1/60);const ally2Before=state.charge;ally2.intent.booyah=true;owner._updateSpecial(1/60);
 assert.ok(Math.abs(state.charge-ally2Before-.09)<1e-9,'a second ally starts its own five-call contribution schedule');
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
