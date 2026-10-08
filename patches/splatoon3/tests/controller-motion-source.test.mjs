import test from 'node:test';
import assert from 'node:assert/strict';
import { controllerMotionDelta, installControllerMotion } from '../runtime/controller-motion.mjs';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-12,`${a} != ${b}`);
test('#71 motion bridge converts finite rates once and rejects stale/malformed rates',()=>{
  const s={yawRate:2,pitchRate:-1};
  const d=controllerMotionDelta(s,1/60,0,false);
  assert.equal(d.available,true);close(d.yaw,2*1.8/60);close(d.pitch,-1*1.8/60);
  close(controllerMotionDelta(s,1/60,-5,true).pitch,1/60);
  assert.equal(controllerMotionDelta(s,0).available,false);
  assert.equal(controllerMotionDelta({...s,yawRate:NaN},1/60).available,false);
  assert.equal(controllerMotionDelta({...s,pitchRate:1000},1/60).available,false);
});
test('#71 bridge composes with original PlayerController; missing bridge is stick-only',()=>{
  class Input {}
  class PlayerController {
    constructor(input){this.input=input;this.rig={yaw:0,pitch:0};this.enabled=true;this.calls=0;}
    update(){this.calls++;}
  }
  const G={settings:{gyroSensitivity:0,invertY:false},rig:{mapK:0}};
  installControllerMotion({Input,PlayerController,G});
  const input=new Input();
  input.pad={connected:true,index:1};
  input.lastDevice='pad';
  input.down=()=>false;input.padButton=()=>false;
  const c=new PlayerController(input);
  assert.equal(input.controllerMotionStatus(),'bridge-unavailable');
  c.update(1/60);close(c.rig.yaw,0);assert.equal(c.calls,1);
  let reads=0;
  input.setControllerMotionReader(()=>{reads++;return {padIndex:1,yawRate:1,pitchRate:.5};});
  assert.equal(input.controllerMotionStatus(),'bridge-available');
  c.update(1/60);
  assert.equal(reads,1);close(c.rig.yaw,1.8/60);close(c.rig.pitch,.9/60);
  G.rig.mapK=1;c.update(1/60);assert.equal(reads,1,'map is not aimed by gyro');
  G.rig.mapK=0;input.pad.connected=false;c.update(1/60);assert.equal(reads,1);
  input.pad.connected=true;input.setControllerMotionReader(()=>({padIndex:2,yawRate:2,pitchRate:0}));
  c.update(1/60);close(c.rig.yaw,1.8/60,'wrong pad ignored');
  assert.equal(c.calls,5);
});
