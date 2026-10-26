import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {planCaptureTrigger,SUPPORTED_CAPTURE_SUITES,SUITE_PLAN_BASELINE} from '../lib/reticle-next/suite-plan.mjs';
const sourceSha='1234567890123456789012345678901234567890';
const trigger=()=>({schema:1,baselineSha:SUITE_PLAN_BASELINE,state:'run',scope:'reticle-next-visual-review',captureProtocol:'chromium-owned-next-native60-mixedrender-v1',viewport:'desktop',renderPolicy:'native60-render30-dualies60',fullAcceptance:false,suites:[...SUPPORTED_CAPTURE_SUITES]});
test('original all-four capability remains exact ordered suite/render include matrix',()=>{
 assert.deepEqual(planCaptureTrigger(trigger(),{sourceSha}),{include:[{suite:'next-shapes',renderHz:30},{suite:'next-dualies',renderHz:60},{suite:'next-bamboo',renderHz:30},{suite:'next-pencil',renderHz:30}]});
 assert(Object.isFrozen(SUPPORTED_CAPTURE_SUITES));
});
test('all fifteen nonempty unique subsets execute only the requested suites and never expand successful siblings',()=>{
 for(let mask=1;mask<16;mask++){
  const suites=SUPPORTED_CAPTURE_SUITES.filter((_,i)=>mask&(1<<i)),t={...trigger(),suites},before=JSON.stringify(t),m=planCaptureTrigger(t,{sourceSha});
  assert.deepEqual(m.include.map(row=>row.suite),suites);assert.equal(m.include.length,suites.length);assert.equal(JSON.stringify(t),before);
 }
 assert.deepEqual(planCaptureTrigger({...trigger(),suites:['next-dualies']},{sourceSha}).include,[{suite:'next-dualies',renderHz:60}]);
});
test('rejects empty, duplicate, unknown, malformed and oversized suite selections',()=>{
 for(const suites of [[],['next-dualies','next-dualies'],['next-mobile-layout'],['unknown'],[null],['next-bamboo',17],null,{},'next-dualies',[...SUPPORTED_CAPTURE_SUITES,'extra']])assert.throws(()=>planCaptureTrigger({...trigger(),suites},{sourceSha}));
});
test('baseline/state/scope/protocol/viewport/renderpolicy/acceptance are fail-closed before matrix output',()=>{
 for(const patch of [{schema:2},{baselineSha:'bad'},{state:'armed'},{scope:'other'},{captureProtocol:'other'},{viewport:'mobile'},{renderPolicy:'60'},{fullAcceptance:true}])assert.throws(()=>planCaptureTrigger({...trigger(),...patch},{sourceSha}));
 for(const t of [null,[],true])assert.throws(()=>planCaptureTrigger(t,{sourceSha}));
});
test('requires exact checked-out source SHA and respects optional explicit candidate pin',()=>{
 for(const sha of [undefined,'main','abc',sourceSha.toUpperCase()+'f'])assert.throws(()=>planCaptureTrigger(trigger(),{sourceSha:sha}));
 assert.doesNotThrow(()=>planCaptureTrigger({...trigger(),candidateSha:sourceSha},{sourceSha}));
 assert.throws(()=>planCaptureTrigger({...trigger(),candidateSha:'ffffffffffffffffffffffffffffffffffffffff'},{sourceSha}));
});
test('workflow consumes validated plan output with same exact branch/path-only scope, readonly permission and all capture gates',()=>{
 const s=fs.readFileSync(new URL('../../.github/workflows/inkwave-reticle-next-visual-review.yml',import.meta.url),'utf8');
 assert(s.includes('needs: plan_suites'));assert(s.includes('matrix: ${{ fromJSON(needs.plan_suites.outputs.matrix) }}'));assert(s.includes("fs.appendFileSync(process.env.GITHUB_OUTPUT,'matrix='+JSON.stringify(matrix)"));
 assert(s.includes("row.suite===process.env.CAPTURE_SUITE&&row.renderHz===Number(process.env.CAPTURE_RENDER_HZ)"));
 assert(s.includes("branches: ['improve/inkwave-weapon-reticles-20261025']"));assert(s.includes("paths: ['diagnostics/inkwave-reticle-next-visuals.trigger.json']"));assert(s.includes('contents: read'));
 assert(!/workflow_dispatch:|pull_request:|schedule:|contents: write|actions: write|continue-on-error/.test(s));
 for(const gate of ['reticle-native-input-admission.test.mjs','next-reticle-owners.test.mjs','current-main-composition-tests.log','content-hash-preservation.json','baseline-cleanup','candidate/cleanup.json','comparison-index.json','include-hidden-files: true'])assert(s.includes(gate),gate);
 assert.equal((s.match(/timeout --signal=TERM --kill-after=15s 700s node/g)||[]).length,2);
});
