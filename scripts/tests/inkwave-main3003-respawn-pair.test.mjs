import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {RESPAWN3003_BASE as B,RESPAWN3003_HEAD as H,RESPAWN3003_FIXTURE_SHA256,RESPAWN3003_QA_PATHS,
  respawn3003Fixture,respawn3003Epoch,respawn3003ExecutionIdentity,assertRespawn3003Environment,assertRespawn3003Head,assertRespawn3003Inputs,assertRespawn3003Artifacts} from '../lib/inkwave-main3003-respawn-pair.mjs';
import {MAIN3003_HEAD as FIRING_HEAD,main3003Fixture} from '../lib/inkwave-main3003-firing-pair.mjs';
import {currentPairFixture,selectCurrentPair,assertCurrentPairRows,currentPairNegativeControls,verifyCurrentPairCaptureBuild} from '../lib/inkwave-projectile-current-pair.mjs';
const f=respawn3003Fixture(),old=currentPairFixture(),hash=x=>createHash('sha256').update(x).digest('hex');
const execution=respawn3003ExecutionIdentity();
const event=()=>({number:1860,pull_request:{number:1860,base:{ref:'main',sha:B,repo:{full_name:f.repository}},head:{ref:f.branch,sha:execution.commit,repo:{full_name:f.repository}}}});
const select=e=>selectCurrentPair(e,'pull_request',f.repository);

test('PR1860 pins its own complete source/build pair and exact five existing respawn deltas',()=>{
  assert.equal(RESPAWN3003_FIXTURE_SHA256,'584ba3535410e67d2abee64928507c68023735d106373141aeeba1fc5e9e22d8');
  assert.deepEqual(Object.keys(f.epochs),[B,H]);assert.deepEqual(f.epochs[B],main3003Fixture().epochs[B]);
  assert.equal(hash(fs.readFileSync(new URL('../fixtures/inkwave-projectile-current-pair-20261023.json.gz',import.meta.url))),'adf375e9e5a53d3f7ea0724d296a4b201c68edbfc6aea44291617a7d9de20ad9');
  assert.deepEqual(Object.values(old.epochs).map(e=>e.leaves.length),[1458,1458,1461,1460]);
  assert.equal(hash(fs.readFileSync(new URL('../fixtures/inkwave-main3003-firing-pair.json.gz',import.meta.url))),'80824cf99125fdf58a98394e2913764cf18ae1f40bb81f11f83647ab87367f51');
  for(const [epoch,counts]of [[B,[1459,1421,2110]],[H,[1461,1423,2112]]]){
    const e=f.epochs[epoch];assert.deepEqual([e.leaves.length,Object.keys(e.build.files).length,Object.keys(e.build.artifacts).length],counts);
    assertCurrentPairRows(e.leaves,epoch);assertRespawn3003Inputs(e.leaves,epoch);
    for(const name of ['inkwave-audio-manifest.mjs','inkwave-volume-packaging.mjs','inkwave-account-bundle.mjs']){
      const p='scripts/lib/'+name;assert.equal(e.leaves.find(r=>r.path===p).sha256,e.build.files['build-script/lib/'+name]);
    }
    assert.equal(hash(JSON.stringify(e.build.files)),e.build.inputHash);assert.equal(hash(JSON.stringify(e.build.artifacts)),e.build.contentHash);
  }
  assert.equal(f.unchangedPaths.length,1456);
  const before=new Map(f.epochs[B].leaves.map(r=>[r.path,r])),after=new Map(f.epochs[H].leaves.map(r=>[r.path,r]));
  for(const p of f.unchangedPaths)assert.deepEqual(before.get(p),after.get(p),p);
  assert.deepEqual(f.deltas,old.routes.find(r=>r.pr===1860).deltas['7e027ac2ff7eea31c04155e0ee1e0d3e5604ed51']);
  assert.deepEqual(f.deltas.map(r=>r.path),['inkwave-public/src/net/transport.js','patches/splatoon3/runtime/spawn-exclusion.mjs','patches/splatoon3/spawn-exclusion-adapter.mjs','scripts/inkwave-source-composition.mjs','scripts/lib/inkwave-build-only-modules.mjs']);
  assert.throws(()=>{respawn3003Epoch(H).leaves[0].sha256='0'.repeat(64);},TypeError);
});

