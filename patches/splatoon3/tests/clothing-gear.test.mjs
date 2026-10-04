import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { emptyLoadout, normalizeLoadout, abilityPoints, gearCurve } from '../runtime/gear.mjs';
import { FixedClock } from '../runtime/clock.mjs';
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-9, `${a} != ${b}`);
const extra = "export * from './inkwave-public/src/net/netmatch.js'; export * from './patches/splatoon3/runtime/clothing-gear.mjs';";
async function setup(){const f=await fixture(extra);f.profile.flow.threshold=1e6;f.G.level.spawnPads=[new f.THREE.Vector3(),new f.THREE.Vector3()];return f;}
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
  a.splat(cause==='no-attacker'?null:cause==='self'?a:e,cause);near(a.special,40);near(a.s3.lastDeathGear.frames,0);
 }
 const f=await setup(),a=f.make(),e=f.make();e.team=1;dress(e,'respawnPunisher');a.splat(e);a.reset();a.special=80;a.splat(e,'water');near(a.special,40);near(a.s3.lastDeathGear.frames,0);
});
test('RP transforms incoming QR AP by ceiling .15 before the curve, never multiplies a finished time reduction',async()=>{
 for(const [gp,expected] of [[0,0],[3,1],[6,1],[10,2],[30,5],[57,9]]){
  const f=await setup(),a=f.make(),e=f.make();e.team=1;dress(a,'none',gp);dress(e,'respawnPunisher');a.s3.previousLifeNoSplat=true;a.splat(e);
  assert.equal(a.s3.lastDeathGear.qrAP,expected);near(a.respawnTimer,f.PLAYER.respawnTime+45/60-f.profile.respawnChaseTime*(1-gearCurve(expected,...f.profile.gear.quickRespawn)));
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
test('real NetMatch sends bit24 without changing21 columns and rejects foreign/stale equipment snapshots',async()=>{
 const f=await setup(),a=f.make();a.nid=1;a.owner='owner';dress(a,'respawnPunisher');const n=Object.create(f.NetMatch.prototype);n.byNid=new Map([[1,a]]);n.stats={out:0,in:0};n.out=[];n.s={hostId:'host',tr:{broadcast:d=>n.packet=d}};n.peers=new Map();n._sendTick();
 const row=n.packet.a[0];assert.equal(row.length,21);assert.ok(row[10]&f.RESPAWN_PUNISHER_FLAG);
 const remote=f.make();remote.remote=true;remote.owner='owner';remote.nid=1;remote.net={buf:[]};n.byNid.set(1,remote);
 n._tick('foreign',{ts:1,a:[row]});assert.equal(f.respawnPunisherEquipped(remote),false);
 n._tick('owner',{ts:2,a:[row]});assert.equal(f.respawnPunisherEquipped(remote),true);
 const clear=[...row];clear[10]&=~f.RESPAWN_PUNISHER_FLAG;n._tick('owner',{ts:1,a:[clear]});assert.equal(f.respawnPunisherEquipped(remote),true);
 n._tick('owner',{ts:3,a:[clear]});assert.equal(f.respawnPunisherEquipped(remote),false);remote.owner='new-owner';assert.equal(f.respawnPunisherEquipped(remote),false);
});
test('real NetMatch carries attack-local RP before the first actor snapshot and cleans its override on throw',async()=>{
 const f=await setup(),a=f.make(),v=f.make();a.team=1;a.nid=2;a.owner='attacker';v.nid=1;v.owner='victim';dress(a,'respawnPunisher');
 const n=Object.create(f.NetMatch.prototype);n.myId='attacker';n.s={tr:{sendTo:(_id,d)=>n.packet=d}};n.sendHit(a,v,100,'shooter');assert.equal(n.packet.rp,true);
 a.remote=true;a.s3.loadout=emptyLoadout();n.byNid=new Map([[2,a],[1,v]]);f.G.projectiles.applyHit=(atk,target)=>target.splat(atk);v.special=80;
 n.onMessage('wrong',n.packet);assert.equal(v.alive,true);n.onMessage('attacker',n.packet);near(v.special,28);near(v.respawnTimer,f.PLAYER.respawnTime+.75);assert.equal(a.s3.clothingHitPunisher,undefined);
 v.reset();f.G.projectiles.applyHit=()=>{throw Error('injected');};assert.throws(()=>n.onMessage('attacker',n.packet),/injected/);assert.equal(a.s3.clothingHitPunisher,undefined);assert.equal(n._applyingHit,undefined);
});

test('RP death countdown and retained gauge are independent of30/60/120Hz presentation schedules',async()=>{
 const traces=[];for(const hz of[30,60,120]){const f=await setup(),a=f.make(),e=f.make();e.team=1;dress(e,'respawnPunisher');a.special=80;a.splat(e);const c=new FixedClock(),trace=[];for(let i=0;i<hz*2;i++)c.advance(1/hz,dt=>{f.G.time+=dt;a.update(dt);trace.push([a.respawnTimer,a.special,a.alive]);});traces.push(trace);}assert.equal(traces[0].length,120);assert.deepEqual(traces[0],traces[1]);assert.deepEqual(traces[1],traces[2]);
});
