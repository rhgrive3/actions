import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { heldBrellaGuardFacing } from '../runtime/brella-guard-facing.mjs';
import { adaptBrellaGuardFacing } from '../brella-guard-facing-adapter.mjs';
import { adaptSource, replaceOnce } from '../adapter.mjs';
import fs from 'node:fs';
import { parse } from '../../loading-cache/vendor/acorn.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { reverseShotRelease } from '../runtime/shooter-movement.mjs';
import { rollingHeadingActive } from '../runtime/movement-physics.mjs';
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
// Restrict ownership/order checks to the actual Actor._face AST, rather than
// finding an old helper name somewhere in the whole adapted module.
function faceMethod(code) {
  const ast=parse(code,{ecmaVersion:'latest',sourceType:'module'});
  const actors=ast.body.map(n=>n.declaration||n).filter(n=>n.type==='ClassDeclaration'&&n.id?.name==='Actor');
  assert.equal(actors.length,1,'one actual Actor owner');
  const methods=actors[0].body.body.filter(n=>n.type==='MethodDefinition'&&n.key.name==='_face');
  assert.equal(methods.length,1,'one actual facing method');
  const method=methods[0];return {method,source:code.slice(method.start,method.end)};
}
const actorSource=()=>fs.readFileSync(new URL('../../../inkwave-public/src/game/actor.js',import.meta.url),'utf8');
test('build hook is single-use and preserves special/superjump and roller precedence',()=>{
  const raw=actorSource(),code=adaptBuildSource('src/game/actor.js',raw),face=faceMethod(code);
  assert.equal(face.source,faceMethod(adaptSource('src/game/actor.js',raw)).source,
    'later production overlays preserve the movement and Brella facing owner');
  const special=face.method.value.body.body.find(n=>n.type==='IfStatement'&&code.slice(n.test.start,n.test.end)==='this.specialActive || this.superJumpState');
  assert.ok(special,'special/superjump own the first facing branch');
  // Grounded rolling follows the stick; the held swing before rolling keeps aim.
  const rolling=special.alternate,held=rolling?.alternate,guard=held?.alternate;
  assert.equal(rolling?.type,'IfStatement');assert.equal(held?.type,'IfStatement');assert.equal(guard?.type,'IfStatement');
  const rollingTest=code.slice(rolling.test.start,rolling.test.end),heldTest=code.slice(held.test.start,held.test.end),guardTest=code.slice(guard.test.start,guard.test.end);
  assert.match(rollingTest,/!isSquid/);assert.match(rollingTest,/rollingHeadingActive\(this\)/);assert.match(rollingTest,/!this\.intent\.sub/);
  assert.match(heldTest,/!isSquid/);assert.match(heldTest,/!this\.weaponRunner\.rolling/);
  assert.match(heldTest,/this\.intent\.fire.*behaviorKind === "roller".*behaviorKind === "brush"/);
  assert.match(heldTest,/!this\.intent\.sub/);
  assert.match(guardTest,/!reverseShotRelease\(this\).*heldBrellaGuardFacing\(this\)/);
  assert.throws(()=>adaptBrellaGuardFacing('src/game/actor.js',code,replaceOnce),/expected exactly one/);
  assert.throws(()=>adaptBrellaGuardFacing('src/game/actor.js','',replaceOnce),/expected exactly one/);
  const anchor='    } else if (this.weaponRunner.firingPose() || this.fireFacing > 0 || this.intent.sub) {';
  assert.ok(raw.includes(anchor));
  assert.throws(()=>adaptBrellaGuardFacing('src/game/actor.js',raw+'\n'+anchor,replaceOnce),/expected exactly one/);
  assert.equal(adaptBrellaGuardFacing('src/game/character.js','untouched',replaceOnce),'untouched');
});
test('actual Actor facing executes higher-priority owners before held Brella admission',async()=>{
  const f=await setup(),code=adaptBuildSource('src/game/actor.js',actorSource()),{method,source}=faceMethod(code);
  const special=method.value.body.body.find(n=>n.type==='IfStatement'&&code.slice(n.test.start,n.test.end)==='this.specialActive || this.superJumpState');
  const rolling=special.alternate;
  const compile=(text,guard=heldBrellaGuardFacing)=>new Function('PLAYER','clamp','angleDiff','TAU','reverseShotRelease','heldBrellaGuardFacing','rollingHeadingActive',
    'return (class {'+text+'}).prototype._face;')(f.PLAYER,f.clamp,f.angleDiff,Math.PI*2,reverseShotRelease,guard,rollingHeadingActive);
  const without=(node)=>source.slice(0,node.test.start-method.start)+'false'+source.slice(node.test.end-method.start);
  const cases=[...IDS.flatMap(id=>[
    {name:id+' guard',id,target:.8,guard:1,pose:1},
    {name:id+' special',id,special:true,target:Math.PI,guard:0,pose:0},
    {name:id+' superjump',id,jump:true,target:Math.PI,guard:0,pose:0},
    {name:id+' closed',id,closed:true,target:Math.PI/2,guard:1,pose:1}]),
    {name:'roller',id:'roller',rolling:true,target:Math.PI/2,guard:0,pose:0}, // follows the stick, not aim
    {name:'held catalog roller',id:'s3-roller-heavy',fire:true,target:.8,guard:0,pose:0},
    {name:'held brush',id:'s3-brush-normal',fire:true,target:.8,guard:0,pose:0},
    {name:'sub supersedes roller',id:'roller',rolling:true,sub:true,target:.8,guard:0,pose:1},
    {name:'squid supersedes held catalog roller',id:'s3-roller-heavy',fire:true,squid:true,target:Math.PI/2,guard:1,pose:1}];
  function actor(c){
    const a=f.make(c.id);a.yaw=a.yawVel=a.fireFacing=0;a._faceTarget=null;a.aimYaw=.8;
    a.intent.move.set(1,0,0);a.vel.set(0,0,-2);a.grounded=true;a.weaponRunner.firingPose=()=>false;
    a.weaponRunner.rolling=!!c.rolling;a.intent.fire=!!c.fire;a.intent.sub=!!c.sub;
    a.specialActive=c.special?{}:null;a.superJumpState=c.jump?{}:null;a.form=c.squid?'squid':'kid';
    a.weaponRunner.catalogState={id:c.id,canopy:{open:!c.closed,launched:false,hp:100}};return a;
  }
  for(const hz of[30,60,120])for(const c of cases){
    const native=actor(c),observed=actor(c);let calls=0,poseCalls=0;
    observed.weaponRunner.firingPose=()=>{poseCalls++;return false;};
    const traced=compile(source,a=>{calls++;return heldBrellaGuardFacing(a);});
    const before=JSON.stringify(native.weaponRunner.catalogState);
    native._face(1/hz,!!c.squid);traced.call(observed,1/hz,!!c.squid);
    assert.equal(native._faceTarget,c.target,c.name+' actual owner target');
    assert.deepEqual([observed.yaw,observed.yawVel,observed.anim.turnRate,observed._faceTarget],
      [native.yaw,native.yawVel,native.anim.turnRate,native._faceTarget],c.name+' extracted production method agrees');
    assert.equal(calls,c.guard,c.name+' lower-priority guard call count');
    assert.equal(poseCalls,c.pose,c.name+' firing branch call count');
    assert.equal(JSON.stringify(native.weaponRunner.catalogState),before,c.name+' never mutates canopy state');
  }
  const guard=cases[0],disabled=actor(guard);compile(source,()=>false).call(disabled,1/60,false);
  assert.notEqual(disabled._faceTarget,guard.target,'disabling the real guard changes the admitted target');
  for(const c of[cases[1],cases[2]]){
    const a=actor(c);compile(without(special)).call(a,1/60,false);
    assert.notEqual(a._faceTarget,c.target,c.name+' must fail if the special/superjump branch is disabled');
  }
  // A rolling roller with the stick released holds its heading (target null).
  const roller=cases.find(c=>c.name==='roller'),still=actor(roller);still.intent.move.set(0,0,0);
  still._face(1/60,false);assert.equal(still._faceTarget,null,'released stick holds the rolling heading');
  const a=actor(roller);a.intent.move.set(0,0,0);let lowerCalls=0;
  compile(without(rolling),x=>{lowerCalls++;return heldBrellaGuardFacing(x);}).call(a,1/60,false);
  assert.notEqual(a._faceTarget,null,'disabling the roller owner loses the held rolling heading');
  assert.equal(lowerCalls,1,'disabled roller owner incorrectly reaches the lower Brella branch');
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
