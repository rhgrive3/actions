// Integration tests for this exact private epoch: requires its immutable Git
// objects and the preserved six-way normal site. Never changes original refs.
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {SHEET_V2_EPOCH,INVENTORY_SHA256,sheetV2PinSummary,assertSheetV2Rows} from '../lib/inkwave-sheet-v2-epoch.mjs';
const repo=fileURLToPath(new URL('../..',import.meta.url)),cli=path.join(repo,'scripts/verify-inkwave-sheet-v2-epoch.mjs');
const preservedSite=process.env.SHEET_V2_TEST_SITE||'/workspace/inkwave-sheet-successor-site';
const summary=sheetV2PinSummary(),scratch=fs.mkdtempSync(path.join(os.tmpdir(),'inkwave-sheet-v2-cli-'));
const base=path.join(scratch,'base'),candidate=path.join(scratch,'candidate'),site=path.join(scratch,'site');
const env=()=>({...Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('GIT_')&&!k.startsWith('INKWAVE_')&&!['GH_TOKEN','GITHUB_TOKEN','NODE_OPTIONS'].includes(k))),GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_NO_REPLACE_OBJECTS:'1'});
const git=(root,...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8',env:env(),stdio:['ignore','pipe','pipe'],maxBuffer:16*1024*1024}).trim();
const worktrees=[],receiptFiles=new Set();
after(()=>{
 if(process.env.SHEET_V2_TEST_REPORT){
  const report=process.env.SHEET_V2_TEST_REPORT,folder=report+'.receipts',saved=[];fs.mkdirSync(folder);
  for(const file of receiptFiles)if(file.startsWith(scratch+path.sep)&&fs.existsSync(file)&&fs.lstatSync(file).isFile()&&!fs.lstatSync(file).isSymbolicLink()){
   const destination=path.join(folder,String(saved.length+1)+'.json');fs.copyFileSync(file,destination,fs.constants.COPYFILE_EXCL);saved.push({original:file,saved:destination,sha256:hash(fs.readFileSync(destination))});
  }
  fs.writeFileSync(report,JSON.stringify({verifierSha:git(repo,'rev-parse','HEAD'),calls,preservedReceipts:saved},null,2)+'\n',{flag:'wx'});
 }
 for(const root of worktrees.reverse())git(repo,'worktree','remove','--force',root);fs.rmSync(scratch,{recursive:true,force:true});
});
for(const [root,p]of [[base,summary.base],[candidate,summary.candidate]]) {
  git(repo,'worktree','add','--detach',root,p.commit);worktrees.push(root);
}
fs.cpSync(preservedSite,site,{recursive:true});
const verifierSha=git(repo,'rev-parse','HEAD'),calls=[];
let sequence=0;
const receipt=()=>path.join(scratch,'receipt-'+(++sequence)+'.json');
function args({profile='sheet-birth-successor',baseline=base,subject=candidate,output=receipt(),emitted=site}={}) {
  const p=summary.candidate;
  return ['--epoch',SHEET_V2_EPOCH,'--candidate-profile',profile,'--provenance','local',
    '--baseline',baseline,'--candidate',subject,'--base-sha',summary.base.commit,'--candidate-sha',p.commit,
    '--base-tree',summary.base.tree,'--candidate-tree',p.tree,'--site',emitted,'--receipt',output,'--verifier-sha',verifierSha,'--published-heads','none'];
}
function invoke(argv=args(),environment={},nodeOptions=[]) {
  const output=argv[argv.indexOf('--receipt')+1];receiptFiles.add(output);const before=fs.existsSync(output)&&fs.statSync(output).isFile()?fs.readFileSync(output):null;
  const r=spawnSync(process.execPath,[...nodeOptions,cli,...argv],{encoding:'utf8',env:{...env(),...environment},timeout:120000,maxBuffer:2*1024*1024});
  assert.equal(r.error,undefined,'actual CLI must finish');calls.push({argv,environment,status:r.status,stdoutSha256:hash(r.stdout),stderrSha256:hash(r.stderr),nodeOptions});return {...r,output,before};
}
function rejects(r,pattern) {
  assert.notEqual(r.status,0,r.stdout+'\n'+r.stderr);
  if(pattern)assert.match(r.stderr,pattern);
  if(r.before)assert.deepEqual(fs.readFileSync(r.output),r.before,'failed CLI preserves existing receipt/input');
  else assert.ok(!fs.existsSync(r.output),'failed CLI creates no receipt');
}
function changeArg(argv,flag,value){const out=[...argv];out[out.indexOf(flag)+1]=value;return out;}
const hash=b=>createHash('sha256').update(b).digest('hex');
const archive=fs.readFileSync(path.join(repo,'scripts/fixtures/inkwave-sheet-v2-inventory.json.gz'));
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

test('exact twenty-leaf candidate passes the real CLI with its independent verifier pin',()=>{
  const r=invoke();assert.equal(r.status,0,r.stderr);const proof=JSON.parse(fs.readFileSync(r.output));
  assert.equal(proof.candidateProfile,'sheet-birth-successor');assert.equal(proof.verifier.commit,verifierSha);
  assert.equal(proof.checkouts[0].completeRepositoryLeaves,6254);assert.equal(proof.checkouts[1].completeRepositoryLeaves,7246);
  assert.equal(proof.productionDeltaPaths.length,20);assert.equal(proof.build.inputHash,summary.build.inputHash);
  assert.equal(proof.build.artifacts,2120);assert.deepEqual(proof.writtenSourcePaths,[]);assert.equal(proof.event.mode,'local');
});

test('all independently pinned file rows reject byte/blob/mode mutations; complete lists reject omission/duplication',()=>{
  for(const inventory of [pins.base.files,pins.candidate.files]) {
    for(const row of inventory)for(const key of ['mode','sha','sha256']) {
      assert.throws(()=>assertSheetV2Rows([{...row,[key]:'unreviewed'}],[row]),/pinned/);
    }
    assert.throws(()=>assertSheetV2Rows(inventory.slice(1),inventory),/complete inventory/);
    assert.throws(()=>assertSheetV2Rows([...inventory,inventory[0]],inventory),/complete inventory/);
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
  } finally {restore(candidate,summary.candidate.commit,file);}
});

for(const [root,commit,side]of [[base,summary.base.commit,'base'],[candidate,summary.candidate.commit,'candidate']])
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
  finally{restore(candidate,summary.candidate.commit,file);}
});

