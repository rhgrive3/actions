import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

export const selected = ['s3-saber-normal','s3-saber-lite','s3-saber-heavy','s3-stringer-normal','s3-stringer-short','s3-stringer-explosion','s3-shelter-normal','s3-shelter-wide','s3-shelter-focus'];
// Two eight-player scenarios are required: neither can silently omit the ninth weapon.
export const rosters = { A: selected.slice(0,8), B: selected.slice(1) };
assert.deepEqual([...new Set(Object.values(rosters).flat())].sort(), [...selected].sort());
for (const ids of Object.values(rosters)) assert.equal(new Set(ids).size,8);

if (process.argv[2] === '--roster') {
  assert.ok(rosters[process.argv[3]], 'Unknown roster');
  console.log(rosters[process.argv[3]].join(','));
} else if (process.argv[2]) {
  const root=process.argv[2], comparison={};
  for (const [scenario,ids] of Object.entries(rosters)) {
    const all={};
    for (const pair of ['before-A','after-B','after-B2','before-A2']) {
      const data=JSON.parse(fs.readFileSync(path.join(root,scenario,pair,'gallery.json')));
      assert.deepEqual(data.errors,[]); assert.equal(data.rows.length,1);
      all[pair]=data.rows[0].crowd;
      for (const tier of ['game','far']) {
        const row=all[pair][tier]; assert.equal(row.actors,8); assert.deepEqual(row.ids,ids);
        assert.deepEqual(row.lodTiers,ids.map(()=>tier));
        assert.deepEqual(row.lodStates,ids.map(()=>({force:tier==='game'?1:2,tier:tier==='game'?1:2,to:-1})));
        assert.deepEqual(row.camera.position,[-5,3.5,8]); assert.deepEqual(row.camera.target,[0,.8,0]); assert.equal(row.camera.fov,40);
        const delta=[5,-2.7,-8],length=Math.hypot(...delta);
        assert.equal(row.camera.direction.length,3);
        row.camera.direction.forEach((v,i)=>assert.ok(Math.abs(v-delta[i]/length)<1e-12));
        assert.deepEqual(row.weaponNear,ids.map(()=>tier==='game'));
        for (const metric of ['animationMs','renderSubmitMs','renderCompleteMs'])
          for (const percentile of ['p50','p95']) assert.ok(Number.isFinite(row[metric][percentile]));
      }
    }
    for (const tier of ['game','far']) for (const pair of ['after-B','after-B2','before-A2']) {
      assert.equal(all[pair][tier].drawCalls,all['before-A'][tier].drawCalls,`${scenario}/${pair}/${tier}: draw-call difference`);
      assert.deepEqual(all[pair][tier].weaponNear,all['before-A'][tier].weaponNear,`${scenario}/${pair}/${tier}: LOD mismatch`);
    }
    comparison[scenario]=all;
  }
  fs.writeFileSync(path.join(root,'comparison.json'),JSON.stringify({selected,rosters,comparison},null,2));
  console.log('NINE_MODEL_CROWD_ABBA '+JSON.stringify({selected,rosters,comparison}));
}
