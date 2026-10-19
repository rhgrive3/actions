import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fixture} from './source-fixture.mjs';

const {THREE}=await fixture(),context=vm.createContext({});
const runtimePath=process.env.INKWAVE_BUILT_SITE?path.resolve(process.env.INKWAVE_BUILT_SITE,'patches/splatoon3/runtime/weapon-handoff-motion.mjs'):new URL('../runtime/weapon-handoff-motion.mjs',import.meta.url);
const runtimeSource=fs.readFileSync(runtimePath,'utf8');
console.log(JSON.stringify({airSupportRuntime:String(runtimePath),sha256:createHash('sha256').update(runtimeSource).digest('hex'),emitted:!!process.env.INKWAVE_BUILT_SITE}));
const module=new vm.SourceTextModule(runtimeSource,{context});
await module.link(spec=>{
 if(spec==='./bomb-motion.mjs')return new vm.SyntheticModule(['applyClamThrowGrip'],function(){this.setExport('applyClamThrowGrip',()=>{throw Error('unrelated clam helper');});},{context});
 assert.equal(spec,'./ranked/rainmaker-motion.mjs');
 return new vm.SyntheticModule(['applyRainmakerPose','rainmakerAimQuaternion'],function(){
  this.setExport('applyRainmakerPose',ch=>{ch._rainmakerPose=ch.carry;});
  this.setExport('rainmakerAimQuaternion',out=>out.identity());
 },{context});
});
await module.evaluate();
// A geometric boundary probe around the installed final owner. The solver is
// counted and represented by a fixed-length straight chain. Real-Actor replay
// separately checks the native two-bone IK and unchanged joint lengths.
class Rig{
 constructor(){
  this.kid=new THREE.Group();this.bones={clavL:new THREE.Group(),handR:new THREE.Group(),handL:new THREE.Group()};
  for(const name of ['spine','chest','neck','clavR','uArmL','uArmR','fArmL','fArmR'])this.bones[name]=new THREE.Group();
  this.kid.add(this.bones.clavL,this.bones.handR);const up=this.bones.uArmL;up.position.set(.1,0,0);this.bones.clavL.add(up);
  up.add(this.bones.fArmL);this.bones.fArmL.position.set(0,0,.2);this.bones.fArmL.add(this.bones.handL);this.bones.handL.position.set(0,0,.1998);
  this.boneList=Object.values(this.bones);
  this.weapon={pivot:new THREE.Group()};this.bones.handR.add(this.weapon.pivot);
  this.limbs={armL:{up,a:.2,b:.2}};this.P=new Float64Array(8);this.P[0]=1;this.ikErr=[0];
  this.kidScale=1;this.carry=true;this.kidForm=true;this.sourceMotion={active:true,state:'air'};this.actor={aimDir:new THREE.Vector3(0,0,1),yaw:0};
  this.solves=0;this.target=new THREE.Vector3();
 }
 _applyPose(){for(const bone of this.boneList)bone.quaternion.identity();}
 setWeapon(){}
 dispose(){}
 _kidXform(bone,pos,quat){bone.getWorldPosition(pos);this.kid.worldToLocal(pos);bone.getWorldQuaternion(quat);quat.premultiply(this.kid.getWorldQuaternion(new THREE.Quaternion()).invert());}
 _solveLimb(limb,target){assert.equal(limb,this.limbs.armL);this.solves++;this.target.copy(target);const shoulder=limb.up.getWorldPosition(new THREE.Vector3());this.kid.worldToLocal(shoulder);this.residual=Math.max(0,shoulder.distanceTo(target)-(.4*.9995));limb.up.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),target.clone().sub(shoulder).normalize());}
}
const G={match:{mode:'rainmaker'}};
module.namespace.installWeaponHandoffMotion({THREE,Character:Rig,CHARACTER_CHANNELS:{POLEL:0,IKL:3,LTW:4},G});
const distance=.45,length=.1,reach=.4*.9995;
const threshold=Math.acos((distance*distance+length*length-reach*reach)/(2*distance*length));
function sample(required,rig=new Rig()){
 if(rig.s3RainmakerSupportPending)rig._restoreRainmakerSupport();
 const angle=threshold+required;rig.bones.handR.position.set(distance*Math.cos(angle),0,distance*Math.sin(angle)-.07);
 const before=rig.bones.handR.position.toArray();rig._applyPose(1/60,{});
 assert.deepEqual(rig.bones.handR.position.toArray(),before);assert.ok(rig.bones.clavL.getWorldPosition(new THREE.Vector3()).length()<=.03+1e-12,'bounded .03 world translation');
 rig.finalResidual=rig.bones.handL.getWorldPosition(new THREE.Vector3()).distanceTo(rig.kid.localToWorld(rig.target.clone()));
 return{rig,angle:2*Math.acos(Math.min(1,Math.abs(rig.bones.clavL.quaternion.w)))};
}
test('air support enters continuously at the reach boundary and stays below the cap',()=>{
 for(const n of [-1e-5,0,1e-5,.01,.109676,.143847]){
  const x=sample(n);assert.ok(Math.abs(x.angle-Math.max(0,n))<1e-7);assert.equal(x.rig.solves,1);assert.ok(x.rig.finalResidual<.001);
 }
});
test('0.2 rad rotation and .03 world translation caps stay bounded; farther target still fails',()=>{
 for(const n of [.2-1e-5,.2,.2+1e-5])assert.ok(Math.abs(sample(n).angle-Math.min(.2,n))<1e-7);
 const reachable=sample(.4);assert.ok(reachable.rig.finalResidual<.001);assert.ok(reachable.rig.bones.clavL.position.length()>0);
 const x=sample(.9);assert.ok(Math.abs(x.angle-.2)<1e-7);assert.ok(x.rig.finalResidual>.001,'cap cannot hide unsolved target');assert.equal(x.rig.solves,1);
});
test('repeated frames do not accumulate, and landing/drop/source-off restore native clavicle',()=>{
 const rig=new Rig(),reference=sample(.4,rig).rig.bones.clavL.position.clone();for(let i=0;i<100;i++){assert.ok(Math.abs(sample(.4,rig).angle-.2)<1e-7);assert.ok(rig.bones.clavL.position.distanceTo(reference)<1e-12);}
 rig.sourceMotion.state='idle';assert.equal(sample(.14,rig).angle,0);
 rig.sourceMotion.state='air';rig.sourceMotion.active=false;assert.equal(sample(.14,rig).angle,0);
 rig.sourceMotion.active=true;rig.carry=false;const count=rig.solves;assert.equal(sample(.14,rig).angle,0);assert.equal(rig.solves,count);
});

