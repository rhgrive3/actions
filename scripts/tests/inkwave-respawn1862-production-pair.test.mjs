import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync, execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {RESPAWN_BASE, RESPAWN_HEAD, RESPAWN_PRODUCTION_MODE, RESPAWN_QA_PATHS,
  respawnProductionInventory, assertRespawnProductionRows, assertRespawnProductionContract,
  respawnPRContext, assertRespawnCandidateHistory, respawnBuildClosureInventory, assertRespawnBuildClosureRows, assertRespawnNormalBuildProfile} from '../lib/inkwave-respawn1862-production-pair.mjs';
import {RESPAWN_1862_POSE_PAIR} from '../lib/inkwave-respawn1862-source-pair.mjs';
import {currentPairFixture,scanCurrentPairProduction,readCurrentPairGitTree} from '../lib/inkwave-projectile-current-pair.mjs';
const fixture=currentPairFixture();
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const options = {mode: RESPAWN_PRODUCTION_MODE, sourceBase: RESPAWN_BASE, sourceHead: RESPAWN_HEAD,
  baseSha: RESPAWN_BASE, candidateSha: RESPAWN_HEAD};
const context = {eventName: 'pull_request', repository: 'rhgrive3/actions', number: 1862,
  baseRef: 'main', baseRepo: 'rhgrive3/actions', baseSha: RESPAWN_BASE,
  headRef: 'fix/respawn-weapon-state-20261023', headRepo: 'rhgrive3/actions', headSha: RESPAWN_HEAD};
const makeEvent = ctx => ({number: ctx.number, pull_request: {number: ctx.number,
  base: {ref: ctx.baseRef, sha: ctx.baseSha, repo: {full_name: ctx.baseRepo}},
  head: {ref: ctx.headRef, sha: ctx.headSha, repo: {full_name: ctx.headRepo}}}});
const args = (baseline, candidate, receipt, head = RESPAWN_HEAD) => [
  '--baseline', baseline, '--candidate', candidate, '--base-sha', RESPAWN_BASE, '--candidate-sha', head,
  '--expected-mode', RESPAWN_PRODUCTION_MODE, '--expected-source-base', RESPAWN_BASE,
  '--expected-source-head', RESPAWN_HEAD, '--role', 'prepare', '--receipt', receipt];
const call = (argv, env) => spawnSync(process.execPath, [path.join(repo, 'scripts/verify-inkwave-respawn1862-production-pair.mjs'), ...argv],
  {encoding: 'utf8', timeout: 60000, env: {...process.env, ...env}});
