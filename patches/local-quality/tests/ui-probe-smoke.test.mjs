import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {smokePlan,executeSmokePlan,validateSmokeReceipts,requiredSmokeImages,RANGE_RUNS} from '../../../scripts/check-inkwave-ui-probes.mjs';

const root=new URL('../../../',import.meta.url);
const read=name=>fs.readFileSync(new URL(name,root),'utf8');
function receipts(){return{
  sourceSha:'source',contentHash:'content',outcomes:[{name:'hud',code:0},{name:'range',code:0}],
  hud:{status:'passed',scope:'ui-probes-only',fullAcceptance:false,sourceSha:'source',contentHash:'content',hudAuthority:{authoritativeSpread:[{},{},{},{}],winnerPodium:{states:[{},{}]}}},
  range:{status:'passed',scope:'signage-only',fullAcceptance:false,contentHash:'content',runs:RANGE_RUNS.map(name=>({name,status:'passed',checks:{signageBudget:{active:{width:1024}},signageViews:[{zone:'gallery'},{zone:'wall'}]}}))},
};}
test('one diagnostic command reuses exact-source active and all Range viewport fixtures without quick mode',()=>{
  const plan=smokePlan({site:'/site',evidence:'/evidence',profile:'/profile'});
  assert.equal(plan.length,2);assert.equal(plan[0].script,'scripts/check-inkwave-browser.mjs');assert.equal(plan[1].script,'scripts/check-inkwave-range.mjs');
  assert(plan[0].args.includes('--exact-source'));assert(plan[0].args.includes('--ui-probes-only'));assert(plan[1].args.includes('--signage-only'));
  assert(!plan.flatMap(x=>x.args).includes('--quick'));assert(plan.every(x=>x.args[x.args.indexOf('--site')+1]==='/site'));
});
test('independent Range diagnostic still runs when HUD launch or probe fails',async()=>{
  const called=[];const result=await executeSmokePlan([{name:'hud'},{name:'range'}],async task=>{called.push(task.name);if(task.name==='hud')throw Error('launch denied');return{code:0};});
  assert.deepEqual(called,['hud','range']);assert.equal(result[0].code,null);assert.match(result[0].error,/launch denied/);assert.equal(result[1].code,0);
});
test('diagnostic receipts reject stale identities, full-suite labels and partial viewport coverage',()=>{
  assert.deepEqual(validateSmokeReceipts(receipts()),[]);
  for(const mutate of [r=>r.hud.sourceSha='old',r=>r.range.contentHash='old',r=>r.hud.fullAcceptance=true,r=>r.range.scope='full-range',r=>r.range.runs.pop(),r=>r.hud.hudAuthority.winnerPodium.states.pop(),r=>r.outcomes[0].code=1,r=>r.range.runs[1].checks.signageViews.pop()]){
    const r=receipts();mutate(r);assert(validateSmokeReceipts(r).length>0);
  }
});
test('receipt requires four accuracy, four winner and all signage atlas/world PNGs',()=>{
  const names=requiredSmokeImages();assert.equal(names.length,18);assert.equal(new Set(names).size,18);
  assert(names.includes('hud/winner-podium-0-back.png'));assert(names.includes('hud/winner-podium-1-loss.png'));assert(names.includes('range/webkit-tablet-signage-world-wall.png'));assert(names.includes('range/chromium-desktop-signage-high.png'));
});
test('smoke shares native assertions while full paths keep their broader checks',()=>{
  const active=read('scripts/check-inkwave-browser.mjs'),hud=read('scripts/check-inkwave-hud-authority.mjs'),range=read('scripts/check-inkwave-range.mjs');
  assert.match(active,/if \(uiProbesOnly\)/);assert.match(active,/checkUiVisualProbes\(\{page,evidence,sourceSha,contentHash:manifest.contentHash\}\)/);
  assert.match(active,/result\.hudAuthority = await checkHudAuthority/);assert.match(active,/Actual browser gameplay regression/);
  assert.match(hud,/Object\.assign\(result, await checkUiVisualProbes/);assert.match(hud,/result\.winnerPodium=await checkWinnerPodium/);
  assert.match(hud,/\['spread','hidden','opacity'\]/);assert.match(hud,/reticle negative cleanup remained hidden/);
  assert(range.indexOf('out.checks.signageViews=[]')<range.indexOf('if (!signageOnly)'));assert(range.indexOf('out.checks.hit =')>range.indexOf('if (!signageOnly)'));
  assert.match(range,/range HUD covers touch controls/);assert.match(range,/isolation/);
});
test('smoke preserves native start/intro and immutable source identity, and never removes old evidence',()=>{
  const active=read('scripts/check-inkwave-browser.mjs'),smoke=read('scripts/check-inkwave-ui-probes.mjs');
  const branch=active.slice(active.indexOf('  if (uiProbesOnly) {'),active.indexOf('  // Exercise the native menu interval'));
  assert.match(branch,/startMatch\(\{mapId:'tidewater'/);assert.match(branch,/hud\?\._visible && !document\.querySelector\('\.iw-lineup'\)/);assert.match(branch,/g\.debug\.freezeBots\(\)/);
  assert.match(smoke,/Use fresh probe output\/profile directory/);assert.match(smoke,/Probe differs from source commit/);assert.match(smoke,/visualReviewRequired:true/);
  assert.doesNotMatch(smoke,/rmSync|unlinkSync/);
});
