import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {gzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
import {selectCanonicalTraceModule,requireFrozenTrace} from './native-action-trace-binding.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
test('built trace requires the selected, manifest-bound canonical module',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'native-trace-binding-'));
 try{
  const rel='patches/network-replication/canonical-weapon-actions.mjs',file=path.join(root,rel),manifest=path.join(root,'inkwave-build.json');
  fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'export const x=1;');
  const artifacts={[rel]:hash(fs.readFileSync(file))};fs.writeFileSync(manifest,JSON.stringify({artifacts,contentHash:hash(JSON.stringify(artifacts))}));
  assert.equal(selectCanonicalTraceModule(root),file);assert.equal(selectCanonicalTraceModule(root,file),file);assert.equal(selectCanonicalTraceModule(),null);
  assert.throws(()=>selectCanonicalTraceModule(undefined,file),/requires a built site/);
  assert.throws(()=>selectCanonicalTraceModule(root,path.join(root,'other.mjs')),/not the selected/);
  fs.appendFileSync(file,'tampered');assert.throws(()=>selectCanonicalTraceModule(root),/identity mismatch/);
  fs.rmSync(file);assert.throws(()=>selectCanonicalTraceModule(root),/ENOENT/);
  delete artifacts[rel];fs.writeFileSync(manifest,JSON.stringify({artifacts,contentHash:hash(JSON.stringify(artifacts))}));assert.throws(()=>selectCanonicalTraceModule(root),/identity mismatch/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('immutable corpus is mandatory and exact',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'native-trace-corpus-')),file=path.join(root,'corpus.gz');
 try{assert.throws(()=>requireFrozenTrace('correct',file),/ENOENT/);fs.writeFileSync(file,gzipSync('correct'));requireFrozenTrace('correct',file);assert.throws(()=>requireFrozenTrace('changed',file),/differs/);}finally{fs.rmSync(root,{recursive:true,force:true});}
});
