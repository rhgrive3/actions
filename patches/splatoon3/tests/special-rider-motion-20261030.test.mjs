import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoadedActorFixture} from './source-loaded-actor-fixture.mjs';

const f=await sourceLoadedActorFixture({random:()=>.5,extraExports:`
  export {specialRiderMotionSnapshot} from './patches/splatoon3/runtime/special-motion.mjs';
`});
const {G,THREE:T,CHARACTER_CHANNELS:C}=f;
after(()=>f.reset());
const bones=['hips','spine','chest','thighL','thighR','shinL','shinR','footL','footR'];
const steady=new Map();
const gripEvidence=new WeakMap();
function points(ch){ch.root.updateMatrixWorld(true);return Object.fromEntries(bones.map(name=>[name,
  ch.root.worldToLocal(ch.bones[name].getWorldPosition(new T.Vector3())).toArray()]));}
function close(a,b,message,tolerance=1e-6){assert.equal(a.length,b.length);for(let i=0;i<a.length;i++)assert.ok(Math.abs(a[i]-b[i])<tolerance,`${message}: ${a} / ${b}`);}
function checkSteady(id,hz,pose){
  const prior=steady.get(id);
  if(prior)for(const name of ['hips','footL','footR'])close(pose[name],prior[name],id+' '+hz+'Hz '+name,.00001);
  else steady.set(id,pose);
}
function grips(ch){
  for(const d of ch.s3SpecialDevices())for(const side of ['R','L']){
    const target=d.model.root.localToWorld(new T.Vector3(...d.spec.hands[side]));
    const hole=ch.bones['hand'+side].localToWorld(new T.Vector3(side==='R'?.0255:-.0255,-.0525,0));
    const error=hole.distanceTo(target);
    if(!gripEvidence.has(ch)||error>gripEvidence.get(ch).error)gripEvidence.set(ch,{side,error,target:target.toArray(),hole:hole.toArray(),state:ch.actor._s3AllSpecialState.phase,age:ch.actor._s3AllSpecialState.t,handScale:ch.bones['hand'+side].scale.toArray()});
  }
}
function assertGrips(ch,id,hz){const evidence=gripEvidence.get(ch);console.log(JSON.stringify({id,hz,grip:evidence}));assert.ok(evidence?.error<1e-5,'rider grips: '+JSON.stringify(evidence));}
async function start(id,hz=60,enabled=true){
  f.reset();G.time=0;const a=await f.make(),ch=a.character;ch.s3SpecialMotionEnabled=enabled;
  for(let i=0;i<hz;i++)f.tick(a,1/hz);
  a.weapon={...a.weapon,special:id};a.special=a.specialCost();a._startSpecial();
  assert.equal(a.specialActive?.id,id);return {a,ch,step:(dt=1/hz)=>f.tick(a,dt)};
}
function gameplay(a){const s=a._s3AllSpecialState;return JSON.stringify({
  pos:a.pos.toArray(),vel:a.vel.toArray(),ink:a.ink,hp:a.hp,special:a.special,invuln:a.invuln,form:a.form,
  active:a.specialActive&&{id:a.specialActive.id,phase:a.specialActive.phase,pose:a.specialActive.pose},
  state:s&&{id:s.id,t:s.t,phase:s.phase,ballMode:s.ballMode,startupT:s.startupT,dashT:s.dashT,brakeT:s.brakeT,recoveryT:s.recoveryT},
  shots:G.projectiles.list.length,
});}

for(const hz of [30,60,120])test(`Crab rider retains bent legs above the floor through movement and pause at ${hz}Hz`,async()=>{
  const {a,ch,step}=await start('crabTank',hz);
  for(let i=0;i<hz/2;i++)step();
  const resting=points(ch),s=f.specialRiderMotionSnapshot(ch);
  checkSteady('crabTank',hz,resting);grips(ch);
  assert.equal(s.kind,'crabTank');assert.equal(s.weight,1);
  assert.ok(ch.sourceMotion.active,'loaded source controller remains enabled outside the drawing transaction');
  assert.ok(resting.hips[1]>.9,'pelvis is at the cockpit rim instead of the standing ground pose');
  for(const side of ['L','R']){
    assert.ok(resting['thigh'+side][1]-resting['foot'+side][1]>.2,'ankles descend below the anatomical hips');
    assert.ok(resting['shin'+side][2]>resting['thigh'+side][2]+.08,'knees bend toward the controls from the hips');
    assert.ok(resting['shin'+side][1]-resting['foot'+side][1]>.07,'calves descend from knees to ankles');
  }
  assert.equal(ch.P[C.WPL],0);assert.equal(ch.P[C.WPR],0);
  const before=gameplay(a);step(0);assert.equal(gameplay(a),before,'paused presentation does not advance the actual special');
  const paused=points(ch);for(const name of bones)close(paused[name],resting[name],'paused '+name);
  a.intent.move.set(1,0,1);
  for(let i=0;i<hz/2;i++){
    step();const moving=points(ch);
    grips(ch);
    for(const name of ['hips','footL','footR'])close(moving[name],resting[name],'riding '+name,.002);
  }
  assert.ok(a.pos.length()>.1,'native vehicle movement really advances');
  assertGrips(ch,'crabTank',hz);
});

