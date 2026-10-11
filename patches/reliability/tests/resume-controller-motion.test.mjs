import test from 'node:test';
import assert from 'node:assert/strict';
import {boot,pad,STEP} from './pause-fixture.mjs';
import {installControllerMotion,createSwitchHIDReader} from '../../splatoon3/runtime/controller-motion.mjs';
async function setup(){const h=await boot();installControllerMotion({Input:h.input.constructor,PlayerController:h.controller.constructor,G:h.G});h.setPads(pad());h.input.pollPad();h.input.lastDevice='pad';h.G.settings.gyro=true;const reader=createSwitchHIDReader({maxAgeMs:60000});h.input.setControllerMotionReader(reader);const packet=new DataView(new ArrayBuffer(48));packet.setInt16(18,100,true);packet.setInt16(22,-100,true);return {...h,reader,feed:()=>reader.feedReport(packet,0x30)};}
for(const mode of ['offline','online','online-dead'])test(`resume retires ${mode} menu packets without waiting for another blocked tick`,async()=>{
 const h=await setup();if(mode!=='offline')h.G.netm={};
 h.feed();h.game.pause();assert.equal(h.reader(h.input.pad,STEP),null,'pause entry retires pre-menu sample');
 if(mode==='online-dead')h.actor.splat(null,'water');
 h.feed();assert.ok(h.reader(h.input.pad,STEP),'packet arrives during menu');h.game.resume();
 assert.equal(h.reader(h.input.pad,STEP),null,'resume must retire the packet received while menu owned input');
 if(mode!=='online-dead'){h.controller.update(STEP);assert.equal(h.rig.yaw,0);h.feed();h.controller.update(STEP);assert.ok(h.rig.yaw>0,'fresh post-resume report restores aim');}
 else {h.controller.enabled=false;h.controller.navigationEnabled=true;h.controller.update(STEP);assert.equal(h.rig.yaw,0);}
});
test('resume remains available with absent or throwing optional HID reader',async()=>{for(const reader of [undefined,{discard(){throw Error('injected bridge fault');}}]){const h=await boot();h.input.s3ControllerMotionReader=reader;h.game.pause();assert.doesNotThrow(()=>h.game.resume());assert.equal(h.m.paused,false);assert.equal(h.controller.enabled,true);}});
