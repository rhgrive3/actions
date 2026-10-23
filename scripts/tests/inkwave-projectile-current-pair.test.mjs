import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync,execFileSync} from 'node:child_process';
import {currentPairFixture,selectCurrentPair,assertCurrentPairRows,scanCurrentPairProduction,readCurrentPairGitTree,currentPairNegativeControls} from '../lib/inkwave-projectile-current-pair.mjs';
import {MAIN_INK_BASELINE_PATHS,MAIN_INK_BASELINE_MANIFEST_BLOB} from '../lib/inkwave-main-ink-baseline.mjs';
import {CHARACTER_POSE_PATHS} from '../lib/inkwave-character-pose-baseline.mjs';

const repo = fileURLToPath(new URL('../../',import.meta.url)), fixture = currentPairFixture();
const repository = 'rhgrive3/actions', base726 = '726e338ac256ba9609086ce65e25a68ddd99df85', base7e = '7e027ac2ff7eea31c04155e0ee1e0d3e5604ed51';
const route = fixture.routes[0], footprint = 'patches/splatoon3/main-ink-footprint-adapter.mjs';
const makeEvent = (row = route,baseSha = row.bases[0]) => ({number:row.pr,pull_request:{number:row.pr,base:{ref:'main',sha:baseSha,repo:{full_name:repository}},head:{ref:row.branch,sha:row.sourceHead,repo:{full_name:repository}}}});
const select = event => selectCurrentPair(event,'pull_request',repository);
const workflow = fs.readFileSync(path.join(repo,'.github/workflows/inkwave-projectile-visuals.yml'),'utf8');
function step(name) {
  const marker = '      - name: '+name+'\n', at = workflow.indexOf(marker);
  assert.notEqual(at,-1); return workflow.slice(at+marker.length).split(/\n      - /)[0];
}

test('closed inventories name all four real source epochs and exact reviewed deltas',()=>{
  assert.deepEqual(Object.values(fixture.epochs).map(epoch=>epoch.leaves.length),[1458,1458,1461,1460]);
  for (const [epoch,row] of Object.entries(fixture.epochs)) assertCurrentPairRows(row.leaves,epoch);
  assert.deepEqual(route.deltas[base7e].map(row=>row.path),['patches/splatoon3/firing-cosmetics-adapter.mjs','patches/splatoon3/runtime/shooter-muzzle-droplets.mjs','patches/splatoon3/runtime/splatling-cosmetics.mjs','scripts/inkwave-source-composition.mjs']);
  assert.equal(route.deltas[base726].length,5,'stale event base retains the independently merged menu delta');
  assert.equal(fixture.routes[1].deltas[base7e].length,5,'respawn production delta is explicit, not called identical');
});

test('every paint/native/pose leaf keeps current pins; historical replay pin remains unchanged',()=>{
  assert.equal(MAIN_INK_BASELINE_MANIFEST_BLOB,'07b37df481d288206fbb4178bc8d716dc22192ae');
  const paths = [...new Set([...MAIN_INK_BASELINE_PATHS,...CHARACTER_POSE_PATHS,'patches/splatoon3/profile.json'])]
    .filter(p=>!['scripts/inkwave-source-composition.mjs','scripts/lib/inkwave-build-only-modules.mjs'].includes(p));
  const baseline = new Map(fixture.epochs[base7e].leaves.map(row=>[row.path,row]));
  for (const epoch of Object.values(fixture.epochs)) for (const p of paths)
    assert.deepEqual(epoch.leaves.find(row=>row.path===p),baseline.get(p),p+' is preserved across these pairs');
  const old = JSON.parse(fs.readFileSync(path.join(repo,'scripts/fixtures/inkwave-main-ink-pr1525-baseline.json'))).files.find(row=>row.path===footprint);
  assert.equal(old.afterBlob,'8ddbf0c56af50c68a645701c94a11fa81e6a2666');
  assert.notEqual(baseline.get(footprint).sha,old.afterBlob,'modern production must not be changed back to the historical pin');
});

