// Integration tests for this exact private epoch: requires its immutable Git
// objects and the preserved six-way normal site. Never changes original refs.
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {SIXWAY_EPOCH,INVENTORY_SHA256,sixwayPinSummary,assertSixwayRows} from '../lib/inkwave-sixway-epoch.mjs';
const repo=fileURLToPath(new URL('../..',import.meta.url)),cli=path.join(repo,'scripts/verify-inkwave-sixway-epoch.mjs');
const preservedSite=process.env.SIXWAY_TEST_SITE||'/workspace/inkwave-six-site';
const summary=sixwayPinSummary(),scratch=fs.mkdtempSync(path.join(os.tmpdir(),'inkwave-sixway-cli-'));
const base=path.join(scratch,'base'),candidate=path.join(scratch,'candidate'),qa=path.join(scratch,'fixture-qa'),site=path.join(scratch,'site');
const env=()=>({...Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('GIT_')&&!k.startsWith('INKWAVE_'))),GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_NO_REPLACE_OBJECTS:'1'});
const git=(root,...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8',env:env(),stdio:['ignore','pipe','pipe'],maxBuffer:16*1024*1024}).trim();
const worktrees=[];
after(()=>{for(const root of worktrees.reverse())git(repo,'worktree','remove','--force',root);fs.rmSync(scratch,{recursive:true,force:true});});
for(const [root,p]of [[base,summary.base],[candidate,summary.profiles.six],[qa,summary.profiles['six-plus-fixture']]]) {
  git(repo,'worktree','add','--detach',root,p.commit);worktrees.push(root);
}
fs.cpSync(preservedSite,site,{recursive:true});
let sequence=0;
const receipt=()=>path.join(scratch,'receipt-'+(++sequence)+'.json');
function args({profile='six',baseline=base,subject=candidate,output=receipt(),emitted=site}={}) {
  const p=summary.profiles[profile];
  return ['--epoch',SIXWAY_EPOCH,'--candidate-profile',profile,'--provenance','local',
    '--baseline',baseline,'--candidate',subject,'--base-sha',summary.base.commit,'--candidate-sha',p.commit,
    '--base-tree',summary.base.tree,'--candidate-tree',p.tree,'--site',emitted,'--receipt',output];
}
function invoke(argv=args(),environment={}) {
  const output=argv[argv.indexOf('--receipt')+1],before=fs.existsSync(output)&&fs.statSync(output).isFile()?fs.readFileSync(output):null;
  const r=spawnSync(process.execPath,[cli,...argv],{encoding:'utf8',env:{...env(),...environment},timeout:120000,maxBuffer:2*1024*1024});
  assert.equal(r.error,undefined,'actual CLI must finish');return {...r,output,before};
}
function rejects(r,pattern) {
  assert.notEqual(r.status,0,r.stdout+'\n'+r.stderr);
  if(pattern)assert.match(r.stderr,pattern);
  if(r.before)assert.deepEqual(fs.readFileSync(r.output),r.before,'failed CLI preserves existing receipt/input');
  else assert.ok(!fs.existsSync(r.output),'failed CLI creates no receipt');
}
function changeArg(argv,flag,value){const out=[...argv];out[out.indexOf(flag)+1]=value;return out;}
const hash=b=>createHash('sha256').update(b).digest('hex');
const archive=fs.readFileSync(path.join(repo,'scripts/fixtures/inkwave-sixway-frozen-inventory.json.gz'));
assert.equal(hash(archive),INVENTORY_SHA256);
const pins=JSON.parse(gunzipSync(archive));
const dirs=root=>new Set(git(root,'ls-tree','-rd','--name-only','HEAD').split('\n'));
function restore(root,commit,file) {
  git(root,'reset','--hard',commit);if(!file)return;
  const relative=path.relative(root,file).split(path.sep).join('/');
  if(!git(root,'ls-files','--',relative))fs.rmSync(file,{recursive:true,force:true});
  const keep=dirs(root);
  for(let p=path.dirname(file);p!==root&&p.startsWith(root+path.sep)&&!keep.has(path.relative(root,p).split(path.sep).join('/'));p=path.dirname(p)) {
    if(fs.existsSync(p)&&fs.readdirSync(p).length===0)fs.rmdirSync(p);
  }
}

test('both separately named frozen source profiles pass the real CLI and verify complete outputs',()=>{
  for(const [profile,subject]of [['six',candidate],['six-plus-fixture',qa]]) {
    const r=invoke(args({profile,subject}));assert.equal(r.status,0,r.stderr);
    const proof=JSON.parse(fs.readFileSync(r.output));assert.equal(proof.candidateProfile,profile);
    assert.equal(proof.checkouts[0].completeRepositoryLeaves,6254);assert.equal(proof.checkouts[1].completeRepositoryLeaves,7234);
    assert.equal(proof.productionDeltaPaths.length,19);assert.equal(proof.build.inputHash,summary.build.inputHash);
    assert.equal(proof.build.artifacts,2120);assert.deepEqual(proof.writtenSourcePaths,[]);assert.equal(proof.event.mode,'local');
  }
});

test('all independently pinned file rows reject byte/blob/mode mutations; complete lists reject omission/duplication',()=>{
  for(const inventory of [pins.base.files,pins.six.files]) {
    for(const row of inventory)for(const key of ['mode','sha','sha256']) {
      assert.throws(()=>assertSixwayRows([{...row,[key]:'unreviewed'}],[row]),/pinned/);
    }
    assert.throws(()=>assertSixwayRows(inventory.slice(1),inventory),/complete inventory/);
    assert.throws(()=>assertSixwayRows([...inventory,inventory[0]],inventory),/complete inventory/);
  }
});

const unknownPaths=['inkwave-public/tests/injected.js','inkwave-public/tests/injected.md',
  'inkwave-public/runtime/tests/injected.md','inkwave-public/assets/injected.md','inkwave-public/injected.md',
  'patches/loading-cache/runtime/tests/injected.js','patches/loading-cache/runtime/injected.md',
  'patches/splatoon3/runtime/tests/injected.md','patches/splatoon3/tests/injected.md','scripts/lib/injected.mjs'];
for(const relative of unknownPaths)for(const tracked of [false,true])test(`actual CLI rejects ${tracked?'staged':'untracked'} extra ${relative}`,()=>{
  const file=path.join(candidate,relative);
  try {
    fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'export {};\n');
    if(tracked)git(candidate,'add','--',relative);
    rejects(invoke(),tracked?/complete inventory/:/unknown (file|directory)/);
  } finally {restore(candidate,summary.profiles.six.commit,file);}
});

