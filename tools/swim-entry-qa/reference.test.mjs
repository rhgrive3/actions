import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {TARGET,CURRENT_SHA256,REFERENCE_SHA256,hash,rollbackSwimInitialization,captureSourceIdentity,prepareReference,verifyIdentityPair} from './reference.mjs';
const actual=fs.readFileSync(new URL('../../'+TARGET,import.meta.url),'utf8');
const git=(root,...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
test('rollback is exactly the reviewed initialization change and refuses changed source',()=>{
 assert.equal(hash(actual),CURRENT_SHA256);assert.equal(hash(rollbackSwimInitialization(actual)),REFERENCE_SHA256);
 for(const code of [actual+'\n',actual.replace('const headingX','const changedHeadingX'),actual.replace('bank: ch.sqRoll','bank: 0'),rollbackSwimInitialization(actual)])assert.throws(()=>rollbackSwimInitialization(code));
});
test('tracked source proof permits one named rollback and rejects all other edits, modes and missing inputs',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'swim-current-reference-contract-')),file=path.join(root,TARGET),other=path.join(root,'stable-owner.txt'),receipt=path.join(root,'reference.json');
 try{
  fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,actual);fs.writeFileSync(other,'stable source\n');git(root,'init','--quiet');git(root,'add','.');git(root,'-c','user.name=fixture','-c','user.email=fixture@example.invalid','commit','--quiet','-m','local reference contract');const head=git(root,'rev-parse','HEAD');
  const current=captureSourceIdentity(root,head,'candidate');const reference=prepareReference(root,head,receipt);assert(verifyIdentityPair(reference,current,head));assert.equal(hash(fs.readFileSync(file)),REFERENCE_SHA256);assert.deepEqual(JSON.parse(fs.readFileSync(receipt)),reference);
  assert.throws(()=>prepareReference(root,head,receipt),'cannot apply rollback twice');assert.throws(()=>captureSourceIdentity(root,'0'.repeat(40),'baseline'));
  fs.writeFileSync(other,'modified\n');assert.throws(()=>captureSourceIdentity(root,head,'baseline'),/unchanged tracked source/);fs.writeFileSync(other,'stable source\n');
  fs.chmodSync(other,0o755);assert.throws(()=>captureSourceIdentity(root,head,'baseline'),/executable mode/);fs.chmodSync(other,0o644);
  fs.renameSync(other,other+'.saved');assert.throws(()=>captureSourceIdentity(root,head,'baseline'),/ENOENT/);fs.renameSync(other+'.saved',other);
  fs.writeFileSync(file,actual);assert.throws(()=>captureSourceIdentity(root,head,'baseline'),/named target role/);assert.deepEqual(captureSourceIdentity(root,head,'candidate'),current);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
