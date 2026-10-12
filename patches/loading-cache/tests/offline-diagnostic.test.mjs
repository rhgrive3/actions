import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { finalizeLoadingWorker, WORKER_BUDGET_BYTES, REVISION_BUDGET_BYTES } from '../adapter.mjs';
const root=path.resolve('.ci-scratch/offline-diagnostic');fs.mkdirSync(root,{recursive:true});
function fixture(t){const dir=fs.mkdtempSync(path.join(root,'case-'));fs.writeFileSync(path.join(dir,'index.html'),'<html></html>');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
const plan=()=>({assets:{},precache:[],assetBytes:0,precacheBytes:0});
test('default worker retains 48MiB revision / 192KiB production ceilings', t=>{
  const dir=fixture(t);finalizeLoadingWorker(dir,'a'.repeat(64),plan());
  assert.equal(REVISION_BUDGET_BYTES,48*1024*1024);
  assert.match(fs.readFileSync(path.join(dir,'sw.js'),'utf8'),/MAX_REVISION_BYTES = 48 \* 1024 \* 1024/);
  // A 96 KiB worker is above the old 69 KiB limit but must now build cleanly.
  const accepted=finalizeLoadingWorker(dir,'a'.repeat(64),plan(),s=>s+' '.repeat(96*1024));
  assert.ok(accepted.workerBytes>69*1024 && accepted.workerBytes<WORKER_BUDGET_BYTES);
  assert.throws(()=>finalizeLoadingWorker(dir,'a'.repeat(64),plan(),s=>s+' '.repeat(WORKER_BUDGET_BYTES)),/192 KiB/);
});
test('explicit diagnostic mode changes only declared worker/revision budgets', t=>{
  const dir=fixture(t),p=plan();p.budget={mode:'diagnostic-unminified',precache:32*1024*1024,revision:64*1024*1024,worker:256*1024};
  const result=finalizeLoadingWorker(dir,'b'.repeat(64),p,s=>s+' '.repeat(WORKER_BUDGET_BYTES));
  assert.ok(result.workerBytes>WORKER_BUDGET_BYTES && result.workerBytes<256*1024);
  assert.match(fs.readFileSync(path.join(dir,'sw.js'),'utf8'),/MAX_REVISION_BYTES = 67108864/);
  assert.throws(()=>finalizeLoadingWorker(dir,'b'.repeat(64),p,s=>s+' '.repeat(256*1024)),/256 KiB/);
});
