import test from 'node:test';
import assert from 'node:assert/strict';
import {createSwitchHIDReader,controllerMotionDelta,DEFAULT_GYRO_SCALE,SWITCH_IMU_SAMPLE_SECONDS} from '../runtime/controller-motion.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-11,`${a} != ${b}`);
function packet(samples=[100,200,300],timer=1){
 const bytes=new Uint8Array(48),view=new DataView(bytes.buffer);bytes[0]=timer;
 samples.forEach((value,i)=>{view.setInt16(18+12*i,value,true);view.setInt16(22+12*i,-value,true);});return view;
}
test('all three 5ms samples contribute once, even when the first sample is zero',()=>{
 const r=createSwitchHIDReader({integrateReports:true});r.feedReport(packet([0,200,400]),0x30);
 const sample=r({index:0},1/60),d=controllerMotionDelta(sample,1/60,-5);
 close(d.yaw,600*DEFAULT_GYRO_SCALE*SWITCH_IMU_SAMPLE_SECONDS);close(d.pitch,d.yaw);
 assert.equal(r({index:0},1/60),null,'no repeated latest-rate drift');
});
test('packet arrival between renders preserves total angle at 30/60/120Hz',()=>{
 const values=[];
 for(const hz of [30,60,120]){
  const r=createSwitchHIDReader({integrateReports:true});let arrived=0,total=0;
  for(let frame=1;frame<=hz;frame++){
   while(arrived<60&&(arrived+1)*.015<=frame/hz+1e-12){r.feedReport(packet([100,200,300],arrived++),0x30);}
   const d=controllerMotionDelta(r({index:0},1/hz),1/hz,-5);if(d.available)total+=d.yaw;
  }
  values.push(total);close(total,60*600*DEFAULT_GYRO_SCALE*.005);
 }
 close(Math.max(...values)-Math.min(...values),0);
});
test('rate-based external reader contract remains independent and inversion applies once',()=>{
 const r=createSwitchHIDReader({integrateReports:true});r.feedReport(packet(),0x30);
 const sample=r({index:2},1/120),d=controllerMotionDelta(sample,1/120,-5,true,true);
 close(d.yaw,-600*DEFAULT_GYRO_SCALE*.005);close(d.pitch,d.yaw);assert.equal(sample.padIndex,2);
 close(controllerMotionDelta({yawRate:1,pitchRate:2},1/60,-5).yaw,1/60);
});
test('recenter, invalid reports and detach discard queued angular displacement',()=>{
 for(const action of ['recenter','discard','detach']){const r=createSwitchHIDReader({integrateReports:true});
  r.feedReport(packet(),0x30);r[action]();assert.equal(r({index:0},1/60),null);}
 const r=createSwitchHIDReader({integrateReports:true});r.feedReport(packet(),0x30);
 r.feedReport(new Uint8Array(24),0x30);assert.equal(r({index:0},1/60),null);
});
test('queued motion has a bounded duration and malformed deltas cannot enter the camera',()=>{
 const r=createSwitchHIDReader({integrateReports:true});for(let i=0;i<500;i++)r.feedReport(packet(),0x30);
 const sample=r({index:0},1/60);assert.ok(sample.sampleSeconds<=.1);assert.ok(sample.sampleSeconds>0);
 for(const changes of [{yawDelta:Infinity},{sampleSeconds:3},{pitchDelta:100},{sampleSeconds:NaN}])
  assert.equal(controllerMotionDelta({...sample,...changes},1/60).available,false);
});

test('menu/pause suspension drops reports arriving during the takeover, not just the opening edge',()=>{
 const r=createSwitchHIDReader({integrateReports:true,initiallySuspended:true});
 r.feedReport(packet(),0x30);r.resume();assert.equal(r({index:0},1/60),null,'pre-game report is not replayed');
 r.feedReport(packet(),0x30);assert.ok(r({index:0},1/60));r.suspend();
 for(let i=0;i<20;i++)r.feedReport(packet(),0x30);
 r.resume();assert.equal(r({index:0},1/60),null,'reports received inside a paused menu are discarded');
 r.feedReport(packet(),0x30);assert.ok(controllerMotionDelta(r({index:0},1/60),1/60).available);
});
