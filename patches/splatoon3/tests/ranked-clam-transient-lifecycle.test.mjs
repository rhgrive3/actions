import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoadedActorFixture} from './source-loaded-actor-fixture.mjs';
const NAMES=['clavL','uArmL','fArmL','handL'];
const state=c=>c[Symbol.for('inkwave.s3.bomb-motion.install.v1')].states.get(c);
function persistent(c){const result={};for(const k of Object.keys(c)){
  if(k==='s3ClamGripActive')continue;const v=c[k];
  if(v==null||['number','string','boolean'].includes(typeof v))result[k]=v;
  else if(ArrayBuffer.isView(v))result[k]=Array.from(v);
  else if(v?.isVector2||v?.isVector3||v?.isVector4||v?.isQuaternion||v?.isEuler||v?.isMatrix3||v?.isMatrix4)result[k]=v.toArray();
}return result;}
test('transient clam overlay restores only its four bones before source capture and on cancellation, including world matrices',async t=>{
  const f=await sourceLoadedActorFixture({random:()=>.5}),a=await f.make(),c=a.character,rows=[];
  f.G.match={mode:'clams',playing:()=>true,canRespawn:()=>false};
  const release=()=>c.trigger('clam-throw',{clamRelease:{kind:'power',pos:[0,1.15,0]}});
  for(const action of ['hide','ordinary-bomb','weapon-switch','source-switch','death','dispose']){
    a.alive=true;a.hp=100;c.setVisible(true);a.setWeapon('shooter');c.sourceMotion.setEnabled(true);
    for(let i=0;i<40;i++)f.tick(a);
    const before=NAMES.map(n=>c.bones[n].quaternion.clone());
    const positions=c.boneList.map(b=>b.position.toArray()),scales=c.boneList.map(b=>b.scale.toArray());
    const other=c.boneList.filter(b=>!NAMES.includes(b.name)).map(b=>b.quaternion.toArray());
    const fields=persistent(c),world=c.bones.handL.getWorldPosition(new f.THREE.Vector3());
    release();const bank=state(c).clamGrip;
    assert.ok(bank.restorePending);assert.deepEqual(persistent(c),fields,'Event solve changes no native scalar/vector/timer/spring/IK fields');
    assert.deepEqual(c.boneList.map(b=>b.position.toArray()),positions);assert.deepEqual(c.boneList.map(b=>b.scale.toArray()),scales);
    assert.deepEqual(c.boneList.filter(b=>!NAMES.includes(b.name)).map(b=>b.quaternion.toArray()),other,'Event leaves all unrelated bones untouched');
    release();assert.equal(state(c).clamGrip,bank,'Repeat reuses the same scratch bank');
    NAMES.forEach((n,i)=>assert.ok(bank.base[i].equals(before[i]),'Repeat does not save its own prior overlay as the baseline'));
    if(action==='hide')c.setVisible(false);
    if(action==='ordinary-bomb')c.trigger('throw');
    if(action==='weapon-switch')a.setWeapon('dualies');
    if(action==='source-switch'){
      c.sourceMotion.setEnabled(false);c._updateStates(0,a.anim);
      assert.equal(bank.restorePending,false,'Existing state owner removes overlay before source may resume');
      c.setVisible(false);
    }
    if(action==='death')a.splat(null,'test');
    if(action==='dispose')c.dispose();
    assert.equal(c.s3ClamGripActive,false);assert.equal(bank.restorePending,false);
    assert.ok(!state(c)?.clamGrip);
    NAMES.forEach((n,i)=>assert.ok(c.bones[n].quaternion.equals(before[i]),`${action} restores ${n}`));
    assert.ok(c.bones.handL.getWorldPosition(new f.THREE.Vector3()).distanceTo(world)<1e-12,`${action}: restored world matrices do not retain the event wrist`);
    rows.push({action,restored:true,eventPersistentStateDifference:0});
  }
  t.diagnostic(JSON.stringify(rows));f.reset();
});
