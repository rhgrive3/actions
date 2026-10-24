import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import path from'node:path';import os from'node:os';import{spawnSync}from'node:child_process';
import{SOURCE_REMAINDERS,planSourceRemainder,assertSourceRemainderCoverage,runSourceRemainder}from'../run-inkwave-source-remainder.mjs';
const workflow=fs.readFileSync(new URL('../../.github/workflows/validate-inkwave-update.yml',import.meta.url),'utf8');
test('all unique source files execute once while partial and emitted passes remain separate',()=>{
 for(const suite of['network','quality']){const plan=assertSourceRemainderCoverage(workflow,suite);assert.equal(plan.completed.length,suite==='network'?3:7);assert.deepEqual([...plan.completed,...plan.tests.filter(x=>plan.all.includes(x))].sort(),plan.all);assert.ok(plan.tests.length>100);}
 const network=planSourceRemainder('network');for(const name of['robustness-timing','comparison','composed-hit-unit-packet'])assert.ok(network.tests.includes('patches/network-replication/tests/'+name+'.test.mjs'));
assert.match(workflow,/INKWAVE_IDLE_BUILD:/);assert.match(workflow,/INKWAVE_BUILT_SITE:/);
});
test('missing, partial, conditional, duplicated or ignored early proof cannot remove a full source file',()=>{
 const file=SOURCE_REMAINDERS.network.completed[0];
 for(const changed of[workflow.replace(file,'not-the-source.test.mjs'),workflow.replace('name: Verify deterministic network replication','name: Verify deterministic network replication\n        env:\n          INKWAVE_BUILT_SITE: _site'),workflow.replace('run: node --experimental-vm-modules --test '+file,'run: node --test '+file),workflow.replace('      - name: Verify paint ownership', '      - name: duplicate full run\n        run: node --experimental-vm-modules --test '+file+'\n      - name: Verify paint ownership'),workflow.replace('run: node --experimental-vm-modules --test '+file,'run: node --experimental-vm-modules --test --test-name-pattern=partial '+file),workflow.replace('name: Verify queued InkFlight and catalogue bot liveness fixes','name: Verify queued InkFlight and catalogue bot liveness fixes\n        if: false'),workflow.replace('name: Verify queued InkFlight and catalogue bot liveness fixes','name: Verify queued InkFlight and catalogue bot liveness fixes\n        continue-on-error: true'),workflow.replace('name: Verify queued InkFlight and catalogue bot liveness fixes','name: Verify queued InkFlight and catalogue bot liveness fixes\n        env:\n          INKWAVE_BUILT_SITE: _site')])assert.throws(()=>assertSourceRemainderCoverage(changed,'network'),/fully once|canonical environment/);
});
test('new tests are included automatically, missing declarations fail closed, child failure remains failure',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'source-remainder-'));try{
 for(const suite of['network','quality'])for(const file of[...SOURCE_REMAINDERS[suite].completed,...SOURCE_REMAINDERS[suite].extra]){fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),'');}
 fs.mkdirSync(path.join(root,'.github/workflows'),{recursive:true});fs.writeFileSync(path.join(root,'.github/workflows/validate-inkwave-update.yml'),workflow);
 const next='patches/network-replication/tests/new-default.test.mjs';fs.writeFileSync(path.join(root,next),"import test from'node:test';test('deliberate failure',()=>{throw Error('proof');});");assert.deepEqual(planSourceRemainder('network',root).tests,[next]);
 const result=runSourceRemainder('network',{root,spawn:(exe,args,opts)=>{assert.deepEqual(args,['--experimental-vm-modules','--test',next]);assert.equal(opts.env,process.env);const env={...opts.env};delete env.NODE_TEST_CONTEXT;return spawnSync(exe,args,{...opts,env,stdio:'pipe'});}});assert.equal(result.status,1,'the real failing child is not reported as success');
 fs.unlinkSync(path.join(root,SOURCE_REMAINDERS.network.completed[0]));assert.throws(()=>planSourceRemainder('network',root),/ENOENT/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
