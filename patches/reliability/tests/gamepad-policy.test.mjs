import test from 'node:test';
import assert from 'node:assert/strict';
import {boot,pad,STEP} from './pause-fixture.mjs';
const envOf=h=>h.input.constructor.constructor('return globalThis')();
const blocked=h=>{const env=envOf(h),original=env.navigator.getGamepads;env.navigator.getGamepads=()=>{const e=new Error('Gamepad policy');e.name='SecurityError';throw e;};return()=>{env.navigator.getGamepads=original;};};
const classes=()=>({add(){},remove(){},toggle(){}});

for(const hz of [30,60,120])test(`policy denial leaves 300 ${hz}Hz keyboard frames running`,async()=>{
 const h=await boot();blocked(h);h.event('keydown',{code:'KeyW',preventDefault(){}});
 let net=0;h.G.net={update(){net++;}};
 for(let i=0;i<300;i++)h.frame(1/hz);
 assert.equal(net,300);assert.equal(h.updates.length,300*60/hz);
 assert.ok(h.actor.intent.move.length()>0);assert.equal(h.input.pad,null);
});

test('touch stick, buttons, swipe and real Gyro consume remain live under policy denial',async()=>{
 const h=await boot(),m=h.input.mobile;blocked(h);
 m.active=true;m.root={classList:classes(),querySelectorAll:()=>[]};m.els={fire:{classList:classes()}};
 h.input.lastDevice='touch';m.s.stickMode='floating';
 m._stickStart({pointerId:1,clientX:100,clientY:400});m._stickMove({pointerId:1,clientX:130,clientY:400});
 m._press('fire',{pointerId:2,clientX:700,clientY:400});
 m.lookDX=.1;m.gyro.enabled=true;m.gyro.dYaw=.25;m.gyro.dPitch=.05;
 h.frame(STEP);
 assert.ok(h.actor.intent.move.length()>0);assert.equal(h.actor.intent.fire,true);
 assert.ok(Math.abs(h.rig.yaw-.15)<1e-10);assert.ok(Math.abs(h.rig.pitch-.05)<1e-10);
 assert.equal(m.gyro.dYaw,0);assert.equal(m.gyro.dPitch,0);assert.equal(m.lookDX,0);
 for(let i=1;i<300;i++)h.frame(STEP);
 assert.equal(h.updates.length,300);assert.equal(h.input.lastDevice,'touch');assert.equal(m._ptr.size,1);assert.equal(m._stick.id,1);
});

test('denied access retires old pad holds, menu edges, filter and render-pending action',async()=>{
 const h=await boot();h.setPads(pad([0,3,5,6,7,11]));h.input.pollPad();
 assert.ok(h.input.padPressed.size>0);h.controller.padLook.x=.8;h.controller.padLook.y=.4;h.controller.edgeT=.5;
 h.actor.special=h.actor.specialCost();blocked(h);h.frame(STEP);
 for(const key of ['fire','jump','squid','sub','special'])assert.equal(h.actor.intent[key],false,key);
 assert.equal(h.actor.specialReady(),true);assert.equal(h.input.pad,null);assert.equal(h.input.padPrev.length,0);
 assert.equal(h.input.padPressed.size,0);assert.equal(h.input.padMenuPressed.size,0);assert.equal(h.input.padMenuBlocked.size,0);
 assert.equal(h.controller.padLook.x,0);assert.equal(h.controller.padLook.y,0);assert.equal(h.controller.edgeT,0);
});

test('mouse and allowed/absent gamepad still work, unrelated controller errors propagate',async()=>{
 const h=await boot(),restore=blocked(h);h.input.mouse.dx=10;h.input.mouse.left=true;h.frame(STEP);
 assert.notEqual(h.rig.yaw,0);assert.equal(h.actor.intent.fire,true);
 restore();h.setPads(pad([0]));h.input.pollPad();assert.equal(h.input.padPressed.has(0),true);
 h.setPads([]);h.input.pollPad();assert.equal(h.input.pad,null);
 envOf(h).navigator.getGamepads=undefined;assert.doesNotThrow(()=>h.frame(STEP));
 blocked(h);const error=new Error('controller bug');h.controller.update=()=>{throw error;};
 assert.throws(()=>h.frame(STEP),e=>e===error);
});