test('committed new public input rejects even when caller declares its real new HEAD/tree',()=>{
  const relative='inkwave-public/tests/committed.md',file=path.join(candidate,relative);
  try{
    fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'unreviewed\n');git(candidate,'add','--',relative);
    git(candidate,'-c','user.name=Sixway CLI Fixture','-c','user.email=fixture@example.invalid','commit','--quiet','-m','Disposable negative source');
    rejects(invoke(changeArg(changeArg(args(),'--candidate-sha',git(candidate,'rev-parse','HEAD')),'--candidate-tree',git(candidate,'rev-parse','HEAD^{tree}'))),/fixed epoch commit/);
  }finally{restore(candidate,summary.candidate.commit,file);}
});

test('fixed base/head/tree/profile declarations cannot be substituted or silently inferred',()=>{
  for(const flag of ['--base-sha','--candidate-sha','--base-tree','--candidate-tree'])rejects(invoke(changeArg(args(),flag,'0'.repeat(40))),/fixed epoch/);
  rejects(invoke(changeArg(args(),'--candidate-profile','unknown')),/fixed v2 candidate profile/);
  rejects(invoke(changeArg(args(),'--verifier-sha','0'.repeat(40))),/verifier HEAD/);
  rejects(invoke(changeArg(args(),'--epoch','main-reviewed-special-four-delta-pair')),/separate explicit v2 epoch/);
});

