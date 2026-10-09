import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './clothing-gear-fixture.mjs';
import { emptyLoadout, normalizeLoadout, abilityPoints, gearCurve } from '../runtime/gear.mjs';
import { FixedClock } from '../runtime/clock.mjs';
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-9, `${a} != ${b}`);
const extra = "export * from './inkwave-public/src/net/netmatch.js'; export * from './patches/splatoon3/runtime/clothing-gear.mjs';";
async function setup(options){const f=await fixture(options);f.profile.flow.threshold=1e6;f.G.level.spawnPads=[new f.THREE.Vector3(),new f.THREE.Vector3()];return f;}
function dress(a, main='none', ap=0, ability='quickRespawn'){
 a.s3.loadout=emptyLoadout();a.s3.loadout[1].main=main;
 if(ap===57)for(const p of a.s3.loadout){p.main=ability;p.subs.fill(ability);}
 else if(ap===30)for(const p of a.s3.loadout)p.main=ability;
 else if(ap===10)a.s3.loadout[0].main=ability;
 else if(ap===3||ap===6)for(let i=0;i<ap/3;i++)a.s3.loadout[0].subs[i]=ability;
 a.setWeapon(a.weaponId);
}
test('fixed clothing abilities reject other slots and doubler requires an explicit Splatfest Tee',()=>{
 for(const id of ['respawnPunisher','abilityDoubler'])for(let p=0;p<3;p++)for(let slot=0;slot<4;slot++){
  const l=emptyLoadout();if(id==='abilityDoubler')l[p].item='splatfestTee';if(slot===0)l[p].main=id;else l[p].subs[slot-1]=id;
  const n=normalizeLoadout(l);assert.equal(slot===0?n[p].main:n[p].subs[slot-1],p===1&&slot===0?id:'none');
 }
 const l=emptyLoadout();l[1].main='abilityDoubler';assert.equal(normalizeLoadout(l)[1].main,'none');
});
test('doubler counts only the equipped Tee subs as6, excludes its own10 and leaves other pieces10/3',()=>{
 const l=emptyLoadout();l[1]={item:'splatfestTee',main:'abilityDoubler',subs:['runSpeed','swimSpeed','inkRecovery']};
 assert.deepEqual(abilityPoints(l),{runSpeed:6,swimSpeed:6,inkRecovery:6});
 l[1].subs.fill('runSpeed');assert.deepEqual(abilityPoints(l),{runSpeed:18});
 for(const p of [0,2])l[p]={main:'runSpeed',subs:Array(3).fill('runSpeed')};assert.deepEqual(abilityPoints(l),{runSpeed:56});
 l[1].subs.fill('none');assert.deepEqual(abilityPoints(l),{runSpeed:38});
 assert.equal(abilityPoints(l).abilityDoubler,undefined);
});
test('Tee AP reaches actual actor modifiers, survives reset and does not mutate another actor',async()=>{
 const f=await setup(),a=f.make(),b=f.make();a.s3.loadout[1]={item:'splatfestTee',main:'abilityDoubler',subs:Array(3).fill('runSpeed')};a.setWeapon('shooter');
 near(a.s3.modifiers.runSpeed,1.25326);near(b.s3.modifiers.runSpeed,1);const l=JSON.stringify(a.s3.loadout);a.reset();near(a.s3.modifiers.runSpeed,1.25326);assert.equal(JSON.stringify(a.s3.loadout),l);
 a.s3.loadout[1].main='none';a.setWeapon('shooter');near(a.s3.modifiers.runSpeed,1.137565);
});
test('RP final-killer/self/both branches add45/68/113F and15/22.5/37.5 percent of pre-death gauge',async()=>{
 for(const [own,killer,frames,left] of [[false,false,0,.5],[false,true,45,.35],[true,false,68,.275],[true,true,113,.125]]){
  const f=await setup(),a=f.make(),e=f.make();e.team=1;dress(a,own?'respawnPunisher':'none');dress(e,killer?'respawnPunisher':'none');
  a.special=80;a.splat(e);near(a.respawnTimer,f.PLAYER.respawnTime+frames/60);near(a.special,80*left);
  const timer=a.respawnTimer,sp=a.special;a.splat(e);near(a.respawnTimer,timer);near(a.special,sp);
 }
});
test('RP excludes water/fall with stale enemy attribution, no attacker, self and allies; no penalty carries to another death',async()=>{
 for(const cause of ['water','fall','out','bounds','void','no-attacker','self','ally']){
  const f=await setup(),a=f.make(),e=f.make();dress(a,'respawnPunisher');dress(e,'respawnPunisher');e.team=cause==='ally'?0:1;a.special=80;
  a.splat(cause==='no-attacker'?null:cause==='self'?a:e,cause);near(a.special,['water','fall','out','bounds','void'].includes(cause)?22:40);near(a.s3.lastDeathGear.frames,0);
 }
 const f=await setup(),a=f.make(),e=f.make();e.team=1;dress(e,'respawnPunisher');a.splat(e);a.reset();a.special=80;a.splat(e,'water');near(a.special,40);near(a.s3.lastDeathGear.frames,0);
});
test('RP transforms incoming QR AP by ceiling .15 before the curve, never multiplies a finished time reduction',async()=>{
 for(const [gp,expected] of [[0,0],[3,1],[6,1],[10,2],[30,5],[57,9]]){
  const f=await setup(),a=f.make(),e=f.make();e.team=1;dress(a,'none',gp);dress(e,'respawnPunisher');a.s3.quickRespawnHistory.seenEnemyDeath=true;a.splat(e);
  assert.equal(a.s3.lastDeathGear.qrAP,expected);near(a.respawnTimer,f.PLAYER.respawnTime+45/60-(f.profile.gearExtra.quickRespawnAroundFrames[0]+f.profile.respawnChaseTime*60-Math.floor(gearCurve(expected,...f.profile.gearExtra.quickRespawnAroundFrames)+1e-10)-Math.floor(f.profile.respawnChaseTime*60*gearCurve(expected,...f.profile.gear.quickRespawn)+1e-10))/60);
 }
});
test('RP transforms incoming Special Saver AP by .7, preserves fractional AP and does not suppress a lone wearer own gear',async()=>{
 for(const gp of [0,3,10,30,57]){
  const f=await setup(),a=f.make(),e=f.make();e.team=1;dress(a,'none',gp,'specialSaver');dress(e,'respawnPunisher');a.special=80;a.splat(e);
  near(a.s3.lastDeathGear.saverAP,gp*.7);near(a.special,80*Math.max(0,gearCurve(gp*.7,...f.profile.gear.specialSaver)-.15));
 }
 const f=await setup(),a=f.make(),e=f.make();e.team=1;dress(a,'respawnPunisher',3,'specialSaver');a.special=80;a.splat(e);near(a.s3.lastDeathGear.saverAP,3);near(a.special,80*(gearCurve(3,...f.profile.gear.specialSaver)-.225));
});
test('RP assist-only contributors do not penalize a victim killed by someone else',async()=>{
 const f=await setup(),a=f.make(),e=f.make(),helper=f.make();e.team=1;dress(helper,'respawnPunisher');e.special=80;
 f.emit('damage',{attacker:helper,victim:e,amount:20,source:'shooter'});e.splat(a);near(e.special,40);near(e.respawnTimer,f.PLAYER.respawnTime);
});
test('real NetMatch sends distinct bit25 without changing current24 columns and rejects foreign/stale snapshots',async()=>{
 const f=await setup(),a=f.make();a.nid=1;a.owner='owner';dress(a,'respawnPunisher');
 let packet;const n=new f.NetMatch({myId:'owner',hostId:'owner',isHost:true,tr:{broadcast:d=>{packet=JSON.parse(JSON.stringify(d));}}},{id:'clothing'});n.bind({actors:[a],state:'playing',time:180});n._sendTick();
 const row=packet.a[0];assert.equal(row.length,24);assert.ok(row[10]&f.RESPAWN_PUNISHER_FLAG);
 const remote=f.make();remote.owner='owner';remote.nid=1;
 const receiver=new f.NetMatch({myId:'viewer',hostId:'owner',isHost:false},{id:'clothing'});receiver.bind({actors:[remote],state:'playing',time:180});
 receiver._tick('foreign',{...packet,ts:1});assert.equal(f.respawnPunisherEquipped(remote),false);
 receiver._tick('owner',{...packet,ts:2});assert.equal(f.respawnPunisherEquipped(remote),true);
 const clear=[...row];clear[10]&=~f.RESPAWN_PUNISHER_FLAG;receiver._tick('owner',{...packet,ts:1,a:[clear]});assert.equal(f.respawnPunisherEquipped(remote),true);
 clear[23][2]=++a._adoptionSequence;receiver._tick('owner',{...packet,ts:3,a:[clear]});assert.equal(f.respawnPunisherEquipped(remote),false);remote.owner='new-owner';assert.equal(f.respawnPunisherEquipped(remote),false);
});
for(const legacyClothingHit of [true,false]) test(`real NetMatch hit-local RP next-tick ${legacyClothingHit?'old loss negative':'preservation positive'}`,async()=>{
 const f=await setup({legacyClothingHit}),a=f.make(),v=f.make();a.team=1;a.nid=2;a.owner='attacker';v.nid=1;v.owner='victim';a.netLife=v.netLife=0;dress(a,'respawnPunisher');
 let packet;const sender=new f.NetMatch({myId:'attacker',hostId:'attacker',isHost:true,tr:{sendTo:(_id,d)=>{packet=JSON.parse(JSON.stringify(d));}}},{id:'clothing'});sender.bind({actors:[a,v],state:'playing',time:180});sender.sendHit(a,v,100,'shooter');assert.equal(packet.rp,true);
 const receiver=new f.NetMatch({myId:'victim',hostId:'attacker',isHost:false,tr:{sendTo(){}}},{id:'clothing'});receiver.bind({actors:[a,v],state:'playing',time:180});a.s3.loadout=emptyLoadout();f.G.netm=receiver;
 f.G.projectiles.applyHit=(atk,target)=>target.damage(100,atk,'shooter');v.special=80;v.invuln=0;
 receiver.onMessage('wrong',packet);assert.equal(v.hp,100);receiver.onMessage('attacker',packet);assert.equal(v.alive,true,'accepted lethal stays deferred');assert.equal(v.hp,0);assert.equal(a.s3.clothingHitPunisher,undefined);
 f.tick(v);near(v.special,legacyClothingHit?40:28);near(v.respawnTimer,f.PLAYER.respawnTime+(legacyClothingHit?0:.75)-1/60);assert.equal(a.s3.clothingHitPunisher,undefined);
 v.reset();v.invuln=0;packet={...packet,h:packet.h+1,l:v.netLife};f.G.projectiles.applyHit=()=>{throw Error('injected');};assert.throws(()=>receiver.onMessage('attacker',packet),/injected/);assert.equal(a.s3.clothingHitPunisher,undefined);assert.equal(receiver._applyingHit,undefined);
});

