// Closed source admission for the two reviewed October 23 PRs. No source writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';

export const CURRENT_PAIR_MODE = 'oct23-reviewed-projectile-pairs';
export const CURRENT_PAIR_FIXTURE_SHA256 = 'adf375e9e5a53d3f7ea0724d296a4b201c68edbfc6aea44291617a7d9de20ad9';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const packed = fs.readFileSync(new URL('../fixtures/inkwave-projectile-current-pair-20261023.json.gz', import.meta.url));
assert.equal(hash(packed), CURRENT_PAIR_FIXTURE_SHA256, 'reviewed current-pair fixture pin');
const fixture = JSON.parse(gunzipSync(packed));
assert.equal(fixture.schema, 1);
assert.equal(fixture.repository, 'rhgrive3/actions');
assert.deepEqual(fixture.routes.map(row => row.pr), [1857, 1860]);
const sort = rows => [...rows].sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
const included = relative => fixture.scripts.includes(relative) ||
  (fixture.roots.some(root => relative.startsWith(root + '/')) && !relative.split('/').includes('tests') && !relative.endsWith('.md'));
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
  assert.ok(route.bases.includes(pr.base.sha), 'actual event baseline must be a pinned reviewed epoch');
  assert.match(pr.head.sha ?? '', /^[0-9a-f]{40}$/, 'actual candidate immutable SHA required');
  assert.notEqual(pr.head.sha, pr.base.sha, 'separate reviewed candidate required');
  return {...structuredClone(route), baseSha:pr.base.sha, candidateSha:pr.head.sha};
}

export function assertCurrentPairRows(rows, epoch, hashes = true) {
  const expected = fixture.epochs[epoch];
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
  for (const row of rows) assert.equal(row.type,'blob','production cannot contain Git links');
  return {head:expectedSha,tree:git(real,['rev-parse',expectedSha+'^{tree}']).trim(),entries:rows};
}

export function scanCurrentPairProduction(root) {
  const rows = [];
  const visit = relative => {
    const file = path.join(root,relative), stat = fs.lstatSync(file);
    assert.ok(!stat.isSymbolicLink(), relative + ': source symlinks rejected');
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(file).sort()) {
        if (name !== 'tests') visit(relative + '/' + name);
      }
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

export function verifyCurrentProjectilePair({baseline,candidate,event,eventName,repository}) {
  const route = selectCurrentPair(event,eventName,repository);
  baseline = fs.realpathSync(baseline); candidate = fs.realpathSync(candidate);
  assert.notEqual(baseline,candidate,'separate actual worktrees required');
  const checkouts = [];
  for (const [root,commit,epoch,isBase] of [[baseline,route.baseSha,route.baseSha,true],[candidate,route.candidateSha,route.sourceHead,false]]) {
    const before = readCurrentPairGitTree(root,commit);
    if (isBase) assert.equal(before.tree,fixture.epochs[epoch].tree,'exact reviewed baseline full tree');
    assertCurrentPairRows(before.entries,epoch,false);
    const rows = scanCurrentPairProduction(root);
    assertCurrentPairRows(rows,epoch);
    assert.deepEqual(readCurrentPairGitTree(root,commit),before,'declared checkout stable during verification');
    checkouts.push({commit,tree:before.tree,sourceEpoch:epoch,productionLeaves:rows.length,inventorySha256:hash(JSON.stringify(rows))});
  }
  return {schema:1,mode:CURRENT_PAIR_MODE,pr:route.pr,repository,branch:route.branch,
    declaredBaseCommit:route.baseSha,declaredCandidateCommit:route.candidateSha,
    sourceBase:route.baseSha,sourceHead:route.sourceHead,fixtureSha256:CURRENT_PAIR_FIXTURE_SHA256,
    checkouts,productionDeltas:route.deltas[route.baseSha],changes:[],writtenPaths:[],
    scope:'Preserve the actual event base and complete pinned candidate production epoch, including paint, births, RNG, pose and network. No historical Roller, pool, paint or pose replay.',
    limitation:'Pinned source admission only. Listed production differences remain visible. Does not establish compiled, physical-state, RNG, visual, retail or hardware equivalence; full capture and comparison remain mandatory.'};
}

export function currentPairNegativeControls(route) {
  let rejected = 0;
  for (const epoch of [route.baseSha,route.sourceHead]) {
    const rows = fixture.epochs[epoch].leaves;
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
