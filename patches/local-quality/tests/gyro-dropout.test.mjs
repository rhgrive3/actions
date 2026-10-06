import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';
import {adaptSource} from '../../splatoon3/adapter.mjs';import {adaptTouchLayout} from '../../touch-layout/adapter.mjs';import {adaptReliability} from '../../reliability/adapter.mjs';import {adaptQualitySource} from '../adapter.mjs';
const read=f=>fs.readFileSync(f,'utf8'),site=process.env.INKWAVE_GYRO_HANDOFF_SITE;
async function setup(android=false){const context=vm.createContext({console,performance:{now:()=>1},setTimeout:()=>1,clearTimeout(){},DeviceOrientationEvent:function(){},DeviceMotionEvent:function(){},navigator:{userAgent:android?'Android Chrome':'iPad Safari'},window:{DeviceOrientationEvent:function(){},DeviceMotionEvent:function(){}},addEventListener(){},removeEventListener(){},__angle:0});
 const rel='src/core/gyro.js';let code=site?read(path.join(site,rel)):adaptQualitySource(rel,adaptReliability(rel,adaptTouchLayout(rel,adaptSource(rel,read('inkwave-public/'+rel)))));
 code=code.replace(/_sample\(([^)]*)\)\s*\{/, (all,args)=>{const[x,y,z,dt]=args.split(',').map(v=>v.trim());return all+`globalThis.__samples.push({x:${x},y:${y},z:${z},dt:${dt},src:this._src});`;});context.__samples=[];
 const modules=new Map();const entry=new vm.SourceTextModule(code,{context,identifier:path.resolve(site||'inkwave-public',rel)});modules.set(entry.identifier,entry);await entry.link(async (spec,from)=>{let file=path.resolve(path.dirname(from.identifier),spec);const publicPatches=path.resolve('inkwave-public/patches');if(file.startsWith(publicPatches+'/'))file=path.resolve('patches',path.relative(publicPatches,file));if(modules.has(file))return modules.get(file);const override=process.env.INKWAVE_GYRO_RUNTIME_OVERRIDE;const alt=override&&path.join(override,path.basename(file));const text=spec==='./device.js'?'export function screenAngle(){return globalThis.__angle||0;}':read(alt&&fs.existsSync(alt)?alt:file);const m=new vm.SourceTextModule(text,{context,identifier:file});modules.set(file,m);return m;});await entry.evaluate();const g=new entry.namespace.Gyro();g.start();return {g,context};}
function events(hz,phase,order,from=100,seconds=2,map='rrA') {const h=1000/hz,out=[];for(let n=0;n<=hz*seconds;n++){out.push({kind:'ori',t:from+n*h});out.push({kind:'raw',t:from+(n+phase)*h});}out.sort((a,b)=>a.t-b.t||(a.kind===order?-1:1));return {out,from,map};}
function replay(g,trace){const samples=[],raw=g._sample;let time=0;g._sample=function(x,y,z,dt){samples.push({start:time-dt*1000,end:time,source:this._src});return raw.call(this,x,y,z,dt);};
 for(const e of trace.out){time=e.t;if(e.kind==='ori')g._orientation({timeStamp:time,alpha:0,beta:(time-trace.from)*.12,gamma:0});else g._motion({timeStamp:time,rotationRate:trace.map==='rrA'?{alpha:0,beta:120,gamma:0}:{alpha:120,beta:0,gamma:0}});}g._sample=raw;return samples;}


