// Closed source admission for the two reviewed October 23 PRs. No source writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {MAIN3003_BASE,main3003Fixture,main3003Epoch,main3003Route,assertMain3003Environment,assertMain3003Head,assertMain3003Inputs,assertMain3003Artifacts} from './inkwave-main3003-firing-pair.mjs';

export const CURRENT_PAIR_MODE = 'oct23-reviewed-projectile-pairs';
export const CURRENT_PAIR_FIXTURE_SHA256 = 'adf375e9e5a53d3f7ea0724d296a4b201c68edbfc6aea44291617a7d9de20ad9';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const packed = fs.readFileSync(new URL('../fixtures/inkwave-projectile-current-pair-20261023.json.gz', import.meta.url));
assert.equal(hash(packed), CURRENT_PAIR_FIXTURE_SHA256, 'reviewed current-pair fixture pin');
const fixture = JSON.parse(gunzipSync(packed));
assert.equal(fixture.schema, 1);
assert.equal(fixture.repository, 'rhgrive3/actions');
assert.deepEqual(fixture.routes.map(row => row.pr), [1857, 1860]);
assert.deepEqual(main3003Fixture().roots,fixture.roots);
assert.deepEqual(main3003Fixture().scripts,fixture.scripts);
const sourceEpoch=epoch=>fixture.epochs[epoch]||main3003Epoch(epoch);
const sort = rows => [...rows].sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
const included = relative => {
  if (fixture.scripts.includes(relative)) return true;
  const root = fixture.roots.find(root => relative.startsWith(root + '/'));
  if (!root) return false;
  const local = relative.slice(root.length + 1);
  // The public copy loop transforms/copies tests and Markdown too. Pin its
  // whole subtree (a conservative superset of the builder's explicit skips).
  // prepareLoading likewise copies every file below its runtime directory.
  if (root === 'inkwave-public' || (root === 'patches/loading-cache' && local.startsWith('runtime/'))) return true;
  // Overlay copy loops exclude only root-level tests/, not runtime/tests/.
  // Keep unused non-QA leaves in this conservative production superset.
  return !local.startsWith('tests/') && !local.endsWith('.md');
};
export const currentPairFixture = () => structuredClone(fixture);

export function selectCurrentPair(event, eventName, repository) {
  assert.equal(eventName, 'pull_request', 'current-pair route requires a pull_request event');
  assert.equal(repository, fixture.repository, 'owned repository required');
  const pr = event.pull_request;
  assert.ok(pr && event.number === pr.number, 'matching event and pull request number required');
  const route = fixture.routes.find(row => row.pr === pr.number);
  assert.ok(route, 'only reviewed PR1857 or PR1860 may use this route');
  assert.equal(pr.base.repo.full_name, fixture.repository, 'owned baseline repository');
  assert.equal(pr.head.repo.full_name, fixture.repository, 'owned candidate repository');
  assert.equal(pr.base.ref, 'main', 'reviewed main baseline required');
  assert.equal(pr.head.ref, route.branch, 'exact reviewed branch required');
  const additional=main3003Route(pr.number,pr.base.sha);
  assert.ok(route.bases.includes(pr.base.sha)||additional, 'actual event baseline must be a pinned reviewed epoch');
  assert.match(pr.head.sha ?? '', /^[0-9a-f]{40}$/, 'actual candidate immutable SHA required');
  assert.notEqual(pr.head.sha, pr.base.sha, 'separate reviewed candidate required');
  return {...structuredClone(route),...additional, baseSha:pr.base.sha, candidateSha:pr.head.sha};
}

export function assertCurrentPairRows(rows, epoch, hashes = true) {
  const expected = sourceEpoch(epoch);
  assert.ok(expected, 'known reviewed production epoch required');
  assert.ok(Array.isArray(rows), 'complete production inventory required');
  const actual = sort(rows), pinned = sort(expected.leaves);
  assert.equal(actual.length, pinned.length, 'complete production inventory: missing, extra or duplicate path');
  for (let i = 0; i < pinned.length; i++) {
    for (const key of hashes ? ['path','mode','sha','sha256'] : ['path','mode','sha'])
      assert.equal(actual[i][key], pinned[i][key], pinned[i].path + ': pinned ' + key);
  }
}