test('ambiguous, missing and unsupported real CLI arguments reject before writing',()=>{
  const a=args();rejects(invoke([...a,'--epoch',SHEET_V2_EPOCH]),/duplicate/);
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
  const eventFile=path.join(scratch,'event.json'),p=summary.candidate;
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

const changedRuntime='patches/splatoon3/runtime/s3-projectile-shapes.mjs';
for(const kind of ['bytes','old-body','mode','missing','physical-symlink','staged-symlink','index-only'])
test(`actual CLI rejects changed twentieth leaf: ${kind}`,()=>{
 const file=path.join(candidate,changedRuntime),sha=git(candidate,'rev-parse','HEAD:'+changedRuntime);
 try {
  if(kind==='bytes')fs.appendFileSync(file,'\n// unknown source\n');
  if(kind==='old-body')fs.writeFileSync(file,execFileSync('git',['-C',repo,'show',summary.base.commit+':'+changedRuntime]));
  if(kind==='mode')fs.chmodSync(file,0o755);
  if(kind==='missing')fs.unlinkSync(file);
  if(kind.includes('symlink')){fs.unlinkSync(file);fs.symlinkSync(path.join(repo,changedRuntime),file);if(kind==='staged-symlink'){git(candidate,'add','--',changedRuntime);assert.match(git(candidate,'ls-files','--stage','--',changedRuntime),/^120000 /);}}
  if(kind==='index-only'){
   const bad=execFileSync('git',['-C',candidate,'hash-object','-w','--stdin'],{input:'unreviewed index\n',encoding:'utf8',env:env()}).trim();
   git(candidate,'update-index','--cacheinfo','100644,'+bad+','+changedRuntime);assert.equal(git(candidate,'hash-object','--',changedRuntime),sha);
  }
  rejects(invoke(),kind==='physical-symlink'?/symlink/:/pinned|complete inventory/);
 }finally{restore(candidate,summary.candidate.commit,file);}
});

test('later QA commit with exactly the same tree is not admitted',()=>{
 try{
  git(candidate,'-c','user.name=V2 Fixture','-c','user.email=fixture@example.invalid','commit','--allow-empty','--quiet','-m','Unreviewed QA successor');
  assert.equal(git(candidate,'rev-parse','HEAD^{tree}'),summary.candidate.tree);
  rejects(invoke(),/actual HEAD/);
  rejects(invoke(changeArg(args(),'--candidate-sha',git(candidate,'rev-parse','HEAD'))),/fixed epoch commit/);
 }finally{restore(candidate,summary.candidate.commit);}
});

test('unmerged index and external clean-index redirection cannot hide index drift',()=>{
 const originalIndex=git(candidate,'rev-parse','--path-format=absolute','--git-path','index'),lure=path.join(scratch,'clean-index');
 fs.copyFileSync(originalIndex,lure);
 try{
  const sha=git(candidate,'rev-parse','HEAD:'+changedRuntime);
  git(candidate,'update-index','--force-remove','--',changedRuntime);
  execFileSync('git',['-C',candidate,'update-index','--index-info'],{input:[1,2,3].map(stage=>`100644 ${sha} ${stage}\t${changedRuntime}\n`).join(''),env:env()});
  rejects(invoke(),/conflict-free/);
  rejects(invoke(args(),{GIT_INDEX_FILE:lure,GIT_DIR:path.join(base,'.git'),GIT_WORK_TREE:base}),/conflict-free/);
 }finally{restore(candidate,summary.candidate.commit);}
 const r=invoke(args(),{GIT_INDEX_FILE:lure,GIT_DIR:path.join(base,'.git'),GIT_WORK_TREE:base});
 assert.equal(r.status,0,r.stderr);
});

test('kernel exclusive create preserves a competing receipt appearing after validation',()=>{
 const output=receipt(),preload=path.join(scratch,'race-writer.mjs'),marker='competing successful receipt\n';
 fs.writeFileSync(preload,`import fs from 'node:fs';\nconst native=fs.openSync,target=${JSON.stringify(output)};let fired=false;\nfs.openSync=function(file,flags,...rest){if(!fired&&file===target&&typeof flags==='number'&&(flags&fs.constants.O_EXCL)){fired=true;fs.writeFileSync(target,${JSON.stringify(marker)},{flag:'wx'});}return native.call(this,file,flags,...rest);};\n`);
 const r=invoke(args({output}),{},['--import',preload]);
 assert.notEqual(r.status,0);assert.match(r.stderr,/EEXIST/);assert.equal(fs.readFileSync(output,'utf8'),marker);
});

test('two concurrent real CLIs create exactly one receipt and preserve the winner',async()=>{
 const output=receipt(),argv=args({output});receiptFiles.add(output);
 async function launch(){return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[cli,...argv],{env:env(),stdio:['ignore','pipe','pipe']});let stdout='',stderr='';
  child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);child.on('error',reject);
  child.on('exit',status=>{calls.push({argv,environment:{},status,stdoutSha256:hash(stdout),stderrSha256:hash(stderr),concurrent:true});resolve({status,stdout,stderr});});
 });}
 const runs=await Promise.all([launch(),launch()]);assert.deepEqual(runs.map(r=>r.status).sort(),[0,1]);
 const winner=fs.readFileSync(output),proof=JSON.parse(winner);assert.equal(proof.verifier.commit,verifierSha);assert.equal(proof.checkouts[1].commit,summary.candidate.commit);
 rejects(invoke(args({output})),/existing files/);assert.deepEqual(fs.readFileSync(output),winner);
});

