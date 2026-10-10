import test from 'node:test';import assert from 'node:assert/strict';import {viabilityFixture} from './gyro-viability-fixture.mjs';
async function setup(android=true){const f=await viabilityFixture();if(!android)f.env.navigator.userAgent='iPhone';await f.m.setGyro(true);return f;}
function motion(f,time,rate={alpha:0,beta:0,gamma:0}){f.m.gyro._motion({timeStamp:time,rotationRate:rate});}
function orientation(f,time,alpha){f.m.gyro._orientation({timeStamp:time,alpha,beta:0,gamma:90});}
const consume=f=>({...f.m.gyro.consume({})});
for(const hz of [30,60,90,120])test(`#187 Android ${hz}Hz reference drift with fresh exact-zero rate never accumulates aim`,async t=>{
 const f=await setup();t.after(f.close);orientation(f,1000,0);let yaw=0,pitch=0;for(let i=1;i<=hz*10;i++){const time=1000+i*1000/hz;motion(f,time);orientation(f,time,i/hz);const d=consume(f);yaw+=d.yaw;pitch+=d.pitch;}assert.ok(Math.hypot(yaw,pitch)<1e-9,`stationary look drift ${yaw}, ${pitch} radians`);assert.equal(f.m.gyro.enabled,true);assert.equal(f.m.gyro._src,'ori');assert.equal(f.m.gyro._qualityGyro.rawPendingBoundary,null);
});
test('#187 nonzero turn samples remain native in both landscape orientations',async t=>{
 for(const angle of [90,270]){const f=await setup();t.after(f.close);f.env.screen.orientation.angle=angle;orientation(f,1000,0);for(let i=1;i<=60;i++){const time=1000+i*1000/60;motion(f,time,{alpha:30,beta:0,gamma:0});orientation(f,time,i/2);}const d=consume(f);assert.ok(Math.hypot(d.yaw,d.pitch)>.1);}
});
test('#187 stationary reference rebasing preserves queued real deltas and creates no replay on the next turn',async t=>{
 const f=await setup();t.after(f.close);orientation(f,1000,0);motion(f,1017,{alpha:30,beta:0,gamma:0});orientation(f,1017,.5);const queued=[f.m.gyro.dYaw,f.m.gyro.dPitch];assert.ok(Math.hypot(...queued)>0);
 for(let i=1;i<=60;i++){const time=1017+i*1000/60;motion(f,time);orientation(f,time,.5+i/60);}assert.deepEqual([f.m.gyro.dYaw,f.m.gyro.dPitch],queued);consume(f);motion(f,2034,{alpha:30,beta:0,gamma:0});orientation(f,2034,2);const d=consume(f);assert.ok(Math.hypot(d.yaw,d.pitch)>0);assert.ok(Math.hypot(d.yaw,d.pitch)<.1);
});
test('#187 expired or missing zero-rate evidence does not freeze orientation-only input; iOS stays unchanged',async t=>{
 for(const mode of ['stale','missing','ios']){const f=await setup(mode!=='ios');t.after(f.close);orientation(f,1000,0);if(mode!=='missing')motion(f,1001);orientation(f,mode==='stale'?1100:1017,1);const d=consume(f);assert.ok(Math.hypot(d.yaw,d.pitch)>0,mode);}
});
test('#187 resync clears stationarity and starts a new attitude baseline',async t=>{
 const f=await setup();t.after(f.close);motion(f,1000);orientation(f,1000,0);f.m.gyro.resync();orientation(f,1017,20);assert.deepEqual(consume(f),{yaw:0,pitch:0});orientation(f,1034,21);assert.ok(Math.hypot(...Object.values(consume(f)))>0);
});
test('#187 fresh zero evidence is bounded by the existing trust window and denied motion cannot freeze aim',async t=>{
 for(const [age,suppressed] of [[75,true],[76,false]]){const f=await setup();t.after(f.close);orientation(f,1000,0);motion(f,1001);orientation(f,1001+age,1);assert.equal(Math.hypot(...Object.values(consume(f)))<1e-9,suppressed);}
 const f=await setup();t.after(f.close);f.m.gyro._platformGyroAccess.motionPermission='denied';orientation(f,1000,0);motion(f,1017);orientation(f,1017,1);assert.ok(Math.hypot(...Object.values(consume(f)))>0);
});
