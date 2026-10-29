import test from 'node:test';
import assert from 'node:assert/strict';
import {compareComposedCpu} from '../compare-inkwave-composed-cpu.mjs';
const report=()=>({schema:2,status:'passed',sourceSha:'a'.repeat(40),contentHash:'base',harness:Object.fromEntries(['benchmark-inkwave-composed-cpu.mjs','lib/inkwave-cpu-gameplay-digest.mjs','lib/inkwave-cpu-counters.mjs','lib/inkwave-cpu-trace.mjs','lib/inkwave-runtime-evidence.mjs','lib/inkwave-sandbox-browser.mjs'].map(file=>[file,'a'.repeat(64)])),environment:{quality:'high',wrappers:true},scenarios:[{stage:'test',initial:{roster:['shooter'],scene:{meshes:3}},frames:60,hz:60,ticks:60,minActors:8,minLiving:8,digest:12,digests:[3,5],counts:[3,4],state:'playing',bvh:{queries:2},draw:{frame:0,calls:1},resources:{textures:2},scene:{meshes:3},rawCounters:{before:{draw:{frame:10,calls:1},resources:{textures:7},scene:{meshes:3}},after:{draw:{frame:10,calls:1},resources:{textures:9},scene:{meshes:3}}},contextLost:false,errors:[],cpuFrameMs:{p50:10},gc:{pauseMs:1}}]});
test('comparison requires reproducible A/A and exact workload/output parity',()=>{
 const a=report(),b=report(),c=report();c.contentHash='candidate';
 assert.equal(compareComposedCpu(a,b,c)[0].status,'exact-recorded-state-parity');
 for(const mutate of [r=>r.scenarios[0].digests[1]++,r=>r.scenarios[0].initial.roster.push('bot'),r=>r.scenarios[0].minActors--,r=>r.scenarios[0].minLiving--,r=>r.environment.quality='low',r=>r.scenarios[0].contextLost=true,r=>r.scenarios[0].draw.calls++,r=>r.scenarios[0].scene.meshes--,r=>r.scenarios[0].resources.textures++,r=>r.schema=1,r=>r.scenarios[0].rawCounters.after.draw.frame++,r=>delete r.scenarios[0].rawCounters,r=>r.scenarios[0].errors.push('page failed'),r=>r.status='failed',r=>r.harness['lib/inkwave-cpu-gameplay-digest.mjs']='b'.repeat(64),r=>delete r.harness,r=>r.harness['lib/inkwave-cpu-trace.mjs']='unbound']){
  const altered=report();mutate(altered);assert.throws(()=>compareComposedCpu(a,b,altered));assert.throws(()=>compareComposedCpu(a,altered,c));
 }
});
test('explicit BVH reduction mode keeps exact A/A and gameplay/render gates',()=>{
 const a=report(),b=report(),c=report();
 for(const r of [a,b,c])r.scenarios[0].bvh={queries:20,triangleTests:100};
 c.scenarios[0].bvh={queries:18,triangleTests:60};
 assert.throws(()=>compareComposedCpu(a,b,c));
 const options={allowBvhWorkReduction:true};
 const row=compareComposedCpu(a,b,c,options)[0];
 assert.equal(row.bvh.policy,'explicit-non-increasing-candidate-work');
 assert.deepEqual(row.bvh.after,c.scenarios[0].bvh);
 for(const mutate of [r=>r.scenarios[0].bvh.queries=21,r=>r.scenarios[0].bvh.triangleTests=101,r=>r.scenarios[0].bvh.queries=-1,r=>r.scenarios[0].bvh.queries=1.5,r=>delete r.scenarios[0].bvh.triangleTests,r=>r.scenarios[0].bvh.extra=0,r=>r.scenarios[0].digests[0]++,r=>r.scenarios[0].counts[0]++,r=>r.scenarios[0].draw.calls--]){
  const changed=structuredClone(c);mutate(changed);assert.throws(()=>compareComposedCpu(a,b,changed,options));
 }
 const changedRepeat=structuredClone(b);changedRepeat.scenarios[0].bvh.triangleTests--;
 assert.throws(()=>compareComposedCpu(a,changedRepeat,c,options));
});

for(const [label,mutate] of [
 ['lost context',r=>r.scenarios[0].contextLost=true],
 ['page error',r=>r.scenarios[0].errors.push('baseline page failed')],
])test(`comparison rejects baseline ${label}`,()=>{
 const a=report(),b=report(),c=report();mutate(a);
 assert.throws(()=>compareComposedCpu(a,b,c),'invalid baseline must not support parity');
});
test('comparison rejects an empty workload',()=>{
 const a=report(),b=report(),c=report();
 for(const r of [a,b,c])r.scenarios=[];
 assert.throws(()=>compareComposedCpu(a,b,c),'empty comparison is not measured work');
});

for(const [label,change] of [
 ['zero work',r=>{r.frames=0;r.ticks=0;}],
 ['below capture minimum',r=>{r.frames=29;r.ticks=29;}],
 ['above capture maximum',r=>{r.frames=18001;r.ticks=18001;}],
 ['unsupported cadence',r=>{r.hz=90;r.ticks=40;}],
 ['incorrect fixed ticks',r=>{r.ticks=59;}],
])test(`comparison rejects identical invalid ${label} scenarios`,()=>{
 const a=report(),b=report(),c=report();
 for(const r of [a,b,c])change(r.scenarios[0]);
 assert.throws(()=>compareComposedCpu(a,b,c));
});
test('comparison accepts the capture cadence and fixed-tick boundaries',()=>{
 for(const hz of [30,60,120])for(const frames of [30,18000]){
  const a=report(),b=report(),c=report();
  for(const r of [a,b,c])Object.assign(r.scenarios[0],{frames,hz,ticks:Math.round(frames*60/hz)});
  assert.equal(compareComposedCpu(a,b,c)[0].status,'exact-recorded-state-parity');
 }
});
