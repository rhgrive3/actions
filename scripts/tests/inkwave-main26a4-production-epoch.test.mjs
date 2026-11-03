import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {MAIN26A4_MODE, MAIN26A4_SHA, main26a4Inventory, assertMain26a4Rows, assertMain26a4Contract, readMain26a4GitTree, scanMain26a4Production} from '../lib/inkwave-main26a4-production-epoch.mjs';
const rows = main26a4Inventory();
const contract = {mode:MAIN26A4_MODE,sourceBase:MAIN26A4_SHA,sourceHead:MAIN26A4_SHA,baseSha:MAIN26A4_SHA,candidateSha:'a'.repeat(40)};
test('pinned inventory has1362 canonical inputs plus stricter1391 production superset, including builder',()=>{
 assert.equal(rows.length,1391);assert.equal(new Set(rows.map(x=>x.path)).size,1391);assertMain26a4Rows(rows);
 assert.equal(rows.find(x=>x.path==='scripts/build-inkwave.mjs').sha,'17d59758049518a6e5c93f50e1f3a0614e7c6ee4');
 for(const name of ['catalog-source-launch','catalog-flick-damage','catalog-depletion'])assert.ok(rows.some(x=>x.path===`patches/splatoon3/runtime/${name}.mjs`));
});
test('every production leaf rejects byte drift independently, including new catalog dependencies',()=>{
 for(let i=0;i<rows.length;i++){const changed=[...rows];changed[i]={...rows[i],sha256:'0'.repeat(64)};assert.throws(()=>assertMain26a4Rows(changed),/source SHA256/);}
});
test('missing, extra, duplicate, changed Git blob and changed file mode fail closed',()=>{
 for(const changed of [rows.slice(1),rows.slice(0,-1),[...rows,{...rows[0],path:'inkwave-public/new-production.js'}],[...rows,rows[0]]])assert.throws(()=>assertMain26a4Rows(changed),/inventory/);
 for(const [key,value] of [['sha','0'.repeat(40)],['mode','120000']]){const changed=[...rows];changed[0]={...rows[0],[key]:value};assert.throws(()=>assertMain26a4Rows(changed));}
});
test('new source epoch and actual immutable checkout declarations are distinct and mandatory',()=>{
 assertMain26a4Contract(contract);
 for(const changed of [{mode:'queue1801-byte-identical-paint-source-epoch'},{mode:'unknown'},{sourceBase:'b'.repeat(40)},{sourceHead:contract.candidateSha},{baseSha:contract.candidateSha},{candidateSha:'main'},{candidateSha:undefined}])assert.throws(()=>assertMain26a4Contract({...contract,...changed}));
});
test('actual Git HEAD binding uses real temporary commits, never a mocked declared head',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'main26a4-git-binding-'));
 const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8',env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'}}).trim();
 try{
  git('init','--quiet');fs.writeFileSync(path.join(root,'fixture.txt'),'unit fixture, not production');git('add','fixture.txt');git('-c','user.name=QA test','-c','user.email=qa@example.invalid','commit','--quiet','-m','unit fixture');
  const head=git('rev-parse','HEAD');assert.equal(readMain26a4GitTree(root,head).head,head);
  assert.throws(()=>readMain26a4GitTree(root,MAIN26A4_SHA),/actual HEAD/);
  fs.mkdirSync(path.join(root,'nested'));assert.throws(()=>readMain26a4GitTree(path.join(root,'nested'),head),/actual Git worktree/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('filesystem scanner rejects symlink sources rather than following outside the worktree',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'main26a4-symlink-'));
 try{fs.symlinkSync(os.tmpdir(),path.join(root,'inkwave-public'));assert.throws(()=>scanMain26a4Production(root),/no source symlinks/);}finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('filesystem enumeration observes actual changed, missing and extra inputs while excluding QA tests',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'main26a4-scan-'));
 try{
  const roots=['inkwave-public','patches/splatoon3','patches/touch-layout','patches/reliability','patches/local-quality','patches/network-replication','patches/practice-range','patches/native-stages','patches/loading-cache'];
  for(const directory of roots)fs.mkdirSync(path.join(root,directory),{recursive:true});
  for(const row of rows.filter(x=>x.path.startsWith('scripts/'))){const file=path.join(root,row.path);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'test scanner fixture, not admitted production');}
  const relative='patches/splatoon3/runtime/unit-source.mjs',file=path.join(root,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'one');
  const first=scanMain26a4Production(root);fs.writeFileSync(file,'two');assert.notEqual(scanMain26a4Production(root).find(x=>x.path===relative).sha,first.find(x=>x.path===relative).sha);
  fs.unlinkSync(file);assert.equal(scanMain26a4Production(root).some(x=>x.path===relative),false);
  const added='inkwave-public/new-input.js';fs.writeFileSync(path.join(root,added),'new');assert.ok(scanMain26a4Production(root).some(x=>x.path===added));
  fs.mkdirSync(path.join(root,'patches/splatoon3/tests'));fs.writeFileSync(path.join(root,'patches/splatoon3/tests/qa.mjs'),'QA-only');assert.ok(!scanMain26a4Production(root).some(x=>x.path.includes('/tests/')));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
test('both actual CLI entrypoints dispatch only the explicit new mode after strict parsing',()=>{
 for(const file of ['check-inkwave-current-pair-controls.mjs','prepare-inkwave-projectile-baseline.mjs']){
  const source=fs.readFileSync(path.join(repo,'scripts',file),'utf8');
  assert.ok(source.indexOf('const options = parseSourceAdmissionArgs(')<source.indexOf("if (options.get('--expected-mode') === '"+MAIN26A4_MODE+"')"));
  assert.ok(source.indexOf('await runMain26a4AdmissionCLI(')<source.indexOf('const selectedPaths = paintSourcePaths('));
  assert.match(source,/await runMain26a4AdmissionCLI\(options, '(?:controls|prepare)'\);\n  process.exit\(0\);/);
 }
});
