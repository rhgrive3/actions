import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {spawnSync} from 'node:child_process';
const original=JSON.parse(fs.readFileSync(new URL('./acceptance-plan.json',import.meta.url),'utf8'));
function run(mutate){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'weapon-checkout-'));try{const p=structuredClone(original);mutate(p);const plan=path.join(dir,'plan.json'),env=path.join(dir,'env');fs.writeFileSync(plan,JSON.stringify(p));fs.writeFileSync(env,'EXISTING=preserved\n');const r=spawnSync(process.execPath,[new URL('./select-candidate.mjs',import.meta.url).pathname,plan,env],{encoding:'utf8'});return {status:r.status,env:fs.readFileSync(env,'utf8'),stderr:r.stderr};}finally{fs.rmSync(dir,{recursive:true,force:true});}}
test('validated immutable head is written exactly once without shell interpolation',()=>{const r=run(()=>{});assert.equal(r.status,0,r.stderr);assert.equal(r.env,'EXISTING=preserved\nCANDIDATE='+original.candidateHead+'\n');});
for(const [name,mutate] of Object.entries({empty:p=>p.candidateHead='',missing:p=>delete p.candidateHead,undefinedString:p=>p.candidateHead='undefined',newline:p=>p.candidateHead=original.candidateHead+'\nOTHER=bad',malformed:p=>p.candidateHead='main',wrongVariants:p=>p.variantIds=[]}))test('fail before environment mutation: '+name,()=>{const r=run(mutate);assert.notEqual(r.status,0);assert.equal(r.env,'EXISTING=preserved\n');});
