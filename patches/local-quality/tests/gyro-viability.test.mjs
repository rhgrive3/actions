import test from 'node:test';import assert from 'node:assert/strict';
import {viabilityFixture} from './gyro-viability-fixture.mjs';
for(const [orientation,motion]of [[false,true],[false,false]])test(`#376 missing required orientation ${orientation}/${motion} fails activation and stays off`,async t=>{
 const h=await viabilityFixture({orientation,motion});t.after(h.close);assert.equal(await h.m.setGyro(true),false);
 for(let i=0;i<30;i++)h.motion();assert.equal(h.m.gyro.enabled,false);assert.equal(h.m.s.gyro,false);assert.equal(h.listenerCount('deviceorientation'),0);assert.equal(h.m.els.gyro.attrs['aria-pressed'],'false');
});
for(const motion of [false,true])test(`#376 no sensor data stops listeners and ON state with optional motion ${motion}`,async t=>{
 const h=await viabilityFixture({motion});t.after(h.close);await h.m.setGyro(true);
 assert.equal(h.m.gyro.platformStatus.availability,'waiting');assert.equal(h.m.els.gyro.classList.contains('is-on'),false);assert.equal(h.m.els.gyro.attrs['aria-busy'],'true');
 h.m.moveX=.5;h.m.buttons.fire=true;h.m.lookDX=.2;
 for(let i=0;i<10;i++)h.motion();await h.advance(2100);
 assert.equal(h.m.gyro.enabled,false);assert.equal(h.m.gyro.working,false);assert.equal(h.m._gyroWanted,false);assert.equal(h.m.s.gyro,false);
 assert.equal(h.m.gyro.platformStatus.reason,'no-sensor-data');assert.equal(h.m.gyro.platformStatus.permission,'not-required');
 assert.equal(h.m.els.gyro.classList.contains('is-on'),false);assert.equal(h.m.els.gyro.attrs['aria-pressed'],'false');assert.equal(h.m.els.gyro.attrs['aria-busy'],'false');
 assert.equal(h.listenerCount('deviceorientation'),0);assert.equal(h.listenerCount('devicemotion'),0);
 assert.equal(h.m.moveX,.5);assert.equal(h.m.buttons.fire,true);assert.equal(h.m.lookDX,.2,'swipe and body input remain independent');
 assert.equal(h.notices.length,1);h.orientation({alpha:90});assert.equal(h.m.gyro.enabled,false,'late samples cannot revive stopped session');
});
for(const motion of [false,true])test(`#376 valid orientation ${motion?'with':'without'} motion cancels probe and enables real aim`,async t=>{
 const h=await viabilityFixture({motion});t.after(h.close);await h.m.setGyro(true);h.orientation();h.orientation({alpha:20});
 assert.equal(h.m.gyro.platformStatus.availability,'active');assert.equal(h.m.els.gyro.classList.contains('is-on'),true);assert.equal(h.m.els.gyro.attrs['aria-pressed'],'true');
 await h.advance(2100);assert.equal(h.m.gyro.enabled,true);assert.ok(Math.abs(h.m.gyro.dYaw)+Math.abs(h.m.gyro.dPitch)>0);assert.equal(h.notices.length,0);
});
test('#376 timeout retains granted permission and explicit retry can become viable',async t=>{
 const h=await viabilityFixture({permission:'granted'});t.after(h.close);await h.m.setGyro(true);await h.advance(2100);
 assert.equal(h.m.gyro.platformStatus.permission,'granted');assert.equal(h.m.gyro.enabled,false);assert.equal(h.prompts.length,1);
 await h.m.setGyro(true);h.orientation();h.orientation({alpha:15});await h.advance(2100);
 assert.equal(h.m.gyro.enabled,true);assert.equal(h.prompts.length,1);assert.equal(h.m.gyro.platformStatus.reason,null);assert.equal(h.listenerCount('deviceorientation'),1);
});
test('#376 denied permission and invalid samples never advertise viable gyro',async t=>{
 const denied=await viabilityFixture({permission:'denied'});t.after(denied.close);assert.equal(await denied.m.setGyro(true),false);assert.equal(denied.m.gyro.enabled,false);assert.equal(denied.m.gyro.platformStatus.permission,'denied');
 const h=await viabilityFixture();t.after(h.close);await h.m.setGyro(true);h.orientation({alpha:null});h.orientation({beta:NaN});await h.advance(2100);assert.equal(h.m.gyro.enabled,false);assert.equal(h.m.gyro.platformStatus.reason,'no-sensor-data');
});
test('#376 timeout does not auto-retry on hide/show; explicit off cancels its stale watchdog',async t=>{
 const h=await viabilityFixture();t.after(h.close);await h.m.setGyro(true);await h.advance(2100);h.hide(true);h.hide(false);assert.equal(h.m.gyro.enabled,false);assert.equal(h.m._gyroWanted,false);
 await h.m.setGyro(true);await h.m.setGyro(false);await h.advance(2100);assert.equal(h.m.gyro.enabled,false);assert.equal(h.m.gyro.platformStatus.reason,null);assert.equal(h.notices.length,1);
});
