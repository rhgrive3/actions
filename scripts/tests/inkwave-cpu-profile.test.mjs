import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeCpuProfile} from '../analyze-inkwave-cpu-profile.mjs';
const frame=(functionName,url='')=>({functionName,url,lineNumber:0,columnNumber:0});
test('profile weights samples, deduplicates recursive frame identities and retains blocking/idle boundaries',()=>{
  const url='http://local/_versions/'+'a'.repeat(64)+'/src/core/renderer.js';
  const p={startTime:0,endTime:10000,nodes:[
    {id:1,callFrame:frame('(root)'),children:[2,5]},
    {id:2,callFrame:frame('render',url),children:[3]},
    {id:3,callFrame:frame('render',url),children:[4]},
    {id:4,callFrame:frame('getProgramParameter')},
    {id:5,callFrame:frame('(idle)')},
  ],samples:[4,5],timeDeltas:[2000,8000]};
  const a=analyzeCpuProfile(p);
  assert.equal(a.sampledMs,10);assert.equal(a.scopes.render,2);assert.equal(a.scopes.glProgramQuery,2);assert.equal(a.scopes.idle,8);
  assert.equal(a.inclusive.find(r=>r.functionName==='render').ms,2,'same recursive function is counted once');
  assert.equal(a.self.find(r=>r.functionName==='getProgramParameter').ms,2);
  assert.equal(a.inclusive.find(r=>r.functionName==='render').module,'src/core/renderer.js');
  for(const mutate of [x=>x.timeDeltas.pop(),x=>x.samples[0]=99,x=>x.timeDeltas[0]=-1,x=>x.nodes[3].children=[2]]){
    const bad=structuredClone(p);mutate(bad);assert.throws(()=>analyzeCpuProfile(bad));
  }
});
