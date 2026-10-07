import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runLoggedTestProcess } from '../run-logged-test-process.mjs';

test('progress is persisted and forwarded while a child is still running; failure status remains failure', async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'inkwave-live-log-')),logFile=path.join(dir,'tests.log');
 let output='',sawLive=false;
 try {
  const stdout={write(chunk){output+=chunk; if(String(chunk).includes('started')) {assert(fs.readFileSync(logFile,'utf8').includes('started'));assert(!fs.readFileSync(logFile,'utf8').includes('finished'));sawLive=true;}}};
  const result=await runLoggedTestProcess(process.execPath,['-e',"process.stdout.write('started\\n');setTimeout(()=>{process.stderr.write('failure detail\\n');process.stdout.write('finished\\n');process.exitCode=7;},30)"],{logFile,stdout,stderr:stdout});
  assert(sawLive);assert.equal(result.status,7);assert.equal(result.signal,null);
  const log=fs.readFileSync(logFile,'utf8');for(const text of ['started','finished','failure detail']) {assert(log.includes(text));assert(output.includes(text));}
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('signal termination keeps already emitted progress and never reports success',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'inkwave-live-signal-')),logFile=path.join(dir,'tests.log');
 try {
  const sink={write(){}};const result=await runLoggedTestProcess(process.execPath,['-e',"process.stdout.write('before signal\\n',()=>process.kill(process.pid,'SIGTERM'))"],{logFile,stdout:sink,stderr:sink});
  assert.equal(result.status,null);assert.equal(result.signal,'SIGTERM');assert(fs.readFileSync(logFile,'utf8').includes('before signal'));
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('spawn failure rejects and leaves a readable diagnostic destination',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'inkwave-live-missing-')),logFile=path.join(dir,'tests.log');
 try {await assert.rejects(runLoggedTestProcess(path.join(dir,'missing'),[],{logFile}),/ENOENT/);assert.equal(fs.readFileSync(logFile,'utf8'),'');}
 finally {fs.rmSync(dir,{recursive:true,force:true});}
});
