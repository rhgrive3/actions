import test from 'node:test';
import assert from 'node:assert/strict';
import {compareComposedCpu} from '../compare-inkwave-composed-cpu.mjs';
const report=()=>({status:'passed',sourceSha:'a'.repeat(40),contentHash:'base',environment:{quality:'high',wrappers:true},scenarios:[{stage:'test',initial:{roster:['shooter']},frames:60,hz:60,ticks:60,digest:12,digests:[3,5],counts:[3,4],state:'playing',bvh:{queries:2},draw:{calls:1},resources:{textures:2},contextLost:false,errors:[],cpuFrameMs:{p50:10},gc:{pauseMs:1}}]});
test('comparison requires reproducible A/A and exact workload/output parity',()=>{
 const a=report(),b=report(),c=report();c.contentHash='candidate';
 assert.equal(compareComposedCpu(a,b,c)[0].status,'exact-gameplay-parity');
 for(const mutate of [r=>r.scenarios[0].digests[1]++,r=>r.scenarios[0].initial.roster.push('bot'),r=>r.environment.quality='low',r=>r.scenarios[0].contextLost=true,r=>r.scenarios[0].draw.calls++,r=>r.scenarios[0].errors.push('page failed'),r=>r.status='failed']){
  const altered=report();mutate(altered);assert.throws(()=>compareComposedCpu(a,b,altered));assert.throws(()=>compareComposedCpu(a,altered,c));
 }
});
