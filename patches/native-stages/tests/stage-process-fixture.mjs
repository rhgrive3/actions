// Large source stage VMs must die between cases; retaining 21 complete worlds
// in one V8 heap otherwise exhausts the ordinary Node limit before all run.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export async function isolatedNativeStageTest(file,name){
 if(!process.env.INKWAVE_NATIVE_STAGE_ASSETS||process.env.INKWAVE_NATIVE_STAGE_TEST_CHILD==='1')return false;
 const pattern='^'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$';
 const result=await new Promise(resolve=>execFile(process.execPath,
  ['--experimental-vm-modules','--test','--test-reporter=tap','--test-name-pattern',pattern,fileURLToPath(file)],
  {env:{...process.env,INKWAVE_NATIVE_STAGE_TEST_CHILD:'1'},timeout:15*60*1000,maxBuffer:4*1024*1024},
  (error,stdout,stderr)=>resolve({error,stdout,stderr})));
 if(result.stdout)process.stdout.write(result.stdout);
 if(result.stderr)process.stderr.write(result.stderr);
 assert.ifError(result.error);
 assert.match(result.stdout,/^# pass 1$/m,'one original named case must execute');
 assert.match(result.stdout,/^# fail 0$/m,'child failure cannot be waived');
 assert(result.stdout.includes('ok 1 - '+name),'the exact requested case must pass');
 return true;
}
