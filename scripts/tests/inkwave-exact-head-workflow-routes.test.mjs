import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root = new URL('../../', import.meta.url);
const projectile = fs.readFileSync(new URL('.github/workflows/inkwave-projectile-visuals.yml', root), 'utf8');
const relay = fs.readFileSync(new URL('.github/workflows/inkwave-relay-security.yml', root), 'utf8');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-route-'));
// Stubs exercise workflow shell routing only, not Git identity/source admission itself.
fs.writeFileSync(path.join(tmp, 'git'), '#!/bin/sh\nprintf "%s\\n" "$ACTUAL_SHA"\n', {mode:0o755});
fs.writeFileSync(path.join(tmp, 'node'), '#!/bin/sh\nprintf "%s\\n" "$@"\nexit "${NODE_STATUS:-0}"\n', {mode:0o755});
process.on('exit', () => fs.rmSync(tmp, {recursive:true, force:true}));
const H='1'.repeat(40), B='2'.repeat(40), E='3'.repeat(40);
function step(name) {
  const marker=`      - name: ${name}\n`;
  const start=projectile.indexOf(marker); assert.notEqual(start,-1);
  return projectile.slice(start+marker.length).split(/\n      - /)[0];
}
function shell(name, overrides={}) {
  const body=step(name).split('        run: |\n')[1]; assert.ok(body);
  return spawnSync('bash',['--noprofile','--norc','-eo','pipefail','-c',body.split('\n').map(l=>l.replace(/^          /,'')).join('\n')],{
    encoding:'utf8',env:{...process.env,PATH:`${tmp}:${process.env.PATH}`,ACTUAL_SHA:H,EXPECTED_SOURCE_SHA:H,
      PAIR_EVENT_NAME:'workflow_dispatch',DISPATCH_BASE_SHA:B,DISPATCH_HEAD_SHA:H,DISPATCH_MODE:'maina350-byte-identical-paint-source-epoch',
      DISPATCH_SOURCE_BASE:E,DISPATCH_SOURCE_HEAD:E,DECLARED_BASE_SHA:B,DECLARED_HEAD_SHA:H,INKWAVE_REFERENCE_ROOT:'.ci-baseline',...overrides}});
}
test('the subsequent weapon batch binds actual Git commits to its exact integrated-main source pair',()=>{
 const names=['Bind reviewed source controls to declared immutable Git source leaves','Replay reviewed Roller births, pool reset and pinned paint in the main reference'];
 const valid={PAIR_EVENT_NAME:'pull_request',PAIR_BASE_REF:'main',PAIR_HEAD_REF:'fix/stringer-splatana-review-20261023',PAIR_REPOSITORY:'rhgrive3/actions',PAIR_HEAD_REPO:'rhgrive3/actions'};
 for(const name of names){
  const result=shell(name,valid);assert.equal(result.status,0,result.stderr);
  for(const [flag,value] of [['--base-sha',B],['--candidate-sha',H],['--expected-mode','current-pair-with-gameplay-differences'],['--expected-source-base','83403aaab0043633f1ad1c963068cd0566c5b6fc'],['--expected-source-head','c9218d19b98a3bc63c9266738e1d67a64d9d1ff0']])assert.ok(result.stdout.includes(`${flag}\n${value}\n`));
  for(const override of [{PAIR_BASE_REF:'other'},{PAIR_HEAD_REPO:'outside/actions'},{PAIR_REPOSITORY:''},{PAIR_HEAD_REF:valid.PAIR_HEAD_REF+'-other'}])
   assert.ok(!shell(name,{...valid,...override}).stdout.includes('c9218d19b98a3bc63c9266738e1d67a64d9d1ff0'));
  assert.notEqual(shell(name,{...valid,NODE_STATUS:'7'}).status,0);
 }
});
test('relay dispatch retains checkout and both regression suites',()=>{
 assert.match(relay,/on:\n  workflow_dispatch:\n/);
 assert.match(relay,/test "\$actual_source_sha" = "\$EXPECTED_SOURCE_SHA"/);
 assert.match(relay,/node --test server\/tests\/\*\.test\.mjs/);
 assert.match(relay,/node --experimental-vm-modules --test patches\/reliability\/tests\/relay-compatibility.test.mjs/);
});
test('dispatch has five required explicit inputs and no mutable baseline fallback',()=>{
 const inputSection=projectile.split('  workflow_dispatch:\n')[1].split('\npermissions:')[0];
 for(const name of ['base_sha','candidate_sha','expected_mode','expected_source_base','expected_source_head'])
   assert.match(inputSection,new RegExp(`      ${name}:\\n        description: [^\\n]+\\n        required: true\\n        type: string`));
 assert.doesNotMatch(projectile,/\|\| 'main'/);
 assert.match(step('Bind reviewed source controls to declared immutable Git source leaves'),/matrix.side == 'before' && \(github.event_name == 'workflow_dispatch' \|\|/);
});
test('frozen dispatch candidate accepts complete identities',()=>assert.equal(shell('Verify immutable candidate and dispatch pair').status,0));
for(const key of ['DISPATCH_BASE_SHA','DISPATCH_HEAD_SHA','DISPATCH_SOURCE_BASE','DISPATCH_SOURCE_HEAD']){
 test(`reject missing or mutable ${key}`,()=>{
  for(const bad of ['', 'main', 'a'.repeat(39), 'A'.repeat(40), '$(touch BAD)'])
   assert.notEqual(shell('Verify immutable candidate and dispatch pair',{[key]:bad}).status,0);
 });
}
test('reject candidate mismatch and invalid mode',()=>{
 for(const env of [{ACTUAL_SHA:B},{DISPATCH_HEAD_SHA:B},{DISPATCH_MODE:''},{DISPATCH_MODE:'x; echo unsafe'}])
  assert.notEqual(shell('Verify immutable candidate and dispatch pair',env).status,0);
});
test('baseline identity fails closed',()=>{
 for(const actual of [B,H]) assert.equal(shell('Verify immutable baseline checkout before any alignment',{EXPECTED_BASE_SHA:B,ACTUAL_SHA:actual}).status,actual===B?0:1);
 assert.notEqual(shell('Verify immutable baseline checkout before any alignment',{EXPECTED_BASE_SHA:'main'}).status,0);
});
test('dispatch both controls and preparation receive all five immutable assertions',()=>{
 for(const name of ['Bind reviewed source controls to declared immutable Git source leaves','Replay reviewed Roller births, pool reset and pinned paint in the main reference']){
  const result=shell(name); assert.equal(result.status,0,result.stderr);
  for(const [flag,value] of [['--base-sha',B],['--candidate-sha',H],['--expected-mode','maina350-byte-identical-paint-source-epoch'],['--expected-source-base',E],['--expected-source-head',E]])
   assert.ok(result.stdout.includes(`${flag}\n${value}\n`),`${name}: ${flag}`);
 }
});
test('existing reviewed integration PR remains bound to fixed a350 source epoch',()=>{
 for(const name of ['Bind reviewed source controls to declared immutable Git source leaves','Replay reviewed Roller births, pool reset and pinned paint in the main reference']){
  const result=shell(name,{PAIR_EVENT_NAME:'pull_request',PAIR_BASE_REF:'main',PAIR_HEAD_REF:'inkwave/runtime-main-a350-integration-20261022'});
  assert.equal(result.status,0,result.stderr);assert.ok(result.stdout.includes('a350b6b89e4cb86abe37273db6315c74085f8ac5'));
  assert.ok(!result.stdout.includes(E));
 }
});
test('comparison retains complete and synthetic gates plus checkout identity',()=>{
 assert.equal(shell('Verify immutable comparison checkout').status,0);
 assert.notEqual(shell('Verify immutable comparison checkout',{ACTUAL_SHA:B}).status,0);
 assert.match(projectile,/compare-inkwave-projectile-captures.py .* --require-complete/);
 assert.match(projectile,/inkwave-projectile-captures-synthetic.py --before/);
 assert.match(projectile,/side: \[before, after\]/);
});

test('rejected dispatch admission or preparation fails the step without legacy fallback',()=>{
 for(const name of ['Bind reviewed source controls to declared immutable Git source leaves','Replay reviewed Roller births, pool reset and pinned paint in the main reference']){
  const result=shell(name,{NODE_STATUS:'7'}); assert.equal(result.status,7);
  assert.equal(result.stdout.split('--receipt').length-1,1);
 }
});

test('queue1801 dispatch preserves checkout SHA versus reviewed source-epoch distinction',()=>{
 const base='28d2c888704d32304d1c938c51d7d2d230eddbbd';
 const head='144923aefc282a588225ac44de3da95762653add';
 const sourceHead='df83a5c4265a9c8738d930dabaffb43cd31ae902';
 const env={EXPECTED_SOURCE_SHA:head,ACTUAL_SHA:head,DISPATCH_BASE_SHA:base,DISPATCH_HEAD_SHA:head,
   DECLARED_BASE_SHA:base,DECLARED_HEAD_SHA:head,DISPATCH_MODE:'queue1801-reviewed-paint-source-pair',DISPATCH_SOURCE_BASE:base,DISPATCH_SOURCE_HEAD:sourceHead};
 assert.equal(shell('Verify immutable candidate and dispatch pair',env).status,0);
 assert.notEqual(shell('Verify immutable candidate and dispatch pair',{...env,DISPATCH_HEAD_SHA:sourceHead}).status,0);
 for(const name of ['Bind reviewed source controls to declared immutable Git source leaves','Replay reviewed Roller births, pool reset and pinned paint in the main reference']){
  const result=shell(name,env);assert.equal(result.status,0,result.stderr);
  for(const [flag,value] of [['--base-sha',base],['--candidate-sha',head],['--expected-mode',env.DISPATCH_MODE],['--expected-source-base',base],['--expected-source-head',sourceHead]])
   assert.ok(result.stdout.includes(`${flag}\n${value}\n`));
 }
});
test('queue-30 PR retains exact admission/preparation branch and all new regression triggers',()=>{
 for(const name of ['Bind reviewed source controls to declared immutable Git source leaves','Replay reviewed Roller births, pool reset and pinned paint in the main reference']){
  const result=shell(name,{PAIR_EVENT_NAME:'pull_request',PAIR_BASE_REF:'main',PAIR_HEAD_REF:'fix/queue-30-recovery-20261022'});
  assert.equal(result.status,0,result.stderr);
  assert.ok(result.stdout.includes('--expected-mode\nqueue1801-reviewed-paint-source-pair\n'));
  assert.ok(result.stdout.includes('--expected-source-base\n28d2c888704d32304d1c938c51d7d2d230eddbbd\n'));
  assert.ok(result.stdout.includes('--expected-source-head\ndf83a5c4265a9c8738d930dabaffb43cd31ae902\n'));
 }
 assert.match(step('Bind reviewed source controls to declared immutable Git source leaves'),/github.head_ref == 'fix\/queue-30-recovery-20261022'/);
 assert.match(projectile,/      - 'scripts\/tests\/inkwave-queue1801-source-pairs.test.mjs'/);
 assert.match(projectile,/      - 'scripts\/fixtures\/inkwave-queue1801-source-pairs.json.gz'/);
 assert.match(step('Native visual, source-value and gameplay regressions'),/node --test .*scripts\/tests\/inkwave-queue1801-source-pairs.test.mjs/);
 assert.doesNotMatch(projectile,/^(?:<<<<<<<|=======|>>>>>>>)/m);
});

test('only owned same-repository main PR selects queue1801 identity route',()=>{
 const env={PAIR_EVENT_NAME:'pull_request',PAIR_BASE_REF:'main',PAIR_HEAD_REF:'inkwave/exact-head-ci-main144-20261022',PAIR_HEAD_REPO:'rhgrive3/actions',PAIR_REPOSITORY:'rhgrive3/actions'};
 for(const name of ['Bind reviewed source controls to declared immutable Git source leaves','Replay reviewed Roller births, pool reset and pinned paint in the main reference']){
  for(const override of [{},{PAIR_HEAD_REPO:'fork/actions'},{PAIR_REPOSITORY:''},{PAIR_BASE_REF:'other'},{PAIR_HEAD_REF:'other'}]){
   const r=shell(name,{...env,...override});assert.equal(r.status,0,r.stderr);
   assert.equal(r.stdout.includes('--expected-mode\nqueue1801-byte-identical-paint-source-epoch\n'),Object.keys(override).length===0);
   if(!Object.keys(override).length){assert.ok(r.stdout.includes(`--base-sha\n${B}\n`));assert.ok(r.stdout.includes(`--candidate-sha\n${H}\n`));assert.ok(r.stdout.includes('--expected-source-base\ndf83a5c4265a9c8738d930dabaffb43cd31ae902\n'));}
  }
 }
 assert.match(step('Bind reviewed source controls to declared immutable Git source leaves'),/github.event.pull_request.head.repo.full_name == github.repository && github.head_ref == 'inkwave\/exact-head-ci-main144-20261022'/);
});


test('the fixed 32-PR aggregate routes both source controls to the full main pair',()=>{
 const valid={PAIR_EVENT_NAME:'pull_request',PAIR_BASE_REF:'main',PAIR_HEAD_REF:'integrate/inkwave-all-prs-20261022',PAIR_REPOSITORY:'rhgrive3/actions',PAIR_HEAD_REPO:'rhgrive3/actions'};
 for(const name of ['Bind reviewed source controls to declared immutable Git source leaves','Replay reviewed Roller births, pool reset and pinned paint in the main reference']){
  const result=shell(name,valid);assert.equal(result.status,0,result.stderr);
  assert.ok(result.stdout.includes('--expected-source-base\n26a4db4123d23162a3dbf8a12150b1b5bc6ccf64\n'));
  assert.ok(result.stdout.includes('--expected-source-head\nc9218d19b98a3bc63c9266738e1d67a64d9d1ff0\n'));
  for(const override of [{PAIR_BASE_REF:'other'},{PAIR_HEAD_REPO:'outside/actions'},{PAIR_REPOSITORY:''},{PAIR_HEAD_REF:'other'}])
   assert.ok(!shell(name,{...valid,...override}).stdout.includes('c9218d19b98a3bc63c9266738e1d67a64d9d1ff0'));
  assert.notEqual(shell(name,{...valid,NODE_STATUS:'7'}).status,0);
 }
});
