import test from 'node:test';import assert from 'node:assert/strict';
import {nativeStageRuleStatus} from '../runtime/rule-availability.mjs';
import {BASE_SOURCE_STAGES} from '../runtime/source-catalog.mjs';
import {prepareNativeStageBuild} from '../../../scripts/lib/inkwave-native-stages.mjs';

test('Hagglefish Tower status limits this inferred build without denying retail or compound human routes',()=>{
 const status=nativeStageRuleStatus('hagglefish','tower');assert.equal(status.supported,false);assert.equal(status.status,'source-route-unverified');assert.match(status.reason,/ガチヤグラ/);assert.match(status.evidence,/Compound human jump\/climb connectivity.*remain unverified/);
 const stage=BASE_SOURCE_STAGES.find(s=>s.id==='hagglefish');assert.deepEqual(stage.spawnPads,[[0,13.58,-67.08],[-0,13.58,67.08]]);
 assert.equal(stage.sourceSha256,'1da0c775b47e42e9bc8657675034e935c672866ee109c13896283b3bbe7c77f4');
 const sealed=prepareNativeStageBuild(null).config.stages.find(s=>s.id==='hagglefish');assert.deepEqual(sealed.ruleAvailability,stage.ruleAvailability);
 for(const id of ['scorch','hagglefish','inkblot','mako','brinewater'])for(const mode of ['turf','zones','tower','rainmaker','clams'])assert.equal(nativeStageRuleStatus(id,mode).supported,id!=='hagglefish'||mode!=='tower');
 assert.equal(nativeStageRuleStatus('tidewater','tower'),null);
});
