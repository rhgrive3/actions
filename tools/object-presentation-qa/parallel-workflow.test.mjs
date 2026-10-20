import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const workflow=fs.readFileSync(new URL('../../.github/workflows/inkwave-object-presentation-qa.yml',import.meta.url),'utf8');
test('one production build and all original source/emitted gates stay before matrix capture',()=>{
 assert.equal((workflow.match(/node scripts\/build-inkwave\.mjs inkwave-public _site/g)||[]).length,1);
 for(const label of ['Verify comparison, artifact and production-source contracts','Verify Rainmaker presentation and hands','Verify spawner geometry and unchanged lifecycle','Verify Clam Blitz presentation and rules','Verify real actors against the exact emitted site','Verify source-loaded Rainmaker surfaces against exact emitted site','Verify emitted Rainmaker aim endpoints in native and source modes'])assert(workflow.includes('- name: '+label));
 assert(workflow.indexOf('Verify emitted Rainmaker aim endpoints')<workflow.indexOf('\n  capture:'));
});
test('capture is five isolated jobs, no fail-fast cancellation, exact source and immutable transport',()=>{
 const s=workflow.slice(workflow.indexOf('\n  capture:'),workflow.indexOf('\n  compare-objects:'));
 assert(s.includes('fail-fast: false'));for(const suite of ['spawner','rainmaker','clam','rainmaker-air','rainmaker-form'])assert(s.includes('{suite: '+suite+','));
 assert(s.includes("needs.prepare.outputs.build-ready == 'true'"));assert(s.includes('fetch-depth: 0'));assert(s.includes('assert.equal(x.sourceSha,process.env.SOURCE_SHA)'));assert(s.includes("digest('hex'),x.tarSha"));assert(s.indexOf("digest('hex'),x.tarSha")<s.indexOf('tar -xf'));
 assert(s.includes('--out .capture'));assert(s.includes('timeout-minutes: ${{ matrix.minutes }}'));
});
test('original required job cannot skip or turn missing/failed captures green',()=>{
 const s=workflow.slice(workflow.indexOf('\n  compare-objects:'));assert(s.includes('needs: [prepare, capture]\n    if: always()'));
 for(const k of ['PREPARE_RESULT: ${{ needs.prepare.result }}','CAPTURE_RESULT: ${{ needs.capture.result }}','--prepare-result "$PREPARE_RESULT" --capture-result "$CAPTURE_RESULT"'])assert(s.includes(k));
 for(const group of ['spawner','rainmaker','clam'])assert(s.includes('name: object-'+group+'-${{ github.event.pull_request.head.sha || github.sha }}'));
 assert(!workflow.includes('continue-on-error'));assert(workflow.includes('cancel-in-progress: false'));
});
