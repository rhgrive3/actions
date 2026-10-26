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
 const actual=qualityScope('a'.repeat(40),'b'.repeat(40),args=>{assert(args.includes('--no-renames'));return 'account/deleted.js\0account/renamed.js\0';});assert.equal(actual.relevant,false);
 assert.equal(qualityScope('a'.repeat(40),'b'.repeat(40),()=>{throw Error('unavailable');}).relevant,true);
});
test('the account workflow still owns every account path and its real tests/build',()=>{
 const source=expandTestSuiteSteps(fs.readFileSync(new URL('../../.github/workflows/zevant-account.yml',import.meta.url),'utf8'));assert.equal((source.match(/- "account\/\*\*"/g)||[]).length,2);assert.match(source,/node --test account\/tests\/\*\.test\.mjs/);assert.match(source,/npx vite build/);assert.match(source,/wrangler deploy --dry-run/);
});
