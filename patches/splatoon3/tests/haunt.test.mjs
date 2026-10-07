import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { adaptSource } from '../adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';
const extraExports=`export * from './patches/splatoon3/runtime/haunt.mjs';export * from './patches/splatoon3/runtime/private-tracking.mjs';export * from './patches/splatoon3/runtime/respawn-lifecycle.mjs';
 export function saveTestLoadout(value){globalThis.localStorage={getItem:key=>key==='inkwave.splatoon3.gear.v1'?JSON.stringify(value):null};}`;
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
async function rig(){const f=await fixture({extraExports});const a=f.make(),b=f.make(),c=f.make(),d=f.make();a.team=c.team=0;b.team=d.team=1;a.isLocal=true;a.nid=1;a.owner='owner';b.owner='enemy';a.s3.loadout[1].main='haunt';f.saveTestLoadout(a.s3.loadout);
 f.G.match={mode:'turf',state:'playing',playing:()=>true,local:a,actors:[a,b,c,d]};f.G.level.spawnPads=[new f.THREE.Vector3(),new f.THREE.Vector3()];f.G.physics.groundProbe=(...args)=>{args[6].hit=false;return args[6];};b.pos.set(0,0,20);return{...f,a,b,c,d};}
function qualify(f){f.a.splat(f.b);f.a.respawn();f.a.pos.set(0,0,0);f.b.pos.set(0,0,20);}
test('#351 Haunt is clothing-main only and survives stored loadout reset',async()=>{const f=await rig();for(let piece=0;piece<3;piece++)for(let slot=0;slot<4;slot++){const l=f.emptyLoadout();if(slot===0)l[piece].main='haunt';else l[piece].subs[slot-1]='haunt';const n=f.normalizeLoadout(l);assert.equal(slot===0?n[piece].main:n[piece].subs[slot-1],piece===1&&slot===0?'haunt':'none');}f.a.reset();assert.equal(f.a.s3.loadout[1].main,'haunt');});
test('#351 verified post-respawn target tracking is private and persists beyond 16 seconds',async()=>{const f=await rig();qualify(f);f.G.time=20;assert.ok(f.hauntTrackingRecord(f.b,f.a));assert.equal(f.privateTrackingOpacity(f.b,f.a),1);assert.equal(f.privateTrackingOpacity(f.b,f.c),0);assert.equal(f.b.s3.revealedUntil,undefined);f.b.submerged=true;assert.equal(f.privateTrackingOpacity(f.b,f.a),0);assert.ok(f.hauntTrackingRecord(f.b,f.a));f.b.climbing=true;assert.equal(f.privateTrackingOpacity(f.b,f.a),1);});
test('#351 self-attributed basic-case finish adds 45F and removes 15 percent of predeath gauge, for any weapon category',async()=>{for(const cause of ['shooter','bomb','storm'])for(const gauge of [0,40,100,160]){const f=await rig();qualify(f);f.G.time=20;f.b.special=gauge;f.b.splat(f.a,cause);near(f.b.respawnTimer,f.PLAYER.respawnTime+.75);near(f.b.special,gauge*.35);const timer=f.b.respawnTimer;f.b.splat(f.a,cause);near(f.b.respawnTimer,timer);near(f.b.special,gauge*.35);assert.equal(f.hauntTrackingRecord(f.b,f.a),null);}});
test('#351 teammate/environment finishes only clear the target life; fresh life never inherits a mark',async()=>{for(const cause of ['ally','water','fall','self']){const f=await rig();qualify(f);f.b.special=100;f.b.splat(cause==='ally'?f.c:cause==='self'?f.b:f.a,cause);near(f.b.special,50);assert.equal(f.b.s3.lastHauntPenalty,undefined);assert.equal(f.hauntTrackingRecord(f.b,f.a),null);f.b.respawn();assert.equal(f.hauntTrackingRecord(f.b,f.a),null);}});
test('#351 verified immediate trade does not activate tracking or Haunt penalty in either death order',async()=>{
 {const f=await rig();f.a.splat(f.b);f.b.special=100;f.b.splat(f.a,'bomb');near(f.b.respawnTimer,f.PLAYER.respawnTime);near(f.b.special,50);assert.equal(f.b.s3.lastHauntPenalty,undefined);assert.equal(f.hauntTrackingRecord(f.b,f.a),null);}
 {const f=await rig();f.b.splat(f.a,'bomb');f.a.splat(f.b);assert.equal(f.hauntTrackingRecord(f.b,f.a),null);}
});
test('#351 ledger holds multiple living killers across separate owner respawns',async()=>{const f=await rig();qualify(f);f.a.splat(f.d);f.a.respawn();assert.ok(f.hauntTrackingRecord(f.b,f.a));assert.ok(f.hauntTrackingRecord(f.d,f.a));f.b.splat(f.c);assert.equal(f.hauntTrackingRecord(f.b,f.a),null);assert.ok(f.hauntTrackingRecord(f.d,f.a));});
test('#351 fresh match, reset, owner identity reuse, target identity reuse and disconnect retire stale marks',async()=>{for(const mode of ['reset','match','owner','target','disconnect']){const f=await rig();qualify(f);if(mode==='reset')f.a.reset();if(mode==='match')f.G.match={...f.G.match};if(mode==='owner')f.a.owner='other';if(mode==='target')f.b.owner='other';if(mode==='disconnect')f.G.match.actors=[f.a,f.c];assert.equal(f.hauntTrackingRecord(f.b,f.a),null,mode);}});
test('#351 Special Saver is reduced to 70% AP under Haunt while QR does not erase the fixed 45F',async()=>{for(const gp of [3,10,30,57]){const f=await rig();qualify(f);f.b.s3.loadout[0].subs[0]='specialSaver';if(gp===10){f.b.s3.loadout[0].subs=['none','none','none'];f.b.s3.loadout[0].main='specialSaver';}else if(gp===30){for(const piece of f.b.s3.loadout){piece.main='specialSaver';piece.subs=['none','none','none'];}}else if(gp===57){for(const piece of f.b.s3.loadout){piece.main='specialSaver';piece.subs=['specialSaver','specialSaver','specialSaver'];}}f.b.setWeapon('shooter');const ap=f.b.s3.abilityPoints.specialSaver||0;f.b.special=100;f.b.splat(f.a);near(f.b.respawnTimer,f.PLAYER.respawnTime+.75);near(f.b.s3.lastHauntPenalty.saverAP,ap*.7);near(f.b.special,100*Math.max(0,f.gearCurve(ap*.7,...f.profile.gear.specialSaver)-.15));}
 const f=await rig();qualify(f);f.b.s3.loadout[0].main='quickRespawn';f.b.setWeapon('shooter');f.b.special=100;f.b.splat(f.a);near(f.b.respawnTimer,f.PLAYER.respawnTime+.75);});