test('owned PR/ref/base/head selection preserves the separate reviewed Firing route',()=>{
  const selected=select(event());assert.equal(selected.sourceHead,H);assert.equal(selected.mode,'oct23-main3003-respawn-source-build-pair');assert(selected.exactRespawn3003);
  for(const mutate of [e=>e.number=1857,e=>e.pull_request.number=1857,e=>e.pull_request.base.sha=H,
    e=>e.pull_request.head.sha=FIRING_HEAD,e=>e.pull_request.head.sha='1d58f3efe923cdd7e470be0e40975c528b3b6ae1',
    e=>e.pull_request.head.sha='0'.repeat(40),e=>e.pull_request.base.sha='a'.repeat(40),e=>e.pull_request.head.sha=B,
    e=>e.pull_request.head.ref+='-other',e=>e.pull_request.base.ref='other',e=>e.pull_request.head.repo.full_name='fork/actions',
    e=>e.pull_request.base.repo.full_name='fork/actions']){const e=event();mutate(e);assert.throws(()=>select(e));}
  assert.throws(()=>selectCurrentPair(event(),'workflow_dispatch',f.repository));assert.throws(()=>selectCurrentPair(event(),'pull_request','fork/actions'));
  const firing=main3003Fixture(),e=event();e.number=e.pull_request.number=1857;e.pull_request.head.ref=firing.branch;e.pull_request.head.sha=FIRING_HEAD;
  assert.equal(select(e).sourceHead,FIRING_HEAD);assert.equal(select(e).mode,'oct23-main3003-firing-source-build-pair');assert(!select(e).exactRespawn3003);
  for(const row of old.routes)for(const base of row.bases){const e=event();e.number=e.pull_request.number=row.pr;e.pull_request.base.sha=base;e.pull_request.head.ref=row.branch;e.pull_request.head.sha=row.sourceHead;assert.equal(select(e).sourceHead,row.sourceHead);}
});

test('the unchanged executing snapshot binds commit/tree/all QA bodies, without candidate declarations or git stubs',()=>{
  assertRespawn3003Head(execution.commit);
  assert.deepEqual(execution.qaLeaves.map(r=>r.path),RESPAWN3003_QA_PATHS);
  for(const row of execution.qaLeaves){assert.equal(row.mode,'100644');assert.match(row.sha,/^[a-f0-9]{40}$/);assert.match(row.sha256,/^[a-f0-9]{64}$/);}
  assert.match(execution.tree,/^[a-f0-9]{40}$/);assert.match(execution.commitBodySHA256,/^[a-f0-9]{64}$/);
  const copy=respawn3003ExecutionIdentity();copy.qaLeaves[0].sha='0'.repeat(40);assert.deepEqual(respawn3003ExecutionIdentity(),execution);
  for(const declared of [H,B,FIRING_HEAD,'a'.repeat(40)])
    assert.throws(()=>assertRespawn3003Head(declared,()=>assert.fail('candidate cannot supply trusted git results')),/unchanged reviewed verifier execution commit/);
});