test('historical 1456-leaf observed subset has exactly five reviewed deltas, including all native GPU inputs', () => {
  const base = respawnProductionInventory('baseline'), candidate = respawnProductionInventory('candidate');
  assert.equal(base.length, 1456); assert.equal(candidate.length, 1456);
  assertRespawnProductionRows(base, 'baseline'); assertRespawnProductionRows(candidate, 'candidate');
  assert.equal(candidate.filter((row, at) => row.sha !== base[at].sha).length, 5);
  assert.equal(candidate.find(row => row.path === 'patches/native-stages/runtime/native-gpu-budget.mjs').sha, '8afdf2481f481986179416f176535b9d8b324b81');
  for (const [relative, pair] of Object.entries(RESPAWN_1862_POSE_PAIR.paths)) {
    assert.equal(base.find(row => row.path === relative).sha, pair.baseline, relative + ': reviewed pose baseline');
    assert.equal(candidate.find(row => row.path === relative).sha, pair.candidate, relative + ': reviewed pose candidate');
  }
});
test('every leaf on each side independently rejects byte drift', () => {
  for (const side of ['baseline', 'candidate']) {
    const rows = respawnProductionInventory(side);
    for (let at = 0; at < rows.length; at++) {
      const changed = [...rows]; changed[at] = {...rows[at], sha256: '0'.repeat(64)};
      assert.throws(() => assertRespawnProductionRows(changed, side), /pinned sha256/);
    }
  }
});
test('missing, extra, duplicate, mode/blob drift and each partial production revert reject', () => {
  const base = respawnProductionInventory('baseline'), candidate = respawnProductionInventory('candidate');
  for (const side of ['baseline', 'candidate']) {
    const rows = respawnProductionInventory(side);
    for (const changed of [rows.slice(1), rows.slice(0, -1), [...rows, rows[0]], [...rows, {...rows[0], path: 'inkwave-public/extra.mjs'}]])
      assert.throws(() => assertRespawnProductionRows(changed, side), /complete production inventory/);
    for (const [key, value] of [['mode', '120000'], ['sha', '0'.repeat(40)]]) {
      const changed = [...rows]; changed[0] = {...rows[0], [key]: value};
      assert.throws(() => assertRespawnProductionRows(changed, side), /pinned/);
    }
  }
  for (let at = 0; at < base.length; at++) if (base[at].sha !== candidate[at].sha) {
    const changed = [...candidate]; changed[at] = base[at];
    assert.throws(() => assertRespawnProductionRows(changed, 'candidate'), /pinned/);
  }
});
test('wrong PR/ref/repository/event, unknown/reversed epochs and unbound actual heads reject', () => {
  assertRespawnProductionContract(options, context);
  for (const change of [{number: 1857}, {number: 1860}, {number: 1863}, {headRef: 'other'}, {headRef: context.headRef + '-extra'},
    {baseRef: 'other'}, {repository: 'RHGRIVE3/actions'}, {headRepo: 'fork/actions'}, {baseRepo: 'fork/actions'},
    {eventName: 'workflow_dispatch'}, {baseSha: RESPAWN_HEAD}, {headSha: RESPAWN_BASE}, {headSha: '0'.repeat(40)}])
    assert.throws(() => assertRespawnProductionContract(options, {...context, ...change}));
  for (const change of [{mode: 'unknown'}, {sourceBase: RESPAWN_HEAD, sourceHead: RESPAWN_BASE},
    {sourceHead: '0'.repeat(40)}, {sourceBase: '0'.repeat(40)}, {baseSha: RESPAWN_HEAD},
    {candidateSha: RESPAWN_BASE}, {candidateSha: 'main'}, {candidateSha: '0'.repeat(40)}])
    assert.throws(() => assertRespawnProductionContract({...options, ...change}, context));
});
test('actual event parser requires both matching PR numbers and immutable head declarations', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'respawn-event-'));
  try {
    const file = path.join(tmp, 'event.json'), env = {GITHUB_EVENT_NAME: 'pull_request', GITHUB_REPOSITORY: context.repository, GITHUB_EVENT_PATH: file};
    fs.writeFileSync(file, JSON.stringify(makeEvent(context)));
    assert.deepEqual(respawnPRContext(env), context);
    const event = makeEvent(context); event.number = 1857; fs.writeFileSync(file, JSON.stringify(event));
    assert.throws(() => respawnPRContext(env), /matching PR event numbers/);
  } finally {fs.rmSync(tmp, {recursive: true, force: true});}
});
test('real dedicated CLI rejects wrong owner before changing source or existing receipt', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'respawn-cli-reject-'));
  try {
    const event = path.join(tmp, 'event.json'), receipt = path.join(tmp, 'receipt.json');
    fs.writeFileSync(event, JSON.stringify(makeEvent({...context, number: 1857}))); fs.writeFileSync(receipt, 'sentinel');
    const result = call(args(repo, repo, receipt), {GITHUB_EVENT_NAME: 'pull_request', GITHUB_REPOSITORY: context.repository, GITHUB_EVENT_PATH: event});
    assert.notEqual(result.status, 0); assert.match(result.stderr, /owned PR1862/);
    assert.equal(fs.readFileSync(receipt, 'utf8'), 'sentinel');
    for (const extra of [['--role', 'prepare'], ['--unknown', 'value']]) {
      const result = call([...args(repo, repo, receipt), ...extra], {});
      assert.notEqual(result.status, 0); assert.match(result.stderr, /duplicate|unknown argument/);
      assert.equal(fs.readFileSync(receipt, 'utf8'), 'sentinel');
    }
  } finally {fs.rmSync(tmp, {recursive: true, force: true});}
});
test('unknown actual commits cannot masquerade as f253 or its single QA successor', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'respawn-history-'));
  const git = (...argv) => execFileSync('git', ['-C', tmp, ...argv], {encoding: 'utf8'}).trim();
  try {
    git('init', '--quiet'); fs.writeFileSync(path.join(tmp, 'unit.txt'), 'unit, not production'); git('add', 'unit.txt');
    git('-c', 'user.name=QA', '-c', 'user.email=qa@example.invalid', 'commit', '--quiet', '-m', 'unrelated actual commit');
    assert.throws(() => assertRespawnCandidateHistory(tmp, RESPAWN_HEAD), /actual candidate HEAD/);
    assert.throws(() => assertRespawnCandidateHistory(tmp, git('rev-parse', 'HEAD')));
  } finally {fs.rmSync(tmp, {recursive: true, force: true});}
});
test('actual CLI cannot use production, QA or Git source paths as receipts; bytes remain intact', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'respawn-source-receipt-'));
  try {
    const event = path.join(tmp, 'event.json'); fs.writeFileSync(event, JSON.stringify(makeEvent(context)));
    const env = {GITHUB_EVENT_NAME: 'pull_request', GITHUB_REPOSITORY: context.repository, GITHUB_EVENT_PATH: event};
    const metadata = execFileSync('git', ['-C', repo, 'rev-parse', '--path-format=absolute', '--git-path', 'HEAD'], {encoding: 'utf8'}).trim();
    for (const relative of ['patches/splatoon3/runtime/roller.mjs', 'scripts/lib/inkwave-character-pose-baseline.mjs', metadata]) {
      const file = path.resolve(repo, relative), original = fs.readFileSync(file);
      const result = call(args(repo, repo, file), env);
      assert.notEqual(result.status, 0); assert.match(result.stderr, /receipt must not/);
      assert.deepEqual(fs.readFileSync(file), original, relative + ': rejected receipt preserves source bytes');
    }
  } finally {fs.rmSync(tmp, {recursive: true, force: true});}
});
test('saved workflow owns only PR1862 routing and retains every historical prepare branch unchanged', () => {
  const file = '.github/workflows/inkwave-projectile-visuals.yml';
  const workflow = fs.readFileSync(path.join(repo, file), 'utf8');
  for (const relative of RESPAWN_QA_PATHS.filter(relative => relative !== file)) assert.ok(workflow.includes("      - '" + relative + "'"));
  assert.ok(workflow.includes('scripts/tests/inkwave-respawn1862-production-pair.test.mjs'));
  const replay = text => text.slice(text.indexOf('      - name: Replay reviewed Roller births'), text.indexOf('      - name: Verify exact current pose source'));
  const current = replay(workflow);
  const historicalIf = "        if: ${{ matrix.side == 'before' && github.event.pull_request.number != 1651 }}";
  const isolatedIf = "        if: ${{ matrix.side == 'before' && github.event.pull_request.number != 1651 && github.event.pull_request.number != 1862 && github.head_ref != 'fix/respawn-weapon-state-20261023' }}";
  assert.ok(current.includes(isolatedIf));
  assert.equal(createHash('sha256').update(current.replace(isolatedIf, historicalIf)).digest('hex'), '28c3e808e922444d45d9bd0a6e0f4d2736e713b26e242798182e351c74df24bc', 'entire historical Replay step remains pinned');
  assert.ok(workflow.includes('      - name: Admit owned PR1862 production reference without replay\n'));
  assert.ok(workflow.includes("matrix.side == 'before' && (github.event.pull_request.number == 1862 || github.head_ref == 'fix/respawn-weapon-state-20261023')"));
  assert.ok(workflow.includes("fetch-depth: ${{ (github.event.pull_request.number == 1862 || github.head_ref == 'fix/respawn-weapon-state-20261023') && 2 || 1 }}"), 'owned route fetches its one immutable source parent; other lanes keep depth 1');
});

