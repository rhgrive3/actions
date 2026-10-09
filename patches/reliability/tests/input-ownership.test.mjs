import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, pad, STEP } from './pause-fixture.mjs';
import { adaptInputOwnership } from '../input-ownership-adapter.mjs';

async function setup() {
  const h = await boot();
  const mobile = h.input.mobile;
  Object.assign(mobile, { active:true,root:{querySelectorAll:()=>[],classList:{toggle(){},add(){},remove(){}}},visible:true,lookDX:0,lookDY:0,moveX:0,moveY:0,mapOpen:false });
  const gyro={enabled:false,discard(){},consume(out){out.yaw=this.yaw||0;out.pitch=this.pitch||0;this.yaw=this.pitch=0;return out;}};
  mobile.gyro=gyro;
  h.input.lastDevice='touch';
  return {...h,mobile,gyro};
}
for (const hz of [30,60,120,144]) test(`#475 ${hz}Hz inactive gamepad drift cannot move/rotate for ten seconds`,async()=>{
  const h=await setup(),p=pad();p[0].axes=[.2,.2,.2,.2];h.setPads(p);
  for(let i=0;i<hz*10;i++){h.input.pollPad();h.controller.update(1/hz);}
  assert.equal(h.input.lastDevice,'touch');assert.equal(h.rig.yaw,0);assert.equal(h.rig.pitch,0);assert.equal(h.actor.intent.move.length(),0);
});
test('#475 deliberate pad motion acquires ownership immediately; touch clears filtered tail and boost',async()=>{
  const h=await setup(),p=pad();p[0].axes=[.8,0,1,0];h.setPads(p);h.input.pollPad();h.controller.update(STEP);
  assert.equal(h.input.lastDevice,'pad');assert.notEqual(h.rig.yaw,0);assert.ok(h.actor.intent.move.length()>0);
  for(let i=0;i<30;i++)h.controller.update(STEP);
  assert.equal(h.controller.edgeT,0,'S3 right-stick rate cap keeps obsolete rim timer at zero');
  h.controller.edgeT=.4; // If an old filter was pending, touch must still clear it.
  const yaw=h.rig.yaw;h.input.lastDevice='touch';p[0].axes=[.2,0,.2,0];h.input.pollPad();h.controller.update(STEP);
  assert.equal(h.rig.yaw,yaw);assert.equal(h.actor.intent.move.length(),0);assert.deepEqual({...h.controller.padLook},{x:0,y:0});assert.equal(h.controller.edgeT,0);
});
test('#475 held pad actions and pending edges do not leak after keyboard/touch ownership',async()=>{
  const h=await setup(),p=pad([0,3,5,6,7,8,11,14]);h.setPads(p);h.input.pollPad();assert.equal(h.input.lastDevice,'pad');
  for(const owner of ['kbm','touch']){
    h.input.lastDevice=owner;h.input.pollPad();h.controller.update(STEP);
    assert.equal(h.input.lastDevice,owner);assert.equal(h.input.padPressed.size,0);
    for(const key of ['jump','fire','squid','sub','special'])assert.equal(h.actor.intent[key],false,key);
    assert.equal(h.controller.mapHeld,false);
  }
  h.setPads(pad());h.input.pollPad();h.setPads(pad([0]));h.input.pollPad();h.controller.update(STEP);
  assert.equal(h.input.lastDevice,'pad');assert.equal(h.actor.intent.jump,true);
});
test('#474 gyro owns pitch; swipe yaw and actual sensor pitch remain independent',async()=>{
  const h=await setup();h.gyro.enabled=true;h.mobile.lookDX=.2;h.mobile.lookDY=.3;h.gyro.pitch=.1;
  h.controller.update(STEP);assert.equal(h.rig.yaw,-.2);assert.equal(h.rig.pitch,.1);assert.equal(h.mobile.lookDY,0);
  h.mobile.lookDX=0;h.mobile.lookDY=.4;h.controller.update(STEP);assert.equal(h.rig.pitch,.1);
  h.gyro.enabled=false;h.mobile.lookDY=.4;h.controller.update(STEP);assert.equal(h.rig.pitch,.1,'transition discards old pitch');
  h.mobile.lookDY=.2;h.controller.update(STEP);assert.ok(Math.abs(h.rig.pitch+.1)<1e-12,'gyro off restores vertical swipe');
});
for(const kind of ['look','fire','squid','sub'])for(const sens of [-5,0,5])test(`#474 ${kind} drag sensitivity ${sens} uses same pitch ownership`,async()=>{
  const h=await setup();h.mobile._H=768;h.mobile.s.touchSens=sens;h.mobile.s.fireAim=true;
  const drag=()=>{h.mobile._ptr.set(77,{kind:kind==='look'?'look':'btn',id:kind,x:100,y:100,aiming:true});h.mobile._move({pointerId:77,clientX:120,clientY:120,preventDefault(){},stopPropagation(){}});};
  h.gyro.enabled=true;drag();assert.ok(h.mobile.lookDX>0);assert.equal(h.mobile.lookDY,0);
  h.gyro.enabled=false;drag();assert.ok(h.mobile.lookDY>0);
  const fresh=h.mobile.lookDY;h.controller.update(STEP);assert.equal(h.rig.pitch,-fresh,'first OFF swipe is not swallowed');
  h.gyro.enabled=true;h.mobile._gyroBtn();assert.equal(h.mobile.lookDY,0,'toggle notification clears queued pitch');
});
test('unrelated modules are unchanged and missing ownership anchors fail closed',()=>{
  assert.equal(adaptInputOwnership('src/unrelated.js','source'),'source');
  assert.throws(()=>adaptInputOwnership('src/core/input.js','missing'));
});