test('real separate candidates reject a same-eleven-path altered checker and a same-tree different commit',
  {skip:!process.env.INKWAVE_RESPAWN_PAIR_BASELINE},()=>{
  const root=fs.realpathSync(fileURLToPath(new URL('../../',import.meta.url))),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'respawn3003-sibling-'));
  const candidate=path.join(tmp,'candidate'),entry=path.join(root,'scripts/verify-inkwave-projectile-current-pair.mjs'),cases=[];
  const env={...process.env,GIT_AUTHOR_NAME:'Respawn QA',GIT_AUTHOR_EMAIL:'qa@example.invalid',GIT_COMMITTER_NAME:'Respawn QA',GIT_COMMITTER_EMAIL:'qa@example.invalid'};
  for(const key of Object.keys(env))if(key.startsWith('GIT_')&&!/^(GIT_AUTHOR_|GIT_COMMITTER_)/.test(key))delete env[key];
  const git=(cwd,args)=>execFileSync('git',['-C',cwd,...args],{env,encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024,stdio:['ignore','pipe','pipe']}).trim();
  const cli=(label,commit,accept,validator=entry)=>{
    const e=event();e.pull_request.head.sha=commit;
    const eventFile=path.join(tmp,label+'.json'),receipt=path.join(tmp,label+'-receipt.json');fs.writeFileSync(eventFile,JSON.stringify(e));fs.writeFileSync(receipt,'sentinel\n');
    const before=git(candidate,['status','--porcelain=v1','--untracked-files=all']);
    const r=spawnSync(process.execPath,[validator,'--baseline',process.env.INKWAVE_RESPAWN_PAIR_BASELINE,'--candidate',candidate,'--event',eventFile,'--receipt',receipt],
      {cwd:candidate,env:{...env,GITHUB_EVENT_NAME:'pull_request',GITHUB_REPOSITORY:f.repository},encoding:'utf8',timeout:120000});
    assert.equal(r.error,undefined);if(accept)assert.equal(r.status,0,r.stderr);else{assert.notEqual(r.status,0);assert.match(r.stderr,/unchanged reviewed verifier execution commit|unchanged committed QA execution body/);assert.equal(fs.readFileSync(receipt,'utf8'),'sentinel\n');}
    assert.equal(git(candidate,['status','--porcelain=v1','--untracked-files=all']),before,'validator leaves candidate unchanged');
    cases.push({label,commit,validator,status:r.status,stdout:r.stdout,stderr:r.stderr});
  };
  try{
    git(tmp,['clone','--shared','--no-checkout',root,candidate]);git(candidate,['checkout','--detach',execution.commit]);
    assertRespawn3003Head(execution.commit,candidate);cli('exact-execution-copy',execution.commit,true);
    const checker='scripts/verify-inkwave-projectile-current-pair.mjs';fs.writeFileSync(path.join(candidate,checker),'#!/usr/bin/env node\nprocess.exit(0);\n');
    assert.throws(()=>assertRespawn3003Head(execution.commit,candidate),/unchanged committed QA execution body/);cli('dirty-qa-body',execution.commit,false);
    git(candidate,['add','--',checker]);const alteredTree=git(candidate,['write-tree']);
    const sibling=git(candidate,['commit-tree',alteredTree,'-p',H,'-m','negative: unreviewed same-eleven-path altered-checker sibling']);
    git(candidate,['reset','--hard',sibling]);git(candidate,['branch','control/altered-checker',sibling]);
    assert.deepEqual(git(candidate,['diff','--no-renames','--name-only',H,sibling]).split('\n').sort(),[...RESPAWN3003_QA_PATHS].sort());
    cli('altered-checker-sibling',sibling,false);
    const sameTree=git(candidate,['commit-tree',execution.tree,'-p',H,'-m','negative: same reviewed tree with unreviewed commit identity']);
    git(candidate,['reset','--hard',sameTree]);git(candidate,['branch','control/same-tree',sameTree]);
    assert.notEqual(sameTree,execution.commit);assert.equal(git(candidate,['rev-parse','HEAD^{tree}']),execution.tree);
    assert.deepEqual(git(candidate,['diff','--no-renames','--name-only',H,sameTree]).split('\n').sort(),[...RESPAWN3003_QA_PATHS].sort());
    cli('same-tree-different-commit',sameTree,false);
    // Optional historical controller is executed unchanged from its own path;
    // neither candidate's altered checker nor a git replay stub is executed.
    if(process.env.INKWAVE_RESPAWN_PAIR_OLD_VALIDATOR){
      cli('old-validator-same-tree',sameTree,true,process.env.INKWAVE_RESPAWN_PAIR_OLD_VALIDATOR);
      git(candidate,['reset','--hard',sibling]);cli('old-validator-altered-checker',sibling,true,process.env.INKWAVE_RESPAWN_PAIR_OLD_VALIDATOR);
    }
    if(process.env.INKWAVE_RESPAWN_PAIR_EVIDENCE){
      const out=path.resolve(process.env.INKWAVE_RESPAWN_PAIR_EVIDENCE);fs.mkdirSync(out,{recursive:true});
      fs.writeFileSync(path.join(out,'sibling-controls.json'),JSON.stringify({execution,cases},null,2)+'\n');
      git(candidate,['bundle','create',path.join(out,'sibling-controls.bundle'),'control/altered-checker','control/same-tree','^'+H]);
    }
    assertRespawn3003Head(execution.commit);
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});

