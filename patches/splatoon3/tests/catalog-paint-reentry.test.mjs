import test from 'node:test';
import assert from 'node:assert/strict';
import {runNativePaintReentry} from './catalog-paint-reentry-fixture.mjs';
for(const hook of ['recSplat','queryBlocks'])test('native catalogue paint preserves both live impact packets across '+hook+' reentry',async t=>{
 const packets=await runNativePaintReentry({hook});
 for(const p of packets)assert.deepEqual(p.after,p.before,'native consumer must retain its packet across nested impact');
 t.diagnostic(JSON.stringify({hook,packets}));
});
