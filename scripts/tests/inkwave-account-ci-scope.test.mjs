import {expandTestSuiteSteps} from '../ci/run-inkwave-test-suite.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {accountTestsOnly,classifyAccountChange} from '../lib/inkwave-account-ci-scope.mjs';
const base='1'.repeat(40),head='2'.repeat(40);
test('only nonempty direct account test modules skip production builds',()=>{
 assert.equal(accountTestsOnly(['account/tests/build.test.mjs','account/tests/api.test.mjs']),true);
 for(const paths of [[],['account/tests/d1-fake.mjs'],['account/dev/vite-plugins.mjs'],['account/worker/index.js'],['account/tests/build.test.mjs','package.json'],['account/tests/sub/x.test.mjs'],['account/tests/x.test.mjs\npackage.json'],['inkwave-public/src/main.js']])assert.equal(accountTestsOnly(paths),false);
});
test('missing history fetches only exact SHAs; every lookup/diff failure retains full workload',()=>{
 const calls=[];let found=false;
 const run=args=>{calls.push(args);if(args[0]==='cat-file')return{status:found?0:1};if(args[0]==='fetch'){found=true;return{status:0};}return{status:0,stdout:'account/tests/build.test.mjs\0'};};
 assert.equal(classifyAccountChange(base,head,run),true);assert.equal(calls.filter(a=>a[0]==='fetch').length,1);
 assert.equal(classifyAccountChange('0'.repeat(40),head,run),false);assert.equal(classifyAccountChange('bad',head,run),false);
 for(const fail of ['history','diff'])assert.equal(classifyAccountChange(base,head,args=>fail==='history'&&['cat-file','fetch'].includes(args[0])||fail==='diff'&&args[0]==='diff'?{status:1}:{status:0,stdout:'account/tests/build.test.mjs\0'}),false);
 assert.equal(classifyAccountChange(base,head,()=>{throw Error('no git')}),false);
 assert.equal(classifyAccountChange(base,head,args=>({status:0,stdout:args[0]==='diff'?'account/tests/a.test.mjs':undefined})),false);
});
test('workflow keeps tests unconditional and full latest-head checks for every production change',()=>{
 const s=expandTestSuiteSteps(fs.readFileSync(new URL('../../.github/workflows/zevant-account.yml',import.meta.url),'utf8'));
 assert.match(s,/cancel-in-progress: \$\{\{ github.event_name == 'pull_request' \}\}/);
 const tests=s.slice(s.indexOf('- name: Account API'),s.indexOf('- name: Install build tools'));
 assert.doesNotMatch(tests,/if:/);assert.match(tests,/node --test account\/tests\/\*\.test\.mjs/);
 assert.equal((s.match(/if: steps.scope.outputs.test_only != 'true'/g)||[]).length,5);
});
