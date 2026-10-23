import test from 'node:test';
import assert from 'node:assert/strict';
import {compareComposedCpu} from '../compare-inkwave-composed-cpu.mjs';
const report=()=>({schema:2,status:'passed',sourceSha:'a'.repeat(40),contentHash:'base',harness:Object.fromEntries(['benchmark-inkwave-composed-cpu.mjs','lib/inkwave-cpu-gameplay-digest.mjs','lib/inkwave-cpu-counters.mjs','lib/inkwave-cpu-trace.mjs','lib/inkwave-runtime-evidence.mjs'].map(file=>[file,'a'.repeat(64)])),environment:{quality:'high',wrappers:true},scenarios:[{stage:'test',initial:{roster:['shooter'],scene:{meshes:3}},frames:60,hz:60,ticks:60,digest:12,digests:[3,5],counts:[3,4],state:'playing',bvh:{queries:2},draw:{frame:0,calls:1},resources:{textures:2},scene:{meshes:3},rawCounters:{before:{draw:{frame:10,calls:1},resources:{textures:7},scene:{meshes:3}},after:{draw:{frame:10,calls:1},resources:{textures:9},scene:{meshes:3}}},contextLost:false,errors:[],cpuFrameMs:{p50:10},gc:{pauseMs:1}}]});
test('comparison requires reproducible A/A and exact workload/output parity',()=>{
 const a=report(),b=report(),c=report();c.contentHash='candidate';
 assert.equal(compareComposedCpu(a,b,c)[0].status,'exact-recorded-state-parity');
 for(const mutate of [r=>r.scenarios[0].digests[1]++,r=>r.scenarios[0].initial.roster.push('bot'),r=>r.environment.quality='low',r=>r.scenarios[0].contextLost=true,r=>r.scenarios[0].draw.calls++,r=>r.scenarios[0].scene.meshes--,r=>r.scenarios[0].resources.textures++,r=>r.schema=1,r=>r.scenarios[0].rawCounters.after.draw.frame++,r=>delete r.scenarios[0].rawCounters,r=>r.scenarios[0].errors.push('page failed'),r=>r.status='failed',r=>r.harness['lib/inkwave-cpu-gameplay-digest.mjs']='b'.repeat(64),r=>delete r.harness,r=>r.harness['lib/inkwave-cpu-trace.mjs']='unbound']){
  const altered=report();mutate(altered);assert.throws(()=>compareComposedCpu(a,b,altered));assert.throws(()=>compareComposedCpu(a,altered,c));
 }
});
