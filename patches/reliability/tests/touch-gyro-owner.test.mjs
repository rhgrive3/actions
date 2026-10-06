import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {boot,pad,STEP} from './pause-fixture.mjs';
import {adaptTouchGyroOwner} from '../touch-gyro-owner-adapter.mjs';
const classes=()=>({add(){},remove(){},toggle(){}});
async function rig(){const h=await boot(),m=h.input.mobile,g=m.gyro;
 Object.assign(m,{active:true,visible:true,root:{classList:classes(),querySelectorAll:()=>[]},_gyroWanted:true});m.s.gyro=true;g.enabled=true;
 let resets=0,starts=0,stops=0,requests=0;const reset=g.resync;g.resync=function(){resets++;return reset.call(this);};for(const [key,inc]of [['start',()=>starts++],['stop',()=>stops++],['request',()=>requests++]]){const fn=g[key];g[key]=function(...args){inc();return fn.apply(this,args);};}
 h.input.lastDevice='touch';resets=0;
 const motion=(yaw=.25,pitch=.1)=>{g.dYaw=yaw;g.dPitch=pitch;};
 const take=owner=>{if(owner==='kbm')h.event('keydown',{code:'KeyW',repeat:false,preventDefault(){}});else if(owner==='pad'){h.setPads(pad([0]));h.input.pollPad();}else h.event('pointerdown',{pointerType:'touch'});};
 return {...h,m,g,motion,take,counts:()=>({resets,starts,stops,requests})};
}
for(const owner of ['kbm','pad'])test(`#633 ${owner} discards new mobile gyro deltas after native takeover`,async()=>{
 const h=await rig();h.motion();h.controller.update(STEP);assert.equal(h.rig.yaw,.25);assert.equal(h.rig.pitch,.1);
 h.take(owner);assert.equal(h.input.lastDevice,owner);const before=[h.rig.yaw,h.rig.pitch];h.motion();h.controller.update(STEP);
 assert.deepEqual([h.rig.yaw,h.rig.pitch],before);assert.equal(h.g.dYaw,0);assert.equal(h.g.dPitch,0);assert.equal(h.g.enabled,true);assert.equal(h.m.s.gyro,true);assert.equal(h.m._gyroWanted,true);
});
test('#633 touch reentry rebases immediately, then preserves the first new post-transition delta',async()=>{
 const h=await rig();h.take('kbm');h.motion(3,2);h.take('touch');assert.equal(h.g.dYaw,0);assert.equal(h.g.dPitch,0);h.motion(.2,.15);h.controller.update(STEP);assert.equal(h.rig.yaw,.2);assert.equal(h.rig.pitch,.15);assert.equal(h.counts().resets,2);
});
test('#633 twenty owner round trips preserve wanted preference without permission/listener restarts',async()=>{
 const h=await rig();for(let i=0;i<20;i++){h.take('kbm');h.motion();h.controller.update(STEP);h.take('touch');h.motion(.01,.01);h.controller.update(STEP);}
 const c=h.counts();assert.equal(c.resets,40);assert.equal(c.starts,0);assert.equal(c.stops,0);assert.equal(c.requests,0);assert.equal(h.m._gyroWanted,true);assert.equal(h.m.s.gyro,true);assert.ok(Math.abs(h.rig.yaw-.2)<1e-12);
});
test('#633 mouse and both gamepad look axes remain live while mobile gyro is muted',async()=>{
 const h=await rig();h.take('kbm');h.input.locked=true;h.event('mousemove',{movementX:8,movementY:4});h.motion(10,10);h.controller.update(STEP);assert.ok(h.rig.yaw<0);assert.ok(h.rig.pitch<0);
 h.input.mouse.dx=h.input.mouse.dy=0;h.rig.yaw=h.rig.pitch=0;const p=pad();p[0].axes=[0,0,.6,.4];h.setPads(p);h.input.pollPad();h.motion(10,10);h.controller.update(STEP);assert.equal(h.input.lastDevice,'pad');assert.ok(h.rig.yaw<0);assert.ok(h.rig.pitch<0);
});
test('#633 duplicate same-owner notifications do not reset valid gyro data',async()=>{
 const h=await rig();h.motion();h.take('touch');assert.equal(h.counts().resets,0);h.controller.update(STEP);assert.equal(h.rig.yaw,.25);
});
test('#633 disabled controller still discards gyro and does not replay on resume',async()=>{
 const h=await rig();h.controller.enabled=false;h.motion();h.controller.update(STEP);assert.equal(h.g.dYaw,0);assert.equal(h.rig.yaw,0);h.controller.enabled=true;h.controller.update(STEP);assert.equal(h.rig.yaw,0);
});
test('#633 native owner anchors and the optional #276 exclusivity connection fail closed',()=>{
 for(const rel of ['src/core/mobile.js','src/game/player.js']){const raw=fs.readFileSync(new URL('../../../inkwave-public/'+rel,import.meta.url),'utf8');assert.throws(()=>adaptTouchGyroOwner(rel,''),/conflict/);assert.throws(()=>adaptTouchGyroOwner(rel,adaptTouchGyroOwner(rel,raw)),/conflict/);}
 const rel='src/game/player.js',raw=fs.readFileSync(new URL('../../../inkwave-public/'+rel,import.meta.url),'utf8');const with276=raw.replace("    const usingPad =",'    const gyroActive = !!touch?.gyro?.enabled;\n    const usingPad =');assert.match(adaptTouchGyroOwner(rel,with276),/const gyroActive = inp.lastDevice === 'touch' &&/);
 assert.throws(()=>adaptTouchGyroOwner(rel,with276.replace('!!touch?.gyro?.enabled','changedOwner')),/conflict/);
});
