import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sourceLoadedActorFixture} from '../../splatoon3/tests/source-loaded-actor-fixture.mjs';
import {contactPoseSnapshot} from './source-contact-fixture.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {adaptWalkPresentation} from '../walk-presentation-adapter.mjs';
import {replaceOnce} from '../adapter.mjs';
const before=JSON.parse(fs.readFileSync(new URL('./fixtures/added-ui-motion-before.json',import.meta.url)));
// Compare sparse storage with the same later walking presentation on both
// sides. The frozen source bytes and every strict pose assertion stay intact.
// Build the negative control from today's complete composition, not a frozen
// pre-queue source controller that lacks later movement and hair behavior.
// Reverse only the sparse-storage/camera-hotpath batch under test. The saved
// pre-optimization snapshot still anchors the original dense expressions.
const baseline=(rel,raw)=>{
 let code=adaptBuildSource(rel,raw);
 const denseGait='this.wp=bank.bones.map(()=>new THREE.Vector3());this.wq=bank.bones.map(()=>new THREE.Quaternion());';
 const denseBalance='this.targets={wp:bank.bones.map(()=>new THREE.Vector3())};this.centerTargets={wp:bank.bones.map(()=>new THREE.Vector3())};';
 const densePrevious='this.previousBalanceTargets={wp:bank.bones.map(()=>new THREE.Vector3())};';
 if(rel==='src/game/motion/gait-targets.js'){
   assert.ok(before.motionSources[rel].includes(denseGait),'frozen dense-gait negative control');
   const sparse='if(this.indices.every(i=>Number.isInteger(i)&&i>=0&&i<bank.bones.length)){this.wp=new Array(bank.bones.length);this.wq=new Array(bank.bones.length);for(const i of this.indices){this.wp[i]=new THREE.Vector3();this.wq[i]=new THREE.Quaternion();}}else{'+denseGait+'}';
   return replaceOnce(code,sparse,denseGait,'dense gait A/B control');
 }
 if(rel==='src/game/motion/body-balance.js'){
   assert.ok(before.motionSources[rel].includes(denseBalance),'frozen dense-balance negative control');
   const sparse="const balanceIndices=['leg1_L','leg1_R'].map(name=>bank.index[name]);if(balanceIndices.every(i=>Number.isInteger(i)&&i>=0&&i<bank.bones.length)){this.targets={wp:new Array(bank.bones.length)};this.centerTargets={wp:new Array(bank.bones.length)};for(const i of balanceIndices){this.targets.wp[i]=new THREE.Vector3();this.centerTargets.wp[i]=new THREE.Vector3();}}else{"+denseBalance+"}";
   return replaceOnce(code,sparse,"const balanceIndices=['leg1_L','leg1_R'].map(name=>bank.index[name]);"+denseBalance,'dense balance A/B control');
 }
 if(rel==='src/game/motion/source-controller.js'){
   assert.ok(before.motionSources[rel].includes(densePrevious),'frozen dense-previous-balance control');
   const sparse="const balanceIndices=['leg1_L','leg1_R'].map(name=>bank.index[name]);if(balanceIndices.every(i=>Number.isInteger(i)&&i>=0&&i<bank.bones.length)){this.previousBalanceTargets={wp:new Array(bank.bones.length)};for(const i of balanceIndices)this.previousBalanceTargets.wp[i]=new THREE.Vector3();}else{"+densePrevious+"}";
   return replaceOnce(code,sparse,densePrevious,'dense previous balance A/B control');
 }
 if(rel==='src/game/cameraRig.js'){
   const start=code.indexOf('    let fwd;\n    if (this.forward === CAMERA_FORWARD_IMPL) {');
   const suffix='   // camera right on the ground plane';
   const at=code.indexOf(suffix,start);
   assert.ok(start>=0&&at>start,'current camera fast path belongs to the A/B test');
   return code.slice(0,start)+'    const fwd = this.forward(_fwd);\n    _right.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));'+suffix+code.slice(at+suffix.length);
 }
 return code;
};
const extraExports="export {GaitTargets} from './src/game/motion/gait-targets.js';export {BodyBalance} from './src/game/motion/body-balance.js';export {CameraRig} from './src/game/cameraRig.js';";
const json=x=>JSON.parse(JSON.stringify(x));
function cameraSnapshot(r){const out={};for(const k of ['yaw','pitch','pivotY','curDist','fovKick','scopeK','wantDist','shoulder','kick','_lastTY','_vyF','_sjLandT'])out[k]=r[k];for(const k of ['sx','sy','sz','hgt','side','boom','lensLift','kickS','dipS'])out[k]=json(r[k]);return json({...out,pivot:r.pivot.toArray(),p:r.camera.position.toArray(),q:r.camera.quaternion.toArray()});}
test('real source bank: sparse foot/balance storage preserves full pose, contacts, skeleton and muzzle at30/60/120Hz',async()=>{const apis=[];try{for(const transform of [baseline,adaptBuildSource])apis.push(await sourceLoadedActorFixture({transform,random:()=>.375,extraExports}));for(const hz of [30,60,120]){const actors=await Promise.all(apis.map(a=>a.make()));const [old,next]=actors.map(a=>a.character.sourceMotion);apis[1]._addedBank=next.bank;const count=a=>a.reduce((n,v)=>n+(!!v),0);assert.equal(count(next.gaitTargets.wp),6);assert.equal(count(old.gaitTargets.wp),old.bank.bones.length);assert.equal(count(next.bodyBalance.targets.wp),2);assert.equal(count(next.bodyBalance.centerTargets.wp),2);assert.equal(count(next.previousBalanceTargets.wp),2);const other=new apis[1].GaitTargets(next.bank);for(const i of next.gaitTargets.indices){assert.notEqual(other.wp[i],next.gaitTargets.wp[i]);assert.notEqual(other.wq[i],next.gaitTargets.wq[i]);}
 for(let i=0;i<hz*3;i++){for(let k=0;k<2;k++){const api=apis[k],a=actors[k],ch=a.character,dt=i%83===0?0:i%101===0?.08:1/hz;const state={form:i<hz*2?'kid':'squid',grounded:i<hz||i>hz*1.4,speed:i<hz*.5?0:5,vy:i>hz&&i<hz*1.4?-1:0,firing:i%27<10,rolling:false,localMove:{x:Math.sin(i/31),z:Math.cos(i/31)},ink:1,hp:1};a.grounded=state.grounded;a.form=state.form;a.vel.set(state.localMove.x*state.speed,state.vy,state.localMove.z*state.speed);a.pos.addScaledVector(a.vel,dt);ch.root.position.copy(a.pos);api.G.time+=dt;ch.update(dt,state);ch.root.updateMatrixWorld(true);ch.skeleton.update();}assert.deepEqual(contactPoseSnapshot(actors[1].character),contactPoseSnapshot(actors[0].character),'Hz'+hz+' frame'+i);}
 // Actual complete camera follow, including collision probes and late flight
 // yaw changes; an overridden forward mutates yaw to exercise the fallback.
 const rigs=apis.map((api,k)=>{const r=new api.CameraRig(new api.THREE.PerspectiveCamera(70,16/9,.1,200));r.target=actors[k];r.mode='follow';return r;});
 for(let i=0;i<80;i++){for(let k=0;k<2;k++){const a=actors[k],r=rigs[k];r.yaw=i/19;r.pitch=-.2+Math.sin(i/10)*.1;a.form='kid';a.anim.form=i<20?'swim':'kid';a.superJumpState=i>=30&&i<50?{phase:'flight',to:{x:8,z:4},from:{x:0,z:0},t:i/80,dur:1}:null;a.specialActive=i>60;a.landT=i/80;a.landSpeed=7;if(i===60){const original=r.forward;r.forward=function(out){this.yaw+=.02;return original.call(this,out);};}r._follow(1/hz);}assert.deepEqual(cameraSnapshot(rigs[1]),cameraSnapshot(rigs[0]),'camera '+hz+' frame'+i);}
 apis.forEach(a=>a.reset());}
 // Missing/invalid bone indices retain the old dense-storage behavior, so
 // malformed banks are not silently converted into custom array properties.
 const bank=apis[1]._addedBank;for(const invalid of [undefined,-1,bank.bones.length,1.5]){const broken={...bank,index:{...bank.index,foot_L:invalid}};const a=new apis[1].GaitTargets(broken);assert.equal(a.wp.filter(Boolean).length,bank.bones.length);assert.equal(Object.hasOwn(a.wp,'undefined'),false);const badLeg={...bank,index:{...bank.index,leg1_L:invalid}};const b=new apis[1].BodyBalance(badLeg);assert.equal(b.targets.wp.filter(Boolean).length,bank.bones.length);assert.equal(b.centerTargets.wp.filter(Boolean).length,bank.bones.length);}
}finally{apis.forEach(a=>a.reset());}});
