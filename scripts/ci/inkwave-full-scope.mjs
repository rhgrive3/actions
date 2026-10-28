#!/usr/bin/env node
// Exact-tree scope selection, never a replacement for source identity checks.
// An unchanged gameplay/input tree may reuse the CI-contract acceptance route,
// regardless of the COMMIT SHA. Missing history/invalid refs always run FULL CI.
import {spawnSync} from 'node:child_process';
import {appendFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const hash=/^[a-f0-9]{40}$/;
const contractTests=/^scripts\/tests\/inkwave-(?:staged-ci-policy|added-ci-contracts|network-diagnostic-workflow|wall-diagnostic-workflow|test-suites|workflow-inputs|source-coverage|optimization-workflows|ci-source-admission|ci-sparse-checkout)\.test\.mjs$/;
const isolatedWorkflow=/^\.github\/workflows\/(?!validate-inkwave-update\.yml$)[a-zA-Z0-9_-]+\.yml$/;
const docs=/^(?:docs|reports)\/[^\\\0\n]+\.md$/;

export function classifyChangedFiles(files) {
  if (!Array.isArray(files)||files.some(x=>typeof x!=='string'||!x||x.includes('\0')||x.includes('\n')))
    return 'full';
  return files.every(file=>contractTests.test(file)||isolatedWorkflow.test(file)||docs.test(file)) ? 'contracts-only' : 'full';
}
export function classifyExactDiff({event,base,head,run=spawnSync}) {
  const result={mode:'full',reason:'fail-open'};
  if(event!=='pull_request'||!hash.test(base||'')||!hash.test(head||''))return {...result,reason:'non-PR or missing immutable SHA'};
  const invoke=args=> {
    const out=run('git',args,{encoding:'buffer',maxBuffer:4*1024*1024});
    if(!out||out.status!==0||out.signal||out.error)throw Error('Git history unavailable');
    return Buffer.isBuffer(out.stdout)?out.stdout:Buffer.from(out.stdout||'');
  };
  try{
    if(invoke(['rev-parse','HEAD']).toString('utf8').trim()!==head)throw Error('Checkout not exact head');
    try{if(invoke(['cat-file','-t',base]).toString('utf8').trim()!=='commit')throw Error('wrong ref type');}
    catch{invoke(['fetch','--no-tags','--depth=1','origin',base]);if(invoke(['cat-file','-t',base]).toString('utf8').trim()!=='commit')throw Error('missing immutable base');}
    const changed=invoke(['-c','diff.renames=false','diff','--no-ext-diff','--no-renames','--name-only','-z',base,head]);
    if(changed.length>4*1024*1024)throw Error('diff too large');
    const paths=changed.length?changed.toString('utf8').split('\0').filter(Boolean):[];
    const mode=classifyChangedFiles(paths);
    return {mode,reason:mode==='contracts-only'?'only isolated CI contracts/workflows/docs changed':'runtime or unknown source inputs changed',paths};
  }catch(error){return {...result,reason:'fail-open: '+String(error?.message||error)};}
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const info=classifyExactDiff({event:process.env.GITHUB_EVENT_NAME,base:process.env.CONTRACT_SCOPE_BASE,head:process.env.SOURCE_SHA});
  if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,'contracts_only='+(info.mode==='contracts-only'?'true':'false')+'\n');
  console.log(JSON.stringify({mode:info.mode,reason:info.reason,pathCount:info.paths?.length||0}));
}
