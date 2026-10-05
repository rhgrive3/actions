import assert from 'node:assert/strict';
// Actual production Menus DOM and storage callbacks. No real match/network is
// started: the caller's fixture records the existing rematch API invocation.
export async function checkResultContinuation({page,tap,settle,capture,entry}) {
  await page.evaluate(()=>{
    window.__continuationOriginal={rematch:menus.api.rematch,prepareMatch:menus.api.prepareMatch};
    window.__continuationCalls=[];
    menus.api.prepareMatch=()=>__continuationCalls.push({kind:'prepare'});
    menus.api.rematch=()=>__continuationCalls.push({kind:'rematch',weapon:menus.api.getLoadout().weapon});
    menus.showResults(menus._demoResults());window.__continuationResult=menus._results;window.__continuationResultJSON=JSON.stringify(menus._results);
    menus.wipe.cancel();menus.show('results',{force:true,wipe:false});
  });
  const ready=async()=>{await settle(page);await page.waitForFunction(()=>performance.now()-menus._shownAt>=220&&!document.querySelector('.iw-screen.is-leaving'));};
  try {
    await ready();await tap(page,'.iw-res__title');await ready();await capture('results-change-gear','.iw-res__foot button');
    await tap(page,'[data-id="change-gear-continue"]');await page.waitForFunction(()=>menus.current==='loadout'&&menus._scr?.name==='loadout');await ready();
    const before=await page.evaluate(()=>menus.api.getLoadout().weapon);
    const different=page.locator('.iw-loadout .iw-wcard');
    const ids=await different.evaluateAll(xs=>xs.map(x=>x._wid));const next=ids.find(id=>id!==before);assert(next);
    await tap(page,'[data-id="w-'+next+'"]');assert.equal(await page.evaluate(()=>menus.api.getLoadout().weapon),next);
    await capture('loadout-continue','.iw-continuation-actions button');await ready();
    await tap(page,'.iw-loadout .iw-backbtn');await page.waitForFunction(()=>menus.current==='results'&&menus._scr?.name==='results');await ready();
    assert.deepEqual(await page.evaluate(()=>__continuationCalls),[],'Back cannot start');
    assert(await page.evaluate(()=>menus._results===__continuationResult&&JSON.stringify(menus._results)===__continuationResultJSON),'old results unchanged after equipment save');
    await tap(page,'[data-id="change-gear-continue"]');await page.waitForFunction(()=>menus.current==='loadout'&&menus._scr?.name==='loadout');await ready();
    await tap(page,'.iw-loadout [data-id="look"]');await page.waitForFunction(()=>menus.current==='locker'&&menus._scr?.name==='locker');await ready();
    await tap(page,'.iw-locker .iw-backbtn');await page.waitForFunction(()=>menus.current==='loadout'&&menus._scr?.name==='loadout');await ready();
    assert.equal(await page.locator('[data-id="continue-with-gear"]').count(),1);
    await tap(page,'[data-id="continue-with-gear"]');
    await page.evaluate(()=>document.querySelector('[data-id="continue-with-gear"]').click());
    assert.deepEqual(await page.evaluate(()=>__continuationCalls),[{kind:'prepare'},{kind:'rematch',weapon:next}]);
    entry.resultContinuation={status:'passed',changedWeapon:next,starts:1,resultPreserved:true,backWithoutStart:true,lockerRoundtrip:true};
  } finally {
    await page.evaluate(()=>{Object.assign(menus.api,__continuationOriginal);menus.show('main',{wipe:false});delete window.__continuationOriginal;delete window.__continuationCalls;delete window.__continuationResult;delete window.__continuationResultJSON;});
  }
}
