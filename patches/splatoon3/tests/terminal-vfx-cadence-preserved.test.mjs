import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
const code=adaptBuildSource('src/fx/fxHooks.js',fs.readFileSync(new URL('../../../inkwave-public/src/fx/fxHooks.js',import.meta.url),'utf8'));
for(const [field,threshold]of [['climbT',0.07],['bubbleT',0.35],['sizzleT',0.11]])test(field+' preserves canonical per-frame cadence at 30/60/120 Hz',()=>{
 const fragment=code.match(new RegExp('s\\.'+field+' \\+= dt;\\s*if \\(([^)]+)\\) \\{ s\\.'+field+' = ([^;]+);'));assert(fragment,'actual production cadence fragment');
 const actual=vm.runInNewContext('(s,dt)=>{s.'+field+'+=dt;if('+fragment[1]+'){s.'+field+'='+fragment[2]+';return 1;}return 0;}');
 const before=(s,dt)=>{s[field]+=dt;if(s[field]>threshold){s[field]=0;return 1;}return 0;};
 for(const hz of [30,60,120]){const a={[field]:0},b={[field]:0};let ca=0,cb=0;for(let i=0;i<hz*10;i++){ca+=actual(a,1/hz);cb+=before(b,1/hz);assert.equal(a[field],b[field]);}assert.equal(ca,cb);}
});
