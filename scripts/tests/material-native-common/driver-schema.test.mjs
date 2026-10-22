import preserved from './fixtures/preserved-contracts.json' with {type:'json'};
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import{semanticSnapshot}from'./semantic-identity.mjs';import{compareReplaySemanticCondition,requireReplayIdentityCoverage}from'./replay-semantic-condition.mjs';
import{fixture,condition,rename,driver}from'./driver-schema-fixture.mjs';
const id=n=>'00000000-0000-4000-8000-'+n.toString(16).padStart(12,'0');
test('actual generated snapshot + embedded resource observer feeds mapper and paired coverage',()=>{const f=fixture(),s=f.capture();assert.equal(s.entryObservation.nativeResources.schema,1);assert.equal(s.entryObservation.nodeGraph.length,3);assert.equal(semanticSnapshot(s).complete,true);const c=condition(s);assert.equal(requireReplayIdentityCoverage(c).complete,true);const r=compareReplaySemanticCondition(rename(c),c);assert.equal(r.semanticEqual,true);assert.equal(r.rawEqual,false);assert.equal(r.rawIdsEqual,false);});
for(const[name,change]of[
 ['other native atlas RT',f=>f.G.paint.rt.texture={}],['other native bone array',f=>f.a.character.skeleton.boneMatrices=new Float32Array(64)],
 ['uncached native material',f=>{f.r.properties.has=()=>false;f.r.properties.get=()=>{throw Error('uncached get');};}]
])test('actual driver captures '+name+' and paired admission rejects',()=>{const f=fixture(),a=condition(f.capture());change(f);assert.equal(compareReplaySemanticCondition(condition(f.capture()),a).semanticEqual,false);});
for(const[name,change]of[
 ['loaded resource change',c=>c.loadedExceptMaterial.push(['other.js','c'.repeat(64)])],['gameplay RNG change',c=>c.initial.gameplaySeed++],['capture ordinal change',c=>c.renderStates[0].captureOrdinal++],['unknown native reference',c=>c.renderStates[0].before.extraTexture=id(999)],['renderer frame change',c=>c.renderStates[1].after.rendererFrame++],['source identity change',c=>c.sourceSha='e'.repeat(40)]
])test('paired strict '+name,()=>{const a=condition(fixture().capture()),b=rename(a);change(b);assert.equal(compareReplaySemanticCondition(b,a).semanticEqual,false);});
test('runtime head is exact common cc0, never silent429 fallback',()=>{assert.ok(driver.includes("sourceSha='cc0c90afe8031643e6a890974f8f44a40a30509e';assert.match"));assert.ok(!driver.includes("sourceSha='429cc"));});
test('normal measured path and original3-frame observer remain byte-exact',()=>{const marker='  // Warm the actual full-game renderer and shaders after native painting.';assert.equal(driver.split(marker)[1].split(' },')[0],preserved.normalMeasuredBody);const a=preserved.originalThreeFrameObserver;const b=driver.slice(driver.indexOf('function materialEntryObservation('),driver.indexOf('function requireSettledMaterialEntry'));assert.ok(a.length>100);assert.equal(a,b);});
