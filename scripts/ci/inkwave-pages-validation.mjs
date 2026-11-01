#!/usr/bin/env node
import {pathToFileURL} from 'node:url';
import {readFileSync} from 'node:fs';
const REPOSITORY='rhgrive3/actions';
const WORKFLOW='validate-inkwave-update.yml';
const requiredSingles=['admission_preflight','build_site','validate_core','seven_claims','resource_paint_continuation','validate'];
const browserSuites=['active','catalog','ui','responsive','network','range','startup'];
function requireProof(ok,message){if(!ok)throw Error('Pages validation barrier: '+message);}
export function assertPagesTrigger({sha,githubSha,eventName,event,repository,ref}){
 requireProof(repository===REPOSITORY&&ref==='refs/heads/main','Pages must run on trusted main');
 requireProof(/^[a-f0-9]{40}$/.test(sha),'expected immutable 40-character SHA');
 if(eventName==='workflow_dispatch'){
  requireProof(sha===githubSha,'manual Pages source must be its exact workflow SHA');
  return null;
 }
 requireProof(eventName==='workflow_run'&&event?.action==='completed','expected completed Validate trigger');
 const run=event.workflow_run;
 requireProof(event.repository?.full_name===REPOSITORY&&run?.head_repository?.full_name===REPOSITORY,'untrusted triggering repository');
 requireProof(run.head_sha===sha&&run.head_branch==='main'&&run.event==='push','trigger must be this exact main push');
 requireProof(run.path==='.github/workflows/'+WORKFLOW,'unexpected triggering workflow path');
 requireProof(run.status==='completed'&&run.conclusion==='success','triggering Validate has not succeeded');
 requireProof(Number.isInteger(run.id)&&run.id>0&&Number.isInteger(run.run_attempt)&&run.run_attempt>0,'missing triggering run identity');
 return {runId:run.id,runAttempt:run.run_attempt};
}
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
 const patchJobs=jobs.filter(j=>/^patch_tests(?: \(|$)/.test(j.name));
 requireProof(patchJobs.length===9,'all nine patch shards are required');
 for(let i=0;i<9;i++)one('patch_tests ('+i+')');
 const browserJobs=jobs.filter(j=>/^browser \(/.test(j.name));
 requireProof(browserJobs.length===7,'all seven browser lanes are required');
 for(const suite of browserSuites){const rows=browserJobs.filter(j=>new RegExp('^browser \\('+suite+'(?:, [^)]*)?\\)$').test(j.name));requireProof(rows.length===1&&rows[0].status==='completed'&&rows[0].conclusion==='success','browser lane failed or missing: '+suite);}
 return {sha,runId:run.id,runAttempt:run.run_attempt,requiredJobs:22,validatedAt:new Date().toISOString()};
}
export async function awaitPagesValidation({sha,read,trigger=null,wait=false,now=Date.now,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),timeoutMs=150*60*1000,log=()=>{}}){
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
  if(trigger)requireProof(run?.id===trigger.runId&&run.run_attempt===trigger.runAttempt,'trigger does not identify the latest Validate attempt');
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
  const shaIndex=process.argv.indexOf('--sha');
  const sha=shaIndex<0?process.env.GITHUB_SHA:process.argv[shaIndex+1];
  const event=process.env.GITHUB_EVENT_PATH?JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8')):null;
  const trigger=assertPagesTrigger({sha,githubSha:process.env.GITHUB_SHA,eventName:process.env.GITHUB_EVENT_NAME,event,repository:process.env.GITHUB_REPOSITORY,ref:process.env.GITHUB_REF});
  requireProof(!!process.env.GITHUB_TOKEN,'missing read-only Actions token');
  const read=async endpoint=>{
   const response=await fetch('https://api.github.com'+endpoint,{headers:{Authorization:'Bearer '+process.env.GITHUB_TOKEN,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(30000)});
   requireProof(response.ok,'GitHub read failed with HTTP '+response.status);return response.json();
  };
  console.log(JSON.stringify(await awaitPagesValidation({sha,read,trigger,wait:process.argv.includes('--wait'),log:message=>console.error(message)})));
 }catch(error){console.error(error.message);process.exitCode=1;}
}
