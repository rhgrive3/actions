import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {sourceLoadedActorFixture} from './source-loaded-actor-fixture.mjs';
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
 assert.ok(r.maxTranslation>0,'real input must reach capped-rotation/position branch');
 t.diagnostic(JSON.stringify({...r,traces:undefined,firstBad:undefined,worst:{frame:r.worst.frame,grip:r.worst.grip},worstLanding:{frame:r.worstLanding.frame,grip:r.worstLanding.grip},emitted:!!process.env.INKWAVE_BUILT_SITE}));
});
