import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {sourceLoadedActorFixture} from './source-loaded-actor-fixture.mjs';
import {sourceLoadedLegacyRainmakerAnchorFixture,LEGACY_RAINMAKER_ANCHOR} from './rainmaker-legacy-anchor-fixture.mjs';
// Use the same complete input driver as native capture. Only the renderer
// module is stubbed for CPU execution; no actor/runtime source is substituted.
const browserURL=new URL('../../../tools/rainmaker-air-production-qa/browser.mjs',import.meta.url);
const context=vm.createContext({console}),module=new vm.SourceTextModule(fs.readFileSync(browserURL,'utf8'),{context});
await module.link(spec=>{assert.equal(spec,'./shared/production-scene.mjs');return new vm.SyntheticModule(['productionScene'],function(){this.setExport('productionScene',()=>{throw Error('CPU test must not start renderer');});},{context});});await module.evaluate();
const {runAirScenario,verifyAirScenario}=module.namespace;
const f=await sourceLoadedActorFixture({random:()=>.5,extraExports:`export {createRankedEffects} from './patches/splatoon3/runtime/ranked/combat.mjs';export {createRainmakerModel,createRainmakerPresentation} from './patches/splatoon3/runtime/ranked/rainmaker-model.mjs';`});
for(const scenario of ['carry-jump','charge-jump'])test(scenario+' actual source Dualies3 jumps keep all84 air and48 landing contacts within .001 world units',async t=>{
 const r=await runAirScenario({api:f,scenario});assert.equal(verifyAirScenario(r),true);
 assert.equal(r.landingFrames,48);assert.equal(r.landingBadFrames,0);assert.ok(r.worstLanding.grip<.001);
 t.diagnostic(JSON.stringify({...r,traces:undefined,firstBad:undefined,worst:{frame:r.worst.frame,grip:r.worst.grip},worstLanding:{frame:r.worstLanding.frame,grip:r.worstLanding.grip},emitted:!!process.env.INKWAVE_BUILT_SITE}));
});

const legacy=await sourceLoadedLegacyRainmakerAnchorFixture({random:()=>.5,extraExports:`export {createRankedEffects} from './patches/splatoon3/runtime/ranked/combat.mjs';export {createRainmakerModel,createRainmakerPresentation} from './patches/splatoon3/runtime/ranked/rainmaker-model.mjs';`});
for(const scenario of ['carry-jump','charge-jump'])test('legacy anchor calibration: '+scenario+' retains real air/land correction branch coverage',async t=>{
 const r=await runAirScenario({api:legacy,scenario});assert.equal(verifyAirScenario(r),true);
 assert.equal(r.landingFrames,48);assert.equal(r.landingBadFrames,0);assert.ok(r.worstLanding.grip<.001);
 assert.ok(r.traces.some(row=>row.pending&&row.angle>0),'real input must reach support correction');
 if(scenario==='carry-jump')assert.ok(r.maxTranslation>0,'carry input must reach capped-rotation/position branch');
 t.diagnostic(JSON.stringify({calibration:LEGACY_RAINMAKER_ANCHOR,emitted:false,...r,traces:undefined,firstBad:undefined,worst:{frame:r.worst.frame,grip:r.worst.grip},worstLanding:{frame:r.worstLanding.frame,grip:r.worstLanding.grip}}));
});

test('current shoulder carry: injected landing hand offset is measured and rejected by the unchanged grip verifier',async t=>{
 const r=await runAirScenario({api:f,scenario:'carry-jump',injectLandingFault:true});
 assert.equal(r.airFrames,84);assert.equal(r.badFrames,0);
 assert.equal(r.landingFrames,48);assert.ok(r.landingBadFrames>0,'real landing samples must expose the injected hand displacement');
 assert.throws(()=>verifyAirScenario(r),/all48 actual landing frames keep world grip < \.001/);
 t.diagnostic(JSON.stringify({pose:'current',negative:'QA-only +0.05 local handL x after landing solve',airBadFrames:r.badFrames,landingBadFrames:r.landingBadFrames,worstLandingGrip:r.worstLanding.grip,emitted:!!process.env.INKWAVE_BUILT_SITE}));
});
