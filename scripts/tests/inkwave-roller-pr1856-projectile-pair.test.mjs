import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {rollerProjectileManifest,assertRollerEvent,assertRollerProductionRows,assertRollerCandidateRevision,rollerFrozenCommit,assertRollerFrozenRevision,scanRollerProduction,assertRollerNormalBuildProfile,ROLLER_PROJECTILE_BASE as B,ROLLER_PROJECTILE_SOURCE as H} from '../lib/inkwave-roller-pr1856-projectile-pair.mjs';
import {ROLLER_PR1856_POSE_PAIR as pose,ROLLER_PR1856_HELPER_PATH as helper} from '../lib/inkwave-roller-pr1856-pose-pair.mjs';
const m=rollerProjectileManifest(),future='a'.repeat(40);
const event=()=>({repository:{full_name:'rhgrive3/actions'},pull_request:{number:1856,base:{ref:'main',sha:B},head:{ref:'fix/roller-vertical-recovery-20261023',sha:H,repo:{full_name:'rhgrive3/actions'}}}});
test('fixed main3003/2b103 closure covers every saved canonical input and retains the reviewed17-leaf pose pins',()=>{
 assert.equal(m.baseline.tree,'8e284fe4c1d35656104cd740ad0cea41099868d0');
 assert.equal(m.candidate.tree,'93910708344d1be3eb78d1ef9a7fd88c003d909c');
 const maps=['baseline','candidate'].map(side=>new Map(m[side].leaves.map(row=>[row.path,row])));
 for(const [p,pins]of Object.entries(pose.paths))for(const [i,side]of ['baseline','candidate'].entries())assert.equal(maps[i].get(p)?.sha??null,pins[side],p);
 assert.equal(maps[0].has(helper),false);assert.equal(maps[1].get(helper).sha,pose.paths[helper].candidate);
 for(const row of m.savedCandidateBuild.canonicalInputs)assert.equal(maps[1].get(row.path)?.sha256,row.sha256,row.path);
 assert.equal(new Set(m.savedCandidateBuild.canonicalInputs.map(r=>r.path)).size,1422);
 assert.deepEqual(m.changedProductionPaths,[helper,'patches/splatoon3/runtime/roller.mjs']);
 assert.equal(m.baseline.leaves.length,1459);assert.equal(m.candidate.leaves.length,1460);
 for(const side of ['baseline','candidate'])assert.doesNotThrow(()=>assertRollerProductionRows(m[side].leaves,side));
});
test('every production leaf byte drift or omission rejects; additions, duplicates, modes and mixed/reversed epochs remain closed',()=>{
 for(const side of ['baseline','candidate']){
  const rows=m[side].leaves;
  for(let i=0;i<rows.length;i++){
   const changed=[...rows];changed[i]={...rows[i],sha256:'0'.repeat(64)};
   assert.throws(()=>assertRollerProductionRows(changed,side),/pinned sha256/);
   assert.throws(()=>assertRollerProductionRows(rows.filter((_,n)=>n!==i),side),/complete production inventory length/);
  }
  for(const bad of [[...rows,rows[0]],[...rows,{...rows[0],path:'inkwave-public/unknown.js'}]])assert.throws(()=>assertRollerProductionRows(bad,side));
  for(const key of ['mode','sha']){const changed=[...rows];changed[0]={...rows[0],[key]:'0'};assert.throws(()=>assertRollerProductionRows(changed,side));}
 }
 assert.throws(()=>assertRollerProductionRows(m.baseline.leaves,'candidate'));
 assert.throws(()=>assertRollerProductionRows(m.candidate.leaves,'baseline'));
});
test('actual isolated worktree discovery rejects copied public tests, Markdown, nested overlay tests and loading runtime Markdown',()=>{
 const repo=fileURLToPath(new URL('../../',import.meta.url)),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'roller1856-copy-')),checkout=path.join(tmp,'worktree');
 const git=(...args)=>execFileSync('git',['-C',repo,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 git('worktree','add','--detach',checkout,'HEAD');
 const probes=['inkwave-public/tests/unreviewed.mjs','inkwave-public/unreviewed.md','patches/splatoon3/runtime/tests/unreviewed.mjs','patches/loading-cache/runtime/unreviewed.md'];
 try{
  assertRollerProductionRows(scanRollerProduction(checkout),'candidate');
  for(const relative of probes){
   const file=path.join(checkout,relative),bytes='// isolated copy-closure probe\n';assert.equal(fs.existsSync(file),false);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);
   try{const rows=scanRollerProduction(checkout);assert.ok(rows.some(r=>r.path===relative),'actual scanner must discover '+relative);assert.throws(()=>assertRollerProductionRows(rows,'candidate'),/complete production inventory length/);assert.equal(fs.readFileSync(file,'utf8'),bytes,'checker writes no source');}
   finally{fs.rmSync(file);}
  }
  assertRollerProductionRows(scanRollerProduction(checkout),'candidate');
 }finally{git('worktree','remove','--force',checkout);fs.rmSync(tmp,{recursive:true,force:true});}
});
test('normal build profile rejects external account/native/compiler inputs and alternate output profiles',()=>{
 const normal=assertRollerNormalBuildProfile({});assert.equal(normal.accountBuild,null);assert.equal(normal.optimization,'esbuild-minify');
 for(const name of ['INKWAVE_ACCOUNT_BUILD','INKWAVE_NATIVE_STAGE_ASSETS','ESBUILD_MODULE','ESBUILD_BINARY_PATH'])assert.throws(()=>assertRollerNormalBuildProfile({[name]:'/unreviewed/external-input'}),new RegExp(name+': unsupported external build input'));
 for(const name of ['INKWAVE_BUILD_UNMINIFIED','INKWAVE_NO_THREE_SHAKE'])assert.throws(()=>assertRollerNormalBuildProfile({[name]:'1'}),/normal minified build profile/);
 assert.throws(()=>assertRollerNormalBuildProfile({INKWAVE_BUILD_TRANSFORM_CONCURRENCY:'8'}),/normal build transform concurrency/);
 assert.deepEqual(assertRollerNormalBuildProfile({INKWAVE_ACCOUNT_BUILD:''}),normal);
});
test('actual event binds owned PR/ref/repository, immutable main3003 and the declared real head',()=>{
 assert.doesNotThrow(()=>assertRollerEvent(event(),'pull_request',B,H));
 const mutations=[e=>e.pull_request.number=1857,e=>e.pull_request.head.ref+='-other',e=>e.pull_request.base.ref='other',e=>e.pull_request.base.sha=future,e=>e.pull_request.head.sha=future,e=>e.pull_request.head.repo.full_name='fork/actions',e=>e.repository.full_name='fork/actions'];
 for(const mutate of mutations){const e=event();mutate(e);assert.throws(()=>assertRollerEvent(e,'pull_request',B,H));}
 for(const args of [['workflow_dispatch',B,H],['pull_request',future,H],['pull_request',B,future],['pull_request',B,'main']])assert.throws(()=>assertRollerEvent(event(),...args));
});
test('revision shape excludes descendants and unrelated merges/changes before the separate frozen identity check',()=>{
 assert.doesNotThrow(()=>assertRollerCandidateRevision({head:H,parents:[B,'b'.repeat(40)],changedPaths:[]}));
 assert.doesNotThrow(()=>assertRollerCandidateRevision({head:future,parents:[H],changedPaths:m.qaPaths}));
 for(const bad of [
  {head:H,parents:[],changedPaths:[helper]},
  {head:future,parents:[future],changedPaths:m.qaPaths},
  {head:future,parents:[H,B],changedPaths:m.qaPaths},
  {head:future,parents:[H],changedPaths:[]},
  {head:future,parents:[H],changedPaths:[...m.qaPaths,helper]},
  {head:future,parents:[H],changedPaths:m.qaPaths.slice(1)}
 ])assert.throws(()=>assertRollerCandidateRevision(bad));
});
test('frozen QA tree and raw commit identity reject another head, tree, parent, timestamp, message or future QA sibling',()=>{
 const expected=rollerFrozenCommit('b'.repeat(40));
 const observed={head:expected.commit,tree:expected.tree,raw:expected.raw};
 assert.doesNotThrow(()=>assertRollerFrozenRevision(observed,expected));
 for(const bad of [{head:future},{tree:future},{raw:expected.raw.replace(H,future)},{raw:expected.raw.replace('1792798310','1792798311')},{raw:expected.raw+'unreviewed message\n'}])assert.throws(()=>assertRollerFrozenRevision({...observed,...bad},expected));
  // Under the unchanged reviewed verifier, path names alone cannot admit an
 // unknown direct QA sibling: full commit/tree identity is still mandatory.
 assert.doesNotThrow(()=>assertRollerCandidateRevision({head:future,parents:[H],changedPaths:m.qaPaths}));
 assert.throws(()=>assertRollerFrozenRevision({...observed,head:future},expected),/only the one frozen/);
});

