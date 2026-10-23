// A closed, private epoch. Never extends or substitutes the historical special
// four-leaf contract. The verifier checkout is separate from the frozen inputs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';

export const SIXWAY_EPOCH = 'main7e-sixway-frozen-v1';
export const INVENTORY_SHA256 = 'be9782496f38b321b58152919a959a0f983082e0c2fa6602ed64d6bb1f41c94d';
const hash = b => createHash('sha256').update(b).digest('hex');
const blob = b => createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex');
const sorted = rows => [...rows].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
const within = (child,parent) => child===parent || child.startsWith(parent+path.sep);
const ownRoot = fs.realpathSync(new URL('../..',import.meta.url));
const packed = fs.readFileSync(new URL('../fixtures/inkwave-sixway-frozen-inventory.json.gz',import.meta.url));
assert.equal(hash(packed),INVENTORY_SHA256,'sealed independently materialized Git inventory');
const pins = JSON.parse(gunzipSync(packed,{maxOutputLength:8*1024*1024}));
assert.equal(pins.schema,1);
assert.equal(pins.base.commit,'7e027ac2ff7eea31c04155e0ee1e0d3e5604ed51');
assert.equal(pins.six.commit,'7c8a5ebf10c27411025522fe1d362c81c1e89e4a');
assert.equal(pins.fixtureQA.commit,'0cabb66c92c07eecc7e649ddb74d26fcab8e02a1');
assert.equal(pins.productionPaths.length,19);
assert.equal(new Set(pins.productionPaths).size,19);

// Only literal, root-relative development outputs are ignored. No extension,
// basename, tests/, Markdown, .gitignore or per-overlay classification is used.
// In particular public/tests/**, public/*.md and loading/runtime/** are fenced.
// The two Python caches are unrelated to the pinned JS builder; all tracked
// files remain mandatory, including tracked files below any ignored location.
const GENERATED = new Set(['.git','node_modules','_site','.ci-scratch',
  '.browser-evidence','.browser-profile-onboarding',
  'tools/backup/__pycache__','tools/backup/tests/__pycache__']);
const forbiddenBuildEnv = ['INKWAVE_ACCOUNT_BUILD','INKWAVE_NATIVE_STAGE_ASSETS',
  'INKWAVE_BUILD_UNMINIFIED','INKWAVE_NO_THREE_SHAKE','INKWAVE_BUILD_TRANSFORM_CONCURRENCY'];
const gitEnv = () => ({...Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('GIT_'))),
  GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_NO_REPLACE_OBJECTS:'1',GIT_OPTIONAL_LOCKS:'0'});