function readerFixture() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'projectile-closure-reader-'));
  const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
  const write=(relative,body='export const closureProbe = 1;\n')=>{const file=path.join(root,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,body);};
  for(const p of fixture.roots)fs.mkdirSync(path.join(root,p),{recursive:true});
  for(const p of fixture.scripts)write(p,'focused reader fixture');
  git('init','--quiet');
  const commit=()=>{git('add','--all');git('-c','user.name=QA test','-c','user.email=qa@example.invalid','commit','--quiet','--allow-empty','-m','closed reader fixture');return git('rev-parse','HEAD');};
  return {root,git,write,commit,cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};
}

test('new public tests/Markdown and copied nested overlay paths are visible in filesystem and tracked Git inventories',()=>{
  const f=readerFixture();
  try {
    const publicPaths=['tests/unreviewed.js','unreviewed.md','nested/tests/deep/unreviewed.mjs','nested/unreviewed.md','folder.md/tests/unreviewed.js','tests/nested/deep/unreviewed.md'].map(p=>'inkwave-public/'+p);
    const overlayRoots=['patches/splatoon3','patches/local-quality','patches/reliability','patches/network-replication','patches/native-stages','patches/practice-range'];
    const included=[...publicPaths,...overlayRoots.map(root=>root+'/runtime/tests/unreviewed.mjs'),
      'patches/splatoon3/runtime/folder.md/tests/unreviewed.mjs','patches/loading-cache/runtime/tests/deep/unreviewed.md','patches/loading-cache/runtime/unreviewed.md'];
    const excluded=fixture.roots.filter(root=>root!=='inkwave-public').flatMap(root=>[root+'/tests/unreviewed.js',root+'/notes/unreviewed.md']);
    f.commit();
    for(const p of [...included,...excluded])f.write(p);
    const scan=scanCurrentPairProduction(f.root).map(row=>row.path);
    for(const p of included)assert.ok(scan.includes(p),p+': untracked output path must be visible');
    for(const p of excluded)assert.ok(!scan.includes(p),p+': existing root-level QA/document exclusion remains');
    const head=f.commit(),tracked=readCurrentPairGitTree(f.root,head).entries.map(row=>row.path);
    assert.deepEqual([...tracked].sort(),[...scan].sort(),'Git and filesystem use the same root-specific boundary');
    for(const p of included)assert.ok(tracked.includes(p),p+': tracked output path must be visible');
  } finally {f.cleanup();}
});

