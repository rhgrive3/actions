import {expandTestSuiteSteps} from '../ci/run-inkwave-test-suite.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {requiresGameQuality,qualityScope} from '../inkwave-quality-scope.mjs';
test('only a complete account-only change can omit the separate game suite',()=>{
 assert.equal(requiresGameQuality(['account/src/worker.js','account/tests/api.test.mjs','account/package.json']),false);
 for(const other of ['scripts/build-inkwave.mjs','inkwave-public/src/main.js','patches/local-quality/adapter.mjs','package.json','vite.config.mjs','unknown.file','docs/account.md'])assert.equal(requiresGameQuality(['account/src/worker.js',other]),true,other);
 for(const paths of [[],null,['account/'],['account/../scripts/build-inkwave.mjs'],['account//worker.js'],['account/./worker.js'],['account/worker.js\0'],[12],['README.md.js']])assert.equal(requiresGameQuality(paths),true,JSON.stringify(paths));
 assert.equal(requiresGameQuality(['README.md','docs/notes.md']),false);
 assert.equal(requiresGameQuality(['.github/workflow-archive/retired.yml','.github/workflow-archive/README.md']),false);
 for(const file of ['scripts/ci/run-inkwave-test-suite.mjs','patches/reliability/adapter.mjs','.github/workflows/retired.yml','.github/workflow-archive/live.mjs'])
  assert.equal(requiresGameQuality(['.github/workflow-archive/retired.yml',file]),true,file);
 const actual=qualityScope('a'.repeat(40),'b'.repeat(40),args=>{assert(args.includes('--no-renames'));return 'account/deleted.js\0account/renamed.js\0';});assert.equal(actual.relevant,false);
 assert.equal(qualityScope('a'.repeat(40),'b'.repeat(40),()=>{throw Error('unavailable');}).relevant,true);
});
test('the account workflow still owns every account path and its real tests/build',()=>{
 const source=expandTestSuiteSteps(fs.readFileSync(new URL('../../.github/workflows/zevant-account.yml',import.meta.url),'utf8'));assert.equal((source.match(/- "account\/\*\*"/g)||[]).length,2);assert.match(source,/node --test account\/tests\/\*\.test\.mjs/);assert.match(source,/npx vite build/);assert.match(source,/wrangler deploy --dry-run/);
});

import {requiresGameBuild} from '../inkwave-quality-scope.mjs';
test('test-only edits keep game tests while omitting unrelated build and benchmark', () => {
 for (const paths of [
  ['patches/local-quality/tests/new.test.mjs'],
  ['scripts/tests/inkwave-quality-account-scope.test.mjs','docs/testing-and-ci.md'],
  ['server/tests/relay.test.mjs','tests/ink-flight/model.test.mjs'],
 ]) {
  assert.equal(requiresGameQuality(paths),true);
  assert.equal(requiresGameBuild(paths),false);
  const scope=qualityScope('a'.repeat(40),'b'.repeat(40),()=>paths.join('\0')+'\0');
  assert.equal(scope.relevant,true);assert.equal(scope.buildRequired,false);
 }
 for(const file of ['scripts/build-inkwave.mjs','scripts/benchmark-aplus-verification.mjs','package.json',
  'patches/local-quality/adapter.mjs','patches/local-quality/tests/fixtures/body.js.txt',
  'scripts/tests/nested/runtime.mjs','unknown.test.mjs','.github/workflows/ci-quality-gate.yml'])
  assert.equal(requiresGameBuild(['patches/local-quality/tests/new.test.mjs',file]),true,file);
 for(const paths of [null,[],['scripts/tests/../runtime.test.mjs'],['scripts/tests/a.test.mjs\0']])assert.equal(requiresGameBuild(paths),true);
 assert.equal(qualityScope(null,'b'.repeat(40)).buildRequired,true);
 assert.equal(qualityScope('a'.repeat(40),'b'.repeat(40),()=>{throw Error('missing history');}).buildRequired,true);
});
test('both expensive A+ stages require explicit false to omit and keep all test steps', () => {
 const workflow=fs.readFileSync(new URL('../../.github/workflows/ci-quality-gate.yml',import.meta.url),'utf8');
 const stages=workflow.split(/^      - /m);
 for(const name of ['Run Production Diagnostic Build & Startup Budget Gate','Execute A+ Same-Condition Performance & Parity Benchmark']) {
  const stage=stages.find(text=>text.includes('name: '+name+'\n'));assert.ok(stage);
  assert.ok(stage.startsWith("if: steps.scope.outputs.relevant == 'true' && steps.scope.outputs.build_required != 'false'\n"));
 }
 for(const name of ['Verify shared test suite runner','Run Local-Quality & Motion Regression Suite','Run Relay Security & Hibernation Test Suite'])
  assert.ok(stages.find(text=>text.includes('name: '+name+'\n')).startsWith("if: steps.scope.outputs.relevant == 'true'\n"));
});
