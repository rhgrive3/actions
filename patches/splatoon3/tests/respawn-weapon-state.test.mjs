import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoadedActorFixture} from './source-loaded-actor-fixture.mjs';
let cached;
const fixture=()=>cached??=sourceLoadedActorFixture({extraExports:`
 export { ROLLER_POSE, horizontalRollerPose } from './patches/splatoon3/runtime/roller.mjs';
 export { rollerDetailMotionSnapshot } from './patches/splatoon3/runtime/roller-detail-motion.mjs';
 export { spawnPoseSnapshot } from './patches/splatoon3/runtime/spawn-pose-motion.mjs';
`});
async function setup(id='roller'){
 const f=await fixture();f.reset();const a=await f.make();a.setWeapon(id);a.slot=0;
 f.G.match={mode:'turf',opts:{},state:'playing',playing:()=>true,canRespawn:()=>true};
 return {f,a,ch:a.character};
}
function respawn(f,a){
 a.splat(null);for(let i=0;i<900&&!a.alive;i++)f.tick(a);
 assert.equal(a.alive,true);assert.equal(a.s3.squidSpawn?.phase,'aim');
}
function launch(f,a,{held=false}={}){
 a.intent.fire=false;f.tick(a);a.intent.fire=true;f.tick(a);
 assert.equal(a.s3.squidSpawn?.phase,'flight');if(!held)a.intent.fire=false;
}
function land(f,a,dt=1/60){
 for(let i=0;i<180&&a.s3.squidSpawn;i++)f.tick(a,dt);
 assert.equal(a.s3.squidSpawn,undefined);assert.equal(a.grounded,true);assert.equal(a.ground.hit,true);
}
function ready(f,ch){
 const C=f.CHARACTER_CHANNELS;
 for(const [name,values] of [['ANC',f.ROLLER_POSE.READY_ANCHOR],['ANCR',f.ROLLER_POSE.READY_ROTATION]])
  for(let i=0;i<3;i++)assert.ok(Math.abs(ch.P[C[name]+i]-values[i])<1e-6,`${name}[${i}]: ${ch.P[C[name]+i]} expected ${values[i]}`);
}
test('native no-attack respawn landing releases spawn weapon pose while its timer remains young',async()=>{
 for(const dt of [1/30,1/60,1/120]){
  const {f,a,ch}=await setup();respawn(f,a);launch(f,a);land(f,a,dt);f.tick(a,dt);
  assert.ok(ch.tr[f.CHARACTER_TIMERS.T_SPAWN]<1.4,'do not fix this by expiring the native spawn clock');
  assert.equal(f.spawnPoseSnapshot(ch).phase,'off');
  assert.equal(a.weaponRunner.rolling,false);assert.equal(a.weaponRunner.flick,-1);
  assert.equal(a.anim.firing,false);assert.equal(a.ink,100);assert.equal(a.stats.turf,0);ready(f,ch);
 }
});
test('held attack before death, release during spawn, and launch tap never paints after landing',async()=>{
 const {f,a,ch}=await setup();a.intent.fire=true;for(let i=0;i<80;i++)f.tick(a);
 assert.equal(a.weaponRunner.rolling,true,'exercise actual pre-death roller state');respawn(f,a);
 assert.equal(a.weaponRunner.rolling,false);assert.equal(a.weaponRunner.s3RollerAttack,null);assert.equal(ch.s3RollerFlick,null);
 launch(f,a);land(f,a);for(let i=0;i<10;i++)f.tick(a);
 assert.equal(a.weaponRunner.rolling,false);assert.equal(a.weaponRunner.flick,-1);assert.equal(a.ink,100);ready(f,ch);
});
test('a fresh attack after native landing has its real flick pose and weapon-specific release delay',async()=>{
 for(const id of ['roller']){
  const {f,a,ch}=await setup(id);respawn(f,a);launch(f,a);land(f,a);f.tick(a);
  a.intent.fire=true;f.tick(a);const attack=a.weaponRunner.s3RollerAttack;
  assert.ok(attack,'fresh attack reaches runner');assert.ok(ch.s3RollerFlick);
  assert.ok(ch.tr[f.CHARACTER_TIMERS.T_FLICK]<.1);
  const before=f.G.projectiles.list.length;
  for(let i=0;i<5;i++)f.tick(a);
  assert.equal(f.rollerDetailMotionSnapshot(ch).active,true,'a live native flick must not be suppressed by the retired spawn clock');
  const curve=f.horizontalRollerPose(attack.elapsed,attack.windup,attack.swingInterval??attack.interval,attack.swingShape,attack.holdRoll===true);
  for(let i=0;i<3;i++)assert.ok(Math.abs(ch.P[f.CHARACTER_CHANNELS.ANCR+i]-curve.rotation[i])<1e-6,'the actual native flick curve owns the weapon');
  for(let i=0;i<60&&attack.elapsed+1/60<attack.windup-1e-10;i++)f.tick(a);
  assert.equal(f.G.projectiles.list.length,before,'no early flick release');
  for(let i=0;i<3;i++)f.tick(a);
  assert.ok(f.G.projectiles.list.length>before,'native release emits real projectiles');
 }
});
test('release and fresh launch press intentionally held through landing is admitted; stale holds stay blocked',async()=>{
 const {f,a}=await setup();a.intent.fire=true;a._prevIntent.fire=true;respawn(f,a);
 a.intent.fire=true;for(let i=0;i<4;i++)f.tick(a);assert.equal(a.s3.squidSpawn.phase,'aim','stale hold cannot launch');
 launch(f,a,{held:true});land(f,a);f.tick(a);
 assert.equal(a.weaponRunner.rolling,true,'a physical release during aim rearms a deliberate post-respawn hold');
 assert.equal(a.weaponRunner.flick,-1,'launch edge does not synthesize an airborne flick');
});
test('other weapon families leave runner/animation idle, fresh input still shoots or charges',async()=>{
 for(const id of ['shooter','charger','splatling','slosher','dualies']){
  const {f,a}=await setup(id);a.intent.fire=true;for(let i=0;i<8;i++)f.tick(a);respawn(f,a);launch(f,a);land(f,a);
  for(let i=0;i<5;i++)f.tick(a);const r=a.weaponRunner;
  assert.equal(r.rolling,false,id);assert.equal(r.firingPose(),false,id);assert.equal(r.charge,0,id);assert.equal(a.ink,100,id);
  a.intent.fire=true;for(let i=0;i<20;i++)f.tick(a);
  assert.ok(r.firingPose()||a.ink<100,id+' deliberate attack remains available');
 }
});
test('ordinary jump, superjump, weapon change, repeated death/reset and dispose do not invent spawn action',async()=>{
 const {f,a,ch}=await setup();a.intent.jump=true;f.tick(a);assert.equal(a.s3.squidSpawn,undefined);assert.equal(f.spawnPoseSnapshot(ch)?.phase??'off','off');
 a.intent.jump=false;for(let i=0;i<90;i++)f.tick(a);ready(f,ch);
 for(let life=0;life<3;life++){
  respawn(f,a);launch(f,a);a.setWeapon(life===1?'shooter':'roller');land(f,a);f.tick(a);
  assert.equal(a.weaponRunner.firingPose(),false);assert.equal(a.weaponRunner.rolling,false);
  if(a.weapon.kind==='roller')ready(f,ch);
 }
 a.reset();assert.equal(a.weaponRunner.rolling,false);assert.equal(ch.s3RollerFlick,null);
 assert.equal(f.spawnPoseSnapshot(ch)?.phase??'off','off');
 // Genuine superjump retains its own motion owner; no respawn bits are added.
 assert.equal(a.superJump(a.pos.clone().add(new f.THREE.Vector3(2,0,2))),true);
 for(let i=0;i<300&&a.superJumpState;i++)f.tick(a);
 assert.equal(a.superJumpState,null,'native charge/flight/landing completes');
 assert.equal(a.grounded,true);
 assert.equal(a.s3.squidSpawn,undefined);assert.equal(a.weaponRunner.rolling,false);
 f.reset();assert.equal(f.spawnPoseSnapshot(ch),null,'dispose retires presentation state');
});

