import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {BASELINE_SHA,CASES,VIEWPORTS,reticleCrop,assertSnapshot,pace,sha256} from '../check-inkwave-reticle-visual-review.mjs';

const source=fs.readFileSync(new URL('../check-inkwave-reticle-visual-review.mjs',import.meta.url),'utf8');
const workflow=fs.readFileSync(new URL('../../.github/workflows/inkwave-reticle-visual-review.yml',import.meta.url),'utf8');
function row(scenario,phase='idle',before=false) {
  return {weaponId:scenario.id,hudWeapon:scenario.id,kind:scenario.kind,installed:!before,
    retConnected:true,hudVisible:true,visible:!(scenario.kind==='charger'&&(before||!scenario.profile)&&['idle','release','switch-back'].includes(phase)),rect:{x:640,y:360,width:0,height:0},
    profiles:before||!scenario.profile?[]:[scenario.profile],profileArtwork:[{display:'block',bounds:{width:160,height:128}}],
    chargeHandleConnected:true,chargeHandleInReticle:true,chargeOffset:0,
    chargeArtworkHidden:!before&&!!scenario.profile&&scenario.kind==='charger',decoratedSpreadTicks:4,
    classes:!before&&scenario.profile?[]:['iw-ret--'+scenario.kind],
    charge:phase==='charging'?.5:phase==='full'?1:0,charging:['charging','full'].includes(phase)};
}
test('capture matrix is small, actual weapon IDs, 720p reference plus mobile DPR coverage',()=>{
  assert.equal(CASES.length,7);
  assert.deepEqual(CASES.map(s=>s.id),['roller','s3-shelter-normal','s3-saber-lite','s3-saber-normal','charger','s3-stringer-normal','s3-brush-normal']);
  assert.deepEqual(VIEWPORTS.map(v=>[v.width,v.height,v.deviceScaleFactor]),[[1280,720,1],[844,390,3]]);
  assert.equal(BASELINE_SHA,'7f863ea2d65671abd1453fdae1b61de00f1d10e2');
});
test('reticle crop is unscaled CSS rectangle, centered and clamped',()=>{
  assert.deepEqual(reticleCrop({x:640,y:360,width:0,height:0},VIEWPORTS[0]),{x:520,y:260,width:240,height:200});
  assert.deepEqual(reticleCrop({x:-40,y:500,width:0,height:0},VIEWPORTS[1]),{x:0,y:190,width:240,height:200});
});
test('baseline and actual supported/unprofiled candidate state contracts',()=>{
  for(const before of [true,false])for(const scenario of CASES) {
    for(const phase of scenario.idleOnly?['idle']:scenario.charge?['idle','charging','full','release','switch-back']:['idle','firing','release'])
      assertSnapshot(row(scenario,phase,before),scenario,phase,before);
  }
});
test('fail closed on missing installation, wrong actual ID/profile, hidden overlay and detached charge handle',()=>{
  const s=CASES[2];
  for(const patch of [{installed:false},{weaponId:'charger'},{hudWeapon:'charger'},{profiles:[]},
    {profileArtwork:[{display:'none',bounds:{width:160,height:128}}]},
    {chargeHandleConnected:false},{chargeHandleInReticle:false},{chargeOffset:NaN},{chargeArtworkHidden:false},
    {classes:['iw-ret--charger']},{charging:true,charge:.5}])
    assert.throws(()=>assertSnapshot({...row(s),...patch},s,'idle'),undefined,JSON.stringify(patch));
});
test('native fallback must never inherit a supported overlay or hidden native charge art',()=>{
  const s=CASES.find(s=>s.name==='native-charger-fallback');
  assert.throws(()=>assertSnapshot({...row(s),profiles:['wiper-reference-720p']},s,'idle'));
  assert.throws(()=>assertSnapshot({...row(s),chargeArtworkHidden:true},s,'idle'));
});
test('partial/full/release are real runner predicates, not manufactured frame snapshots',()=>{
  const s=CASES[3];
  assert.throws(()=>assertSnapshot({...row(s,'charging'),charge:1},s,'charging'));
  assert.throws(()=>assertSnapshot({...row(s,'full'),charge:.9},s,'full'));
  assert.throws(()=>assertSnapshot({...row(s,'release'),charging:true},s,'release'));
  assert.match(source,/range\.setWeapon\(id\)/);
  assert.match(source,/debug\.fire\(true\)/);
  assert.doesNotMatch(source,/\.setContent\(|\.insertAdjacentHTML\(|runner\.charge\s*=(?!=)|runner\.charging\s*=(?!=)/);
});
test('paced advancement yields every native RAF, never debug.step or synchronous GPU bursts',async()=>{
  let calls=0;
  await pace({evaluate:async(fn,n)=>{calls++;assert.equal(n,3);assert.match(fn.toString(),/await new Promise\(resolve=>requestAnimationFrame\(resolve\)\)/);}},3);
  assert.equal(calls,1);
  await assert.rejects(pace({},241));
  assert.doesNotMatch(source,/debug\.step\(/);
  assert.match(source,/g\._frame\(1\/60\)/);
});
test('identities, 1:1 frame/crop PNGs and failure diagnostics are persisted',()=>{
  for(const pattern of [/build\.artifacts\[relative\]/,/probeSha256/,/imageSha256/,/baseWeaponId/,/fov:/,/css:/,/failure\.png/,/browser\.log/,/receipt\.status='failed'/])assert.match(source,pattern);
  assert.equal(sha256('reticle').length,64);
});
test('workflow has only exact isolated branch plus trigger path; no PR/manual/all-CI trigger',()=>{
  assert.match(workflow,/branches: \['improve\/inkwave-weapon-reticles-20261025'\]/);
  assert.match(workflow,/paths: \['diagnostics\/inkwave-reticle-visuals\.trigger\.json'\]/);
  assert.doesNotMatch(workflow,/pull_request:|workflow_dispatch:|schedule:|push:\s*\n\s+branches:.*main/);
  assert.equal((workflow.match(/runs-on:/g)||[]).length,1);
  assert.match(workflow,/ref: \$\{\{ github\.sha \}\}/);
  assert.match(workflow,/test "\$\(git rev-parse HEAD\)" = "\$SOURCE_SHA"/);
  assert.match(workflow,/assert\.equal\(trigger\.state,'run'\)/);
  assert.match(workflow,/assert\.equal\(trigger\.fullAcceptance,false\)/);
});
test('workflow pins tools, builds both actual production sources and always uploads hidden diagnostics',()=>{
  assert.match(workflow,/esbuild@0\.28\.2 playwright@1\.62\.1/);
  assert.equal((workflow.match(/node scripts\/build-inkwave\.mjs inkwave-public/g)||[]).length,2);
  assert.doesNotMatch(workflow,/INKWAVE_BUILD_UNMINIFIED|continue-on-error|npm test|npm run test/);
  assert.match(workflow,/if: always\(\)/);
  assert.match(workflow,/include-hidden-files: true/);
  assert.match(workflow,/set -euo pipefail/);
  assert.match(workflow,/retailParity:'unverified',fullAcceptance:false/);
});
