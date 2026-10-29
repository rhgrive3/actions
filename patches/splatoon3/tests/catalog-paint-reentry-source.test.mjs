import test from 'node:test';
import assert from 'node:assert/strict';
import {runNativePaintReentry,runNativeStringerPaint} from './catalog-paint-reentry-fixture.mjs';
for(const hook of ['recSplat','queryBlocks'])test('source old-policy counterfactual reproduces native catalogue paint corruption through '+hook,async t=>{
 const packets=await runNativePaintReentry({legacy:true,hook});
 assert.notDeepEqual(packets[1].after,packets[1].before,'old shared scratch corrupts the outer packet');
 t.diagnostic(JSON.stringify({hook,outerBefore:packets[1].before,outerAfter:packets[1].after}));
});

for(const hook of ['recSplat','queryBlocks'])test('source old nearest-center policy corrupts real Stringer ground paint through '+hook,async t=>{
 const packets=await runNativeStringerPaint({oldNearest:true,hook});
 assert.notDeepEqual(packets[1].after.center,packets[1].before.center,'old shared floor point corrupts the outer center');
 t.diagnostic(JSON.stringify({hook,outerBefore:packets[1].before,outerAfter:packets[1].after}));
});
