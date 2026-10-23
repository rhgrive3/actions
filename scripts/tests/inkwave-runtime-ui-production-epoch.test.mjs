import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync,spawnSync} from 'node:child_process';
import {MAIN26A4_SHA,main26a4Inventory,assertMain26a4Rows,readMain26a4GitTree,scanMain26a4Production} from '../lib/inkwave-main26a4-production-epoch.mjs';
import {RUNTIME_UI_MODE,runtimeUIInventory,assertRuntimeUIRows,assertRuntimeUIContract} from '../lib/inkwave-runtime-ui-production-epoch.mjs';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const rows=runtimeUIInventory(),base=main26a4Inventory();
const contract={mode:RUNTIME_UI_MODE,sourceBase:MAIN26A4_SHA,sourceHead:'a'.repeat(40),baseSha:MAIN26A4_SHA,candidateSha:'a'.repeat(40)};
const ownerClockPath='patches/network-replication/owner-clock.mjs';
const cataloguePath='patches/splatoon3/runtime/catalogue.mjs';
const cataloguePin={sha:'7fae1d7138ad68b45e0c2f88a3af93367d1575a8',sha256:'25dc604015b5e88bc5e015a299fbb2430ba14ffa2f0c253e3bbc68773e51ec50'};
const oldDeltaPaths=['inkwave-public/src/world/level.js','patches/local-quality/collision-hotpath-adapter.mjs','patches/local-quality/gyro.mjs','patches/local-quality/static-menu-adapter.mjs'];
const clockPins={
 "inkwave-public/src/net/transport.js": {
  "sha": "1fbd79cfe58681901b7d5581d4db984c7c581761",
  "sha256": "8e90e02226f617e70cd0eee96295b2d7c02aa37cb4768064bd00a863f4bf666e"
 },
 "patches/network-replication/adapter.mjs": {
  "sha": "e2acb3f6f9a466414cb77dbe93187303717fbfda",
  "sha256": "03798102743610bb1643caa327fdb4dee9b4bf7a587674fe44b5ada1b6f36645"
 },
 "patches/network-replication/snapshot-guard.mjs": {
  "sha": "39f05e1aecb0b76d9e41ae5a077f2042c6c46b06",
  "sha256": "e3724ac1014550bebeda6287e4c74087610ccbcf93f5803db40950409d7a96e5"
 },
 "patches/network-replication/owner-clock.mjs": {
  "sha": "8ab2f9b395d80c59120d064f7e2c1093ccf04879",
  "sha256": "2225aad527fec32d60b92044d2abc1218c92ca3d608364beaf40be0f6d453e97"
 }
};
const changedPaths=[...oldDeltaPaths,...Object.keys(clockPins),cataloguePath].sort();
const baseByPath=new Map(base.map(row=>[row.path,row]));
test('exact nine reviewed deltas: eight replacements and only owner clock added; other1383 pinned',()=>{
 assert.equal(base.length,1391);assert.equal(rows.length,1392);assertRuntimeUIRows(rows);assertMain26a4Rows(base);
 assert.deepEqual(rows.filter(row=>row.sha!==baseByPath.get(row.path)?.sha).map(row=>row.path),changedPaths);
 assert.deepEqual(rows.filter(row=>!baseByPath.has(row.path)).map(row=>row.path),[ownerClockPath]);
 assert.equal(rows.filter(row=>row.sha===baseByPath.get(row.path)?.sha).length,1383);
 for(const [relative,pins] of Object.entries(clockPins))assert.deepEqual(rows.find(row=>row.path===relative),{path:relative,mode:'100644',...pins});
 assert.deepEqual(rows.find(row=>row.path===cataloguePath),{path:cataloguePath,mode:'100644',...cataloguePin});
 assert.throws(()=>assertMain26a4Rows(rows));assert.throws(()=>assertRuntimeUIRows(base));
 assert.equal(base.find(row=>row.path==='scripts/build-inkwave.mjs').sha,'17d59758049518a6e5c93f50e1f3a0614e7c6ee4');
 assert.equal(createHash('sha256').update(fs.readFileSync(path.join(repo,'scripts/fixtures/inkwave-main26a4-production-epoch.json.gz'))).digest('hex'),'a24db4a8ea3ee3da710df533b26cefe3f981f19238f57aa5139972b7ccc220d4');
});
test('previous four/eight-delta and every partially reverted or altered reviewed delta reject',()=>{
 const oldRows=base.map(row=>oldDeltaPaths.includes(row.path)?rows.find(x=>x.path===row.path):row);
 assert.throws(()=>assertRuntimeUIRows(oldRows));
 const previousEight=rows.map(row=>row.path===cataloguePath?baseByPath.get(cataloguePath):row);
 assert.throws(()=>assertRuntimeUIRows(previousEight),'previous eight-delta epoch must not self-authorize catalogue adoption');
 for(const relative of changedPaths){
  const original=baseByPath.get(relative);
  const mixed=original?rows.map(row=>row.path===relative?original:row):rows.filter(row=>row.path!==relative);
  assert.throws(()=>assertRuntimeUIRows(mixed),relative+' must not admit old/new mixture');
  for(const key of ['mode','sha','sha256']){
   const changed=rows.map(row=>row.path===relative?{...row,[key]:'unreviewed'}:row);
   assert.throws(()=>assertRuntimeUIRows(changed),relative+': '+key);
   if(key!=='sha256')assert.throws(()=>assertRuntimeUIRows(changed,false),relative+': Git '+key);
  }
 }
});
test('owner clock missing, renamed, duplicated, unknown-added and executable variants reject',()=>{
 const clock=rows.find(row=>row.path===ownerClockPath);
 for(const changed of [rows.filter(row=>row.path!==ownerClockPath),rows.map(row=>row.path===ownerClockPath?{...row,path:'patches/network-replication/owner-clock-other.mjs'}:row),[...rows,clock],[...rows,{...clock,path:'patches/network-replication/unreviewed-clock.mjs'}],rows.map(row=>row.path===ownerClockPath?{...row,mode:'100755'}:row)])assert.throws(()=>assertRuntimeUIRows(changed));
 const copy=runtimeUIInventory();copy.find(row=>row.path===ownerClockPath).sha='0'.repeat(40);
 assertRuntimeUIRows(runtimeUIInventory());assertMain26a4Rows(main26a4Inventory());
});
for(const relative of [ownerClockPath,cataloguePath]) test('actual '+relative+' drift cannot hide behind unchanged real Git HEAD (focused scanner fixture)',()=>{
 // Other inventory rows below are validator metadata, not a claimed full
 // production checkout; these fixtures exercise actual clock/catalogue bytes and Git.
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'runtime-ui-pinned-source-'));
 const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8',env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'}}).trim();
 const file=path.join(root,relative),pinned=rows.find(row=>row.path===relative);
 const project=()=>scanMain26a4Production(root).find(row=>row.path===relative);
 try{
  for(const dir of ['inkwave-public','patches/splatoon3','patches/touch-layout','patches/reliability','patches/local-quality','patches/network-replication','patches/practice-range','patches/native-stages','patches/loading-cache'])fs.mkdirSync(path.join(root,dir),{recursive:true});
  for(const row of base.filter(row=>row.path.startsWith('scripts/'))){const f=path.join(root,row.path);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,'focused scanner fixture, not production');}
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,fs.readFileSync(path.join(repo,relative)));
  git('init','--quiet');git('add','.');git('-c','user.name=QA test','-c','user.email=qa@example.invalid','commit','--quiet','-m','focused clock source fixture');
  const head=git('rev-parse','HEAD');
  assert.equal(readMain26a4GitTree(root,head).entries.find(row=>row.path===relative).sha,pinned.sha);
  assert.deepEqual(project(),pinned);
  fs.appendFileSync(file,'\n// unreviewed source drift\n');
  assert.equal(readMain26a4GitTree(root,head).head,head);
  const changed=project();assert.notEqual(changed.sha,pinned.sha);assert.throws(()=>assertRuntimeUIRows(rows.map(row=>row.path===relative?changed:row)));
  fs.unlinkSync(file);assert.equal(project(),undefined);assert.throws(()=>assertRuntimeUIRows(rows.filter(row=>row.path!==relative)));
  const unknown='patches/network-replication/unreviewed-clock.mjs';fs.writeFileSync(path.join(root,unknown),'unreviewed');
  const extra=scanMain26a4Production(root).find(row=>row.path===unknown);assert.ok(extra);assert.throws(()=>assertRuntimeUIRows([...rows,extra]));
  assert.throws(()=>readMain26a4GitTree(root,MAIN26A4_SHA),/actual HEAD/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('every leaf rejects independent drift; missing extra duplicate mode and blob fail closed',()=>{
 for(let i=0;i<rows.length;i++){const x=[...rows];x[i]={...x[i],sha256:'0'.repeat(64)};assert.throws(()=>assertRuntimeUIRows(x));}
 for(const x of [rows.slice(1),[...rows,rows[0]],[...rows,{...rows[0],path:'inkwave-public/unreviewed.js'}]])assert.throws(()=>assertRuntimeUIRows(x));
 for(const key of ['mode','sha']){const x=[...rows];x[0]={...x[0],[key]:'bad'};assert.throws(()=>assertRuntimeUIRows(x,false));}
});
test('source epoch is actual candidate commit, never old sourceSHA or an unbound label',()=>{
 assertRuntimeUIContract(contract);
 for(const x of [{sourceHead:MAIN26A4_SHA},{candidateSha:MAIN26A4_SHA,sourceHead:MAIN26A4_SHA},{mode:'main26a4-byte-identical-production-epoch'},{sourceBase:'b'.repeat(40)},{baseSha:'b'.repeat(40)},{candidateSha:'main'},{sourceHead:undefined}])assert.throws(()=>assertRuntimeUIContract({...contract,...x}));
});
test('real CLI dispatch reaches new fail-closed contract, never historical planners',()=>{
 for(const script of ['prepare-inkwave-projectile-baseline.mjs','check-inkwave-current-pair-controls.mjs']){
  const result=spawnSync(process.execPath,[path.join(repo,'scripts',script),'--baseline',repo,'--candidate',repo,'--receipt','/unused-receipt','--base-sha',MAIN26A4_SHA,'--candidate-sha',contract.candidateSha,'--expected-mode',RUNTIME_UI_MODE,'--expected-source-base',MAIN26A4_SHA,'--expected-source-head',MAIN26A4_SHA],{encoding:'utf8'});
  assert.notEqual(result.status,0);assert.match(result.stderr,/candidate source epoch must be its actual declared Git HEAD/);
 }
});
test('actual shell routes accept only exact own-repo main26a4 acceptance branch and bind current SHA',()=>{
 const workflow=fs.readFileSync(path.join(repo,'.github/workflows/inkwave-projectile-visuals.yml'),'utf8');
 const lines=workflow.split('\n');
 const routes=lines.flatMap((line,i)=>line.includes('elif ')&&line.includes('inkwave/runtime-ui-acceptance-20261022')?[{condition:line.trim().slice(5,-6),command:lines[i+1].trim()}]:[]);
 assert.equal(routes.length,2);
 const env={...process.env,PAIR_EVENT_NAME:'pull_request',PAIR_BASE_REF:'main',DECLARED_BASE_SHA:MAIN26A4_SHA,DECLARED_HEAD_SHA:contract.candidateSha,PAIR_REPOSITORY:'rhgrive3/actions',PAIR_HEAD_REPO:'rhgrive3/actions',PAIR_HEAD_REF:'inkwave/runtime-ui-acceptance-20261022'};
 for(const {condition,command} of routes){
  const evaluate=changes=>execFileSync('bash',['-c',`if ${condition}; then printf yes; else printf no; fi`],{env:{...env,...changes},encoding:'utf8'});
  assert.equal(evaluate({}),'yes');
  for(const changes of [{PAIR_EVENT_NAME:'workflow_dispatch'},{PAIR_BASE_REF:'other'},{DECLARED_BASE_SHA:'b'.repeat(40)},{PAIR_REPOSITORY:'fork/actions',PAIR_HEAD_REPO:'fork/actions'},{PAIR_HEAD_REPO:'fork/actions'},{PAIR_HEAD_REF:env.PAIR_HEAD_REF+'-other'},{PAIR_HEAD_REF:env.PAIR_HEAD_REF.toUpperCase()}])assert.equal(evaluate(changes),'no');
  assert.ok(command.includes('--expected-source-head "$DECLARED_HEAD_SHA"'));
  assert.ok(command.includes('--expected-mode '+RUNTIME_UI_MODE));
 }
 for(const f of ['scripts/lib/inkwave-runtime-ui-production-epoch.mjs','scripts/tests/inkwave-runtime-ui-production-epoch.test.mjs'])assert.ok(workflow.includes("      - '"+f+"'"));
});
