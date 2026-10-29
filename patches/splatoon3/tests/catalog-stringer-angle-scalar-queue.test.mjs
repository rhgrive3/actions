import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {parse} from '../../loading-cache/vendor/acorn.mjs';
const source=fs.readFileSync(new URL('../runtime/main-weapon-catalog.mjs',import.meta.url),'utf8'),ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
const declaration=name=>{const n=ast.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);assert.ok(n);return source.slice(n.start,n.end);};
const finite=(v,f)=>Number.isFinite(v)?v:f,lerp=(a,b,t)=>a+(b-a)*t,clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,v));
test('actual Stringer scalar interpolator retains source getters and exact all-band result without a temporary descriptor',()=>{
 const values=[undefined,null,0,-0,1,8,NaN,Infinity,-Infinity,1e300,-1e300];
 for(let i=0;i<10000;i++){
  function run(name){const reads=[];const p={};for(const [j,key]of ['ChargeFrameMinCharge','ChargeFrameMidCharge','ChargeFrameFullCharge'].entries())Object.defineProperty(p,key,{get(){reads.push(key);return values[(i+j)%values.length];}});
   const t={};for(const [j,key]of ['ArrowAngleMax','ArrowAngleMid','ArrowAngleMin'].entries())Object.defineProperty(t,key,{get(){reads.push(key);return values[(i*3+j)%values.length];}});
   const fn=new Function('finite','lerp','clamp','chargeParam','chargeFrames',declaration(name)+';return '+name)(finite,lerp,clamp,()=>{reads.push('param');return p;},()=>{reads.push('full');return finite(p.ChargeFrameFullCharge,60);});
   const frames=values[Math.floor(i/7)%values.length];
   const result=name==='stageValue'?fn({}, {ArrowAngleMin:finite(t.ArrowAngleMax,8),ArrowAngleMid:finite(t.ArrowAngleMid,8),ArrowAngleMax:finite(t.ArrowAngleMin,0)},'ArrowAngle',frames,8):fn({},finite(t.ArrowAngleMax,8),finite(t.ArrowAngleMid,8),finite(t.ArrowAngleMin,0),frames);
   return {result,reads};}
  assert.deepEqual(run('stringerArrowDegrees'),run('stageValue'));
 }
});
