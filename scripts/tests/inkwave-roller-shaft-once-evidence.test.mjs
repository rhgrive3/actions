import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import os from'node:os';import path from'node:path';import{execFileSync}from'node:child_process';import{gunzipSync}from'node:zlib';import{fileURLToPath}from'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url)),folder=path.join(root,'reports/roller-shaft-once-20261023');
test('published raw reproduces whole48–58 browser regressions and retains open120Hz/early-release gates',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'shaft-once-evidence-'));try{const out=path.join(temp,'analysis.json');execFileSync(process.execPath,['scripts/analyze-inkwave-roller-shaft-once.mjs',folder,out,'--published'],{cwd:root,stdio:'pipe'});assert.equal(fs.readFileSync(out,'utf8'),fs.readFileSync(path.join(folder,'analysis.json'),'utf8'));
  const result=JSON.parse(fs.readFileSync(out));assert.equal(result.cases.length,2);assert.equal(result.knownRemaining.length,2);assert(result.refresh.some(r=>r.hz===120&&r.status==='not accepted'));
  for(const name of['repress','late','cases']){const raw=role=>gunzipSync(fs.readFileSync(path.join(folder,'raw',`${name}-${role}.json.gz`)));assert.deepEqual(raw('source'),raw('built'),name+' exact source/emitted trace');}
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
