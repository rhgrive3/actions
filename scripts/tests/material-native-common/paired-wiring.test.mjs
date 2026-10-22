import preserved from './fixtures/preserved-contracts.json' with {type:'json'};
import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import{createHash}from'node:crypto';
import{fixture,condition,rename}from'./driver-schema-fixture.mjs';
const s=fs.readFileSync(new URL('../../check-inkwave-material-native-paired.mjs',import.meta.url),'utf8');
const code=s.slice(s.indexOf('const UUID='),s.indexOf('function requireSameReplay('));assert.ok(code.length>1000);
const {compareReplaySemanticCondition:compare,requireReplayIdentityCoverage:coverage}=Function('assert','createHash',code+';return {compareReplaySemanticCondition,requireReplayIdentityCoverage};')(assert,createHash);
const block=s.slice(s.indexOf('  if(settledDiagnostic){\n   try{assert.ok(row.integrity'),s.indexOf("  check(lane+' native entry settled'"));assert.ok(block.length>400);
const run=Function('assert','requireReplayIdentityCoverage','print','evidence','integrity',`const settledDiagnostic=true,rows=[],checks=[];for(const lane of ['A1','A2','B1']){const row={lane,evidence,integrity};rows.push(row);${block}}return{rows,checks};`);
test('actual inlined paired comparator accepts semantic raw rename and records raw failure',()=>{const a=condition(fixture().capture()),r=compare(rename(a),a);assert.equal(r.semanticEqual,true);assert.equal(r.rawEqual,false);assert.equal(r.rawIdsEqual,false);assert.equal(r.observations.length,12);});
test('complete real driver schema permits later lanes',()=>{const r=run(assert,coverage,()=>{},condition(fixture().capture()),true);assert.equal(r.rows.length,3);assert.deepEqual(r.checks,[]);});
for(const [name,mutate] of [
 ['missing resources',e=>delete e.renderStates[0].before.entryObservation.nativeResources],
 ['missing node graph',e=>delete e.renderStates[0].before.entryObservation.nodeGraph],
 ['unknown reference',e=>e.renderStates[0].before.newNativeReference='ffffffff-ffff-4fff-8fff-ffffffffffff'],
 ['wrong native owner',e=>e.renderStates[0].before.entryObservation.nativeResources.atlas.rtIdentity=false],
 ['missing phase',e=>delete e.renderStates[1].afterRender]
])test(name+' stops subsequent lanes and records a failed inventory',()=>{const e=condition(fixture().capture());mutate(e);const r=run(assert,coverage,x=>{assert.equal(x.performanceAccepted,false);assert.equal(x.diagnosticOnly,true);},e,true);assert.equal(r.rows.length,1);assert.equal(r.checks[0].passed,false);assert.ok(r.rows[0].identityError);});
test('invalid evidence integrity stops subsequent lanes',()=>{const r=run(assert,coverage,()=>{},condition(fixture().capture()),false);assert.equal(r.rows.length,1);assert.equal(r.checks[0].passed,false);});
test('old sequential-repeat and whole-frame gates remain separate and strict',()=>{assert.ok(s.includes('sequentialZeroRepeatAccepted'));assert.ok(s.includes('candidateBBReplayMeasured:false'));assert.ok(s.includes('performanceAccepted:false'));for(const needle of ["check('A1/A2 all four exact capture ordinals'",'const sequentialZeroRepeatAccepted=']){const a=preserved.pixelGates.find(x=>x.includes(needle)),b=s.split('\n').find(x=>x.includes(needle));assert.ok(a);assert.equal(a,b);}});

test('normal paired source bindings use common head without changing statistics',()=>{const marker='const control={clocks:';assert.ok(!s.includes('429cc1352d9b13ffe83c579ed714b84acf6139ed'));assert.equal(s.split(marker)[1].replace('  const admitted=requireNormalNativeReceipt(row,variant);\n','').replace(',loadedResources:admitted.loadedResources,workload:admitted.workload,overlayProvenance:row.overlay,entryProvenance:r.entry','').replace(' requireAllUnpainted(rows);\n',''),preserved.normalPairedTail.replaceAll('429cc1352d9b13ffe83c579ed714b84acf6139ed','c0938a3f84768474df91713f7b372f9d7f8fe96a'));});
