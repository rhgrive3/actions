import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {sampleChromiumProcessMemory} from '../lib/inkwave-chromium-process-memory.mjs';

function fixture(t){
 const base=path.resolve('.ci-scratch/process-memory-tests');fs.mkdirSync(base,{recursive:true});
 const procRoot=fs.mkdtempSync(path.join(base,'proc-'));t.after(()=>fs.rmSync(procRoot,{recursive:true,force:true}));
 const add=(pid,parent,{type='renderer',memory=true,huge=0,cmd=true}={})=>{
  const dir=path.join(procRoot,String(pid));fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir,'status'),`Name:\tchromium\nPPid:\t${parent}\n`);
  if(cmd)fs.writeFileSync(path.join(dir,'cmdline'),`chromium\0--type=${type}\0--secret=must-not-be-returned\0`);
  if(memory)fs.writeFileSync(path.join(dir,'smaps_rollup'),`Rss: 100 kB\nPss: 70 kB\nPrivate_Clean: 10 kB\nPrivate_Dirty: 20 kB\nPrivate_Hugetlb: ${huge} kB\n`);
 };
 return {procRoot,add};
}

test('includes browser zygotes and descendants, retains CDP types and CPU, excludes unrelated Chromium',t=>{
 const {procRoot,add}=fixture(t);add(100,1,{type:'browser'});add(101,100,{type:'zygote',huge:7});add(102,101);add(103,100,{type:'gpu-process'});
 add(200,1,{type:'browser'});add(201,200,{type:'zygote'});add(202,201);
 const result=sampleChromiumProcessMemory([{id:100,type:'browser',cpuTime:3},{id:102,type:'renderer',cpuTime:2},{id:103,type:'GPU',cpuTime:1}],{procRoot});
 assert.deepEqual(result.processes.map(p=>p.pid),[100,101,102,103]);
 assert.deepEqual(result.processes.map(p=>p.type),['browser','zygote','renderer','GPU']);
 assert.deepEqual(result.processes.map(p=>p.cpuSeconds),[3,null,2,1]);
 assert.equal(result.processes[1].ussKiB,37);assert.equal(result.processes[1].pssKiB,70);
 assert.equal(result.processes[1].source,'proc-descendant');assert.equal(result.processes[2].ppid,101);
 assert.equal(JSON.stringify(result).includes('must-not-be-returned'),false);
 assert.deepEqual(result.diagnostics,[]);
});

test('a vanished CDP process and a discovered child with vanished memory are skipped with bounded diagnostics',t=>{
 const {procRoot,add}=fixture(t);add(100,1);add(101,100,{memory:false});add(102,100,{memory:false});
 const result=sampleChromiumProcessMemory([{id:100,type:'browser',cpuTime:0},{id:999,type:'renderer',cpuTime:0}],{procRoot,maxDiagnostics:1});
 assert.deepEqual(result.processes.map(p=>p.pid),[100]);
 assert.deepEqual(result.skipped,{status:1,memory:2,command:0});
 assert.equal(result.diagnostics.length,1);assert.equal(result.diagnostics[0].pid,999);assert.equal(result.diagnosticsTruncated,true);
 fs.mkdirSync(path.join(procRoot,'998'));
 const silent=sampleChromiumProcessMemory([{id:100,type:'browser'},{id:998,type:'renderer'}],{procRoot,maxDiagnostics:0});
 assert.equal(silent.skipped.status,1,'a vanished status is counted once even with diagnostics disabled');assert.deepEqual(silent.diagnostics,[]);
});

test('missing command receipt preserves a known descendant memory sample without reading environment',t=>{
 const {procRoot,add}=fixture(t);add(100,1);add(101,100,{cmd:false});
 const result=sampleChromiumProcessMemory([{id:100,type:'browser',cpuTime:0}],{procRoot});
 assert.equal(result.processes[1].type,'browser-child');assert.equal(result.processes[1].ussKiB,30);
 assert.equal(result.skipped.command,1);assert.equal(result.diagnostics[0].stage,'command');
});

test('a vanished browser does not accidentally sample another browser or orphaned children',t=>{
 const {procRoot,add}=fixture(t);add(101,100);add(200,1,{type:'browser'});add(201,200);
 const result=sampleChromiumProcessMemory([{id:100,type:'browser',cpuTime:0}],{procRoot});
 assert.deepEqual(result.processes,[]);assert.equal(result.skipped.status,1);
 assert.throws(()=>sampleChromiumProcessMemory([],{procRoot}),/Exactly one browser/);
 assert.throws(()=>sampleChromiumProcessMemory([{id:100,type:'browser'},{id:200,type:'browser'}],{procRoot}),/Exactly one browser/);
});
