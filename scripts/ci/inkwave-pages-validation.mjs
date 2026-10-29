#!/usr/bin/env node
import {pathToFileURL} from 'node:url';
const REPOSITORY='rhgrive3/actions';
const WORKFLOW='validate-inkwave-update.yml';
const requiredSingles=['admission_preflight','build_site','validate_core','seven_claims','resource_paint_continuation','validate'];
const browserSuites=['active','catalog','ui','responsive','network','range','startup'];
function requireProof(ok,message){if(!ok)throw Error('Pages validation barrier: '+message);}
export function assertValidationProof({sha,mainSha,run,jobs,jobsAttempt}){
 requireProof(/^[a-f0-9]{40}$/.test(sha),'expected immutable 40-character SHA');
 requireProof(mainSha===sha,'source is no longer current main');
 requireProof(run?.head_sha===sha&&run.head_branch==='main'&&run.event==='push','Validate must be a push of this exact main SHA');
 requireProof(run.repository?.full_name===REPOSITORY&&run.head_repository?.full_name===REPOSITORY,'untrusted run repository');
 requireProof(run.path==='.github/workflows/'+WORKFLOW,'unexpected workflow path');
 requireProof(Number.isInteger(run.id)&&run.id>0&&Number.isInteger(run.run_attempt)&&run.run_attempt>0,'missing run attempt identity');
 requireProof(run.status==='completed'&&run.conclusion==='success','Validate is not completed successfully');
 requireProof(jobsAttempt===run.run_attempt,'jobs must come from the exact attempt endpoint');
 requireProof(Array.isArray(jobs)&&jobs.length>0,'missing jobs for this run attempt');
 for(const job of jobs)requireProof(job.head_sha===sha&&job.run_id===run.id&&(job.run_attempt===undefined||job.run_attempt===run.run_attempt),'job identity does not match the run attempt');
 function one(name){const rows=jobs.filter(j=>j.name===name);requireProof(rows.length===1&&rows[0].status==='completed'&&rows[0].conclusion==='success','required job failed, missing or duplicated: '+name);}
 for(const name of requiredSingles)one(name);
 for(let i=0;i<8;i++)one('patch_tests ('+i+')');
 const browserJobs=jobs.filter(j=>/^browser \(/.test(j.name));
 requireProof(browserJobs.length===7,'all seven browser lanes are required');
 for(const suite of browserSuites){const rows=browserJobs.filter(j=>new RegExp('^browser \\('+suite+'(?:, [^)]*)?\\)$').test(j.name));requireProof(rows.length===1&&rows[0].status==='completed'&&rows[0].conclusion==='success','browser lane failed or missing: '+suite);}
 return {sha,runId:run.id,runAttempt:run.run_attempt,requiredJobs:21,validatedAt:new Date().toISOString()};
}
export async function awaitPagesValidation({sha,read,wait=false,now=Date.now,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),timeoutMs=150*60*1000,log=()=>{}}){
 requireProof(/^[a-f0-9]{40}$/.test(sha),'expected immutable 40-character SHA');
 const base='/repos/'+REPOSITORY,started=now();
 const currentMain=async()=>{const ref=await read(base+'/git/ref/heads/main');requireProof(ref.object?.sha===sha,'source is no longer current main');return ref.object.sha;};
 async function latest(){
  const result=await read(base+'/actions/workflows/'+WORKFLOW+'/runs?branch=main&event=push&head_sha='+sha+'&per_page=100');
  const runs=result.workflow_runs;requireProof(Array.isArray(runs),'malformed workflow run response');
  // Query is SHA-specific. Do not silently accept an older page if an extreme
  // rerun history exceeds this bounded selection.
  requireProof(result.total_count<=100,'run selection exceeds the bounded result set');
  const run=runs.filter(r=>r.head_sha===sha).sort((a,b)=>b.id-a.id)[0];
  return run?await read(base+'/actions/runs/'+run.id):null;
 }
 while(true){
  const mainSha=await currentMain(),run=await latest();
  if(run?.status==='completed'){
   requireProof(run.conclusion==='success','latest Validate run failed: '+run.conclusion);
   const jobs=[];
   for(let page=1;;page++){
    const response=await read(base+'/actions/runs/'+run.id+'/attempts/'+run.run_attempt+'/jobs?per_page=100&page='+page);
    requireProof(Array.isArray(response.jobs),'malformed job response');jobs.push(...response.jobs);
    if(jobs.length>=response.total_count)break;
    requireProof(response.jobs.length>0&&page<20,'incomplete jobs pagination');
   }
   const proof=assertValidationProof({sha,mainSha,run,jobs,jobsAttempt:run.run_attempt});
   const last=await latest();await currentMain();
   requireProof(last?.id===run.id&&last.run_attempt===run.run_attempt&&last.status==='completed'&&last.conclusion==='success','Validate changed while checking evidence');
   return proof;
  }
  requireProof(wait&&now()-started<timeoutMs,'no completed successful Validate run within the allowed wait');
  log('Waiting for Validate on '+sha+' ('+(run?.status||'not yet observed')+')');
  await pause(30000);
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  requireProof(process.env.GITHUB_REPOSITORY===REPOSITORY&&process.env.GITHUB_REF==='refs/heads/main','Pages must run on trusted main');
  requireProof(!!process.env.GITHUB_TOKEN,'missing read-only Actions token');
  const read=async endpoint=>{
   const response=await fetch('https://api.github.com'+endpoint,{headers:{Authorization:'Bearer '+process.env.GITHUB_TOKEN,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(30000)});
   requireProof(response.ok,'GitHub read failed with HTTP '+response.status);return response.json();
  };
  console.log(JSON.stringify(await awaitPagesValidation({sha:process.env.GITHUB_SHA,read,wait:process.argv.includes('--wait'),log:message=>console.error(message)})));
 }catch(error){console.error(error.message);process.exitCode=1;}
}
