import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeProbe} from './issue-845-ground-certificate-fixture.mjs';

test('source old-policy counterfactual changes live native contact on interior support',async t=>{
 assert.equal(!!process.env.INKWAVE_BUILT_SITE,false,'source-only counterfactual');
 const before=await nativeProbe({oldPolicy:true}),after=await nativeProbe();
 assert.ok(Math.abs(before.groundAt-.1)<1e-9&&Math.abs(after.groundAt-.1)<1e-9,'actual support is present in both fixtures');
 assert.ok(before.budget>=120&&after.budget>=120);
 assert.ok(after.targetHits>before.targetHits,'corrected solver samples the support more often than the shortcut');
 let maxMuzzle=0,firstMuzzle=-1,firstContact=-1;
 for(let i=0;i<after.rows.length;i++){
  const x=before.rows[i],y=after.rows[i];
  assert.equal(JSON.stringify({position:y.position,vel:y.vel,hp:y.hp,ink:y.ink}),JSON.stringify({position:x.position,vel:x.vel,hp:x.hp,ink:x.ink}),'actor state remains same in isolated fixture');
  const d=Math.hypot(...x.muzzle.map((v,j)=>v-y.muzzle[j]));if(d>0&&firstMuzzle<0)firstMuzzle=i;maxMuzzle=Math.max(maxMuzzle,d);
  if(firstContact<0&&JSON.stringify(x.contacts)!==JSON.stringify(y.contacts))firstContact=i;
 }
 assert.ok(firstContact>=0,'old rectangle changes real contact state');
 t.diagnostic(JSON.stringify({beforeGroundCalls:before.ground,afterGroundCalls:after.ground,beforeTargetHits:before.targetHits,afterTargetHits:after.targetHits,firstContact,firstMuzzle,maxMuzzle}));
});
