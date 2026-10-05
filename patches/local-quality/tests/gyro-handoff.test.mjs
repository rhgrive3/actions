import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';
import {adaptSource} from '../../splatoon3/adapter.mjs';import {adaptTouchLayout} from '../../touch-layout/adapter.mjs';import {adaptReliability} from '../../reliability/adapter.mjs';import {adaptQualitySource} from '../adapter.mjs';
const read=f=>fs.readFileSync(f,'utf8'),site=process.env.INKWAVE_GYRO_HANDOFF_SITE;
async function setup(android=false){const context=vm.createContext({console,performance:{now:()=>1},setTimeout:()=>1,clearTimeout(){},DeviceOrientationEvent:function(){},DeviceMotionEvent:function(){},navigator:{userAgent:android?'Android Chrome':'iPad Safari'},window:{DeviceOrientationEvent:function(){},DeviceMotionEvent:function(){}},addEventListener(){},removeEventListener(){},__angle:0});
 const rel='src/core/gyro.js',code=site?read(path.join(site,rel)):adaptQualitySource(rel,adaptReliability(rel,adaptTouchLayout(rel,adaptSource(rel,read('inkwave-public/'+rel)))));
 const modules=new Map();const entry=new vm.SourceTextModule(code,{context,identifier:path.resolve('inkwave-public',rel)});modules.set(entry.identifier,entry);await entry.link(async (spec,from)=>{let file=path.resolve(path.dirname(from.identifier),spec);const publicPatches=path.resolve('inkwave-public/patches');if(file.startsWith(publicPatches+'/'))file=path.resolve('patches',path.relative(publicPatches,file));if(modules.has(file))return modules.get(file);const text=spec==='./device.js'?'export function screenAngle(){return globalThis.__angle||0;}':read(file);const m=new vm.SourceTextModule(text,{context,identifier:file});modules.set(file,m);return m;});await entry.evaluate();const g=new entry.namespace.Gyro();g.start();return {g,context};}
function events(hz,phase,order,from=100,seconds=2,map='rrA') {const h=1000/hz,out=[];for(let n=0;n<=hz*seconds;n++){out.push({kind:'ori',t:from+n*h});out.push({kind:'raw',t:from+(n+phase)*h});}out.sort((a,b)=>a.t-b.t||(a.kind===order?-1:1));return {out,from,map};}
function replay(g,trace){const samples=[],raw=g._sample;let time=0;g._sample=function(x,y,z,dt){samples.push({start:time-dt*1000,end:time,source:this._src});return raw.call(this,x,y,z,dt);};
 for(const e of trace.out){time=e.t;if(e.kind==='ori')g._orientation({timeStamp:time,alpha:0,beta:(time-trace.from)*.12,gamma:0});else g._motion({timeStamp:time,rotationRate:trace.map==='rrA'?{alpha:0,beta:120,gamma:0}:{alpha:120,beta:0,gamma:0}});}g._sample=raw;return samples;}
test('#524 actual30-sample calibration integrates each interval once for both mappings and arbitrary phases',async()=>{
 for(const hz of [30,60,90,120])for(const phase of [0,.125,.5,.875])for(const order of ['ori','raw'])for(const map of ['rrA','rrB']){
  const {g}=await setup(),samples=replay(g,events(hz,phase,order,100,2,map));assert.equal(g._src,map);assert.ok(samples.some(s=>s.source===map));
  for(let i=1;i<samples.length;i++)assert.ok(Math.abs(samples[i].start-samples[i-1].end)<1e-6,JSON.stringify({hz,phase,order,map,prior:samples[i-1],sample:samples[i]}));
  const duration=(samples.at(-1).end-samples[0].start)/1000,expected=duration*120*Math.PI/180*(360/132);assert.ok(Math.abs(g.dPitch-expected)<1e-7,JSON.stringify({hz,phase,order,map,pitch:g.dPitch,expected}));
 }
});
test('#524 equal/tiny first raw samples retain boundary until a meaningful interval, without changing raw timestamps',async()=>{
 const {g}=await setup();const trace=events(120,0,'ori',100,1);const samples=replay(g,trace);for(let i=1;i<samples.length;i++)assert.ok(samples[i].start>=samples[i-1].end-1e-6);assert.equal(g._qualityGyro.rawStart,null);assert.ok(g._tRR>=1000);assert.equal(g._rrScale,1);
});
test('#524 resync clears handoff and re-calibration has no repeated overlap; Android stays attitude-only',async()=>{
 const {g,context}=await setup();replay(g,events(60,.5,'ori'));assert.equal(g._src,'rrA');g.resync();assert.equal(g._qualityGyro.rawStart,null);const samples=replay(g,events(60,.5,'raw',3000,2,'rrB'));assert.equal(g._src,'rrB');for(let i=1;i<samples.length;i++)assert.ok(Math.abs(samples[i].start-samples[i-1].end)<1e-6);
 context.__angle=90;g._orientation({timeStamp:6000,alpha:0,beta:60,gamma:0});assert.equal(g._src,'ori');assert.equal(g._qualityGyro.rawStart,null);
 const a=await setup(true);replay(a.g,events(60,.5,'raw'));assert.equal(a.g._src,'ori');assert.equal(a.g._qualityGyro.rawStart,null);
});
test('#524 an actual untrusted-rate fallback clears pending handoff and later adoption never overlaps',async()=>{
 const {g}=await setup(),first=replay(g,events(60,.5,'ori',100,2,'rrA')),h=1000/60,lastOri=2100;
 // Continue the real phase ordering: next attitude precedes the next raw sample.
 g._orientation({timeStamp:lastOri+h,alpha:0,beta:(lastOri+h-100)*.12,gamma:0});
 g._motion({timeStamp:lastOri+1.5*h,rotationRate:{alpha:0,beta:1200,gamma:0}});
 assert.equal(g._src,'ori');assert.equal(g._qualityGyro.rawStart,null);assert.ok(g._qualityGyro.fallbacks>0);
 const trace=events(60,.5,'ori',lastOri+2*h,2,'rrA');trace.from=100;const next=replay(g,trace);assert.equal(g._src,'rrA');assert.ok(next[0].start>=first.at(-1).end-1e-6);
 for(let i=1;i<next.length;i++)assert.ok(next[i].start>=next[i-1].end-1e-6);
});
