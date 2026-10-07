import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';
import {adaptSource} from '../../splatoon3/adapter.mjs';import {adaptTouchLayout} from '../../touch-layout/adapter.mjs';import {adaptReliability} from '../../reliability/adapter.mjs';import {adaptQualitySource} from '../adapter.mjs';
const read=f=>fs.readFileSync(f,'utf8');
// Issue 921: stationary automatic zero-rate calibration through the complete
// production composition (installed Gyro, not a pure helper).
async function setup(){const context=vm.createContext({console,performance:{now:()=>1},setTimeout:()=>1,clearTimeout(){},DeviceOrientationEvent:function(){},DeviceMotionEvent:function(){},navigator:{userAgent:'iPad Safari'},window:{DeviceOrientationEvent:function(){},DeviceMotionEvent:function(){}},addEventListener(){},removeEventListener(){},__angle:0});
 const rel='src/core/gyro.js';let code=adaptQualitySource(rel,adaptReliability(rel,adaptTouchLayout(rel,adaptSource(rel,read('inkwave-public/'+rel)))));
 const modules=new Map();const entry=new vm.SourceTextModule(code,{context,identifier:path.resolve('inkwave-public',rel)});modules.set(entry.identifier,entry);await entry.link(async(spec,from)=>{let file=path.resolve(path.dirname(from.identifier),spec);const publicPatches=path.resolve('inkwave-public/patches');if(file.startsWith(publicPatches+'/'))file=path.resolve('patches',path.relative(publicPatches,file));if(modules.has(file))return modules.get(file);const text=spec==='./device.js'?'export function screenAngle(){return globalThis.__angle||0;}':read(file);const m=new vm.SourceTextModule(text,{context,identifier:file});modules.set(file,m);return m;});await entry.evaluate();const g=new entry.namespace.Gyro();g.configure({sens:0});g.start();return {g,context};}
// Adopt the raw source with clear motion (mirrors gyro-dropout replay).
function adopt(g){let t=100;for(let i=0;i<60;i++){t+=1000/60;g._orientation({timeStamp:t,alpha:0,beta:(t-100)*.12,gamma:0});g._motion({timeStamp:t,rotationRate:{alpha:0,beta:120,gamma:0}});}return t;}
test('921 stationary 1deg/s bias is rejected after a validated rest window',async()=>{
 for(const hz of [30,60,90,120]){
  const {g}=await setup();let t=adopt(g);assert.notEqual(g._src,'ori');
  g.discard();t+=0;
  const dtms=1000/hz;let first=0,second=0;const t0=t;let beta0=(t-100)*.12;
  // Agreeing slow drift: attitude beta advances 1deg/s, raw beta 1deg/s (rrA -> device x).
  for(let i=1;i<=hz*10;i++){t=t0+i*dtms;const beta=beta0+i*dtms*0.001;
   g._orientation({timeStamp:t,alpha:0,beta,gamma:0});
   g._motion({timeStamp:t,rotationRate:{alpha:0,beta:1,gamma:0}});
   const out={yaw:0,pitch:0};g.consume(out);const v=Math.abs(out.pitch)+Math.abs(out.yaw);
   if(i<=hz*5)first+=v;else second+=v;
  }
  const rest=g._qualityGyro?.rest;
  assert.ok(rest&&rest.ok===true,`hz=${hz} rest must validate after 10s sustained window`);
  assert.ok(Math.hypot(...(rest.bias||[0,0,0]))>0.005,`hz=${hz} bias must be learned`);
  assert.ok(second<first*0.5,`hz=${hz} second-half drift ${second} must be substantially rejected vs first ${first}`);
 }
});
test('921 deliberate rotation is not learned as bias',async()=>{
 const {g}=await setup();let t=adopt(g);g.discard();
 const dtms=1000/60;const t0=t;const beta0=(t-100)*.12;
 for(let i=1;i<=60*6;i++){t=t0+i*dtms;const beta=beta0+i*dtms*0.001*30;
  g._orientation({timeStamp:t,alpha:0,beta,gamma:0});
  g._motion({timeStamp:t,rotationRate:{alpha:0,beta:30,gamma:0}});}
 const rest=g._qualityGyro?.rest;
 assert.ok(!(rest&&rest.ok), 'deliberate 30deg/s rotation must not validate rest');
 assert.ok(Math.hypot(...((rest&&rest.bias)||[0,0,0]))<0.002, 'deliberate rotation must not be learned');
});
test('921 lifecycle resets rest calibration without a jump',async()=>{
 const {g,context}=await setup();let t=adopt(g);g.discard();
 const dtms=1000/60;const t0=t;const beta0=(t-100)*.12;
 for(let i=1;i<=60*6;i++){t=t0+i*dtms;g._orientation({timeStamp:t,alpha:0,beta:beta0+i*dtms*0.001,gamma:0});g._motion({timeStamp:t,rotationRate:{alpha:0,beta:1,gamma:0}});}
 assert.equal(g._qualityGyro?.rest?.ok,true);
 g.resync();assert.ok(!g._qualityGyro?.rest?.ok&&Math.hypot(...g._qualityGyro.rest.bias)===0,'resync clears rest');
 assert.equal(g.dYaw,0);assert.equal(g.dPitch,0);
 g.stop();g.start();assert.ok(!g._qualityGyro?.rest?.ok,'OFF/ON clears rest');
 const out={yaw:0,pitch:0};g.consume(out);assert.equal(out.yaw,0);assert.equal(out.pitch,0,'no jump after rebase');
 context.__angle=90;g._orientation({timeStamp:t+1000,alpha:1,beta:2,gamma:3});
 assert.ok(!g._qualityGyro?.rest?.ok,'screen rotation clears rest');
});
