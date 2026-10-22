import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFileSync,spawnSync} from 'node:child_process';
import {MAIN26A4_SHA,main26a4Inventory,assertMain26a4Rows} from '../lib/inkwave-main26a4-production-epoch.mjs';
import {RUNTIME_UI_MODE,runtimeUIInventory,assertRuntimeUIRows,assertRuntimeUIContract} from '../lib/inkwave-runtime-ui-production-epoch.mjs';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const rows=runtimeUIInventory(),base=main26a4Inventory();
const contract={mode:RUNTIME_UI_MODE,sourceBase:MAIN26A4_SHA,sourceHead:'a'.repeat(40),baseSha:MAIN26A4_SHA,candidateSha:'a'.repeat(40)};
test('exact four published production deltas, all other1387 pinned; old mode remains rejecting',()=>{
 assert.equal(rows.length,1391);assertRuntimeUIRows(rows);assertMain26a4Rows(base);
 assert.deepEqual(rows.filter((x,i)=>x.sha!==base[i].sha).map(x=>x.path).sort(),['inkwave-public/src/world/level.js','patches/local-quality/collision-hotpath-adapter.mjs','patches/local-quality/gyro.mjs','patches/local-quality/static-menu-adapter.mjs']);
 assert.throws(()=>assertMain26a4Rows(rows));assert.throws(()=>assertRuntimeUIRows(base));
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