function git(root, args) {
  const env = {...process.env};
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
  Object.assign(env, {GIT_CONFIG_NOSYSTEM:'1', GIT_CONFIG_GLOBAL:'/dev/null', GIT_NO_REPLACE_OBJECTS:'1'});
  return execFileSync('git', ['-C',root,...args], {encoding:'utf8',env,timeout:15000,maxBuffer:8*1024*1024,stdio:['ignore','pipe','pipe']});
}

export function readCurrentPairGitTree(root, expectedSha) {
  assert.match(expectedSha ?? '', /^[0-9a-f]{40}$/, 'declared immutable commit required');
  const real = fs.realpathSync(root);
  assert.equal(fs.realpathSync(git(real,['rev-parse','--show-toplevel']).trim()), real, 'actual Git worktree root required');
  assert.equal(git(real,['rev-parse','--verify','HEAD^{commit}']).trim(), expectedSha, 'declared commit must equal actual HEAD');
  const rows = git(real,['ls-tree','-r','-z','--full-tree',expectedSha]).split('\0').filter(Boolean).map(line => {
    const match = /^(\d+) (blob|tree|commit) ([0-9a-f]{40})\t([\s\S]+)$/.exec(line);
    assert.ok(match, 'valid immutable Git tree entry');
    return {mode:match[1],type:match[2],sha:match[3],path:match[4]};
  }).filter(row => included(row.path));
  for (const row of rows) {
    assert.equal(row.type,'blob','production cannot contain Git links');
    assert.ok(['100644','100755'].includes(row.mode),row.path + ': source symlinks rejected');
  }
  return {head:expectedSha,tree:git(real,['rev-parse',expectedSha+'^{tree}']).trim(),entries:rows};
}

export function scanCurrentPairProduction(root) {
  const rows = [];
  const visit = relative => {
    const file = path.join(root,relative), stat = fs.lstatSync(file);
    assert.ok(!stat.isSymbolicLink(), relative + ': source symlinks rejected');
    if (stat.isDirectory()) {
      if (fixture.roots.some(root => root !== 'inkwave-public' && relative === root + '/tests')) return;
      for (const name of fs.readdirSync(file).sort()) visit(relative + '/' + name);
    } else if (included(relative)) {
      assert.ok(stat.isFile(), relative + ': regular source file required');
      const bytes = fs.readFileSync(file);
      rows.push({path:relative,mode:stat.mode & 0o111 ? '100755':'100644',
        sha:createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),sha256:hash(bytes)});
    }
  };
  for (const relative of [...fixture.roots,...fixture.scripts]) {
    let prefix = root;
    for (const part of relative.split('/').slice(0,-1)) {
      prefix = path.join(prefix,part);
      assert.ok(!fs.lstatSync(prefix).isSymbolicLink(), 'source parent symlinks rejected');
    }
    visit(relative);
  }
  return sort(rows);
}

function verifySide(root,commit,epoch,isBase,route){
  const before=readCurrentPairGitTree(root,commit);
  if(isBase)assert.equal(before.tree,sourceEpoch(epoch).tree,'exact reviewed baseline full tree');
  assertCurrentPairRows(before.entries,epoch,false);
  const rows=scanCurrentPairProduction(root);assertCurrentPairRows(rows,epoch);
  if(route.exactMain3003){
    assertMain3003Inputs(rows,epoch);
    if(!isBase)assertMain3003Head(commit,args=>git(root,args));
  }
  assert.deepEqual(readCurrentPairGitTree(root,commit),before,'declared checkout stable during verification');
  return {commit,tree:before.tree,sourceEpoch:epoch,productionLeaves:rows.length,inventorySha256:hash(JSON.stringify(rows))};
}

