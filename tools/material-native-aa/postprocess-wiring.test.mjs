import {gunzipSync} from 'node:zlib';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {fileURLToPath,pathToFileURL} from 'node:url';
import {prepareSequencedDriver,bindDiagnosticDriver,sha256} from './entry-driver.mjs';
import {prepareAaRunner} from './run.mjs';
import {preparePostprocessDiagnostic,OWNER_BODIES} from './postprocess-driver.mjs';
import {fixture} from './postprocess/native-fixture.mjs';
import {auditPairedLaunch} from './postprocess/audit-paired-launch.mjs';
const qa=fileURLToPath(new URL('../../',import.meta.url)),read=p=>fs.readFileSync(path.join(qa,p),'utf8');
const canonical=read('scripts/check-inkwave-material-native-frame.mjs'),pair=read('scripts/check-inkwave-material-native-paired.mjs');
// Authored module fixture only, not a browser or installed Playwright run.
const root=fs.mkdtempSync(path.join(qa,'.postprocess-package-test-'));fs.mkdirSync(path.join(root,'node_modules/playwright'),{recursive:true});fs.mkdirSync(path.join(root,'scripts/lib'),{recursive:true});
fs.writeFileSync(path.join(root,'node_modules/playwright/index.mjs'),'export const chromium=null; // fixture only\n');fs.writeFileSync(path.join(root,'node_modules/playwright/package.json'),JSON.stringify({name:'playwright',version:'1.51.1'}));
for(const p of ['inkwave-runtime-evidence.mjs','inkwave-range-menu-entry.mjs'])fs.copyFileSync(path.join(qa,'scripts/lib',p),path.join(root,'scripts/lib',p));
const bindings=Object.fromEntries(['./lib/inkwave-runtime-evidence.mjs','./lib/inkwave-range-menu-entry.mjs','playwright'].map(p=>[p,pathToFileURL(path.join(root,p==='playwright'?'node_modules/playwright/index.mjs':'scripts/'+p.slice(2))).href]));
const prepared=prepareSequencedDriver(canonical,bindings,undefined,root),oldPair=prepareAaRunner(pair,pathToFileURL(path.join(qa,'scripts/lib/inkwave-material-normal-admission.mjs')).href),extended=preparePostprocessDiagnostic(prepared,oldPair);
const source=extended.prepared.program,paired=extended.pairedProgram;
const start=source.indexOf('function materialSettledEntryObservation('),end=source.indexOf('\nfunction unusedSettledEntryPredicate(',start);
const observe=Function('return '+source.slice(start,end))();
const mapStart=paired.indexOf('const UUID='),mapEnd=paired.indexOf('\nfunction compareObservedHistory',mapStart);
// Extract the exact produced semantic program, excluding the following orchestration.
const compareEnd=paired.indexOf('\nfunction ',paired.indexOf('function compareSemanticSnapshots(')+10);
const mapped=Function('assert','createHash',paired.slice(mapStart,compareEnd)+'\n;return{semanticSnapshot,compareSemanticSnapshots,inventoryUUIDs};')(assert,createHash);
const raw=JSON.parse(gunzipSync(Buffer.from(fs.readFileSync(new URL('./postprocess/historical-A1-snapshot.json.gz.base64',import.meta.url),'utf8'),'base64')));
function capture(f=fixture()){
 // HYBRID CPU TEST: actual generated native serializer with real source constructors,
 // attached to the unrelated preserved scene snapshot. Never historical capture repair.
 const s=structuredClone(raw);s.entryObservation.postprocess=observe({g:f.g,G:{},r:f.g.R.renderer,a:{character:{root:new f.THREE.Group()}}},'geometry').postprocess;return s;
}
function rename(s){s=structuredClone(s);const ids=new Map();let n=0;for(const ref of mapped.inventoryUUIDs(s)){if(!ids.has(ref.uuid))ids.set(ref.uuid,'00000000-0000-4000-8000-'+(++n).toString(16).padStart(12,'0'));let at=s;for(const k of ref.path.slice(0,-1))at=at[k];at[ref.path.at(-1)]=ids.get(ref.uuid);}return s;}
test('actual generated observer output connects to actual generated mapper',()=>{const s=capture(),result=mapped.compareSemanticSnapshots(s,rename(s));assert.equal(result.semanticEqual,true,result.error);assert.equal(result.rawEqual,false);assert.equal(result.rawIdsEqual,false);assert.equal(result.before.definitions.length,232);});
test('historical snapshot is still missing owners and cannot pass retroactively',()=>{const result=mapped.semanticSnapshot(raw);assert.equal(result.complete,false);assert.equal(result.unknown.length,12);});
test('state-only polling never enters added owner observation',()=>{const f=fixture(),r=f.g.R.renderer,g=new Proxy(f.g,{get:(o,k)=>{if(k==='R')assert.fail('state-only touched postprocess');return o[k];}});assert.ok(observe({g,G:{},r,a:{}},'state'));});
test('generated geometry observer does not render, read GPU or populate cache',()=>{const f=fixture();for(const key of ['render','readRenderTargetPixels','readRenderTargetPixelsAsync'])f.g.R.renderer[key]=()=>assert.fail('GPU mutation/read');f.g.R.renderer.properties={get:()=>assert.fail('cache populated')};const a=capture(f),b=capture(f);assert.deepEqual(b,a);});
for(const [name,mutate]of Object.entries({
 'foreign sampler':f=>{f.g.R.grade.uniforms.tDiffuse.value=f.g.screenfx.lens.rt.texture;},
 'split alias':f=>{f.g.R.grade.uniforms.tDiffuse.value=f.g.R.composer.renderTarget1.texture.clone();},
 'merged target':f=>{f.g.R.composer.renderTarget2=f.g.R.composer.renderTarget1;},
 'foreign pass':f=>{f.g.R.grade={};}
}))test('generated observer rejects '+name,()=>{const f=fixture();mutate(f);assert.throws(()=>capture(f),/Postprocess owner/);});
for(const[name,mutate]of Object.entries({
 'unknown reference':s=>{s.entryObservation.postprocess.unknown='00000000-0000-4000-8000-999999999999';},
 'shader bytes':s=>{s.entryObservation.postprocess.identityOwners.materials[0].vertex.sha256='0'.repeat(64);},
 'noise bytes':s=>{s.entryObservation.postprocess.ao.gtaoNoise.sha256='0'.repeat(64);},
 'merged texture aliases':s=>{const t=s.entryObservation.postprocess.identityOwners.textures;t[1].uuid=t[0].uuid;}
}))test('generated mapper rejects '+name,()=>{const a=capture(),b=structuredClone(a);mutate(b);assert.equal(mapped.compareSemanticSnapshots(a,b).semanticEqual,false);});
test('frame inverse is exact and original 3-frame / normal timing bodies stay byte-identical',()=>{const observer=read('tools/material-native-aa/postprocess/postprocess-owners.mjs').replace('export function','function');const insertion=observer+'\n postprocess.identityOwners=observePostprocessIdentityOwners(g,sha);\n';assert.equal(source.replace(insertion,''),prepared.program);});
test('paired inverse is exact, keeping all pixel/normal-ABBA gates',()=>{const register=read('tools/material-native-aa/postprocess/register-postprocess.mjs').replace("import assert from 'node:assert/strict';\n",'').replace('export function','function');const inverse=paired.replace(register+'\n','').replace(' const postprocessRules=registerPostprocessOwners(e,register);\n','').replace(' ...postprocessRules,\n','');assert.equal(inverse,oldPair);});
test('actual generated executable hashes bind final programs and retained pre-owner bodies',()=>{const p=extended.prepared.provenance;assert.equal(p.generatedFrameSha256,sha256(source));assert.notEqual(p.generatedFrameSha256,prepared.provenance.generatedFrameSha256);assert.equal(p.postprocessOwners.preOwnerFrameSha256,sha256(prepared.program));assert.equal(p.postprocessOwners.preOwnerPairedSha256,sha256(oldPair));assert.deepEqual(Object.fromEntries(p.postprocessOwners.helpers.map(x=>[x.name,x.sha256])),OWNER_BODIES);});
for(const name of Object.keys(OWNER_BODIES))test('changed '+name+' body fails before generation',()=>{const b=Object.fromEntries(Object.keys(OWNER_BODIES).map(n=>[n,read('tools/material-native-aa/postprocess/'+n)]));b[name]+='\n';assert.throws(()=>preparePostprocessDiagnostic(prepared,oldPair,b),/helper body/);});
test('rehashed but unreviewed pre-owner frame is rejected',()=>{const program=prepared.program+'\n';assert.throws(()=>preparePostprocessDiagnostic({program,provenance:{...prepared.provenance,generatedFrameSha256:sha256(program)}},oldPair),/sequenced frame/);});
test('changed paired semantic boundary rejects',()=>{assert.throws(()=>preparePostprocessDiagnostic(prepared,oldPair.replace('function semanticSnapshot(snapshot)','function wrong(snapshot)')),/injection boundary/);});
test('actual produced paired loop launches new diagnostic body and stops on missing readiness',()=>{const frame=path.join(root,'executed-settled.mjs'),program=bindDiagnosticDriver(paired,frame);const result=auditPairedLaunch(program,{expectedFrame:frame,qa});assert.equal(result.launches.length,1);assert.throws(()=>auditPairedLaunch(bindDiagnosticDriver(oldPair,'scripts/check-inkwave-material-native-frame.mjs'),{expectedFrame:frame,qa}));});
test('portable historical fixture is byte-bound and explicitly remains failed old evidence',()=>{const p=JSON.parse(fs.readFileSync(new URL('./postprocess/historical-fixture-provenance.json',import.meta.url))),bytes=gunzipSync(Buffer.from(fs.readFileSync(new URL('./postprocess/historical-A1-snapshot.json.gz.base64',import.meta.url),'utf8'),'base64'),{maxOutputLength:600000});assert.equal(p.qaHead,'5625829733c77afa6ff26c89a4b067a1cf4643d4');assert.equal(p.sourceRun,39710861283);assert.equal(p.selection,'renderStates[1].before');assert.equal(p.newOwnerEvidencePresent,false);assert.equal(bytes.length,p.snapshotBytes);assert.equal(sha256(bytes),p.snapshotSha256);assert.equal(raw.entryObservation.postprocess.identityOwners,undefined);assert.equal(mapped.semanticSnapshot(raw).complete,false);});
