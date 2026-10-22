import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {isDeepStrictEqual} from 'node:util';import {createHash} from 'node:crypto';import {gunzipSync} from 'node:zlib';
import {prepared,paired,helperUrl,retainedFrame,retainedPaired} from './diagnostic-fixture.mjs';
import {prepare as optimize,inverse as inverseRaw,INPUT_SHA256 as RAW_INPUT} from './raw-equality-driver.mjs';
import {extendPreparedCapturePhases,inverse as inversePhases,sha256,INPUT_SHA256 as FRAME_INPUT} from './capture-phase-driver.mjs';
import {fixture} from './postprocess/native-fixture.mjs';
const optimized=optimize(paired,helperUrl),marked=extendPreparedCapturePhases(prepared);
test('portable fixture reconstructs both exact retained 6469 programs without stored captures or external paths',()=>{assert.equal(sha256(retainedFrame),FRAME_INPUT);assert.equal(sha256(retainedPaired),RAW_INPUT);});
test('portable transforms have exact inverses and retain all inherited source provenance',()=>{assert.equal(inverseRaw(optimized),paired);assert.equal(inversePhases(marked.program),prepared.program);assert.deepEqual(marked.provenance.imports,prepared.provenance.imports);assert.deepEqual(marked.provenance.postprocessOwners,prepared.provenance.postprocessOwners);assert.equal(marked.provenance.capturePhases.preMarkerFrameSha256,sha256(prepared.program));assert.equal(marked.provenance.generatedFrameSha256,sha256(marked.program));});
for(const [name,run] of [
 ['rehashed unrelated frame change',()=>{const program=prepared.program+'\n';return extendPreparedCapturePhases({...prepared,program,provenance:{...prepared.provenance,generatedFrameSha256:sha256(program)}});}],
 ['missing import',()=>extendPreparedCapturePhases({...prepared,provenance:{...prepared.provenance,imports:prepared.provenance.imports.slice(1)}})],
 ['forged import url',()=>extendPreparedCapturePhases({...prepared,provenance:{...prepared.provenance,imports:prepared.provenance.imports.map(x=>({...x,url:x.url+'bad'}))}})],
 ['extra paired statement',()=>optimize(paired+'\n',helperUrl)],
 ['changed paired timeout',()=>optimize(paired.replace('timeout:300000','timeout:400000'),helperUrl)],
 ['changed strict history gate',()=>optimize(paired.replace("assert.deepEqual(a,b,'strict non-identity", "assert.deepEqual(a,a,'strict non-identity"),helperUrl)],
 ['changed helper URL',()=>optimize(paired,helperUrl+'bad')],
 ['reapplied raw optimization',()=>optimize(optimized,helperUrl)],
 ['reapplied phase markers',()=>extendPreparedCapturePhases(marked)],
])test(name+' is rejected before emission',()=>assert.throws(run));
test('both new suites are mandatory in existing pre-browser workflow glob',()=>{const workflow=fs.readFileSync(new URL('../../.github/workflows/inkwave-material-native-aa.yml',import.meta.url),'utf8');const command='node --experimental-vm-modules --test scripts/tests/material-native-common/*.test.mjs tools/material-native-aa/*.test.mjs';assert.ok(workflow.includes(command));assert.ok(workflow.indexOf(command)<workflow.indexOf('npx playwright install'));for(const name of ['capture-phase-driver.test.mjs','raw-equality-driver.test.mjs','diagnostic-integration.test.mjs'])assert.ok(fs.existsSync(new URL(name,import.meta.url)));});
// HYBRID CPU fixture: retained full 525465-byte scene + actual native constructor owners.
// This is not a repaired historical capture, native capture, visual acceptance or timing result.
const raw=JSON.parse(gunzipSync(Buffer.from(fs.readFileSync(new URL('./postprocess/historical-A1-snapshot.json.gz.base64',import.meta.url),'utf8'),'base64')));
const start=prepared.program.indexOf('function materialSettledEntryObservation('),end=prepared.program.indexOf('\nfunction unusedSettledEntryPredicate(',start);
const observe=Function('return '+prepared.program.slice(start,end))();
const native=fixture();raw.entryObservation.postprocess=observe({g:native.g,G:{},r:native.g.R.renderer,a:{character:{root:new native.THREE.Group()}}},'geometry').postprocess;
function replay(source){const start=source.indexOf('const UUID='),end=source.indexOf('\nfunction requireReplayIdentityCoverage(');return Function('assert','createHash','isDeepStrictEqual',source.slice(start,end)+';return {compareReplaySemanticCondition,inventoryUUIDs};')(assert,createHash,isDeepStrictEqual);}
const oldReplay=replay(paired),newReplay=replay(optimized);
function condition(snapshot){return {history:{clock:28,viewport:[960,600],source:'immutable'},renderStates:Array.from({length:4},(_,captureOrdinal)=>({captureOrdinal,before:snapshot,afterRender:snapshot,after:snapshot}))};}
const renamed=structuredClone(raw);const refs=oldReplay.inventoryUUIDs(renamed),ids=new Map();let ordinal=0;
for(const ref of refs){if(!ids.has(ref.uuid))ids.set(ref.uuid,'00000000-0000-4000-8000-'+(++ordinal).toString(16).padStart(12,'0'));let at=renamed;for(const key of ref.path.slice(0,-1))at=at[key];at[ref.path.at(-1)]=ids.get(ref.uuid);}
for(const [name,mutate,accepted] of [
 ['identical full snapshot',x=>{},true],
 ['inventoried UUID renaming only',x=>{x.renderStates=condition(renamed).renderStates;},true],
 ['strict history mismatch',x=>{x.history.clock++;},false],
 ['shader byte mismatch',x=>{x.renderStates[0].before.entryObservation.postprocess.identityOwners.materials[0].vertex.sha256='0'.repeat(64);},false],
 ['unknown owner reference',x=>{x.renderStates[0].before.entryObservation.postprocess.foreign='00000000-0000-4000-8000-999999999999';},false],
])test('actual full snapshot replay controls: '+name,()=>{const a=condition(raw),b=structuredClone(a);mutate(b);const actual=newReplay.compareReplaySemanticCondition(a,b);if(name==='identical full snapshot')assert.deepEqual(actual,oldReplay.compareReplaySemanticCondition(a,b));assert.equal(actual.semanticEqual,accepted);if(name.includes('renaming'))assert.equal(actual.rawEqual,false);});