export function verifyCurrentProjectilePair({baseline,candidate,event,eventName,repository,baselineSite,candidateSite,expectedSourceBase,expectedSourceHead}) {
  const route = selectCurrentPair(event,eventName,repository);
  if(route.exactMain3003)assertMain3003Environment(process.env);
  if(expectedSourceBase!==undefined||expectedSourceHead!==undefined){
    assert.equal(expectedSourceBase,route.baseSha,'explicit source-base label');
    assert.equal(expectedSourceHead,route.sourceHead,'explicit source-head label');
  }
  baseline = fs.realpathSync(baseline); candidate = fs.realpathSync(candidate);
  assert.notEqual(baseline,candidate,'separate actual worktrees required');
  const checkouts = [];
  for (const [root,commit,epoch,isBase] of [[baseline,route.baseSha,route.baseSha,true],[candidate,route.candidateSha,route.sourceHead,false]]) {
    checkouts.push(verifySide(root,commit,epoch,isBase,route));
  }
  assert.equal(Boolean(baselineSite),Boolean(candidateSite),'both build sides required');
  let builds;
  if(baselineSite){
    assert.ok(route.exactMain3003,'build pins require the explicit main3003 pair');
    assert.notEqual(fs.realpathSync(baselineSite),fs.realpathSync(candidateSite),'separate built sides');
    builds=[assertMain3003Artifacts(baselineSite,route.baseSha),assertMain3003Artifacts(candidateSite,route.sourceHead)];
  }
  return {schema:1,mode:route.mode||CURRENT_PAIR_MODE,pr:route.pr,repository,branch:route.branch,
    declaredBaseCommit:route.baseSha,declaredCandidateCommit:route.candidateSha,
    sourceBase:route.baseSha,sourceHead:route.sourceHead,fixtureSha256:route.fixtureSha256||CURRENT_PAIR_FIXTURE_SHA256,
    checkouts,...(route.exactMain3003?{historicalFixtureSha256:CURRENT_PAIR_FIXTURE_SHA256,verificationStage:builds?'source-and-build':'source-before-build',buildClosureRequired:true,builds:builds||null}:{}),productionDeltas:route.deltas[route.baseSha],changes:[],writtenPaths:[],
    scope:'Preserve the actual event base and complete pinned candidate production epoch, including paint, births, RNG, pose and network. No historical Roller, pool, paint or pose replay.',
    limitation:route.exactMain3003?'Exact source/build inventory admission only. Does not establish physical-state, RNG, visual, retail or hardware equivalence; both required captures and comparison remain mandatory.':'Pinned source admission only. Listed production differences remain visible. Does not establish compiled, physical-state, RNG, visual, retail or hardware equivalence; full capture and comparison remain mandatory.'};
}

export function currentPairNegativeControls(route) {
  let rejected = 0;
  for (const epoch of [route.baseSha,route.sourceHead]) {
    const rows = sourceEpoch(epoch).leaves;
    for (let i = 0; i < rows.length; i++) {
      const changed = [...rows]; changed[i] = {...rows[i],sha256:'0'.repeat(64)};
      assert.throws(() => assertCurrentPairRows(changed,epoch)); rejected++;
    }
    for (const changed of [rows.slice(1),[...rows,rows[0]],[...rows,{...rows[0],path:'inkwave-public/unreviewed-extra.js'}]]) {
      assert.throws(() => assertCurrentPairRows(changed,epoch)); rejected++;
    }
  }
  return {kind:'all-production-leaf-and-inventory-negative-controls',rejected};
}

// Both existing required captures enforce their own built side after build.
// The after matrix has no baseline checkout, so each side validates only its
// own real checkout/artifacts while retaining both immutable source labels.
export function verifyCurrentPairCaptureBuild({site,mode,root,eventFile,eventName,repository,baseline,evidence,profile}){
  if(!eventFile||eventName!=='pull_request')return null;
  const event=JSON.parse(fs.readFileSync(eventFile,'utf8'));
  if(event.number!==1857||event.pull_request?.head?.ref!=='fix/shooter-splatling-cosmetics-20261023')return null;
  const route=selectCurrentPair(event,eventName,repository);if(!route.exactMain3003)return null;
  assert.ok(['baseline','candidate'].includes(mode),'explicit capture side label');
  const artifactRoot=path.resolve(site);
  for(const value of [evidence,profile].filter(Boolean)){
    const output=path.resolve(value);
    assert.ok(output!==artifactRoot&&!output.startsWith(artifactRoot+path.sep)&&!artifactRoot.startsWith(output+path.sep),
      'capture outputs must be separate from pinned artifacts');
  }
  const isBase=mode==='baseline',epoch=isBase?MAIN3003_BASE:route.sourceHead,commit=isBase?route.baseSha:route.candidateSha;
  const sourceRoot=isBase?path.resolve(root,baseline||'.ci-baseline'):root;
  assertMain3003Environment(process.env);
  const source=verifySide(sourceRoot,commit,epoch,isBase,route),build=assertMain3003Artifacts(site,epoch);
  return {mode:route.mode,side:mode,sourceBase:route.baseSha,sourceHead:route.sourceHead,
    declaredBaseCommit:route.baseSha,declaredCandidateCommit:route.candidateSha,fixtureSha256:route.fixtureSha256,source,build,writtenPaths:[]};
}