test('only the two owned PRs and their actual admitted event bases select this route',()=>{
  for (const row of fixture.routes) for (const baseSha of row.bases) {
    const selected = select(makeEvent(row,baseSha));
    assert.equal(selected.baseSha,baseSha); assert.equal(selected.sourceHead,row.sourceHead);
  }
  const changes = [e=>e.number=1860,e=>e.pull_request.number=1,e=>e.pull_request.head.ref+='-other',e=>e.pull_request.base.ref='other',
    e=>e.pull_request.base.sha='a'.repeat(40),e=>e.pull_request.head.sha='main',e=>e.pull_request.head.sha='',
    e=>e.pull_request.head.repo.full_name='fork/actions',e=>e.pull_request.base.repo.full_name='fork/actions',
    e=>e.pull_request.head.sha=e.pull_request.base.sha];
  for (const change of changes) {const e=makeEvent();change(e);assert.throws(()=>select(e));}
  assert.throws(()=>selectCurrentPair(makeEvent(),'workflow_dispatch',repository));
  assert.throws(()=>selectCurrentPair(makeEvent(),'pull_request','fork/actions'));
  assert.throws(()=>select(makeEvent(fixture.routes[1],base726)),'PR1860 cannot silently select an older baseline');
});

test('QA-only new head is declared separately from the completely pinned production epoch',()=>{
  const e=makeEvent();e.pull_request.head.sha='a'.repeat(40);
  const selected=select(e);assert.equal(selected.candidateSha,e.pull_request.head.sha);assert.equal(selected.sourceHead,route.sourceHead);
  const modified=structuredClone(fixture.epochs[route.sourceHead].leaves);
  modified.find(row=>row.path===footprint).sha256='0'.repeat(64);
  assert.throws(()=>assertCurrentPairRows(modified,route.sourceHead),'equal or new source text cannot substitute for the reviewed epoch');
});

test('every production leaf rejects drift, including added/missing/duplicate paths and modes',()=>{
  for (const row of fixture.routes) {
    const selected=select(makeEvent(row));
    const controls=currentPairNegativeControls(selected);
    assert.equal(controls.rejected,fixture.epochs[selected.baseSha].leaves.length+fixture.epochs[selected.sourceHead].leaves.length+6);
  }
  const rows=fixture.epochs[base7e].leaves;
  for (const key of ['mode','sha']) {const changed=[...rows];changed[0]={...rows[0],[key]:'bad'};assert.throws(()=>assertCurrentPairRows(changed,base7e,false));}
});

