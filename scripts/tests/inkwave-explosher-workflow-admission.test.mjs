import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {requireExplosherWorkflowEvent,OWNED_BRANCH,BASE_BRANCH,COMMON_HEAD} from '../lib/inkwave-explosher-workflow-admission.mjs';
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

function requireGlitterRoutes(y){
 const head=y.slice(y.indexOf('  native-pair:'),y.indexOf('  reviewed-common-build-diagnostic:'));
 const common=y.slice(y.indexOf('  reviewed-common-build-diagnostic:'));
 assert(head.includes('ref: ${{ github.event.pull_request.head.sha }}'));
 assert(head.includes('test "$(git rev-parse HEAD)" = "$SOURCE_SHA"'));
 assert(head.includes('INKWAVE_BUILT_SITE=.built-site/explosher-current node --experimental-vm-modules --test patches/splatoon3/tests/issue-1431-explosher-authored-muzzle.test.mjs'));
 assert.doesNotMatch(head,/continue-on-error:|if: false/);
 const reviewed=JSON.parse(fs.readFileSync(new URL('../fixtures/explosher-common-build-364dd0.json',import.meta.url))).head;
 assert(common.includes('ref: '+reviewed));
 assert(common.includes('test "$(git -C .ci-explosher-common rev-parse HEAD)" = "'+reviewed+'"'));
 assert.equal((common.match(/EXPLOSHER_PREFLIGHT=1 node /g)||[]).length,2);
 for(const side of ['before','after'])assert(common.includes('.built-site/explosher-common .ci-scratch/explosher/preflight-'+side+' "'+reviewed+'" .ci-explosher-common'));
 assert.doesNotMatch(common,/pull_request\.base\.sha|continue-on-error:|if: false/);
 assert(common.includes("assert.equal(mismatches.length,0,'Every preflight state must agree')"));
}
test('glitter current-head regressions and reviewed historical A/A cannot exchange subjects or suppress gates',()=>{
 const y=fs.readFileSync(new URL('../../.github/workflows/inkwave-explosher-flight-glitter.yml',import.meta.url),'utf8');
 requireGlitterRoutes(y);
 const reviewed=JSON.parse(fs.readFileSync(new URL('../fixtures/explosher-common-build-364dd0.json',import.meta.url))).head;
 for(const [before,after] of [
  ['ref: '+reviewed,'ref: ${{ github.event.pull_request.base.sha }}'],
  ['preflight-after "'+reviewed+'" .ci-explosher-common','preflight-after "'+reviewed+'" .'],
  ['INKWAVE_BUILT_SITE=.built-site/explosher-current node','INKWAVE_BUILT_SITE=.built-site/explosher-common node'],
  ["assert.equal(mismatches.length,0,'Every preflight state must agree')",'void mismatches'],
 ]){assert(y.includes(before));assert.throws(()=>requireGlitterRoutes(y.replace(before,after)));}
});