for(const [root,commit,side]of [[base,summary.base.commit,'base'],[candidate,summary.profiles.six.commit,'candidate']])
for(const kind of ['bytes','mode','missing','symlink'])test(`actual CLI rejects ${side} ${kind} of builder dependency`,()=>{
  const file=path.join(root,'scripts/inkwave-source-composition.mjs');
  try {
    if(kind==='bytes')fs.appendFileSync(file,'\n// unreviewed\n');
    if(kind==='mode')fs.chmodSync(file,0o755);
    if(kind==='missing')fs.unlinkSync(file);
    if(kind==='symlink'){fs.unlinkSync(file);fs.symlinkSync(path.join(repo,'scripts/inkwave-source-composition.mjs'),file);}
    rejects(invoke(),kind==='symlink'?/symlink/:/pinned|complete inventory/);
  } finally {restore(root,commit,file);}
});

test('unknown public symlink cannot hide behind a tests/Markdown path or point into generated output',()=>{
  const file=path.join(candidate,'inkwave-public/tests/alias.md');
  try{fs.mkdirSync(path.dirname(file),{recursive:true});fs.symlinkSync(path.join(site,'src/main.js'),file);rejects(invoke(),/symlink|unknown directory/);}
  finally{restore(candidate,summary.profiles.six.commit,file);}
});

test('committed new public input rejects even when caller declares its real new HEAD/tree',()=>{
  const relative='inkwave-public/tests/committed.md',file=path.join(candidate,relative);
  try{
    fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'unreviewed\n');git(candidate,'add','--',relative);
    git(candidate,'-c','user.name=Sixway CLI Fixture','-c','user.email=fixture@example.invalid','commit','--quiet','-m','Disposable negative source');
    rejects(invoke(changeArg(changeArg(args(),'--candidate-sha',git(candidate,'rev-parse','HEAD')),'--candidate-tree',git(candidate,'rev-parse','HEAD^{tree}'))),/fixed epoch commit/);
  }finally{restore(candidate,summary.profiles.six.commit,file);}
});

test('fixed base/head/tree/profile declarations cannot be substituted or silently inferred',()=>{
  for(const flag of ['--base-sha','--candidate-sha','--base-tree','--candidate-tree'])rejects(invoke(changeArg(args(),flag,'0'.repeat(40))),/fixed epoch/);
  rejects(invoke(changeArg(args(),'--candidate-profile','unknown')),/known candidate profile/);
  rejects(invoke(args({profile:'six-plus-fixture',subject:candidate})),/actual HEAD/);
  rejects(invoke(changeArg(args(),'--epoch','main-reviewed-special-four-delta-pair')),/separate explicit six-way epoch/);
});