test('real filesystem and Git readers detect dirty source, unknown files, symlinks and wrong HEAD',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'projectile-current-pair-scanner-'));
  const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
  try {
    for (const p of fixture.roots) fs.mkdirSync(path.join(root,p),{recursive:true});
    for (const p of fixture.scripts) {fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),'focused reader fixture');}
    const file=path.join(root,footprint), original=fs.readFileSync(path.join(repo,footprint));
    fs.writeFileSync(file,original);
    git('init','--quiet');git('add','.');git('-c','user.name=QA test','-c','user.email=qa@example.invalid','commit','--quiet','-m','reader fixture');
    const head=git('rev-parse','HEAD');
    const pinned=fixture.epochs[base7e].leaves.find(row=>row.path===footprint);
    const read=()=>scanCurrentPairProduction(root).find(row=>row.path===footprint);
    assert.deepEqual(read(),pinned);assert.equal(readCurrentPairGitTree(root,head).entries.find(row=>row.path===footprint).sha,pinned.sha);
    assert.throws(()=>readCurrentPairGitTree(root,base7e),/actual HEAD/);
    fs.appendFileSync(file,'\n// gameplay or paint drift\n');
    const changed=read();assert.notEqual(changed.sha,pinned.sha);
    assert.throws(()=>assertCurrentPairRows(fixture.epochs[base7e].leaves.map(row=>row.path===footprint?changed:row),base7e));
    fs.writeFileSync(file,original);
    fs.writeFileSync(path.join(root,'patches/splatoon3/unreviewed.mjs'),'unreviewed');
    assert.ok(scanCurrentPairProduction(root).some(row=>row.path.endsWith('/unreviewed.mjs')));
    fs.unlinkSync(file);fs.symlinkSync(path.join(repo,footprint),file);assert.throws(()=>scanCurrentPairProduction(root),/symlinks rejected/);
    fs.unlinkSync(file);fs.rmSync(path.join(root,'patches'),{recursive:true});fs.symlinkSync(path.join(repo,'patches'),path.join(root,'patches'));
    assert.throws(()=>scanCurrentPairProduction(root),/parent symlinks rejected/);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('CLI rejects ambiguous flags and invalid events without replacing an existing receipt',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'projectile-current-pair-cli-'));
  try {
    const receipt=path.join(root,'receipt.json'), eventFile=path.join(root,'event.json'), sentinel='previous failure evidence\n';
    fs.writeFileSync(receipt,sentinel);const event=makeEvent();event.pull_request.head.repo.full_name='fork/actions';fs.writeFileSync(eventFile,JSON.stringify(event));
    const args=['--baseline',repo,'--candidate',repo,'--event',eventFile,'--receipt',receipt];
    for (const extra of [[],['--event',eventFile],['--unknown','value']]) {
      const r=spawnSync(process.execPath,[path.join(repo,'scripts/verify-inkwave-projectile-current-pair.mjs'),...args,...extra],{encoding:'utf8',env:{...process.env,GITHUB_EVENT_NAME:'pull_request',GITHUB_REPOSITORY:repository}});
      assert.equal(r.status,1);assert.equal(fs.readFileSync(receipt,'utf8'),sentinel);
    }
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('receipt cannot overwrite production, verifier, fixture or event inputs',()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'projectile-current-pair-receipt-'));
  try {
    const eventFile=path.join(tmp,'event.json');fs.writeFileSync(eventFile,JSON.stringify(makeEvent()));
    for (const output of [path.join(repo,footprint),path.join(repo,'scripts/verify-inkwave-projectile-current-pair.mjs'),path.join(repo,'scripts/fixtures/inkwave-projectile-current-pair-20261023.json.gz'),eventFile]) {
      const before=fs.readFileSync(output);
      const result=spawnSync(process.execPath,[path.join(repo,'scripts/verify-inkwave-projectile-current-pair.mjs'),'--baseline',repo,'--candidate',repo,'--event',eventFile,'--receipt',output],{encoding:'utf8',env:{...process.env,GITHUB_EVENT_NAME:'pull_request',GITHUB_REPOSITORY:repository}});
      assert.equal(result.status,1);assert.match(result.stderr,/receipt must not replace or overlap an input file/);assert.deepEqual(fs.readFileSync(output),before);
    }
  } finally {fs.rmSync(tmp,{recursive:true,force:true});}
});

