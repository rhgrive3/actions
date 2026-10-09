import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { finalizeLoadingWorker } from '../adapter.mjs';
const root=path.resolve('.ci-scratch/offline-diagnostic');fs.mkdirSync(root,{recursive:true});
function fixture(t){const dir=fs.mkdtempSync(path.join(root,'case-'));fs.writeFileSync(path.join(dir,'index.html'),'<html></html>');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
const plan=()=>({assets:{},precache:[],assetBytes:0,precacheBytes:0});
test('default worker retains 12MiB revision / 64KiB code production ceilings', t=>{
  const dir=fixture(t);finalizeLoadingWorker(dir,'a'.repeat(64),plan());
  assert.match(fs.readFileSync(path.join(dir,'sw.js'),'utf8'),/MAX_REVISION_BYTES = 12 \* 1024 \* 1024/);
  assert.throws(()=>finalizeLoadingWorker(dir,'a'.repeat(64),plan(),s=>s+' '.repeat(64*1024)),/64 KiB/);
});
test('explicit diagnostic mode changes only declared worker/revision budgets', t=>{
  const dir=fixture(t),p=plan();p.budget={mode:'diagnostic-unminified',precache:12*1024*1024,revision:24*1024*1024,worker:128*1024};
  const result=finalizeLoadingWorker(dir,'b'.repeat(64),p,s=>s+' '.repeat(64*1024));
  assert.ok(result.workerBytes>64*1024 && result.workerBytes<128*1024);
  assert.match(fs.readFileSync(path.join(dir,'sw.js'),'utf8'),/MAX_REVISION_BYTES = 25165824/);
  assert.throws(()=>finalizeLoadingWorker(dir,'b'.repeat(64),p,s=>s+' '.repeat(128*1024)),/128 KiB/);
});