test('#351 target Respawn Punisher self-penalty stacks additively with Haunt',async()=>{const f=await rig();qualify(f);f.b.s3.loadout[1].main='respawnPunisher';f.b.setWeapon('shooter');f.b.special=100;f.b.splat(f.a);near(f.b.respawnTimer,f.PLAYER.respawnTime+(45+68)/60);near(f.b.special,100*(.5-.15-.225));assert.equal(f.b.s3.lastHauntPenalty.selfPunisher,true);});
test('#351 Tacticooler marker preserves full Special Saver AP while fixed Haunt penalty still applies',async()=>{const f=await rig();qualify(f);for(const piece of f.b.s3.loadout){piece.main='specialSaver';piece.subs=['specialSaver','specialSaver','specialSaver'];}f.b.setWeapon('shooter');f.b.s3.tacticooler=true;const ap=f.b.s3.abilityPoints.specialSaver;f.b.special=100;f.b.splat(f.a);near(f.b.s3.lastHauntPenalty.saverAP,ap);near(f.b.special,100*Math.max(0,f.gearCurve(ap,...f.profile.gear.specialSaver)-.15));near(f.b.respawnTimer,f.PLAYER.respawnTime+.75);});
const productionAdapt=(rel,code)=>adaptQualitySource(rel,adaptReliability(rel,adaptTouchLayout(rel,adaptSource(rel,code))));
async function onlineRig(){
 const f=await fixture({extraExports,adaptNative:productionAdapt}),owner=f.make(),target=f.make();
 owner.nid=1;owner.owner='A';owner.team=0;owner.netLife=1;owner.s3.loadout[1].main='none';
 target.nid=2;target.owner='B';target.team=1;target.netLife=3;target.special=100;
 f.G.match={mode:'turf',state:'playing',playing:()=>true,local:target,actors:[owner,target]};
 const session={myId:'B',hostId:'B',isHost:true,_members:new Map([['A',1],['B',1]]),tr:{sendTo(){},broadcast(){}}};
 const nm=new f.NetMatch(session,{map:'reef'});nm.bind(f.G.match);owner.alive=false;
 return{...f,owner,target,nm};
}
test('#351 online victim authority accepts only sender/life-proven Haunt mark then arm',async()=>{
 const f=await onlineRig();
 const mark={actor:f.owner,target:f.target,ownerOwner:'A',targetOwner:'B',ownerLife:1,targetLife:3};
 assert.equal(f.nm.replayHauntEvent('haunt:mark',mark,'X'),true);assert.equal(f.hauntBasicPenalty(f.target,f.owner),null,'wrong sender rejected');
 assert.equal(f.nm.replayHauntEvent('haunt:mark',{...mark,targetOwner:'forged'},'A'),true);assert.equal(f.hauntBasicPenalty(f.target,f.owner),null,'forged target owner rejected');
 assert.equal(f.nm.replayHauntEvent('haunt:mark',mark,'A'),true);assert.equal(f.hauntBasicPenalty(f.target,f.owner),null,'death mark is not armed before owner life advances');
 f.owner.netLife=2;f.owner.alive=true;
 const arm={...mark,ownerLife:2};assert.equal(f.nm.replayHauntEvent('haunt:arm',arm,'A'),true);
 const penalty=f.hauntBasicPenalty(f.target,f.owner);assert.equal(penalty.frames,45);near(penalty.loss,.15);
 f.target.netLife=4;assert.equal(f.hauntBasicPenalty(f.target,f.owner),null,'target actor-id reuse cannot inherit mark');
 f.nm.dispose();
});
test('#351 proven online Haunt state is applied by local victim authority end-to-end',async()=>{
 const f=await onlineRig(),mark={actor:f.owner,target:f.target,ownerOwner:'A',targetOwner:'B',ownerLife:1,targetLife:3};
 f.nm.replayHauntEvent('haunt:mark',mark,'A');f.owner.netLife=2;f.owner.alive=true;f.nm.replayHauntEvent('haunt:arm',{...mark,ownerLife:2},'A');
 f.target.special=100;f.target.splat(f.owner,'shooter');near(f.target.respawnTimer,f.PLAYER.respawnTime+.75);near(f.target.special,35);assert.equal(f.target.s3.lastHauntPenalty.frames,45);f.nm.dispose();
});
test('#351 production NetMatch forwards local Haunt mark and post-respawn arm with owner/life identities',async()=>{
 const f=await fixture({extraExports,adaptNative:productionAdapt});f.installRespawnLifecycle(f,f.profile);const owner=f.make(),target=f.make();
 owner.nid=1;owner.owner='A';owner.team=0;owner.netLife=1;owner.s3.loadout[1].main='haunt';owner.isLocal=true;f.saveTestLoadout(owner.s3.loadout);
 target.nid=2;target.owner='B';target.team=1;target.netLife=5;
 f.G.level.spawnPads=[new f.THREE.Vector3(),new f.THREE.Vector3()];f.G.physics.groundProbe=(...args)=>{args[6].hit=false;return args[6];};
 f.G.match={mode:'turf',state:'playing',playing:()=>true,canRespawn:()=>true,local:owner,actors:[owner,target]};
 const session={myId:'A',hostId:'A',isHost:true,_members:new Map([['A',1],['B',1]]),tr:{sendTo(){},broadcast(){}}};
 const nm=new f.NetMatch(session,{map:'reef'});nm.bind(f.G.match);owner.splat(target,'shooter');
 const mark=nm.out.find(e=>e[1]==='ev'&&e[2]==='haunt:mark');assert.ok(mark,'mark is in owner event stream');assert.equal(mark[3].ownerOwner,'A');assert.equal(mark[3].targetOwner,'B');assert.equal(mark[3].targetLife,5);
 owner.respawn();assert.equal(f.squidSpawnState(owner)?.phase,'aim','Turf respawn uses Squid Spawn lifecycle');const arm=nm.out.find(e=>e[1]==='ev'&&e[2]==='haunt:arm');assert.ok(arm,'arm is in owner event stream');assert.equal(arm[3].ownerLife,owner.netLife);assert.equal(arm[3].targetLife,5);
 nm.dispose();
});