test('all source leaves, helper drift and copied public/nested extras reject without historical replay',()=>{
  assert.equal(currentPairNegativeControls(select(event())).rejected,1459+1461+6);
  for(const epoch of [B,H]){
    const rows=f.epochs[epoch].leaves;
    for(const name of ['inkwave-audio-manifest.mjs','inkwave-volume-packaging.mjs','inkwave-account-bundle.mjs'])for(const mutation of ['byte','missing','mode']){
      const p='scripts/lib/'+name,bad=structuredClone(rows),at=bad.findIndex(r=>r.path===p);assert(at>=0);
      if(mutation==='missing')bad.splice(at,1);else bad[at][mutation==='mode'?'mode':'sha256']=mutation==='mode'?'100755':'0'.repeat(64);
      assert.throws(()=>assertCurrentPairRows(bad,epoch));
    }
    for(const p of ['inkwave-public/tests/extra.mjs','inkwave-public/nested/tests/extra.mjs','inkwave-public/nested/extra.md','patches/splatoon3/runtime/tests/extra.mjs','patches/native-stages/source-inventories/tests/extra.json','patches/loading-cache/runtime/tests/extra.md'])
      assert.throws(()=>assertCurrentPairRows([...rows,{...rows[0],path:p}],epoch));
    const bad=structuredClone(rows);bad.find(r=>r.path==='scripts/lib/inkwave-audio-manifest.mjs').sha256='0'.repeat(64);assert.throws(()=>assertRespawn3003Inputs(bad,epoch));
  }
  assert.throws(()=>assertCurrentPairRows(f.epochs[B].leaves,H));assert.throws(()=>assertCurrentPairRows(main3003Fixture().epochs[FIRING_HEAD].leaves,H));
});

test('external account/native/compiler and diagnostic modes remain outside this exact canonical pair',()=>{
  assertRespawn3003Environment({});
  for(const key of ['INKWAVE_ACCOUNT_BUILD','INKWAVE_NATIVE_STAGE_ASSETS','ESBUILD_MODULE'])assert.throws(()=>assertRespawn3003Environment({[key]:'/unreviewed/external'}),new RegExp(key));
  for(const key of ['INKWAVE_BUILD_UNMINIFIED','INKWAVE_NO_THREE_SHAKE'])assert.throws(()=>assertRespawn3003Environment({[key]:'1'}),new RegExp(key));
});

test('respawn artifacts reject unknown labels, manifest drift and linked roots without reading outside',()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'respawn3003-artifact-'));
  try{
    fs.writeFileSync(path.join(tmp,'inkwave-build.json'),'{}');assert.throws(()=>assertRespawn3003Artifacts(tmp,H),/exact source-labeled build manifest/);
    assert.throws(()=>assertRespawn3003Artifacts(tmp,FIRING_HEAD),/exact source\/build label/);
    fs.symlinkSync(tmp,tmp+'-link');let reads=0;const read=fs.readFileSync;fs.readFileSync=(...a)=>{reads++;return read(...a);};
    try{assert.throws(()=>assertRespawn3003Artifacts(tmp+'-link',H),/symlinks rejected/);}finally{fs.readFileSync=read;fs.unlinkSync(tmp+'-link');}assert.equal(reads,0);
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});

test('required capture closure precedes writes and comparison flags remain enabled for the new owned route',()=>{
  const checker=fs.readFileSync(new URL('../check-inkwave-projectile-visuals.mjs',import.meta.url),'utf8');
  assert.ok(checker.indexOf('const exactBuildClosure=') < checker.indexOf('fs.mkdirSync(evidence,'));
  const workflow=fs.readFileSync(new URL('../../.github/workflows/inkwave-projectile-visuals.yml',import.meta.url),'utf8');
  for(const s of ['--mode baseline','--mode candidate','--require-complete','inkwave-main3003-respawn-pair.test.mjs'])assert(workflow.includes(s));
  assert.match(workflow,/permissions:\n  contents: read\n/);assert.equal(verifyCurrentPairCaptureBuild({eventName:'workflow_dispatch'}),null);
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'respawn3003-output-'));
  try{
    const file=path.join(tmp,'event.json');fs.writeFileSync(file,JSON.stringify(event()));
    const args={root:tmp,site:path.join(tmp,'site'),eventFile:file,eventName:'pull_request',repository:f.repository};
    assert.throws(()=>verifyCurrentPairCaptureBuild({...args,mode:'after'}),/explicit capture side label/);
    for(const field of ['evidence','profile'])assert.throws(()=>verifyCurrentPairCaptureBuild({...args,mode:'candidate',[field]:args.site}),/overlap an input/);
    assert(!fs.existsSync(args.site),'rejected alias creates no output');
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
