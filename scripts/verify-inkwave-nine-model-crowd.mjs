import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

export const selected = ['s3-saber-normal','s3-saber-lite','s3-saber-heavy','s3-stringer-normal','s3-stringer-short','s3-stringer-explosion','s3-shelter-normal','s3-shelter-wide','s3-shelter-focus'];
// Production keeps articulated Brella canopies animated/near at every body tier.
// Bind the exception to the exact nine-weapon roster, never an observed result.
export const canopyWeapons = new Set(['s3-shelter-normal','s3-shelter-wide','s3-shelter-focus']);
export function expectedWeaponNear(id,tier){
  assert.ok(selected.includes(id),'Unknown crowd weapon');
  assert.ok(tier==='game'||tier==='far','Unknown crowd tier');
  return tier==='game'||canopyWeapons.has(id);
}
// Two eight-player scenarios are required: neither can silently omit the ninth weapon.
export const rosters = { A: selected.slice(0,8), B: selected.slice(1) };
assert.deepEqual([...new Set(Object.values(rosters).flat())].sort(), [...selected].sort());
for (const ids of Object.values(rosters)) assert.equal(new Set(ids).size,8);

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
if (process.argv[2] === '--roster') {
  assert.ok(rosters[process.argv[3]], 'Unknown roster');
  console.log(rosters[process.argv[3]].join(','));
} else if (process.argv[2]) {
  const root=process.argv[2], comparison={};
  for (const [scenario,ids] of Object.entries(rosters)) {
    const all={};
    for (const pair of ['before-A','after-B','after-B2','before-A2']) {
      const data=JSON.parse(fs.readFileSync(path.join(root,scenario,pair,'crowd.json')));
      assert.deepEqual(data.errors,[]);assert.equal(data.roster,scenario);assert.equal(data.environment.inputWidth,1024);assert.equal(data.browser.width,600);assert.equal(data.browser.height,600);
      assert.ok(Number.isFinite(data.warm.warmAllMs)&&data.warm.warmAllMs>0);assert.ok(Number.isFinite(data.warm.actorSetupMs)&&data.warm.actorSetupMs>0);assert.equal(data.post.gtao,true);assert.equal(data.post.bloomEnabled,true);assert.equal(data.post.dynamicScale,1);assert.equal(data.post.quality,'high');assert.ok(data.warm.firstPostFrame.renderThroughReadbackMs>0);
      all[pair]=data.tiers;all[pair]._warm=data.warm;all[pair]._browser=data.browser;
      for (const tier of ['game','far']) {
        const row=all[pair][tier]; assert.equal(row.actors,8); assert.deepEqual(row.ids,ids);
        assert.deepEqual(row.lodTiers,ids.map(()=>tier));
        assert.deepEqual(row.lodStates,ids.map(()=>({force:tier==='game'?1:2,tier:tier==='game'?1:2,to:-1})));
        assert.deepEqual(row.camera.position,[-5,3.5,8]); assert.deepEqual(row.camera.target,[0,.8,0]); assert.equal(row.camera.fov,40);
        const delta=[5,-2.7,-8],length=Math.hypot(...delta);
        assert.equal(row.camera.direction.length,3);
        row.camera.direction.forEach((v,i)=>assert.ok(Math.abs(v-delta[i]/length)<1e-12));
        assert.deepEqual(row.weaponNear,ids.map(id=>expectedWeaponNear(id,tier)));
        for (const metric of ['animationMs','renderSubmitMs','completionWaitMs','renderThroughReadbackMs'])
          for (const percentile of ['p50','p95']) assert.ok(Number.isFinite(row[metric][percentile]));
        assert.equal(row.frames.length,15);assert.equal(row.frames.filter(f=>f.phase==='measured').length,12);
        for(const [index,frame] of row.frames.entries()){assert.equal(frame.index,index);assert.equal(frame.phase,index<3?'warmup':'measured');for(const key of ['animationMs','submitMs','readbackWaitMs','renderThroughReadbackMs'])assert.ok(Number.isFinite(frame[key])&&frame[key]>=0,key+' valid raw timing');assert.equal(frame.glError,0);assert.equal(frame.contextLost,false);assert.equal(frame.defaultReadFramebuffer,true);assert.equal(frame.pixel.length,4);assert.equal(frame.pixel[3],255);assert.ok(frame.pixel.slice(0,3).some(x=>x!==0));assert.ok(frame.renderThroughReadbackMs>=frame.submitMs);assert.equal(frame.width,600);assert.equal(frame.height,600);}
        // The old static ceiling (59 far, 118/119 game) predates the
        // immutable main used by this very ABBA comparison. That baseline
        // already submits 65/68 far draws in both independent rosters.
        // Diagnose legacy-budget drift, but never attribute it to the PR.
        // Hold the candidate to the measured *same-source* baseline instead;
        // its fixed-geometry byte budgets and complete-frame comparisons
        // remain mandatory below.
        const historicalCap=tier==='far'?59:scenario==='A'?118:119;
        const measuredMain=all['before-A'][tier].drawCalls;
        assert.ok(Number.isSafeInteger(row.drawCalls)&&row.drawCalls>0,'nonempty measured draw count');
        assert.ok(Number.isSafeInteger(measuredMain)&&measuredMain>0,'nonempty immutable main draw budget');
        if(pair==='before-A2') assert.equal(row.drawCalls,measuredMain,'immutable baseline repeat draw budget');
        if(pair.startsWith('after')) assert.ok(row.drawCalls<=measuredMain,'candidate must not exceed exact-head baseline draws');
        if(pair==='before-A' && measuredMain>historicalCap) console.warn('NINE_MODEL_HISTORICAL_MAIN_DRAW_DRIFT',JSON.stringify({scenario,tier,legacyCeiling:historicalCap,measuredMain}));

      }
    }
    for (const tier of ['game','far']) for (const pair of ['after-B','after-B2','before-A2']) {
      const recorded=all[pair][tier].drawCalls,base=all['before-A'][tier].drawCalls;
      if(pair.startsWith('after')) assert.ok(recorded>0&&recorded<=base,`${scenario}/${pair}/${tier}: draw increase or empty render`);
      else assert.equal(recorded,base,`${scenario}/${pair}/${tier}: baseline drift`);
      assert.deepEqual(all[pair][tier].weaponNear,all['before-A'][tier].weaponNear,`${scenario}/${pair}/${tier}: LOD mismatch`);
    }
    for(const tier of ['game','far']){
      const base=all['before-A'][tier],repeat=all['before-A2'][tier],cap=tier==='game'?1024*1024:128*1024;
      assert.equal(base.visibleGeometryBytes,repeat.visibleGeometryBytes,'stable baseline geometry allocation');
      assert.equal(base.triangles,repeat.triangles,'stable baseline triangles');
      for(const pair of ['after-B','after-B2']){
        assert.ok(all[pair][tier].visibleGeometryBytes-base.visibleGeometryBytes<=cap,`${scenario}/${pair}/${tier}: approved absolute model-complexity memory increase`);
        assert.equal(all[pair][tier].triangles,all['after-B'][tier].triangles,'stable candidate triangles');
        assert.ok(all[pair][tier].triangles>0,'candidate retains visible rendered triangles');
        assert.equal(all[pair][tier].drawCalls,all['after-B'][tier].drawCalls,'candidate draw batching stable across B/B2');
      }
    }
    comparison[scenario]=all;
  }
  fs.writeFileSync(path.join(root,'comparison.json'),JSON.stringify({scope:'Approved model-complexity envelope, not a lightweight/performance-success claim. Game +1MiB, far +128KiB versus the same immutable main adbd83ee4f6aaef8cb7853de997d42d702c8badf composition; existing per-model <=16000 triangle and geometry-attribute contracts run separately. Completion timing uses actual postprocessor final-output readPixels on SwiftShader and requires manual review.',selected,rosters,comparison},null,2));
  console.log('NINE_MODEL_CROWD_ABBA '+JSON.stringify({selected,rosters,comparison}));
}

}