test('remote spawn event and sampled landing use the same ordinary ready pose without proxy paint',async()=>{
 const {f,a,ch}=await setup();a.remote=true;a.nid='remote-respawn';a.net={remoteDodgeLife:0,lastLife:0};
 const net=Object.create(f.NetMatch.prototype);net.peers=new Map();a.owner='owner';net.byNid=new Map([[a.nid,a]]);
 ch._netTrig=ch.trigger.bind(ch);a.grounded=a.ground.hit=false;
 f.NetMatch.prototype._play.call(net,'owner',[0,'tr',a.nid,'spawn',null]);
 for(let i=0;i<8;i++)a._finishFrame(1/60);
 assert.notEqual(f.spawnPoseSnapshot(ch).phase,'off');
 // Direct native event/sample representation, intentionally no transport claim.
 a.grounded=a.ground.hit=true;f.NetMatch.prototype._play.call(net,'owner',[0,'tr',a.nid,'land',.5]);a._finishFrame(1/60);
 assert.equal(a.weaponRunner.rolling,false);assert.equal(a.ink,100);assert.equal(a.stats.turf,0);ready(f,ch);
});

test('spawn rearm observes physical release through filtered intent; disabled presentation retains its legacy gate',async()=>{
 const {f,a,ch}=await setup();a.intent.fire=true;respawn(f,a);a.s3.physicalRespawnHeld={fire:true};a.intent.fire=false;f.tick(a);
 assert.equal(a.s3.respawnRearm.has('fire'),true,'filtered false intent cannot rearm a physically held trigger');
 a.s3.physicalRespawnHeld.fire=false;f.tick(a);
 assert.equal(a.s3.respawnRearm?.has('fire')??false,false,'a genuine release in aim rearms the new life');
 a.s3.physicalRespawnHeld.fire=true;a.intent.fire=true;f.tick(a);land(f,a);f.tick(a);assert.equal(a.weaponRunner.rolling,true);
 ch.s3SpawnPoseMotionEnabled=false;a.intent.fire=false;respawn(f,a);launch(f,a);land(f,a);f.tick(a);
 assert.ok(ch.tr[f.CHARACTER_TIMERS.T_SPAWN]<1.4);
 assert.ok(Math.abs(ch.P[f.CHARACTER_CHANNELS.ANCR]-.8)<1e-6,'disabled addon uses its native spawn gate');
});