const mul=(a,b)=>{const[x,y,z,w]=a,[X,Y,Z,W]=b;return [w*X+x*W+y*Z-z*Y,w*Y-x*Z+y*W+z*X,w*Z+x*Y-y*X+z*W,w*W-x*X-y*Y-z*Z];};
const stepQ=(x,y,z,dt)=>{const n=Math.hypot(x,y,z),h=n*dt/2,k=n?Math.sin(h)/n:0;return[x*k,y*k,z*k,Math.cos(h)];};
const inverse=q=>[-q[0],-q[1],-q[2],q[3]];
const euler=q=>{const[x,y,z,w]=q;return {alpha:Math.atan2(-2*(x*y-w*z),1-2*(x*x+z*z))*180/Math.PI,beta:Math.asin(Math.max(-1,Math.min(1,2*(y*z+w*x))))*180/Math.PI,gamma:Math.atan2(-2*(x*z-w*y),1-2*(x*x+y*y))*180/Math.PI};};
function distance(a,b){return Math.min(Math.hypot(...a.map((v,i)=>v-b[i])),Math.hypot(...a.map((v,i)=>v+b[i])));}
test('618/621 variable noncommuting axes retain one rotation product and every observed interval',async()=>{
const rows=[];
for(const hz of [30,60,90,120])for(const map of ['rrA','rrB'])for(const gap of ['none','motion','orientation']){
 const {g,context}=await setup();replay(g,events(hz,0,'raw',100,1,map));assert.equal(g._src,map);context.__samples.length=0;const start=g._q.slice();let q=start;
 for(let i=1;i<=Math.round(hz*.2);i++){const dt=1/hz,t=1100+i*1000/hz,x=(120+25*Math.sin(i*.4))*Math.PI/180,y=(18*Math.sin(i*.8))*Math.PI/180,z=(20*Math.cos(i*.6))*Math.PI/180;q=mul(q,stepQ(x,y,z,dt));
  if(gap!=='motion')g._motion({timeStamp:t,rotationRate:map==='rrA'?{alpha:z*180/Math.PI,beta:x*180/Math.PI,gamma:y*180/Math.PI}:{alpha:x*180/Math.PI,beta:y*180/Math.PI,gamma:z*180/Math.PI}});
  if(gap!=='orientation'||i===Math.round(hz*.2))g._orientation({timeStamp:t,...euler(q)});
 }
 let integrated=[0,0,0,1];for(const s of context.__samples)integrated=mul(integrated,stepQ(s.x,s.y,s.z,s.dt));const expected=mul(inverse(start),q),error=distance(integrated,expected),duration=context.__samples.reduce((n,s)=>n+s.dt,0);
 assert.ok(error<1e-10,JSON.stringify({hz,map,gap,error,integrated,expected}));assert.ok(Math.abs(duration-.2)<1e-10,JSON.stringify({hz,map,gap,duration}));rows.push({hz,map,gap,error,duration,samples:context.__samples.length});
}
assert.equal(rows.length,24);
});

test('#524 adoption order/phase retains its one-interval ownership with the common attitude boundary',async()=>{
 for(const hz of [30,60,90,120])for(const phase of [0,.125,.5,.875])for(const order of ['ori','raw'])for(const map of ['rrA','rrB']){
  const {g,context}=await setup(),trace=events(hz,phase,order,100,2,map);replay(g,trace);assert.equal(g._src,map);
  const duration=context.__samples.reduce((n,s)=>n+s.dt,0),expected=(trace.out.at(-1).t-100)/1000;
  assert.ok(Math.abs(duration-expected)<1e-8,JSON.stringify({hz,phase,order,map,duration,expected}));
  assert.ok(Math.abs(g.dPitch-expected*120*Math.PI/180*(360/132))<1e-7);
 }
});
test('resync, reversed timestamps and long gaps cannot consume a previous sensor lifetime',async()=>{
 for(const boundary of ['resync','screen','reverse','long']){
  const {g,context}=await setup();replay(g,events(60,0,'raw',100,1));context.__samples.length=0;
  g._orientation({timeStamp:1120,alpha:0,beta:122.4,gamma:0});assert.ok(g._qualityGyro.attitudes.length>0);
  if(boundary==='resync')g.resync();if(boundary==='screen')context.__angle=90;
  if(boundary==='reverse')g._motion({timeStamp:900,rotationRate:{alpha:0,beta:120,gamma:0}});
  const time=boundary==='long'?1800:boundary==='reverse'?901:1130;
  g._orientation({timeStamp:time,alpha:40,beta:30,gamma:20});
  assert.equal(context.__samples.length,0,boundary);assert.equal(g._qualityGyro.attitudes.length,0,boundary);assert.equal(g._qualityGyro.boundary.time,time,boundary);
 }
});
test('Android stays on its orientation owner through asymmetric events',async()=>{
 const {g,context}=await setup(true);replay(g,events(60,.5,'raw',100,1));assert.equal(g._src,'ori');assert.ok(context.__samples.every(s=>s.src==='ori'));
});

