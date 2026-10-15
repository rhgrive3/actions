import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareNativeStageBuild} from '../../../scripts/lib/inkwave-native-stages.mjs';
import {nativeStageRuleStatus} from '../runtime/rule-availability.mjs';
import {nativeFixture} from './fixture.mjs';

test('source fixture executes the real sealed native catalog and qualified rule guards',async()=>{
 const prepared=prepareNativeStageBuild(process.env.INKWAVE_NATIVE_STAGE_ASSETS||null),f=await nativeFixture();
 assert.equal(JSON.stringify(f.nativeStageBuild),JSON.stringify(prepared.config));
 assert.equal(JSON.stringify(f.NATIVE_MAPS.map(s=>s.id)),JSON.stringify(prepared.config.stages.map(s=>s.id)));
 assert.equal(JSON.stringify(f.UNAVAILABLE_NATIVE_STAGES),JSON.stringify(prepared.config.unavailableStages));
 for(const stage of prepared.config.stages)for(const mode of ['turf','zones','tower','rainmaker','clams']){
  const actual=f.nativeStageRuleStatus(stage.id,mode),expected=nativeStageRuleStatus(stage.id,mode,prepared.config.stages);
  assert.equal(JSON.stringify(actual),JSON.stringify(expected),stage.id+' '+mode+' real catalog status');
 }
});
