// Capture orchestration only. Does not broaden the branch/path-only trigger or
// weaken any source, build, capture, comparison or cleanup gate in a chosen job.
import assert from 'node:assert/strict';
export const SUITE_PLAN_BASELINE='e0072a749df0ec8c2d368e383bdf337baa7b44ad';
export const SUPPORTED_CAPTURE_SUITES=Object.freeze(['next-shapes','next-dualies','next-bamboo','next-pencil']);
export function planCaptureTrigger(trigger,{sourceSha}={}){
 assert(trigger&&typeof trigger==='object'&&!Array.isArray(trigger),'trigger object required');
 assert(/^[a-f0-9]{40}$/.test(sourceSha||''),'exact checked-out source SHA required');
 assert.equal(trigger.schema,1);assert.equal(trigger.baselineSha,SUITE_PLAN_BASELINE,'immutable baseline');
 assert.equal(trigger.state,'run');assert.equal(trigger.scope,'reticle-next-visual-review');
 assert.equal(trigger.captureProtocol,'chromium-owned-next-native60-mixedrender-v1');
 assert.equal(trigger.viewport,'desktop');assert.equal(trigger.renderPolicy,'native60-render30-dualies60');
 assert.equal(trigger.fullAcceptance,false);
 if(Object.hasOwn(trigger,'candidateSha'))assert.equal(trigger.candidateSha,sourceSha,'optional candidate pin must match exact head');
 assert(Array.isArray(trigger.suites)&&trigger.suites.length>0,'nonempty selected suites required');
 assert(trigger.suites.length<=SUPPORTED_CAPTURE_SUITES.length,'bounded suite count');
 assert.equal(new Set(trigger.suites).size,trigger.suites.length,'duplicate selected suite');
 for(const suite of trigger.suites)assert(typeof suite==='string'&&SUPPORTED_CAPTURE_SUITES.includes(suite),'unknown selected suite');
 return {include:trigger.suites.map(suite=>({suite,renderHz:suite==='next-dualies'?60:30}))};
}