test('restoration retains the legacy one-solve pose and clears pending on weapon/dispose',()=>{
 for(const action of ['_restoreRainmakerSupport','setWeapon','dispose']){
  const {rig}=sample(.4),shown=rig.bones.clavL.quaternion.clone();
  assert.equal(rig.s3RainmakerSupportPending,true);assert.ok(shown.angleTo(new THREE.Quaternion())>.1);
  rig[action]();assert.equal(rig.s3RainmakerSupportPending,false);
  assert.equal(rig.bones.clavL.quaternion.angleTo(new THREE.Quaternion()),0);assert.deepEqual(Array.from(rig.bones.clavL.position.toArray()),[0,0,0]);
  const targetDir=rig.target.clone().sub(rig.limbs.armL.up.position).normalize();
  assert.ok(new THREE.Vector3(0,0,1).applyQuaternion(rig.bones.uArmL.quaternion).distanceTo(targetDir)<1e-12);
  assert.equal(rig.solves,1);
 }
});

test('translation cap uses actual world coordinates under nonuniform form scale',()=>{
 const rig=new Rig();rig.kid.scale.set(.7,1.3,.8);const result=sample(.9,rig);assert.ok(Math.abs(result.angle-.2)<1e-7);assert.ok(rig.bones.clavL.getWorldPosition(new THREE.Vector3()).length()<=.03+1e-12);assert.ok(rig.finalResidual>.001);rig._restoreRainmakerSupport();assert.deepEqual(Array.from(rig.bones.clavL.position.toArray()),[0,0,0]);
});
