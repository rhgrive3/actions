import test from 'node:test';
import assert from 'node:assert/strict';
import {viabilityFixture} from './gyro-viability-fixture.mjs';
const consume=g=>g.consume({yaw:0,pitch:0});
for(const android of [true,false])test(`#588 visible blur rejects both sensor paths (${android?'Android':'iOS'}) and rebaselines focus`,async t=>{
 const h=await viabilityFixture();t.after(h.close);if(!android)h.env.navigator.userAgent='iPhone';await h.m.setGyro(true);h.orientation();h.orientation({alpha:10});assert.notEqual(consume(h.m.gyro).yaw,0);
 const life=h.m.gyro._platformGyroAccess.lifecycle;h.fire('blur');assert.equal(life.focused,false);assert.equal(life.active,true);assert.equal(h.env.document.hidden,false);
 for(let i=0;i<10;i++){h.motion();h.orientation({alpha:30+i*5});assert.deepEqual(consume(h.m.gyro),{yaw:0,pitch:0});}
 assert.equal(h.m.gyro._qualityGyro.motionTime,-Infinity);assert.equal(h.m.gyro._hasQ,false);assert.equal(h.m._gyroWanted,true);
 h.fire('focus');h.orientation({alpha:100});assert.deepEqual(consume(h.m.gyro),{yaw:0,pitch:0});h.orientation({alpha:110});assert.notEqual(consume(h.m.gyro).yaw,0);assert.equal(h.prompts.length,0);
});
test('#588 blur pauses a pending viability probe without clearing the requested gyro preference',async t=>{
 const h=await viabilityFixture({permission:'granted'});t.after(h.close);await h.m.setGyro(true);h.fire('blur');await h.advance(2500);assert.equal(h.m.gyro.enabled,true);assert.equal(h.m._gyroWanted,true);assert.equal(h.m.gyro.platformStatus.permission,'granted');assert.equal(h.notices.length,0);
 h.fire('focus');h.orientation();h.orientation({alpha:15});await h.advance(2100);assert.equal(h.m.gyro.enabled,true);assert.equal(h.prompts.length,1);
});
test('#588 permission grant arriving while blurred waits for a focused viability window',async t=>{
 const h=await viabilityFixture({permission:'deferred'});t.after(h.close);const request=h.m.setGyro(true);h.fire('blur');h.answers.shift()('granted');await request;await h.advance(2500);assert.equal(h.m._gyroWanted,true);assert.equal(h.m.gyro.enabled,true);assert.equal(h.notices.length,0);
 h.fire('focus');h.orientation();h.orientation({alpha:15});assert.equal(h.m.gyro.platformStatus.availability,'active');assert.equal(h.prompts.length,1);
});
test('#588 repeated focus cycles keep one sensor subscription and preserve hidden suspension',async t=>{
 const h=await viabilityFixture();t.after(h.close);await h.m.setGyro(true);h.orientation();const lifecycle=h.m.gyro._platformGyroAccess.lifecycle,clients=lifecycle.clients.size;
 for(let i=0;i<25;i++){h.fire('blur');h.motion();h.orientation({alpha:100});h.fire('focus');h.orientation({alpha:150});assert.deepEqual(consume(h.m.gyro),{yaw:0,pitch:0});assert.equal(h.listenerCount('deviceorientation'),1);assert.equal(h.listenerCount('devicemotion'),1);assert.equal(lifecycle.clients.size,clients);}
 h.hide(true);assert.equal(h.m.gyro.enabled,false);h.hide(false);assert.equal(h.m.gyro.enabled,true);h.orientation({alpha:200});assert.deepEqual(consume(h.m.gyro),{yaw:0,pitch:0});
});
test('#588 an actually calibrated raw-rate source is also non-authoritative while blurred',async t=>{
 const h=await viabilityFixture();t.after(h.close);h.env.navigator.userAgent='iPhone';await h.m.setGyro(true);const g=h.m.gyro;
 for(let i=0;i<=40;i++){h.orientation({timeStamp:1100+i*1000/60,alpha:0,beta:i*2,gamma:0});h.motion({timeStamp:1100+(i+.5)*1000/60,rotationRate:{alpha:0,beta:120,gamma:0}});}
 assert.equal(g._src,'rrA');assert.ok(Math.abs(consume(g).pitch)>0);h.fire('blur');
 for(let i=0;i<10;i++)h.motion({rotationRate:{alpha:0,beta:120,gamma:0}});assert.deepEqual(consume(g),{yaw:0,pitch:0});assert.equal(g._tRR,0);assert.equal(g._qualityGyro.rawStart,null);
 h.fire('focus');h.orientation({alpha:100});assert.deepEqual(consume(g),{yaw:0,pitch:0});h.orientation({alpha:110});assert.notEqual(consume(g).yaw,0);
});
test('#588 queued pre-focus samples are ignored and duplicate focus cannot discard a real turn',async t=>{
 const h=await viabilityFixture();t.after(h.close);await h.m.setGyro(true);h.orientation();h.fire('blur');const old=h.env.performance.now();await h.advance(100);h.fire('focus');h.orientation({timeStamp:old,alpha:50});assert.equal(h.m.gyro._hasQ,false);
 h.orientation({alpha:100});assert.deepEqual(consume(h.m.gyro),{yaw:0,pitch:0});h.orientation({alpha:110});const yaw=h.m.gyro.dYaw;assert.notEqual(yaw,0);h.fire('focus');assert.equal(consume(h.m.gyro).yaw,yaw);
});