test('RP death countdown and retained gauge are independent of30/60/120Hz presentation schedules',async()=>{
 const traces=[];for(const hz of[30,60,120]){const f=await setup(),a=f.make(),e=f.make();e.team=1;dress(e,'respawnPunisher');a.special=80;a.splat(e);const c=new FixedClock(),trace=[];for(let i=0;i<hz*2;i++)c.advance(1/hz,dt=>{f.G.time+=dt;a.update(dt);trace.push([a.respawnTimer,a.special,a.alive]);});traces.push(trace);}assert.equal(traces[0].length,120);assert.deepEqual(traces[0],traces[1]);assert.deepEqual(traces[1],traces[2]);
});

test('actual snapshot flags keep clothing and vertical Roller state independent in all four combinations',async()=>{
 const f=await setup();
 for(const punisher of [false,true])for(const vertical of [false,true]){
  const a=f.make('roller'),remote=f.make('roller');Object.assign(a,{nid:1,owner:'owner'});Object.assign(remote,{nid:1,owner:'owner'});dress(a,punisher?'respawnPunisher':'none');
  a.grounded=!vertical;if(vertical)f.emit('actor:jump',{actor:a});
  a.intent.fire=true;f.G.time+=1/60;a.weaponRunner.update(1/60,{fire:true,firePressed:true});
  assert.equal(a.weaponRunner.s3RollerAttack?.vertical,vertical,'native admission selects the complete owner action');
  let packet;const sender=new f.NetMatch({myId:'owner',hostId:'owner',isHost:true,tr:{broadcast:d=>{packet=JSON.parse(JSON.stringify(d));}}},{id:'flags'});sender.bind({actors:[a],state:'playing',time:180});sender._sendTick();
  const flags=packet.a[0][10],roller=f.NET_FLAGS.flickVertical;assert.equal(roller,16777216);assert.equal(f.RESPAWN_PUNISHER_FLAG,33554432);assert.equal(roller&f.RESPAWN_PUNISHER_FLAG,0);assert.equal(!!(flags&roller),vertical);assert.equal(!!(flags&f.RESPAWN_PUNISHER_FLAG),punisher);
  const receiver=new f.NetMatch({myId:'viewer',hostId:'owner',isHost:false},{id:'flags'});receiver.bind({actors:[remote],state:'playing',time:180});receiver.onMessage('owner',packet);receiver._peer('owner').tr=packet.ts;receiver._sample(remote,packet.ts,0);receiver.applyRemote(remote,1/60);
  assert.equal(f.respawnPunisherEquipped(remote),punisher);assert.equal(remote.weaponRunner.s3FlickVertical,false,'wire pose never becomes a simulated remote attack');assert.equal(remote.weaponRunner.s3RollerAttack,null);assert.equal(remote.character.s3RollerFlick?.vertical,vertical);
  if(punisher&&!vertical){const alias=JSON.parse(JSON.stringify(packet));alias.ts+=1;alias.a[0][23][2]=++a._adoptionSequence;alias.a[0][10]=(flags&~f.RESPAWN_PUNISHER_FLAG)|roller;receiver.onMessage('owner',alias);receiver._peer('owner').tr=alias.ts;receiver._sample(remote,alias.ts,0);receiver.applyRemote(remote,1/60);assert.equal(f.respawnPunisherEquipped(remote),false,'legacy shared-bit encoding cannot carry clothing');assert.equal(remote.weaponRunner.s3FlickVertical,false,'legacy shared-bit encoding cannot grant remote attack authority');assert.equal(remote.character.s3RollerFlick?.vertical,false,'accepted horizontal sidecar owns pose despite a conflicting legacy flag');}
 }
});
test('Tee subtotal combines once with current Last Ditch and Comeback AP without losing head ownership',async()=>{
 const f=await setup(),a=f.make();f.G.match={state:'playing',duration:180,time:20,attract:false,bossMode:false,playing:()=>true};
 a.s3.loadout=emptyLoadout();a.s3.loadout[0].main='lastDitchEffort';a.s3.loadout[1]={item:'splatfestTee',main:'abilityDoubler',subs:Array(3).fill('inkSaverMain')};a.setWeapon('shooter');
 assert.equal(abilityPoints(a.s3.loadout).inkSaverMain,18);near(a.s3.modifiers.inkSaverMain,gearCurve(36,...f.profile.gear.inkSaverMain));
 f.G.match.time=40;f.tick(a);near(a.s3.modifiers.inkSaverMain,gearCurve(18,...f.profile.gear.inkSaverMain));
 a.s3.loadout[0].main='comeback';a.s3.loadout[1].subs.fill('runSpeed');a.setWeapon('shooter');a.s3.conditionalGear.comeback=20;f.tick(a);near(a.s3.modifiers.runSpeed,gearCurve(28,...f.profile.gear.runSpeed));
 a.s3.conditionalGear.comeback=1/60;f.tick(a);near(a.s3.modifiers.runSpeed,gearCurve(18,...f.profile.gear.runSpeed));
});
for(const acceptedPunisher of [false,true])test(`accepted lethal RP=${acceptedPunisher} survives remote-to-local ownership change`,async()=>{
 const f=await setup(),a=f.make(),v=f.make();Object.assign(a,{team:1,nid:2,owner:'attacker',netLife:0});Object.assign(v,{nid:1,owner:'victim',netLife:0});dress(a,acceptedPunisher?'respawnPunisher':'none');
 let packet;const sender=new f.NetMatch({myId:'attacker',hostId:'attacker',isHost:true,tr:{sendTo:(_id,d)=>{packet=JSON.parse(JSON.stringify(d));}}},{id:'clothing'});sender.bind({actors:[a,v],state:'playing',time:180});sender.sendHit(a,v,100,'shooter');
 const receiver=new f.NetMatch({myId:'victim',hostId:'attacker',isHost:false,tr:{sendTo(){}}},{id:'clothing'});receiver.bind({actors:[a,v],state:'playing',time:180});f.G.netm=receiver;f.G.projectiles.applyHit=(atk,target)=>target.damage(100,atk,'shooter');v.special=80;v.invuln=0;
 receiver.onMessage('attacker',packet);assert.equal(v.alive,true);assert.equal(a.s3.clothingHitPunisher,undefined);
 // Exercise the metadata-consumer boundary after authority changes locality;
 // actor migration itself remains owned by the existing NetMatch contract.
 a.remote=false;a.owner='victim';a.s3.loadout[1].main=acceptedPunisher?'none':'respawnPunisher';f.tick(v);
 near(v.special,acceptedPunisher?28:40);near(v.respawnTimer,f.PLAYER.respawnTime+(acceptedPunisher?.75:0)-1/60);assert.equal(a.s3.clothingHitPunisher,undefined);
});