test('a top-level overlay tests directory stays excluded while a copied file named tests is admitted to inventory',()=>{
  const f=readerFixture();
  try {
    const relative='patches/splatoon3/tests';
    f.write(relative+'/qa-only.mjs');f.commit();
    assert.ok(!scanCurrentPairProduction(f.root).some(row=>row.path.startsWith(relative+'/')));
    fs.rmSync(path.join(f.root,relative),{recursive:true});f.write(relative,'copied file named tests\n');
    assert.ok(scanCurrentPairProduction(f.root).some(row=>row.path===relative));
    const head=f.commit();assert.ok(readCurrentPairGitTree(f.root,head).entries.some(row=>row.path===relative));
  } finally {f.cleanup();}
});

test('public and nested copied symlinks reject before body reads or directory escape, both untracked and tracked',()=>{
  const f=readerFixture(),outside=fs.mkdtempSync(path.join(os.tmpdir(),'projectile-closure-outside-'));
  try {
    fs.writeFileSync(path.join(outside,'target.md'),'owned outside sentinel\n');
    for(const [relative,directory] of [['inkwave-public/tests/escape.md',false],['inkwave-public/nested/tests',true],['inkwave-public/escape.md',false],['patches/splatoon3/runtime/tests',true],['patches/loading-cache/runtime/tests/escape.md',false]]) {
      const file=path.join(f.root,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.symlinkSync(directory?outside:path.join(outside,'target.md'),file);
      let bodyReads=0,childReads=0;const read=fs.readFileSync,readdir=fs.readdirSync;
      fs.readFileSync=(p,...args)=>{if(String(p)===file)bodyReads++;return read(p,...args);};
      fs.readdirSync=(p,...args)=>{if(String(p)===file)childReads++;return readdir(p,...args);};
      try {assert.throws(()=>scanCurrentPairProduction(f.root),/symlinks rejected/);} finally {fs.readFileSync=read;fs.readdirSync=readdir;}
      assert.equal(bodyReads,0,'symlink body must not be read');assert.equal(childReads,0,'directory link must not be traversed');
      const head=f.commit();assert.throws(()=>readCurrentPairGitTree(f.root,head),/symlinks rejected/);
      fs.unlinkSync(file);f.commit();
    }
  } finally {f.cleanup();fs.rmSync(outside,{recursive:true,force:true});}
});


test('complete conservative closure adds all three real canonical build helpers without changing the five runtime deltas',()=>{
 const b=respawnBuildClosureInventory('baseline'),c=respawnBuildClosureInventory('candidate');
 assert.equal(b.length,1459);assert.equal(c.length,1459);
 assertRespawnBuildClosureRows(b,'baseline');assertRespawnBuildClosureRows(c,'candidate');
 assert.equal(c.filter((row,i)=>row.sha!==b[i].sha).length,5);
 for(const relative of ['scripts/lib/inkwave-audio-manifest.mjs','scripts/lib/inkwave-volume-packaging.mjs','scripts/lib/inkwave-account-bundle.mjs']) {
  const x=b.find(row=>row.path===relative),y=c.find(row=>row.path===relative);assert.ok(x);assert.deepEqual(x,y);
  const changed=c.map(row=>row.path===relative?{...row,sha256:'0'.repeat(64)}:row);assert.throws(()=>assertRespawnBuildClosureRows(changed,'candidate'));
 }
});
test('dirty filesystem bodies of each canonical helper cannot hide behind unchanged actual Git blobs',()=>{
 const f=readerFixture(),expected=respawnBuildClosureInventory('candidate');
 try {
  for(const relative of ['scripts/lib/inkwave-audio-manifest.mjs','scripts/lib/inkwave-volume-packaging.mjs','scripts/lib/inkwave-account-bundle.mjs']) {
   const original=fs.readFileSync(path.join(repo,relative)),pin=expected.find(row=>row.path===relative);
   f.write(relative,original);const head=f.commit();
   assert.equal(readCurrentPairGitTree(f.root,head).entries.find(row=>row.path===relative).sha,pin.sha);
   assert.deepEqual(scanCurrentPairProduction(f.root).find(row=>row.path===relative),pin);
   f.write(relative,Buffer.concat([original,Buffer.from('\n// unreviewed dirty helper\n')]));
   const dirty=scanCurrentPairProduction(f.root).find(row=>row.path===relative);assert.notEqual(dirty.sha256,pin.sha256);
   assert.equal(readCurrentPairGitTree(f.root,head).entries.find(row=>row.path===relative).sha,pin.sha);
   assert.throws(()=>assertRespawnBuildClosureRows(expected.map(row=>row.path===relative?dirty:row),'candidate'),/reviewed build closure/);
   f.write(relative,original);
  }
 }finally{f.cleanup();}
});
test('normal build profile rejects uncovered account/native/compiler paths and diagnostic overrides',()=>{
 assertRespawnNormalBuildProfile({});
 for(const key of ['INKWAVE_ACCOUNT_BUILD','INKWAVE_NATIVE_STAGE_ASSETS','ESBUILD_MODULE'])for(const value of ['/unreviewed/input','0'])
  assert.throws(()=>assertRespawnNormalBuildProfile({[key]:value}),/external input is not covered/);
 for(const key of ['INKWAVE_BUILD_UNMINIFIED','INKWAVE_NO_THREE_SHAKE'])assert.throws(()=>assertRespawnNormalBuildProfile({[key]:'1'}),/normal build closure/);
});

test('unchanged verifier invocation rejects an altered same-path QA sibling and a same-tree different commit through the actual CLI', {skip:!process.env.INKWAVE_RESPAWN_PAIR_BASELINE},()=>{
 const baseline=path.resolve(process.env.INKWAVE_RESPAWN_PAIR_BASELINE);
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'respawn-reviewed-invocation-')),subject=path.join(tmp,'subject');
 const git=(root,...argv)=>execFileSync('git',['-C',root,...argv],{encoding:'utf8',timeout:15000,maxBuffer:8*1024*1024}).trim();
 const expected=respawnBuildClosureInventory('candidate'),trusted=git(repo,'rev-parse','HEAD'),tree=git(repo,'rev-parse','HEAD^{tree}');
 const evidence=[];
 try {
  execFileSync('git',['clone','--quiet','--shared','--no-checkout',repo,subject],{timeout:30000,stdio:['ignore','pipe','pipe']});
  git(subject,'checkout','--quiet','--detach',trusted);git(subject,'update-ref','refs/heads/qa-reviewed-snapshot',trusted);
  const run=(name,head,reject)=>{
   const eventFile=path.join(tmp,name+'-event.json'),receipt=path.join(tmp,name+'-receipt.json');
   fs.writeFileSync(eventFile,JSON.stringify(makeEvent({...context,headSha:head})));
   if(reject)fs.writeFileSync(receipt,'preserved rejection receipt\n');
   assert.deepEqual(scanCurrentPairProduction(subject),expected,'all production bodies preserved in actual candidate');
   const before=scanCurrentPairProduction(subject);
   const result=call(args(baseline,subject,receipt,head),{GITHUB_EVENT_NAME:'pull_request',GITHUB_REPOSITORY:context.repository,GITHUB_EVENT_PATH:eventFile});
   if(reject) {
    assert.equal(result.status,1,result.stderr);assert.match(result.stderr,/candidate must match unchanged reviewed verifier execution commit/);
    assert.equal(fs.readFileSync(receipt,'utf8'),'preserved rejection receipt\n');
   } else {
    assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(fs.readFileSync(receipt)).writtenPaths,[]);
   }
   assert.deepEqual(scanCurrentPairProduction(subject),before,'CLI preserves actual production bodies');
   assert.equal(git(subject,'status','--porcelain'),'','CLI preserves all tracked candidate bytes');
   evidence.push({name,head,tree:git(subject,'rev-parse','HEAD^{tree}'),exit:result.status,stderr:result.stderr,stdout:result.stdout});
  };
  run('exact-invocation-snapshot',trusted,false);
  // These are the original five QA paths. The two exact donor dependencies
  // stay unchanged; production on both sides stays completely pinned.
  for(const relative of ['.github/workflows/inkwave-projectile-visuals.yml','scripts/lib/inkwave-respawn1862-production-pair.mjs','scripts/tests/inkwave-respawn1862-production-pair.test.mjs'])
   fs.appendFileSync(path.join(subject,relative),relative.endsWith('.yml')?'\n# unreviewed QA sibling\n':'\n// unreviewed QA sibling\n');
  const fixtureFile=path.join(subject,'scripts/fixtures/inkwave-respawn1862-production-pair.json.gz');
  const data=JSON.parse(gunzipSync(fs.readFileSync(fixtureFile)));data.scope+=' Unreviewed sibling.';fs.writeFileSync(fixtureFile,gzipSync(JSON.stringify(data)+'\n',{mtime:0}));
  fs.writeFileSync(path.join(subject,'scripts/verify-inkwave-respawn1862-production-pair.mjs'),'#!/usr/bin/env node\nprocess.exit(0);\n');
  git(subject,'add','--all');const siblingTree=git(subject,'write-tree');
  const sibling=git(subject,'-c','user.name=QA test','-c','user.email=qa@example.invalid','commit-tree',siblingTree,'-p',RESPAWN_HEAD,'-m','unreviewed same-five-path QA sibling');
  git(subject,'update-ref','refs/heads/qa-sibling',sibling);git(subject,'checkout','--quiet','--detach',sibling);
  run('same-five-path-sibling-with-exit-zero-checker',sibling,true);
  const sameTree=git(subject,'-c','user.name=QA test','-c','user.email=qa@example.invalid','commit-tree',tree,'-p',RESPAWN_HEAD,'-m','unreviewed same-tree different commit');
  assert.notEqual(sameTree,trusted);git(subject,'update-ref','refs/heads/qa-same-tree',sameTree);git(subject,'checkout','--quiet','--detach',sameTree);
  assert.equal(git(subject,'rev-parse','HEAD^{tree}'),tree);run('same-tree-different-commit',sameTree,true);
  if(process.env.INKWAVE_RESPAWN_INVOCATION_EVIDENCE) {
   const output=path.resolve(process.env.INKWAVE_RESPAWN_INVOCATION_EVIDENCE);
   for(const source of [repo,baseline])assert.ok(!output.startsWith(path.resolve(source)+path.sep)&&output!==path.resolve(source),'test evidence is outside source roots');
   fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'actual-invocation-cases.json'),JSON.stringify({trusted,tree,evidence},null,2)+'\n',{flag:'wx'});
   git(subject,'bundle','create',path.join(output,'actual-negative-commits.bundle'),'^'+RESPAWN_HEAD,'refs/heads/qa-reviewed-snapshot','refs/heads/qa-sibling','refs/heads/qa-same-tree');
  }
  console.log(JSON.stringify({trustedVerifierCommit:trusted,unknownSibling:sibling,sameTreeDifferentCommit:sameTree,sourceBodies:expected.length,results:evidence.map(row=>({name:row.name,exit:row.exit}))}));
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