test('duplicate attitude notifications cannot grow the pending observation queue',async()=>{
 const {g}=await setup();replay(g,events(60,0,'raw',100,1));
 const event={timeStamp:1120,alpha:0,beta:122.4,gamma:0};g._orientation(event);const count=g._qualityGyro.attitudes.length;assert.equal(count,1);
 for(let i=0;i<1000;i++)g._orientation(event);assert.equal(g._qualityGyro.attitudes.length,count);
 g._motion({timeStamp:1130,rotationRate:{alpha:0,beta:120,gamma:0}});assert.equal(g._qualityGyro.attitudes.length,0);
 g.stop();assert.equal(g._qualityGyro.boundary,null);assert.equal(g._qualityGyro.attitudes.length,0);
});

test('both dropout directions cover 80–490ms and settle before a later raw adoption',async()=>{
 for(const gap of ['motion','orientation'])for(const length of [80,100,200,490])for(const map of ['rrA','rrB']){
  const {g,context}=await setup();replay(g,events(100,0,'raw',100,1,map));context.__samples.length=0;const before=g.dPitch;
  for(let elapsed=10;elapsed<=length+500;elapsed+=10){const t=1100+elapsed,missing=elapsed<=length;
   if(!(missing&&gap==='motion'))g._motion({timeStamp:t,rotationRate:map==='rrA'?{alpha:0,beta:120,gamma:0}:{alpha:120,beta:0,gamma:0}});
   if(!(missing&&gap==='orientation')||elapsed===length)g._orientation({timeStamp:t,alpha:0,beta:(t-100)*.12,gamma:0});
  }
  const expected=(length+500)/1000;assert.ok(Math.abs(context.__samples.reduce((n,s)=>n+s.dt,0)-expected)<1e-9);
  assert.ok(Math.abs(g.dPitch-before-expected*120*Math.PI/180*(360/132))<1e-7);assert.equal(g._src,map);
 }
});

test('sub-2ms raw events cannot indefinitely freeze observation ownership or grow the queue',async()=>{
 const {g,context}=await setup();replay(g,events(100,0,'raw',100,1));context.__samples.length=0;const before=g.dPitch;
 for(let elapsed=1;elapsed<=500;elapsed++){
  const t=1100+elapsed;g._motion({timeStamp:t,rotationRate:{alpha:0,beta:120,gamma:0}});
  if(elapsed%10===0)g._orientation({timeStamp:t,alpha:0,beta:(t-100)*.12,gamma:0});
  assert.ok(g._qualityGyro.attitudes.length<=8);
 }
 assert.ok(Math.abs(g.dPitch-before-.5*120*Math.PI/180*(360/132))<1e-7);
});

test('#618 retained absolute attitude observations preserve the measured multiaxis camera path after fallback',async()=>{
 const active=await setup(),reference=await setup();replay(active.g,events(100,0,'raw',100,1));const start=active.g._q.slice();let q=start;
 reference.g._orientation({timeStamp:1100,...euler(q)});const before={yaw:active.g.dYaw,pitch:active.g.dPitch};
 for(let i=1;i<=20;i++){const dt=.01,t=1100+i*10,x=(120+25*Math.sin(i*.4))*Math.PI/180,y=(18*Math.sin(i*.8))*Math.PI/180,z=(20*Math.cos(i*.6))*Math.PI/180;q=mul(q,stepQ(x,y,z,dt));const event={timeStamp:t,...euler(q)};active.g._orientation(event);reference.g._orientation(event);}
 assert.ok(Math.abs(active.g.dYaw-before.yaw-reference.g.dYaw)<1e-10);
 assert.ok(Math.abs(active.g.dPitch-before.pitch-reference.g.dPitch)<1e-10);
});

