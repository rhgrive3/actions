import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoadedActorFixture} from './source-loaded-actor-fixture.mjs';
const DT=1/60,NAMES=['clavL','uArmL','fArmL','handL'];
const state=c=>c[Symbol.for('inkwave.s3.bomb-motion.install.v1')].states.get(c);
test('visible human may finish the existing recovery through dive, but hidden/expired recovery cannot resume on return',async t=>{
  const f=await sourceLoadedActorFixture({random:()=>.5}),a=await f.make(),b=await f.make(),rows=[];
  f.G.match={mode:'clams',playing:()=>true,canRespawn:()=>false};
  const tick=()=>{f.G.time+=DT;for(const x of [a,b]){x.update(DT);x.character.root.updateMatrixWorld(true);}};
  for(let i=0;i<45;i++)tick();
  b.character.trigger('clam-throw',{clamRelease:{kind:'power',pos:[0,1.15,0]}});
  let previous=0,firstHidden=null,retired=null;
  for(let i=0;i<50;i++){
    a.intent.squid=b.intent.squid=true;tick();
    const c=b.character,grip=state(c)?.clamGrip;
    if(grip){assert.ok(grip.elapsed>previous);previous=grip.elapsed;assert.ok(grip.elapsed<.52);}
    if(c.kidScale<=.001){assert.ok(!grip?.restorePending,'No bone override survives the first hidden render frame');if(firstHidden===null)firstHidden=i;}
    if(firstHidden!==null&&i>firstHidden){assert.equal(c.s3ClamGripActive,false);assert.ok(!grip?.restorePending);retired??=i;}
    const ma=a.character.getMuzzle(new f.THREE.Vector3()),mb=b.character.getMuzzle(new f.THREE.Vector3());
    assert.ok(ma.equals(mb));assert.deepEqual(Array.from(a.character.P),Array.from(c.P));
    assert.deepEqual(Array.from(a.character.tr),Array.from(c.tr));assert.deepEqual(Array.from(a.character.sp),Array.from(c.sp));
    for(const name of NAMES){const ia=a.character.boneList.indexOf(a.character.bones[name]),ib=c.boneList.indexOf(c.bones[name]);
      assert.deepEqual(a.character.sourceMotion.diveFrom[ia].q.toArray(),c.sourceMotion.diveFrom[ib].q.toArray(),'Simulation history stays clean even while display overlay is still visible');}
    rows.push({frame:i,scale:c.kidScale,active:!!c.s3ClamGripActive,elapsed:grip?.elapsed??null});
  }
  assert.ok(firstHidden!==null&&retired!==null);
  a.intent.squid=b.intent.squid=false;
  for(let i=0;i<15;i++){tick();assert.equal(b.character.s3ClamGripActive,false);}
  // A new input while still a squid must not invent a human-arm overlay.
  a.intent.squid=b.intent.squid=true;tick();
  b.character.trigger('clam-throw',{clamRelease:{kind:'power',pos:[0,1.15,0]}});
  assert.equal(b.character.s3ClamGripActive,false);
  t.diagnostic(JSON.stringify({firstHidden,retired,rows}));f.reset();
});
