import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { heldBrellaGuardFacing } from '../runtime/brella-guard-facing.mjs';
import { adaptBrellaGuardFacing } from '../brella-guard-facing-adapter.mjs';
import { adaptSource, replaceOnce } from '../adapter.mjs';
import fs from 'node:fs';
const IDS=['s3-shelter-normal','s3-shelter-wide','s3-shelter-focus'];
const setup=async(extra={})=>{const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,vmMathRandom:()=>.5,
  extraExports:"export { installMainWeaponCatalogRuntime } from './patches/splatoon3/runtime/main-weapon-catalog.mjs';",...extra});f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);return f;};
const state=id=>({weaponId:id,alive:true,remote:false,form:'kid',intent:{sub:false},weaponRunner:{catalogState:{id,canopy:{open:true,launched:false,hp:100}}}});
test('guard admission is pure and immediately relinquishes every invalidated owner/state',()=>{
  for(const id of IDS){
    const a=state(id),before=JSON.stringify(a);assert.equal(heldBrellaGuardFacing(a),true);assert.equal(JSON.stringify(a),before);
    for(const mutate of [a=>a.alive=false,a=>a.remote=true,a=>a.form='squid',a=>a.specialActive=true,a=>a.superJumpState={},a=>a.intent.sub=true,a=>a.weaponRunner.aimingSub=true,a=>a.weaponRunner.catalogState.id='stale',a=>a.weaponId='s3-shelter-compact',a=>a.weaponRunner.catalogState.canopy.open=false,a=>a.weaponRunner.catalogState.canopy.launched=true,a=>a.weaponRunner.catalogState.canopy.hp=0,a=>a.weaponRunner.catalogState=null]){
      const x=state(id);mutate(x);assert.equal(heldBrellaGuardFacing(x),false);
    }
    const frozen=state(id);Object.freeze(frozen.weaponRunner.catalogState.canopy);Object.freeze(frozen.weaponRunner.catalogState);Object.freeze(frozen.weaponRunner);Object.freeze(frozen.intent);Object.freeze(frozen);assert.equal(heldBrellaGuardFacing(frozen),true);
  }
  assert.equal(heldBrellaGuardFacing(null),false);
});
test('build hook is single-use and preserves special/superjump and roller precedence',async()=>{
  const raw=fs.readFileSync(new URL('../../../inkwave-public/src/game/actor.js',import.meta.url),'utf8'),code=adaptSource('src/game/actor.js',raw);
  // Exercise the actual fully composed Actor rather than spelling of a helper:
  // held roller facing intentionally has a different gate from roll speed.
  const f=await setup();
  for(const hz of [30,60,120]){
    const make=id=>{const a=f.make(id);a.yaw=a.yawVel=0;a.aimYaw=-.8;
      a.intent.move.set(0,0,-1);a.vel.set(1.4,0,0);return a;};
    const failLower=()=>assert.fail('higher-priority owner evaluated firing/guard branch');
    for(const owner of ['specialActive','superJumpState']){
      const a=make(IDS[0]);a[owner]={};a.weaponRunner.rolling=true;
      a.weaponRunner.catalogState={id:IDS[0],canopy:{open:true,launched:false,hp:100}};
      a.weaponRunner.firingPose=failLower;a._face(1/hz,false);
      assert.equal(a._faceTarget,Math.PI/2,owner+' owns velocity facing before roller/guard');
    }
    const roller=make('roller');roller.weaponRunner.rolling=true;
    roller.weaponRunner.firingPose=failLower;roller._face(1/hz,false);
    assert.equal(roller._faceTarget,roller.aimYaw,'roller owns aim facing before firing/guard');
    for(const id of IDS){const guard=make(id);guard.weaponRunner.firingPose=()=>false;
      guard.weaponRunner.catalogState={id,canopy:{open:true,launched:false,hp:100}};
      guard._face(1/hz,false);assert.equal(guard._faceTarget,guard.aimYaw,id+' held guard owns aim facing');
      guard.weaponRunner.catalogState.canopy.open=false;guard._face(1/hz,false);
      assert.equal(guard._faceTarget,Math.PI,id+' released guard returns to movement facing');
    }
  }
  assert.throws(()=>adaptBrellaGuardFacing('src/game/actor.js',code,replaceOnce),/expected exactly one/);
  assert.equal(adaptBrellaGuardFacing('src/game/character.js','untouched',replaceOnce),'untouched');
});
test('all 160 registered kits and every non-target live guard retain exact existing facing traces',async()=>{
  const a=await setup(),b=await setup({adaptRuntime:(rel,s)=>rel.endsWith('/brella-guard-facing.mjs')?'export function heldBrellaGuardFacing(){return false;}':s});
  const ids=Array.from(a.WEAPON_ORDER);assert.equal(ids.length,160);let cases=0;
  for(const id of ids)for(const mode of ['closed','ordinary','fire','sub','special','superjump','squid'])for(const hz of[30,60,120]){
    if(IDS.includes(id)&&mode==='ordinary')continue;
    const actors=[a.make(id),b.make(id)];
    for(const x of actors){x.yaw=.3;x.aimYaw=-.8;x.yawVel=0;x.intent.move.set(.05,0,-1);x.vel.copy(x.intent.move).multiplyScalar(1.4);x.weaponRunner.catalogState={id,canopy:{open:mode!=='closed',launched:false,hp:100}};x.weaponRunner.firingPose=()=>mode==='fire';x.intent.sub=mode==='sub';x.specialActive=mode==='special';x.superJumpState=mode==='superjump'?{}:null;if(mode==='squid')x.form='squid';}
    // Selected open guards are deliberately ineligible when another owner is active.
    if(IDS.includes(id)&&mode==='fire')for(const x of actors)x.weaponRunner.catalogState.canopy.open=false;
    for(let j=0;j<hz;j++){for(const x of actors)x._face(1/hz,mode==='squid');assert.deepEqual(actors.map(x=>[x.yaw,x.yawVel,x.anim.turnRate,x.fireFacing,x._faceTarget])[0],actors.map(x=>[x.yaw,x.yawVel,x.anim.turnRate,x.fireFacing,x._faceTarget])[1],id+' '+mode+' '+hz);}
    cases++;
  }
  console.log('BRELLA_FACING_UNCHANGED '+JSON.stringify({ids:ids.length,cases}));
});
test('open guard changes only facing admission, with no sticky timer after close/launch/reset/switch',async()=>{
  const f=await setup();
  for(const id of IDS){const a=f.make(id);a.weaponRunner.catalogState={id,canopy:{open:true,launched:false,hp:100}};a.weaponRunner.firingPose=()=>false;a.intent.move.set(0,0,-1);a.vel.set(0,0,-1.4);a.aimYaw=0;a.yaw=0;a.fireFacing=0;
    const snap=JSON.stringify(a.weaponRunner.catalogState);for(let j=0;j<60;j++)a._face(1/60,false);assert.equal(a.yaw,0);assert.equal(a.fireFacing,0);assert.equal(JSON.stringify(a.weaponRunner.catalogState),snap);assert.equal(a.weaponRunner.firingPose(),false);
    for(const invalid of ['close','launch','break','reset','switch','dead']){a.weaponId=id;a.alive=true;a.yaw=a.yawVel=0;a._faceTarget=null;a.weaponRunner.catalogState={id,canopy:{open:true,launched:false,hp:100}};
      if(invalid==='close')a.weaponRunner.catalogState.canopy.open=false;if(invalid==='launch')a.weaponRunner.catalogState.canopy.launched=true;if(invalid==='break')a.weaponRunner.catalogState.canopy.hp=0;if(invalid==='reset')a.weaponRunner.catalogState=null;if(invalid==='switch')a.weaponId='s3-shelter-compact';if(invalid==='dead')a.alive=false;
      a._face(1/60,false);assert.notEqual(a.yaw,0,id+' releases on '+invalid);assert.equal(a.fireFacing,0);
    }
  }
});
test('preparation requires paid shot admission and cannot be revived by input alone',async()=>{
  const f=await setup();
  for(const id of IDS)for(const hz of[30,60,120]){
    const a=f.make(id),r=a.weaponRunner,step=(fire,pressed=false)=>{a.intent.fire=fire;f.G.time+=1/hz;r.update(1/hz,{fire,firePressed:pressed});};
    a.ink=0;step(true,true);assert.equal(r.catalogState.canopy,null,'failed payment creates no preparation');assert.equal(heldBrellaGuardFacing(a),false);
    a.ink=100;step(true,false);assert.equal(r.catalogState.canopy,null,'input without admission creates no canopy');
    step(true,true);assert.equal(r.catalogState.canopy.preparing,true);assert.equal(heldBrellaGuardFacing(a),true);
    step(false);assert.equal(r.catalogState.canopy.preparing,false);assert.equal(heldBrellaGuardFacing(a),false);
    step(true,false);assert.equal(r.catalogState.canopy.preparing,false,'release cannot resurrect preparation');
    step(true,true);assert.equal(r.catalogState.canopy.preparing,false,'cooldown rejection cannot resurrect preparation');
    r.reset();a.ink=100;step(true,true);a.ink=0;
    for(let j=0;j<2*hz;j++)step(true);
    assert.equal(r.catalogState.canopy?.preparing,false,'preparation ends at native opening boundary even if payment fails');assert.equal(r.catalogState.canopy?.open,false);
    r.reset();a.ink=100;step(true,true);a.setWeapon('s3-shelter-compact');assert.equal(r.catalogState,null);assert.equal(heldBrellaGuardFacing(a),false);
    a.setWeapon(id);step(true,true);a.alive=false;assert.equal(heldBrellaGuardFacing(a),false);step(true);assert.equal(r.catalogState.canopy?.preparing,false);
    a.reset();assert.equal(r.catalogState,null);assert.equal(heldBrellaGuardFacing(a),false);
  }
});
test('repeated close/reopen and launch relinquish facing without leaking a timer or firing state',async()=>{
  const f=await setup();
  for(const id of IDS)for(const hz of[30,60,120]){
    const a=f.make(id),r=a.weaponRunner;let previous=false,sawOpen=false,sawLaunch=false,sawPrepare=false,closed=0;
    for(const [seconds,fire]of[[1.3,true],[.08,false],[.16,true],[.08,false],[1.8,true],[.2,false],[6,true]])for(let j=0;j<Math.ceil(seconds*hz);j++){
      const held=r.catalogState?.canopy;
      a.intent.fire=fire;a.ink=100;r.update(1/hz,{fire,firePressed:fire&&!previous});previous=fire;
      if(held?.launched){sawLaunch=true;assert.notEqual(r.catalogState.canopy,held,'launched canopy has its independent owner');assert.equal(held.owner,a);assert.ok(held.remaining>0);assert.equal(heldBrellaGuardFacing(a),false);}
      const c=r.catalogState.canopy;sawOpen ||= !!c?.open&&!c.launched;sawLaunch ||= !!c?.launched;sawPrepare ||= !!c?.preparing;
      if(!fire){closed++;assert.equal(c?.preparing||false,false);assert.equal(heldBrellaGuardFacing(a),false);}
      if(c?.launched)assert.equal(heldBrellaGuardFacing(a),false);
      const firing=r.firingPose(),timer=r.firingT;a._face(1/hz,false);assert.equal(r.firingPose(),firing);assert.equal(r.firingT,timer);assert.equal(a.fireFacing,0);
    }
    assert.ok(sawPrepare&&sawOpen&&sawLaunch&&closed>0,id+' full repeated lifecycle');
  }
});
test('guard yaw-wrap uses native aim spring and leaves remote yaw and another actor independent',async()=>{
  const f=await setup();
  for(const id of IDS)for(const hz of[30,60,120]){
    const guard=f.make(id),native=f.make('shooter');
    for(const a of[guard,native]){a.yaw=3.08;a.yawVel=0;a.aimYaw=-3.08;a.intent.move.set(0,0,-1);a.vel.set(0,0,-1.4);a.weaponRunner.firingPose=()=>false;}
    guard.weaponRunner.catalogState={id,canopy:{open:true,launched:false,hp:100}};native.intent.sub=true;
    for(let j=0;j<hz;j++){guard.aimYaw=native.aimYaw=-3.08+.15*j/hz;guard._face(1/hz,false);native._face(1/hz,false);assert.deepEqual([guard.yaw,guard.yawVel,guard.anim.turnRate],[native.yaw,native.yawVel,native.anim.turnRate]);}
    const other=f.make(id);other.yaw=0;other.aimYaw=0;other.intent.move.set(0,0,-1);other.vel.set(0,0,-1.4);other.weaponRunner.firingPose=()=>false;other._face(1/hz,false);assert.notEqual(other.yaw,0);
    guard.remote=true;guard.yaw=.7;guard.netTurnRate=.42;guard.character.update=()=>{};delete guard._finishFrame;guard._finishFrame(1/hz);assert.equal(guard.yaw,.7);assert.equal(guard.anim.turnRate,.42);assert.equal(heldBrellaGuardFacing(guard),false);
  }
});
test('real held shield matrix covers 30/60/120 Hz, eight directions, idle and up/down aim',async()=>{
  const f=await setup({includeCharacter:true}),{G,THREE}=f;G.scene=new THREE.Scene();G.physics=new f.Physics(G.level);G.level.queryBlocks=(_a,_b,_c,_d,o)=>{o.length=0;return o;};G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
  const rows=[];
  for(let n=0;n<IDS.length;n++)for(const hz of[30,60,120])for(const pitch of[-.3,0,.3])for(let move=-1;move<8;move++){
    const id=IDS[n],a=new f.Actor({team:0,weapon:id,isLocal:true,CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}}),ch=a.character;ch.actor=a;ch.onEvent=null;ch.setLod('game');a.grounded=a.ground.hit=true;G.actors=[a];G.scene.add(ch.root);a.aimYaw=a.yaw=.6;a.aimPitch=pitch;a.aimDir.set(Math.sin(.6)*Math.cos(pitch),Math.sin(pitch),Math.cos(.6)*Math.cos(pitch));
    if(move>=0)a.intent.move.set(Math.sin(.6+move*Math.PI/4),0,Math.cos(.6+move*Math.PI/4));
    let guardAt=null,count=0,maxAngle=0,maxCentre=0,maxGrip=0;
    for(let j=0;j<3*hz;j++){
      a.ink=100;a.intent.fire=true;a.vel.copy(a.intent.move).multiplyScalar(1.4);a.pos.addScaledVector(a.vel,1/hz);G.time+=1/hz;a.weaponRunner.update(1/hz,{fire:true,firePressed:j===0});a._finishFrame(1/hz);ch.root.updateMatrixWorld(true);assert.ok([...ch.P].every(Number.isFinite));
      const c=a.weaponRunner.catalogState.canopy;if(!c?.open||c.launched||a.anim.firing)continue;guardAt??=j/hz;if(j/hz-guardAt<=.2)continue;count++;
      const dir=new THREE.Vector3(0,0,1).transformDirection(ch.weapon.off.matrixWorld),centre=new THREE.Vector3(0,.075,[.5,.74,.525][n]).applyMatrix4(ch.weapon.off.matrixWorld);
      maxAngle=Math.max(maxAngle,Math.acos(Math.max(-1,Math.min(1,dir.dot(c.dir))))*180/Math.PI);maxCentre=Math.max(maxCentre,centre.distanceTo(c.pos));if(ch.P[f.CHARACTER_CHANNELS.IKL]>.99)maxGrip=Math.max(maxGrip,ch.weapon.off.localToWorld(ch.weapon.def.handL.pos.clone()).distanceTo(ch.bones.handL.getWorldPosition(new THREE.Vector3())));
    }
    const row={id,hz,pitch,move,count,maxAngle,maxCentre,maxGrip,pass:count>0&&maxAngle<6&&maxCentre<.05&&maxGrip<.008};rows.push(row);console.log('BRELLA_FACING_CASE '+JSON.stringify(row));a.weaponRunner.reset();ch.dispose();G.scene.remove(ch.root);
  }
  const failed=rows.filter(x=>!x.pass);console.log('BRELLA_FACING_MATRIX '+JSON.stringify({cases:rows.length,failed}));assert.equal(failed.length,0,'candidate guard transition matrix');
});