function git(root,args) {
  return execFileSync('git',['-C',root,...args],{env:gitEnv(),encoding:'utf8',
    timeout:30000,maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']});
}
function cleanPath(relative) {
  assert.ok(typeof relative==='string' && relative.length && !relative.includes('\\') &&
    !path.posix.isAbsolute(relative) && relative.split('/').every(p=>p && p!=='.' && p!=='..'),
    'contained literal relative path');
}
function validatePins(rows) {
  assert.ok(Array.isArray(rows)&&rows.length);
  assert.equal(new Set(rows.map(r=>r.path)).size,rows.length,'unique inventory paths');
  for(const row of rows) {
    cleanPath(row.path);assert.ok(['100644','100755'].includes(row.mode),'regular pinned Git leaf');
    assert.match(row.sha,/^[a-f0-9]{40}$/);assert.match(row.sha256,/^[a-f0-9]{64}$/);
    assert.ok(!GENERATED.has(row.path),'a generated exclusion cannot hide a tracked leaf');
    for(const prefix of GENERATED)assert.ok(!row.path.startsWith(prefix+'/'),'no tracked path hidden by generated exclusion');
  }
  assert.deepEqual(rows.map(r=>r.path),sorted(rows).map(r=>r.path),'canonical complete inventory order');
}
validatePins(pins.base.files);validatePins(pins.six.files);
function profile(name) {
  assert.ok(name==='six' || name==='six-plus-fixture','explicit known candidate profile');
  if(name==='six')return pins.six;
  const p=pins.fixtureQA,rows=pins.six.files.map(r=>r.path===p.override.path?p.override:r);
  assert.equal(rows.filter(r=>r===p.override).length,1,'only the separately pinned fixture override');
  return {commit:p.commit,tree:p.tree,files:rows};
}
export function sixwayPinSummary() {
  return structuredClone({epoch:SIXWAY_EPOCH,archiveSha256:INVENTORY_SHA256,
    base:{commit:pins.base.commit,tree:pins.base.tree,leaves:pins.base.files.length},
    profiles:Object.fromEntries(['six','six-plus-fixture'].map(n=>{const p=profile(n);return[n,{commit:p.commit,tree:p.tree,leaves:p.files.length}];})),
    productionPaths:pins.productionPaths,build:pins.build});
}
export function assertSixwayRows(actual,expected,keys=['path','mode','sha','sha256']) {
  const rows=sorted(actual);assert.equal(rows.length,expected.length,'complete inventory: missing, extra or duplicate source');
  assert.equal(new Set(rows.map(r=>r.path)).size,rows.length,'unique actual source inventory');
  for(let i=0;i<rows.length;i++)for(const key of keys)
    assert.equal(rows[i][key],expected[i][key],`${expected[i].path}: pinned ${key}`);
}
function actualRoot(value) {
  const root=path.resolve(value);assert.ok(!fs.lstatSync(root).isSymbolicLink(),'worktree root cannot be a symlink');
  const real=fs.realpathSync(root);
  assert.equal(fs.realpathSync(git(real,['rev-parse','--show-toplevel']).trim()),real,'actual Git worktree root required');
  return real;
}
function verifyGit(root,expected,declaredSha,declaredTree) {
  assert.equal(declaredSha,expected.commit,'declaration must equal the fixed epoch commit');
  assert.equal(declaredTree,expected.tree,'declaration must equal the fixed epoch full tree');
  assert.equal(git(root,['rev-parse','--verify','HEAD^{commit}']).trim(),expected.commit,'actual HEAD must equal the declared frozen commit');
  assert.equal(git(root,['rev-parse','HEAD^{tree}']).trim(),expected.tree,'actual complete Git tree');
  const rows=git(root,['ls-tree','-rz','--full-tree','HEAD']).split('\0').filter(Boolean).map(line=>{
    const m=/^(\d+) blob ([a-f0-9]{40})\t([\s\S]+)$/.exec(line);assert.ok(m,'no Git links or source symlinks');
    return {path:m[3],mode:m[1],sha:m[2]};
  });
  assertSixwayRows(rows,expected.files,['path','mode','sha']);
  const index=git(root,['ls-files','--stage','-z']).split('\0').filter(Boolean).map(line=>{
    const m=/^(\d+) ([a-f0-9]{40}) 0\t([\s\S]+)$/.exec(line);assert.ok(m,'complete conflict-free stage-zero source index');
    return {path:m[3],mode:m[1],sha:m[2]};
  });
  assertSixwayRows(index,expected.files,['path','mode','sha']);
}
function physical(root,expected,ignored=GENERATED) {
  const expectedNames=new Set(expected.map(r=>r.path)),dirs=new Set(['']);
  for(const relative of expectedNames)for(let p=path.posix.dirname(relative);p!=='.';p=path.posix.dirname(p))dirs.add(p);
  const rows=[];
  function visit(relative) {
    if(ignored.has(relative))return;
    const absolute=path.join(root,relative),stat=fs.lstatSync(absolute);
    assert.ok(!stat.isSymbolicLink(),`${relative}: source/output symlink rejected`);
    if(stat.isDirectory()) {
      assert.ok(dirs.has(relative),`${relative}: unknown directory in complete source inventory`);
      for(const name of fs.readdirSync(absolute).sort())visit(relative?relative+'/'+name:name);
    } else {
      assert.ok(expectedNames.has(relative),`${relative}: unknown file in complete source inventory`);
      assert.ok(stat.isFile()&&stat.size<=64*1024*1024,`${relative}: bounded regular file required`);
      const bytes=fs.readFileSync(absolute);
      rows.push({path:relative,mode:stat.mode&0o111?'100755':'100644',sha:blob(bytes),sha256:hash(bytes)});
    }
  }
  visit('');const ordered=sorted(rows);assertSixwayRows(ordered,expected);return ordered;
}
function prospective(file) {
  let at=path.resolve(file),tail=[];
  for(;;) {
    try {fs.lstatSync(at);return path.join(fs.realpathSync(at),...tail);}
    catch(e){if(e.code!=='ENOENT')throw e;try{fs.lstatSync(at);assert.fail('dangling output ancestor');}catch(x){if(x.code!=='ENOENT')throw x;}
      const parent=path.dirname(at);assert.notEqual(parent,at);tail.unshift(path.basename(at));at=parent;}
  }
}
export function separateReceipt(file,roots,site) {
  try{fs.lstatSync(file);assert.fail('receipt must be a new file; existing files are never overwritten');}catch(e){if(e.code!=='ENOENT')throw e;}
  const resolved=prospective(file);
  for(const root of [...roots,site,ownRoot])assert.ok(!within(resolved,root),'receipt must be outside every source, site and verifier checkout');
  for(const root of [...roots,ownRoot])for(const dir of git(root,['rev-parse','--path-format=absolute','--git-dir','--git-common-dir']).trim().split('\n'))
    assert.ok(!within(resolved,fs.realpathSync(dir)),'receipt cannot target shared Git metadata');
  assert.ok(fs.statSync(path.dirname(resolved)).isDirectory(),'receipt parent must already exist');
  return resolved;
}
function verifyEvent(provenance,base,head) {
  assert.ok(['local','official-pr-event'].includes(provenance),'explicit provenance required');
  if(provenance==='local')return {mode:'local',limitation:'A private source/build check is not a hosted PR event or integration acceptance.'};
  assert.equal(process.env.GITHUB_EVENT_NAME,'pull_request','actual pull_request runner input required');
  assert.equal(process.env.GITHUB_REPOSITORY,'rhgrive3/actions','owned runner repository');
  const file=process.env.GITHUB_EVENT_PATH;assert.ok(file,'actual runner event path');
  const stat=fs.lstatSync(file);assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=2*1024*1024,'bounded regular runner event');
  const bytes=fs.readFileSync(file),event=JSON.parse(bytes),pr=event.pull_request;
  assert.equal(event.repository?.full_name,'rhgrive3/actions');assert.ok(Number.isSafeInteger(event.number)&&event.number>0);
  assert.equal(pr?.number,event.number);assert.equal(pr?.base?.repo?.full_name,'rhgrive3/actions');assert.equal(pr?.head?.repo?.full_name,'rhgrive3/actions');
  assert.equal(pr?.base?.ref,'main');assert.equal(pr?.base?.sha,base);assert.equal(pr?.head?.sha,head);
  return {mode:provenance,file,sha256:hash(bytes),number:event.number,
    limitation:'Runner-input fields are bound here; local fixtures cannot authenticate hosted provenance.'};
}
function verifySite(site,candidate) {
  const file=path.join(site,'inkwave-build.json'),bytes=fs.readFileSync(file);
  assert.equal(hash(bytes),pins.buildManifestSha256,'exact frozen normal build manifest');
  const m=JSON.parse(bytes);
  assert.equal(hash(JSON.stringify(m.files)),pins.build.inputHash,'sealed complete build input manifest');
  assert.equal(hash(JSON.stringify(m.artifacts)),pins.build.contentHash,'sealed complete artifact manifest');
  assert.equal(m.inputHash,pins.build.inputHash);assert.equal(m.contentHash,pins.build.contentHash);
  for(const key of ['revision','esbuild','optimization'])assert.equal(m.build[key],pins.build[key],`frozen build ${key}`);
  assert.equal(m.build.nativeStages?.mode,'browser-direct','pinned normal browser-direct native catalog');
  assert.equal(m.build.account,undefined,'no external account overlay');
  const prefixes={'upstream/':'inkwave-public/','patch/':'patches/splatoon3/','touch-layout/':'patches/touch-layout/','reliability/':'patches/reliability/',
    'local-quality/':'patches/local-quality/','network-replication/':'patches/network-replication/','loading-cache/':'patches/loading-cache/','practice-range/':'patches/practice-range/',
    'native-stages/':'patches/native-stages/','build-script/':'scripts/'};
  const source=new Map(candidate.files.map(r=>[r.path,r]));
  assert.equal(Object.keys(m.files).length,pins.build.inputs);
  for(const [key,digest] of Object.entries(m.files)) {
    const prefix=Object.keys(prefixes).find(p=>key.startsWith(p));assert.ok(prefix,'known build input namespace');
    const rel=prefixes[prefix]+key.slice(prefix.length);cleanPath(rel);
    assert.equal(source.get(rel)?.sha256,digest,`${rel}: build input belongs to exact declared candidate`);
  }
  assert.equal(source.get('scripts/build-inkwave.mjs')?.sha256,m.build.script,'builder belongs to declared candidate');
  assert.equal(Object.keys(m.artifacts).length,pins.build.artifacts);
  const output=Object.entries(m.artifacts).map(([relative,sha256])=>{
    cleanPath(relative);const stat=fs.lstatSync(path.join(site,relative));assert.ok(stat.isFile()&&!stat.isSymbolicLink(),'regular emitted body');
    const b=fs.readFileSync(path.join(site,relative));assert.equal(hash(b),sha256,`${relative}: emitted body`);
    return {path:relative,mode:stat.mode&0o111?'100755':'100644',sha:blob(b),sha256};
  });
  output.push({path:'inkwave-build.json',mode:fs.statSync(file).mode&0o111?'100755':'100644',sha:blob(bytes),sha256:hash(bytes)});
  // Also reject additions and parent symlinks; no filename classification.
  physical(site,sorted(output),new Set());
  return {inputHash:m.inputHash,contentHash:m.contentHash,revision:m.build.revision,inputs:pins.build.inputs,artifacts:pins.build.artifacts};
}
export function verifySixwayEpoch(o) {
  assert.equal(o.epoch,SIXWAY_EPOCH,'separate explicit six-way epoch required');
  for(const key of forbiddenBuildEnv)assert.equal(process.env[key],undefined,`${key}: external build input is outside this frozen epoch`);
  const selected=profile(o.candidateProfile),baseline=actualRoot(o.baseline),candidate=actualRoot(o.candidate),site=fs.realpathSync(o.site);
  assert.ok(!within(baseline,candidate)&&!within(candidate,baseline),'separate non-nested actual source worktrees');
  for(const root of [baseline,candidate])assert.ok(!within(site,root)&&!within(root,site),'separate emitted site');
  assert.ok(!fs.lstatSync(path.resolve(o.site)).isSymbolicLink(),'site root cannot be a symlink');
  const receipt=separateReceipt(o.receipt,[baseline,candidate],site);
  const event=verifyEvent(o.provenance,pins.base.commit,selected.commit);
  const checkouts=[];
  for(const [root,p,sha,tree] of [[baseline,pins.base,o.baseSha,o.baseTree],[candidate,selected,o.candidateSha,o.candidateTree]]) {
    verifyGit(root,p,sha,tree);const rows=physical(root,p.files);
    checkouts.push({commit:p.commit,tree:p.tree,completeRepositoryLeaves:rows.length,inventorySha256:hash(JSON.stringify(rows))});
  }
  const build=verifySite(site,selected);
  // Re-read both materializations and Git identities after output verification.
  for(const [root,p,sha,tree] of [[baseline,pins.base,o.baseSha,o.baseTree],[candidate,selected,o.candidateSha,o.candidateTree]]) {
    verifyGit(root,p,sha,tree);physical(root,p.files);
  }
  if(event.file)assert.equal(hash(fs.readFileSync(event.file)),event.sha256,'stable runner event');
  assert.equal(separateReceipt(o.receipt,[baseline,candidate],site),receipt,'stable independent receipt destination');
  return {receipt,evidence:{schema:1,epoch:SIXWAY_EPOCH,candidateProfile:o.candidateProfile,event,checkouts,build,
    productionDeltaPaths:[...pins.productionPaths],archiveSha256:INVENTORY_SHA256,
    fence:'All committed repository leaves, including all builder imports/data/registrations, public tests-named paths and Markdown. Unknown physical source files/directories reject; only literal development outputs outside production are excluded.',
    writtenSourcePaths:[],limitation:'Exact local source/build identity. Does not establish combined gameplay, browser, RNG, retail, real-peer or mandatory hosted-CI acceptance; historical four-leaf admission is unchanged.'}};
}