for(const hz of [30,60,120])test(`Reefslider lower body stays crouched and trailing across startup, dash and brake at ${hz}Hz`,async()=>{
  const {a,ch,step}=await start('reefslider',hz),phases=new Set();
  let sample;
  for(let i=0;i<hz*2;i++){
    step();const state=a._s3AllSpecialState;
    if(!state||state.phase==='recovery'||state.t<.3)continue;
    phases.add(state.phase);const p=points(ch);sample=p;
    grips(ch);
    assert.equal(f.specialRiderMotionSnapshot(ch)?.kind,'reefslider');
    assert.ok(p.hips[1]<.53,'rider lowers their hips over the saddle');
    assert.ok(p.chest[2]>p.hips[2]+.10,'torso leans toward the actual handles');
    for(const side of ['L','R']){
      assert.ok(p['foot'+side][2]<p.hips[2]-.15,'feet trail behind the pelvis');
      assert.ok(p['foot'+side][1]>.17,'rider feet do not plant on the moving floor');
    }
    assert.equal(ch.P[C.WPL],0);assert.equal(ch.P[C.WPR],0);
    assert.ok(ch.P.every(Number.isFinite));
  }
  assert.deepEqual([...phases],['startup','dash','brake']);
  assert.ok(sample);
  checkSteady('reefslider',hz,sample);
  assertGrips(ch,'reefslider',hz);
});

test('vehicle drawing leaves native movement, phases, damage and emission clocks unchanged',async()=>{
  for(const id of ['crabTank','reefslider'])for(const hz of [30,60,120]){
    const traces=[];
    for(const enabled of [false,true]){
      const {a,step}=await start(id,hz,enabled),trace=[];
      a.intent.move.set(.6,0,.8);a.intent.fire=id==='crabTank';
      for(let i=0;i<hz*3;i++){step();trace.push(gameplay(a));}
      traces.push(trace);
    }
    assert.deepEqual(traces[1],traces[0],id+' native trace at '+hz+'Hz');
  }
});

test('rider ownership releases on ball form, hidden parent, opt-out, weapon change, cancellation and death',async()=>{
  for(const interruption of ['ball','hidden','motion-off','presentation-off','weapon','cancel','death']){
    const {a,ch,step}=await start('crabTank');for(let i=0;i<30;i++)step();
    const source=ch.sourceMotion;assert.equal(f.specialRiderMotionSnapshot(ch)?.kind,'crabTank');
    if(interruption==='ball'){a.specialActive.pose='ball';a._s3AllSpecialState.ballMode=true;}
    if(interruption==='hidden'){const group=new T.Group();G.scene.add(group);group.add(ch.root);group.visible=false;}
    if(interruption==='motion-off')ch.s3SpecialMotionEnabled=false;
    if(interruption==='presentation-off')ch.s3SpecialPresentationEnabled=false;
    if(interruption==='weapon')ch.setWeapon('blaster');
    if(interruption==='cancel'){a.specialActive=null;a._s3AllSpecialState=null;}
    if(interruption==='death')a.splat(null,'rider test');
    // Exercise the Character boundary even where dead actors stop updating it.
    ch.update(1/60,a.anim);
    assert.equal(f.specialRiderMotionSnapshot(ch),null,interruption+' clears ownership');
    assert.equal(ch.sourceMotion,source,'source controller is not replaced');
    assert.ok(ch.P.every(Number.isFinite));
  }
});

test('source body and main weapon resume after the native special ends',async()=>{
  const poses=[];
  for(const enabled of [false,true]){
    const {a,ch,step}=await start('reefslider',60,enabled);
    for(let i=0;i<240;i++)step();
    assert.equal(a.specialActive,null);assert.equal(f.specialRiderMotionSnapshot(ch),null);
    assert.equal(ch.sourceMotion.active,true);assert.equal(ch.sourceMotion.sourceUpper,true);
    assert.equal(ch.weapon.pivot.visible,true);poses.push(points(ch));
  }
  for(const name of bones)close(poses[1][name],poses[0][name],'restored source '+name,.002);
});

test('a failed native pose still restores the source controller owner',async()=>{
  const {ch,step}=await start('crabTank');for(let i=0;i<30;i++)step();
  const source=ch.sourceMotion,applyBody=source.applyBody,active=source.active;
  source.applyBody=()=>{throw new Error('pose transaction probe');};
  try {assert.throws(()=>ch._applyPose(1/60,{}),/pose transaction probe/);}
  finally {source.applyBody=applyBody;}
  assert.equal(source.active,active,'finally restores the source owner after a delegated failure');
});