test('CLI success runs controls with the selected route and writes only the receipt (orchestration stubs)',()=>{
  // This tests the actual CLI driver separately from real source admission.
  // The real pinned inventories/Git readers and real-checkout CLI positives
  // have their own tests/evidence; no substitute admission path is shipped.
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'projectile-current-pair-driver-'));
  try {
    const scripts=path.join(tmp,'scripts'), lib=path.join(scripts,'lib');fs.mkdirSync(lib,{recursive:true});
    for(const name of ['baseline','candidate'])fs.mkdirSync(path.join(tmp,name));
    fs.copyFileSync(path.join(repo,'scripts/verify-inkwave-projectile-current-pair.mjs'),path.join(scripts,'verify.mjs'));
    fs.copyFileSync(path.join(repo,'scripts/lib/inkwave-source-admission-cli.mjs'),path.join(lib,'inkwave-source-admission-cli.mjs'));
    fs.writeFileSync(path.join(lib,'inkwave-projectile-current-pair.mjs'),`import assert from 'node:assert/strict';
      export const currentPairFixture=()=>({roots:[]});
      export const selectCurrentPair=()=>({pr:1857,selected:'verified-route-marker'});
      export const verifyCurrentProjectilePair=()=>({mode:'driver-only-stub',pr:1857,checkouts:[],writtenPaths:[]});
      export const currentPairNegativeControls=route=>{assert.equal(route.selected,'verified-route-marker');return{rejected:17}};
    `);
    const eventFile=path.join(tmp,'event.json'),receipt=path.join(tmp,'receipt.json');fs.writeFileSync(eventFile,'{}');
    const before=fs.readFileSync(eventFile);
    const r=spawnSync(process.execPath,[path.join(scripts,'verify.mjs'),'--baseline',path.join(tmp,'baseline'),'--candidate',path.join(tmp,'candidate'),'--event',eventFile,'--receipt',receipt],{encoding:'utf8'});
    assert.equal(r.status,0,r.stderr);const result=JSON.parse(fs.readFileSync(receipt));
    assert.equal(result.mode,'driver-only-stub');assert.deepEqual(result.controls,{rejected:17});assert.deepEqual(result.writtenPaths,[]);assert.deepEqual(fs.readFileSync(eventFile),before);
  } finally {fs.rmSync(tmp,{recursive:true,force:true});}
});

test('workflow admits only after successful controls and retains both captures and strict comparisons',()=>{
  const name='Preserve the two reviewed October 23 production pairs without historical replay', selected=step(name);
  for (const text of ["matrix.side == 'before'","github.event_name == 'pull_request'","github.repository == 'rhgrive3/actions'",'github.event.pull_request.head.repo.full_name == github.repository',"github.event.pull_request.base.ref == 'main'",'github.event.pull_request.number == 1857 || github.event.pull_request.number == 1860']) assert.ok(selected.includes(text));
  for (const name of ['Replay reviewed Roller births, pool reset and pinned paint in the main reference','Align only the reviewed character pose for exact projectile comparison'])
    assert.ok(step(name).includes("steps.reviewed_current_pair.outputs.admitted != 'true'"),'closed admission replaces replay, not comparison');
  for (const name of ['Capture native reference, not necessarily untouched public main','Capture candidate native game including desktop and mobile workloads']) assert.match(step(name),/check-inkwave-projectile-visuals.mjs/);
  assert.match(workflow,/compare-inkwave-projectile-captures.py .* --require-complete/);
  assert.match(workflow,/inkwave-projectile-captures-synthetic.py --before/);
  assert.match(step('Verify fail-closed immutable workflow routes'),/inkwave-projectile-current-pair.test.mjs/);
  for (const p of ['scripts/verify-inkwave-projectile-current-pair.mjs','scripts/lib/inkwave-projectile-current-pair.mjs','scripts/fixtures/inkwave-projectile-current-pair-20261023.json.gz','scripts/tests/inkwave-projectile-current-pair.test.mjs']) assert.ok(workflow.includes("      - '"+p+"'"));
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'projectile-current-pair-shell-'));
  try {
    fs.writeFileSync(path.join(tmp,'node'),'#!/bin/sh\nexit "$NODE_STATUS"\n',{mode:0o755});
    const body=selected.split('        run: |\n')[1].split('\n').map(line=>line.replace(/^          /,'')).join('\n');
    for (const status of [0,7]) {
      const output=path.join(tmp,'output-'+status);
      const r=spawnSync('bash',['--noprofile','--norc','-eo','pipefail','-c',body],{encoding:'utf8',env:{...process.env,PATH:tmp+':'+process.env.PATH,NODE_STATUS:String(status),GITHUB_EVENT_PATH:'event.json',GITHUB_OUTPUT:output,INKWAVE_REFERENCE_ROOT:'.ci-baseline'}});
      assert.equal(r.status,status);
      if (status===0) assert.equal(fs.readFileSync(output,'utf8'),'admitted=true\n');
      else assert.equal(fs.existsSync(output),false,'failed admission cannot signal success or fall back');
    }
  } finally {fs.rmSync(tmp,{recursive:true,force:true});}
});