const workflow=fs.readFileSync(new URL('../../.github/workflows/inkwave-projectile-visuals.yml',import.meta.url),'utf8');
function routeShell(){const name='      - name: Replay reviewed Roller births, pool reset and pinned paint in the main reference\n';const start=workflow.indexOf(name);assert.notEqual(start,-1);const step=workflow.slice(start+name.length).split(/\n      - /)[0];return step.split('        run: |\n')[1].split('\n').map(l=>l.replace(/^          /,'')).join('\n');}
test('saved workflow selects only Roller1856 main3003 owned route; a verifier failure cannot fall through',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'roller1856-route-'));
 try{
  fs.writeFileSync(path.join(tmp,'node'),'#!/bin/sh\nprintf "%s\\n" "$@"\nexit "${NODE_STATUS:-0}"\n',{mode:0o755});
  fs.writeFileSync(path.join(tmp,'git'),'#!/bin/sh\nif [ "$1" = "cat-file" ]; then exit "${SOURCE_PRESENT_STATUS:-0}"; fi\nprintf "GIT:%s\\n" "$@" >&2\nexit "${FETCH_STATUS:-0}"\n',{mode:0o755});
  const env={...process.env,PATH:tmp+':'+process.env.PATH,PAIR_EVENT_NAME:'pull_request',PAIR_PR_NUMBER:'1856',PAIR_BASE_REF:'main',PAIR_HEAD_REF:'fix/roller-vertical-recovery-20261023',PAIR_HEAD_REPO:'rhgrive3/actions',PAIR_REPOSITORY:'rhgrive3/actions',DECLARED_BASE_SHA:B,DECLARED_HEAD_SHA:H,INKWAVE_REFERENCE_ROOT:'.ci-baseline',GITHUB_EVENT_PATH:'/event.json',DISPATCH_MODE:'unknown',DISPATCH_SOURCE_BASE:B,DISPATCH_SOURCE_HEAD:H};
  const run=extra=>spawnSync('bash',['--noprofile','--norc','-eo','pipefail','-c',routeShell()],{encoding:'utf8',env:{...env,...extra},timeout:10000});
  const selected='scripts/verify-inkwave-roller-pr1856-projectile-pair.mjs';
  const ok=run({});assert.equal(ok.error,undefined);assert.equal(ok.signal,null);assert.equal(ok.status,0,ok.stderr);assert.ok(ok.stdout.includes(selected));
  for(const [flag,value]of [['--base-sha',B],['--candidate-sha',H],['--event','/event.json']])assert.ok(ok.stdout.includes(flag+'\n'+value+'\n'));
  for(const bad of [{PAIR_EVENT_NAME:'workflow_dispatch'},{PAIR_PR_NUMBER:'1857'},{PAIR_HEAD_REF:'other'},{PAIR_BASE_REF:'other'},{DECLARED_BASE_SHA:future},{PAIR_HEAD_REPO:'fork/actions'},{PAIR_REPOSITORY:'fork/actions'}]){
   const r=run(bad);assert.equal(r.status,0,r.stderr);assert.ok(!r.stdout.includes(selected));
  }
  const rejected=run({NODE_STATUS:'7'});assert.equal(rejected.status,7);assert.equal(rejected.stdout.split('--receipt').length-1,1);
  const shallow=run({SOURCE_PRESENT_STATUS:'1'});assert.equal(shallow.status,0,shallow.stderr);assert.ok(shallow.stderr.includes('GIT:fetch\nGIT:--no-tags\nGIT:--depth=1\nGIT:origin\nGIT:'+H+'\n'));
  const absent=run({SOURCE_PRESENT_STATUS:'1',FETCH_STATUS:'7'});assert.equal(absent.status,7);assert.equal(absent.stdout,'','failed exact-source fetch must stop before admission');
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
 for(const p of m.qaPaths.filter(p=>p!=='.github/workflows/inkwave-projectile-visuals.yml'))assert.ok(workflow.includes("      - '"+p+"'"));
 assert.ok(workflow.includes('inkwave-roller-pr1856-projectile-pair.test.mjs\n'));
});
test('real CLI wrong-event rejection is exit1 with its own assertion, preserves the prior receipt, and duplicate flags fail',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'roller1856-cli-'));
 try{
  const before=path.join(tmp,'before'),after=path.join(tmp,'after'),receipt=path.join(tmp,'receipt.json'),file=path.join(tmp,'event.json');fs.mkdirSync(before);fs.mkdirSync(after);
  const e=event();e.pull_request.number=1857;fs.writeFileSync(file,JSON.stringify(e));fs.writeFileSync(receipt,'saved receipt\n');
  const cli=fileURLToPath(new URL('../verify-inkwave-roller-pr1856-projectile-pair.mjs',import.meta.url));
  const argv=[cli,'--baseline',before,'--candidate',after,'--base-sha',B,'--candidate-sha',H,'--event',file,'--receipt',receipt];
  for(const [extra,message]of [[[],/Roller event PR number/],[['--base-sha',B],/duplicate --base-sha/]]){
   const bad=spawnSync(process.execPath,[...argv,...extra],{encoding:'utf8',timeout:10000,env:{...process.env,GITHUB_EVENT_NAME:'pull_request'}});
   assert.equal(bad.error,undefined);assert.equal(bad.signal,null);assert.equal(bad.status,1,bad.stderr);assert.match(bad.stderr,/AssertionError/);assert.match(bad.stderr,message);assert.equal(fs.readFileSync(receipt,'utf8'),'saved receipt\n');
  }
  assert.deepEqual(fs.readdirSync(before),[]);assert.deepEqual(fs.readdirSync(after),[]);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
