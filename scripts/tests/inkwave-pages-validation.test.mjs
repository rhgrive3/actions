import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {assertValidationProof,awaitPagesValidation} from '../ci/inkwave-pages-validation.mjs';
const sha='a'.repeat(40),other='b'.repeat(40);
function fixture(){
 const run={id:9,run_attempt:2,head_sha:sha,head_branch:'main',event:'push',repository:{full_name:'rhgrive3/actions'},head_repository:{full_name:'rhgrive3/actions'},path:'.github/workflows/validate-inkwave-update.yml',status:'completed',conclusion:'success'};
 const names=['admission_preflight','build_site','validate_core','seven_claims','resource_paint_continuation','validate',...Array.from({length:8},(_,i)=>'patch_tests ('+i+')'),...['active','catalog','ui','responsive','network','range','startup'].map(x=>'browser ('+x+', chromium webkit)')];
 return{sha,mainSha:sha,run,jobsAttempt:2,jobs:names.map(name=>({name,run_id:9,run_attempt:2,head_sha:sha,status:'completed',conclusion:'success'}))};
}
test('Pages requires exact trusted main SHA, successful latest attempt, every shard and browser lane',()=>{
 assert.equal(assertValidationProof(fixture()).requiredJobs,21);
 const documented=fixture();for(const j of documented.jobs)delete j.run_attempt;assert.equal(assertValidationProof(documented).runAttempt,2,'attempt-specific endpoint binds jobs even when the optional response field is absent');
 for(const mutate of [x=>x.mainSha=other,x=>x.run.head_sha=other,x=>x.run.head_branch='topic',x=>x.run.event='pull_request',x=>x.run.event='workflow_dispatch',x=>x.run.head_repository.full_name='fork/actions',x=>x.run.repository.full_name='fork/actions',x=>x.run.path='.github/workflows/other.yml',x=>x.jobs.pop(),x=>x.jobs.push({...x.jobs[0]}),x=>x.jobs[0].head_sha=other,x=>x.jobs[0].run_attempt=1,x=>x.jobsAttempt=1,x=>x.jobs[0].run_id=8]){const f=fixture();mutate(f);assert.throws(()=>assertValidationProof(f),/Pages validation barrier/);}
 for(const status of ['queued','in_progress','waiting','cancelled']){const f=fixture();f.run.status=status;assert.throws(()=>assertValidationProof(f));}
 for(const conclusion of ['failure','cancelled','skipped','timed_out','neutral',null]){const f=fixture();f.run.conclusion=conclusion;assert.throws(()=>assertValidationProof(f));for(let i=0;i<f.jobs.length;i++){const g=fixture();g.jobs[i].conclusion=conclusion;assert.throws(()=>assertValidationProof(g));}}
});
function reader(f,{pending=0,rerun=false,stale=false}={}){let list=0,head=0;return async url=>{
 if(url.endsWith('/git/ref/heads/main'))return{object:{sha:stale&&head++?other:sha}};
 if(url.includes('/jobs?'))return{jobs:f.jobs,total_count:f.jobs.length};
 if(url.includes('/runs?')){list++;return{workflow_runs:[f.run],total_count:1};}
 if(url.endsWith('/actions/runs/9'))return {...f.run,status:list<=pending?'in_progress':'completed',run_attempt:rerun&&list>1?3:2};
 throw Error('Unexpected read '+url);
};}
test('pending validation waits without publishing; rerun and main-change races fail closed',async()=>{
 let waits=0;const f=fixture();const proof=await awaitPagesValidation({sha,read:reader(f,{pending:1}),wait:true,pause:async()=>{waits++;}});assert.equal(waits,1);assert.equal(proof.runId,9);
 for(const options of [{rerun:true},{stale:true}])await assert.rejects(awaitPagesValidation({sha,read:reader(f,options)}),/Pages validation barrier/);
 await assert.rejects(awaitPagesValidation({sha,read:reader(f,{pending:1})}),/no completed successful/);
 f.run.conclusion='failure';await assert.rejects(awaitPagesValidation({sha,read:reader(f),wait:true}),/latest Validate run failed/);
});
test('workflow checks validation before upload and again before deploy, with read-only Actions access',()=>{
 const w=fs.readFileSync(new URL('../../.github/workflows/pages-inkwave.yml',import.meta.url),'utf8');
 const wait=w.indexOf('node scripts/ci/inkwave-pages-validation.mjs --wait'),upload=w.indexOf('uses: actions/upload-pages-artifact@'),once=w.indexOf('node scripts/ci/inkwave-pages-validation.mjs --once'),deploy=w.indexOf('uses: actions/deploy-pages@');
 assert(wait>=0&&wait<upload&&upload<once&&once<deploy);assert.match(w,/actions: read/);assert.doesNotMatch(w,/actions: write|continue-on-error/);
});