test('controller push requires exact event, external verifier and both live-ref observations',()=>{
 const controller='1'.repeat(40),candidateRef='refs/heads/inkwave/integration-sheet-birth-v2-20261023',controllerRef='refs/heads/inkwave/sheet-v2-verification-controller-20261023';
 const eventFile=path.join(scratch,'controller-event.json'),bindingFile=path.join(scratch,'published-heads.json');
 const event={repository:{full_name:'rhgrive3/actions'},ref:controllerRef,deleted:false,after:controller,head_commit:{id:controller}};
 const row=phase=>({phase,fetchedAt:'2026-10-23T20:00:00Z',main:{ref:'refs/heads/main',object:{type:'commit',sha:summary.base.commit}},candidate:{ref:candidateRef,object:{type:'commit',sha:summary.candidate.commit}}});
 const binding={schema:1,repository:'rhgrive3/actions',baseRef:'refs/heads/main',candidateRef,verifierSha,controllerSha:controller,runId:'123456',before:row('before'),after:row('after')};
 const environment={GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'push',GITHUB_REPOSITORY:'rhgrive3/actions',GITHUB_REF:controllerRef,GITHUB_SHA:controller,GITHUB_RUN_ID:'123456',GITHUB_EVENT_PATH:eventFile};
 const argv=()=>changeArg(changeArg(args(),'--provenance','controller-push'),'--published-heads',bindingFile);
 const write=(e=event,b=binding)=>{fs.writeFileSync(eventFile,JSON.stringify(e));fs.writeFileSync(bindingFile,JSON.stringify(b));};
 write();const positive=invoke(argv(),environment);assert.equal(positive.status,0,positive.stderr);assert.equal(JSON.parse(positive.stdout).event.controllerSha,controller);
 for(const [key,value]of [['GITHUB_EVENT_NAME','pull_request'],['GITHUB_REPOSITORY','unknown/repo'],['GITHUB_REF',candidateRef],['GITHUB_SHA','2'.repeat(40)],['GITHUB_RUN_ID','999']])rejects(invoke(argv(),{...environment,[key]:value}),/AssertionError/);
 const mutations=[b=>b.after.candidate.object.sha='0'.repeat(40),b=>b.before.candidate.object.sha='0'.repeat(40),b=>b.after.main.object.sha='0'.repeat(40),b=>b.verifierSha='0'.repeat(40),b=>delete b.after,b=>b.after.candidate.ref=candidateRef+'-later',b=>b.controllerSha='2'.repeat(40)];
 for(const mutate of mutations){const b=structuredClone(binding);mutate(b);write(event,b);rejects(invoke(argv(),environment),/AssertionError/);}
 write({...event,after:'2'.repeat(40)});rejects(invoke(argv(),environment),/AssertionError/);
 write();rejects(invoke(changeArg(argv(),'--published-heads','none'),environment),/ENOENT/);
});

test('final real CLI still passes after every negative and preserves both complete frozen checkouts',()=>{
  const r=invoke();assert.equal(r.status,0,r.stderr);
  assert.equal(git(base,'rev-parse','HEAD'),summary.base.commit);assert.equal(git(candidate,'rev-parse','HEAD'),summary.candidate.commit);
  assert.equal(git(base,'status','--porcelain=v1'),'');assert.equal(git(candidate,'status','--porcelain=v1'),'');
});