test('asynchronous variable-body-rate observations conserve the accepted rotation boundary',async()=>{
 for(const hz of [30,60,120])for(const phase of [.125,.5,.875])for(const map of ['rrA','rrB'])for(const gap of ['none','motion','orientation']){
  const {g,context}=await setup(),h=1000/hz,N=Math.round(hz*1.2),origin=100,first=origin+(phase-1)*h;
  const rate=i=>i<hz?[120*Math.PI/180,0,0]:[(120+15*Math.sin(i*.3))*Math.PI/180,12*Math.sin(i*.5)*Math.PI/180,14*Math.cos(i*.4)*Math.PI/180];
  const attitude=t=>{let q=[0,0,0,1];for(let i=0;i<=N+2;i++){const a=first+i*h,b=Math.min(t,a+h);if(b>a)q=mul(q,stepQ(...rate(i),(b-a)/1000));if(t<=a+h)break;}return q;};
  const out=[];for(let i=0;i<=N;i++){out.push({kind:'ori',t:origin+i*h});out.push({kind:'raw',t:origin+(i+phase)*h,index:i});}out.sort((a,b)=>a.t-b.t||(a.kind==='raw'?-1:1));
  for(const e of out){const missing=e.t>1100&&e.t<1300;if(missing&&(gap==='motion'&&e.kind==='raw'||gap==='orientation'&&e.kind==='ori'))continue;
   if(e.kind==='ori')g._orientation({timeStamp:e.t,...euler(attitude(e.t))});else{const[x,y,z]=rate(e.index);g._motion({timeStamp:e.t,rotationRate:map==='rrA'?{alpha:z*180/Math.PI,beta:x*180/Math.PI,gamma:y*180/Math.PI}:{alpha:x*180/Math.PI,beta:y*180/Math.PI,gamma:z*180/Math.PI}});}
  }
  let actual=[0,0,0,1];for(const s of context.__samples)actual=mul(actual,stepQ(s.x,s.y,s.z,s.dt));
  const expected=mul(inverse(attitude(origin)),attitude(g._qualityGyro.boundary.time));assert.ok(distance(actual,expected)<1e-9,JSON.stringify({hz,phase,map,gap,error:distance(actual,expected)}));
 }
});

test('#524 a first-adoption burst cannot stretch the newest raw rate over later rejected samples',async()=>{
 const {g,context}=await setup();replay(g,events(100,0,'ori',100,.3));assert.equal(g._src,'rrA');assert.equal(g._qualityGyro.boundary.time,400);context.__samples.length=0;
 for(let t=401;t<=440;t++)g._motion({timeStamp:t,rotationRate:{alpha:5*Math.sin(t),beta:120+10*Math.sin(t*.2),gamma:10*Math.cos(t*.3)}});
 g._motion({timeStamp:450,rotationRate:{alpha:8,beta:127,gamma:9}});
 assert.ok(context.__samples.length>0,'first >2ms accepted sample must settle the adoption');
 assert.ok(context.__samples.every(s=>s.dt<=.003000001),'later rejected raw intervals cannot be invented from a newest rate');
 assert.equal(g._src,'ori','the uncovered raw interval must fall back to observed attitude');
});

test('discard retires queued attitude samples without replaying them on fallback',async()=>{
 const {g}=await setup();replay(g,events(100,0,'raw',100,1));
 for(const t of [1120,1140])g._orientation({timeStamp:t,alpha:0,beta:(t-100)*.12,gamma:0});
 assert.equal(g._qualityGyro.attitudes.length,2);g.discard();assert.equal(g.dPitch,0);
 for(const t of [1160,1180])g._orientation({timeStamp:t,alpha:0,beta:(t-100)*.12,gamma:0});
 assert.ok(Math.abs(g.dPitch-.04*120*Math.PI/180*(360/132))<1e-9);
});
