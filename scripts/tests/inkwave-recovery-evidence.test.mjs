import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';
import {packageRecoveryEvidence} from '../package-inkwave-recovery-evidence.mjs';
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const fixture=()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'recovery-evidence-')),input=path.join(root,'original'),output=path.join(root,'bounded');fs.mkdirSync(input);return {root,input,output};};
test('at the limit submits identical full originals; one byte over produces a failed bounded package',async()=>{
 const f=fixture();try{fs.writeFileSync(path.join(f.input,'record.bin'),Buffer.alloc(4096,7));const before=fs.readFileSync(path.join(f.input,'record.bin'));
 const full=await packageRecoveryEvidence(f.input,{output:f.output,limit:4096});assert.equal(full.path,f.input);assert.equal(full.failed,false);assert.equal(full.submittedBytes,4096);assert(!fs.existsSync(f.output));
 const bounded=await packageRecoveryEvidence(f.input,{output:f.output,limit:4095,sourceSha:'a'.repeat(40)});assert.equal(bounded.failed,true);assert.equal(bounded.eligible,true);assert(bounded.submittedBytes<=4095);assert.deepEqual(fs.readFileSync(path.join(f.input,'record.bin')),before);assert.equal(bounded.manifest.files[0].sha256,hash(before));assert.equal(bounded.manifest.files[0].reason,'artifact-budget');
 }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
test('over-budget selection preserves logs, error identity, final PNG and complete omission hashes',async()=>{
 const f=fixture();try{const files={'source/tests.log':'failure log\n','stage/result.json':'{"status":"failed"}','stage/failure-last.png':Buffer.alloc(100,3),'stage/huge.bin':Buffer.alloc(100000,9)};for(const [name,bytes]of Object.entries(files)){fs.mkdirSync(path.dirname(path.join(f.input,name)),{recursive:true});fs.writeFileSync(path.join(f.input,name),bytes);}
 const result=await packageRecoveryEvidence(f.input,{output:f.output,limit:16384,sourceSha:'b'.repeat(40)});assert(result.failed&&result.overBudget);assert(result.submittedBytes<=16384);for(const name of ['source/tests.log','stage/result.json','stage/failure-last.png'])assert.equal(hash(fs.readFileSync(path.join(f.output,'files',name))),hash(files[name]));
 const omitted=result.manifest.files.find(row=>row.path==='stage/huge.bin');assert.equal(omitted.reason,'artifact-budget');assert.equal(omitted.bytes,100000);assert.equal(omitted.sha256,hash(files['stage/huge.bin']));assert.equal(result.manifest.sourceSha,'b'.repeat(40));
 const again=await packageRecoveryEvidence(f.input,{output:f.output,limit:16384,sourceSha:'b'.repeat(40)});assert.deepEqual(again.manifest,result.manifest);
 }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
test('single giant log retains a marked tail; empty or unsupported evidence still submits a failed manifest',async()=>{
 const f=fixture();try{fs.writeFileSync(path.join(f.input,'tests.log'),'start\n'+'x'.repeat(50000)+'\nlast failure');const result=await packageRecoveryEvidence(f.input,{output:f.output,limit:8192});assert(result.submittedBytes<=8192);const row=result.manifest.files[0];assert.equal(row.disposition,'tail-copy');assert(fs.readFileSync(path.join(f.output,row.submittedPath),'utf8').endsWith('last failure'));assert(row.originalByteOffset>0);
 fs.unlinkSync(path.join(f.input,'tests.log'));const empty=await packageRecoveryEvidence(f.input,{output:f.output,limit:8192});assert(empty.failed&&empty.eligible);assert.equal(empty.manifest.status,'no-evidence');
 fs.symlinkSync(f.root,path.join(f.input,'outside'));const unsupported=await packageRecoveryEvidence(f.input,{output:f.output,limit:8192});assert(unsupported.failed);assert.equal(unsupported.manifest.files[0].reason,'non-regular-file');
 }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
test('CLI publishes upload eligibility and path before preserving the failed budget status',()=>{
 const f=fixture();try{fs.writeFileSync(path.join(f.input,'tests.log'),'x'.repeat(10000));const output=path.join(f.root,'github-output');const run=spawnSync(process.execPath,[new URL('../package-inkwave-recovery-evidence.mjs',import.meta.url).pathname,f.input,f.output],{env:{...process.env,GITHUB_OUTPUT:output,RECOVERY_ARTIFACT_LIMIT_BYTES:'4096'},encoding:'utf8'});assert.equal(run.status,1,run.stderr);assert.match(fs.readFileSync(output,'utf8'),/eligible=true\npath=/);assert(fs.existsSync(path.join(f.output,'EVIDENCE_MANIFEST.json')));
 }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
