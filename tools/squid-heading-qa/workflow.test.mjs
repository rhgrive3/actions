import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {sourceLoadedActorFixture} from '../../patches/splatoon3/tests/source-loaded-actor-fixture.mjs';
const workflow=fs.readFileSync(new URL('../../.github/workflows/inkwave-squid-heading-qa.yml',import.meta.url),'utf8');
function verify(code){
 assert(!/fetch-depth:\s*0\b|git worktree/.test(code),'no repository history checkout');
 assert.equal((code.match(/uses: actions\/checkout@v4/g)||[]).length,2);
 assert.equal((code.match(/fetch-depth: 1\b/g)||[]).length,2);
 assert(code.includes('ref: ${{ github.event.pull_request.head.sha || github.sha }}'));
 assert(code.includes('BASE_SHA: 00b8994711809ba6d0469723c858ddef6805e2ae'));
 assert(code.includes('ref: ${{ env.BASE_SHA }}\n          fetch-depth: 1\n          path: _squid_heading_baseline'));
 assert(code.includes('test "$(git rev-parse HEAD)" = "$SOURCE_SHA"'));
 assert(code.includes('test "$(git -C _squid_heading_baseline rev-parse HEAD)" = "$BASE_SHA"'));
 assert(code.includes('SOURCE_SHA="$BASE_SHA" node ../tools/squid-heading-qa/run.mjs'));
 assert(code.includes('INKWAVE_BUILT_SITE="$PWD/_site" node --experimental-vm-modules --test --test-concurrency=1'));
 assert(code.includes('node tools/squid-heading-qa/compare.mjs .qa-evidence/squid-heading-baseline/result.json .qa-evidence/squid-heading-candidate/result.json "$SOURCE_SHA"'));
 assert(code.includes('timeout-minutes: 40'));
 assert(code.includes('group: squid-heading-native-${{ github.ref }}\n  cancel-in-progress: true')); 
 assert.equal((code.match(/tools\/squid-heading-qa\/three-contract.test.mjs/g)||[]).length,2,'source and emitted export/guide tests');
}
test('native heading workflow keeps two shallow exact-head builds and emitted/paired gates',()=>{
 verify(workflow);
 for(const mutate of [
  s=>s.replace('fetch-depth: 1','fetch-depth: 0'),
  s=>s.replace('BASE_SHA: 00b8994711809ba6d0469723c858ddef6805e2ae','BASE_SHA: main'),
  s=>s.replace('ref: ${{ env.BASE_SHA }}','ref: main'),
  s=>s.replace('test "$(git -C _squid_heading_baseline rev-parse HEAD)" = "$BASE_SHA"','true'),
  s=>s.replace('SOURCE_SHA="$BASE_SHA" node ../tools/squid-heading-qa/run.mjs','node ../tools/squid-heading-qa/run.mjs'),
  s=>s.replace('INKWAVE_BUILT_SITE="$PWD/_site"','IGNORED_SITE="$PWD/_site"'),
  s=>s.replace('node tools/squid-heading-qa/compare.mjs','echo tools/squid-heading-qa/compare.mjs'),
  s=>s.replace('tools/squid-heading-qa/three-contract.test.mjs',''),
  s=>s.replace('cancel-in-progress: true','cancel-in-progress: false'),
  s=>s.replace('group: squid-heading-native-${{ github.ref }}','group: squid-heading-native-all')
 ])assert.throws(()=>verify(mutate(workflow)));
 for(const rel of ['../../patches/local-quality/tests/squid-heading-frame.test.mjs','../../patches/local-quality/tests/squid-heading-boundary.test.mjs','./probe.test.mjs']){
  const code=fs.readFileSync(new URL(rel,import.meta.url),'utf8');
  assert(!/sourceOnly\s*:/.test(code));assert(code.includes("transform:process.env.INKWAVE_BUILT_SITE?()=>{throw Error('emitted heading test cannot use authored-source adaptation');}:undefined"));
 }
});
test('the real fixture selects emitted bytes and refuses missing emitted paths instead of source fallback',async()=>{
 const saved=process.env.INKWAVE_BUILT_SITE,dir=fs.mkdtempSync(path.join(os.tmpdir(),'squid-heading-emitted-contract-'));
 const forbidden=()=>{throw Error('authored-source fallback forbidden');};
 try{
  process.env.INKWAVE_BUILT_SITE=dir;
  await assert.rejects(()=>sourceLoadedActorFixture({transform:forbidden}),e=>e.code==='ENOENT'&&e.path.startsWith(dir+path.sep));
  const rel='patches/splatoon3/runtime/install.mjs',file=path.join(dir,rel),sentinel='// emitted heading fixture sentinel';fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,sentinel);
  let observed=false;
  await assert.rejects(()=>sourceLoadedActorFixture({transform:forbidden,emittedTransform:(name,code)=>{assert.equal(name,rel);assert.equal(code,sentinel);observed=true;throw Error('emitted bytes selected');}}),/emitted bytes selected/);
  assert(observed,'actual emitted namespace branch was visited');
 }finally{if(saved===undefined)delete process.env.INKWAVE_BUILT_SITE;else process.env.INKWAVE_BUILT_SITE=saved;fs.rmSync(dir,{recursive:true,force:true});}
});
