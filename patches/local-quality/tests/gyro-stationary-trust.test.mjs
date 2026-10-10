import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {viabilityFixture} from './gyro-viability-fixture.mjs';
const moduleURL=process.env.INKWAVE_GYRO_VIABILITY_SITE?pathToFileURL(path.resolve(process.env.INKWAVE_GYRO_VIABILITY_SITE,'patches/local-quality/gyro.mjs')):new URL('../gyro.mjs',import.meta.url);
const {gyroRateTrusted}=await import(moduleURL.href);
const raw=(map,rate)=>map==='rrA'?{alpha:0,beta:rate,gamma:0}:{alpha:rate,beta:0,gamma:0};
test('#595 trust tolerance remains continuous through zero attitude speed for both mappings',()=>{
 for(const map of ['rrA','rrB'])for(const speed of [0,1e-10,1e-8,1.001e-8,1e-7]){const g={_src:map,_rrScale:1,_qualityGyro:{orientationTime:1000,rate:[speed,0,0]}};assert.equal(gyroRateTrusted(g,raw(map,.01),1000),true);assert.equal(gyroRateTrusted(g,raw(map,10),1000),false);assert.equal(gyroRateTrusted(g,raw(map,.01),1076),false);}
});
async function calibrated(hz,map){
 const h=await viabilityFixture();h.env.navigator.userAgent='iPhone';await h.m.setGyro(true);const g=h.m.gyro,dt=1000/hz;let time=1100,angle=0;
 const step=(rate,attitudeRate=rate)=>{time+=dt;angle+=attitudeRate*dt/1000;h.orientation({timeStamp:time,alpha:0,beta:angle,gamma:0});h.motion({timeStamp:time+dt*.5,rotationRate:raw(map,rate)});};
 for(let i=0;i<50;i++)step(120);assert.equal(g._src,map,'native calibration selected expected raw axes');
 for(let i=1;i<=90;i++)step(120*Math.pow(.9,i));assert.equal(g._src,map,'smooth deceleration preserves calibration');
 return {...h,g,step};
}
for(const hz of [30,60,90,120])for(const map of ['rrA','rrB'])test(`#595 ${map} ${hz}Hz calibrated raw source survives finite stationary residuals and later turns`,async t=>{
 const h=await calibrated(hz,map);t.after(h.close);const count=h.g._cal.n,fallbacks=h.g._qualityGyro.fallbacks;
 for(let i=0;i<hz*2;i++){h.step(.01,0);assert.equal(h.g._src,map);assert.equal(h.g._cal.n,count);assert.equal(h.g._qualityGyro.fallbacks,fallbacks);}
 const pitch=h.g.dPitch;for(let i=1;i<=90;i++)h.step(Math.min(120,.01*Math.pow(1.1,i)));assert.equal(h.g._src,map);assert.ok(h.g.dPitch>pitch);assert.ok(Number.isFinite(h.g.dYaw+h.g.dPitch));
});
for(const map of ['rrA','rrB'])test(`#595 ${map} meaningful stationary mismatch still invokes the existing fallback`,async t=>{
 const h=await calibrated(60,map);t.after(h.close);h.step(.01,0);assert.equal(h.g._src,map);h.step(20,0);assert.equal(h.g._src,'ori');assert.ok(h.g._qualityGyro.fallbacks>0);
});
test('#595 Android remains attitude-only despite finite raw residuals',async t=>{
 const h=await viabilityFixture();t.after(h.close);await h.m.setGyro(true);for(let i=0;i<90;i++){h.orientation({beta:i*2});h.motion({rotationRate:{alpha:0,beta:120,gamma:0}});}assert.equal(h.m.gyro._src,'ori');for(let i=0;i<30;i++){h.orientation({beta:178});h.motion({rotationRate:{alpha:0,beta:.01,gamma:0}});}assert.equal(h.m.gyro._src,'ori');
});