test('ambiguous, missing and unsupported real CLI arguments reject before writing',()=>{
  const a=args();rejects(invoke([...a,'--epoch',SIXWAY_EPOCH]),/duplicate/);
  rejects(invoke([...a,'--allow-current-head','true']),/unknown argument/);
  rejects(invoke(a.filter((_,i)=>i!==a.indexOf('--base-tree')&&i!==a.indexOf('--base-tree')+1)),/required --base-tree/);
});

test('source/site/root aliases and every protected receipt destination reject without source writes',()=>{
  rejects(invoke(args({subject:base})),/separate non-nested/);
  const alias=path.join(scratch,'candidate-alias');fs.symlinkSync(candidate,alias);rejects(invoke(args({subject:alias})),/root cannot be a symlink/);
  const outputs=[path.join(candidate,'new-receipt.json'),path.join(base,'inkwave-public/new-receipt.md'),
    path.join(site,'new-receipt.json'),path.join(repo,'new-receipt.json'),
    path.join(git(candidate,'rev-parse','--path-format=absolute','--git-common-dir'),'new-sixway-receipt.json')];
  for(const output of outputs)rejects(invoke(args({output})),/receipt must be outside|Git metadata/);
  const existing=path.join(scratch,'existing.json');fs.writeFileSync(existing,'keep exact\n');rejects(invoke(args({output:existing})),/existing files/);
  const link=path.join(scratch,'receipt-alias');fs.symlinkSync(candidate,link);rejects(invoke(args({output:path.join(link,'new.json')})),/outside/);
});

test('external build inputs reject instead of broadening the frozen normal build',()=>{
  for(const key of ['INKWAVE_ACCOUNT_BUILD','INKWAVE_NATIVE_STAGE_ASSETS','INKWAVE_BUILD_UNMINIFIED'])rejects(invoke(args(),{[key]:'1'}),/outside this frozen epoch/);
});

test('emitted body change, unknown public output and changed manifest reject',()=>{
  const file=path.join(site,'src/main.js'),original=fs.readFileSync(file);
  try{fs.appendFileSync(file,'\n// mutation\n');rejects(invoke(),/emitted body/);}finally{fs.writeFileSync(file,original);}
  const extra=path.join(site,'injected.md');try{fs.writeFileSync(extra,'unreviewed');rejects(invoke(),/unknown file/);}finally{fs.unlinkSync(extra);}
  const manifest=path.join(site,'inkwave-build.json'),bytes=fs.readFileSync(manifest);
  try{fs.appendFileSync(manifest,'\n');rejects(invoke(),/exact frozen normal build manifest/);}finally{fs.writeFileSync(manifest,bytes);}
});

test('official-event mode binds runner fields to the exact Git pair; local fixture provenance is explicit',()=>{
  const eventFile=path.join(scratch,'event.json'),p=summary.profiles.six;
  const event={number:9000,repository:{full_name:'rhgrive3/actions'},pull_request:{number:9000,
    base:{ref:'main',sha:summary.base.commit,repo:{full_name:'rhgrive3/actions'}},
    head:{sha:p.commit,repo:{full_name:'rhgrive3/actions'}}}};
  fs.writeFileSync(eventFile,JSON.stringify(event));
  const a=changeArg(args(),'--provenance','official-pr-event');
  const e={GITHUB_EVENT_NAME:'pull_request',GITHUB_REPOSITORY:'rhgrive3/actions',GITHUB_EVENT_PATH:eventFile};
  const r=invoke(a,e);assert.equal(r.status,0,r.stderr);assert.match(JSON.parse(r.stdout).event.limitation,/cannot authenticate hosted/);
  rejects(invoke(changeArg(args(),'--provenance','official-pr-event'),{...e,GITHUB_EVENT_NAME:'workflow_dispatch'}),/pull_request/);
  event.pull_request.head.sha='0'.repeat(40);fs.writeFileSync(eventFile,JSON.stringify(event));
  rejects(invoke(changeArg(args(),'--provenance','official-pr-event'),e),/AssertionError/);
});

test('final real CLI still passes after every negative and preserves both complete frozen checkouts',()=>{
  const r=invoke();assert.equal(r.status,0,r.stderr);
  assert.equal(git(base,'rev-parse','HEAD'),summary.base.commit);assert.equal(git(candidate,'rev-parse','HEAD'),summary.profiles.six.commit);
  assert.equal(git(base,'status','--porcelain=v1'),'');assert.equal(git(candidate,'status','--porcelain=v1'),'');
});
