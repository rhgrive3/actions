import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {requireExplosherWorkflowEvent,OWNED_BRANCH,BASE_BRANCH,COMMON_HEAD} from '../lib/inkwave-explosher-workflow-admission.mjs';
import {requireComparableExplosherGeometryGrowth} from '../lib/inkwave-explosher-stage-admission.mjs';
const fixture=()=>({eventName:'pull_request',repository:'rhgrive3/actions',checkoutHead:'a'.repeat(40),event:{action:'synchronize',pull_request:{head:{ref:OWNED_BRANCH,sha:'a'.repeat(40),repo:{full_name:'rhgrive3/actions'}},base:{ref:BASE_BRANCH,sha:COMMON_HEAD,repo:{full_name:'rhgrive3/actions'}}}}});
for(const action of['opened','synchronize','reopened'])test('admits owned same-repo '+action+' only to initial pair',()=>{const f=fixture();f.event.action=action;assert.equal(requireExplosherWorkflowEvent(f).scope,'initial-preflight-pair-only');});
for(const[name,mutate]of[
 ['fork',f=>f.event.pull_request.head.repo.full_name='other/actions'],['foreign base',f=>f.event.pull_request.base.repo.full_name='other/actions'],['foreign repository',f=>f.repository='other/actions'],['different branch',f=>f.event.pull_request.head.ref='inkwave/other'],['branch prefix spoof',f=>f.event.pull_request.head.ref=OWNED_BRANCH+'-extra'],['main base',f=>f.event.pull_request.base.ref='main'],['moved frozen base',f=>f.event.pull_request.base.sha='b'.repeat(40)],['manual dispatch',f=>f.eventName='workflow_dispatch'],['push',f=>f.eventName='push'],['pull_request_target',f=>f.eventName='pull_request_target'],['closed event',f=>f.event.action='closed'],['edited event',f=>f.event.action='edited'],['merge checkout',f=>f.checkoutHead='b'.repeat(40)],['invalid head',f=>f.event.pull_request.head.sha='main'],['missing PR',f=>delete f.event.pull_request]
])test('rejects '+name,()=>{const f=fixture();mutate(f);assert.throws(()=>requireExplosherWorkflowEvent(f));});
test('workflow encodes bounded trigger and cannot launch later ladder stages',()=>{
 const y=fs.readFileSync(new URL('../../.github/workflows/inkwave-explosher-inverse-preflight.yml',import.meta.url),'utf8');
 for(const value of[OWNED_BRANCH,BASE_BRANCH,COMMON_HEAD])assert(y.includes(value));
 assert.match(y,/types: \[opened, synchronize, reopened\]/);assert.match(y,/github\.event_name == 'pull_request'/);assert.match(y,/head\.repo\.full_name == github\.repository/);assert.match(y,/ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
 assert.match(y,/contents: read/);assert.match(y,/EXPLOSHER_PREFLIGHT: '1'/);assert.match(y,/ADMISSION_RELEASE_ENABLED/);assert.doesNotMatch(y,/pull_request_target:|workflow_dispatch:|EXPLOSHER_VIDEO:|encode-inkwave-explosher-comparison/);
 const guard=y.indexOf('Verify exact owned PR event'),release=y.indexOf('Refuse native work'),build=y.indexOf('Verify immutable common checkout'),capture=y.indexOf('Capture only initial short pair');assert(guard<release&&release<build&&build<capture);
});
test('general PR regressions retain latest build while specialized native QA uses the admitted immutable source',()=>{
 const y=fs.readFileSync(new URL('../../.github/workflows/inkwave-explosher-flight-glitter.yml',import.meta.url),'utf8');
 assert.match(y,/ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
 assert.match(y,/ref: 364dd0a7fad9508652b4b4c6ec3d82eb124e9c5c/);
 assert.match(y,/node scripts\/build-inkwave\.mjs inkwave-public \.built-site\/explosher-current/);
 for(const gate of ['requireApprovedCommonBuild','compile-inkwave-explosher-inverse-pair.mjs','compile-inkwave-explosher-controlled-main.mjs','readExplosherStagePair'])assert(y.includes(gate));
 assert(y.indexOf('requireApprovedCommonBuild')<y.indexOf('- name: Short admitted same-build native preflight'));
 assert.match(y,/check-inkwave-current-explosher-native\.mjs \.built-site\/explosher-current/);
 assert.match(y,/EXPECTED_HEAD: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
 assert.match(y,/sudo apt-get install --no-install-recommends -y ffmpeg/);
 assert(y.indexOf('Install required PNG decoder')<y.indexOf('Native production-composition regressions'));
 assert.match(y,/same-build native preflight/);assert.match(y,/Historical common-build QA; no latest-gameplay parity claim/);
 assert.doesNotMatch(y,/check-inkwave-explosher-flight-glitter\.mjs \.built-site\/explosher-current/);
});

const geometryFixture=(boot=254,growth=27)=>({
 sceneCensus:{actors:[{key:'local-character'}],categories:[{owner:'background',objects:100}]},
 sceneSources:[{status:'ready',variant:'source'}],
 memory:{geometries:boot+growth,textures:46},
 rngDiagnostic:{enabled:true,boundaries:[
  {label:'shot-input-start',nativeState:{resources:{geometries:boot}}},
  {label:'native-birth',nativeState:{resources:{geometries:boot}}},
  {label:'before-draw-probe',nativeState:{resources:{geometries:boot+growth}}},
  {label:'after-draw-probe',nativeState:{resources:{geometries:boot+growth}}}
 ]}
});
test('geometry gate accepts different cold allocations only with identical active scene and shot growth',()=>{
 const before=geometryFixture(),after=geometryFixture(268,27);
 assert.deepEqual(requireComparableExplosherGeometryGrowth(before,after),{before:{born:254,growth:27},after:{born:268,growth:27}});
});
test('geometry gate rejects new projectile GPU allocations, unstable probes, absent source identity and forged boundaries',()=>{
 const before=geometryFixture();
 const bigger=geometryFixture(268,28);assert.throws(()=>requireComparableExplosherGeometryGrowth(before,bigger),/extra post-birth geometry/);
 const drift=geometryFixture(268,27);drift.rngDiagnostic.boundaries[3].nativeState.resources.geometries++;
 assert.throws(()=>requireComparableExplosherGeometryGrowth(before,drift),/Unexpected geometry growth/);
 const census=geometryFixture(268,27);census.sceneCensus.categories[0].objects++;
 assert.throws(()=>requireComparableExplosherGeometryGrowth(before,census),/Active scene census/);
 const dup=geometryFixture(268,27);dup.rngDiagnostic.boundaries.push(dup.rngDiagnostic.boundaries[1]);
 assert.throws(()=>requireComparableExplosherGeometryGrowth(before,dup),/Missing\/duplicated/);
});
