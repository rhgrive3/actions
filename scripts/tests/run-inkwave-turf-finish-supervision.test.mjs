import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';
import {runBounded,childEnvironment} from '../run-inkwave-turf-finish-isolated.mjs';
test('deadline kills only owned detached group; unrelated sibling stays alive',async()=>{
 const sibling=spawn(process.execPath,['--max-old-space-size=64','-e','setInterval(()=>{},1000)'],{stdio:'ignore',env:childEnvironment(process.env,'source')});
 try {
  await new Promise((resolve,reject)=>{sibling.once('spawn',resolve);sibling.once('error',reject);});
  const run=await runBounded(process.execPath,['--max-old-space-size=64','-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{env:childEnvironment(process.env,'source'),timeout:300});
  assert.equal(run.error?.code,'ETIMEDOUT');assert.equal(run.signal,'SIGKILL');assert.equal(sibling.exitCode,null);process.kill(sibling.pid,0);
 }finally{const closed=new Promise(resolve=>sibling.once('close',resolve));sibling.kill('SIGKILL');await closed;}
});
test('output overflow and spawn failure fail closed',async()=>{
 const overflow=await runBounded(process.execPath,['--max-old-space-size=64','-e',"process.stdout.write('x'.repeat(10000));setInterval(()=>{},1000)"],{env:childEnvironment(process.env,'source'),timeout:1000,maxBuffer:64});assert.equal(overflow.error?.code,'ENOBUFS');
 const missing=await runBounded('/no/such/turf-review-executable',[],{timeout:1000});assert.equal(missing.error?.code,'ENOENT');assert.notEqual(missing.status,0);
});
