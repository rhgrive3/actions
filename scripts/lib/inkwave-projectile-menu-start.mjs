// Browser-test navigation only. Production menu handlers own preparation,
// screen wipe, recorded-audio admission, match construction and recovery.
export async function startProjectileThroughMenu(page,{waitForPhase,remainingMs,receipt}){
  const note=(event,data={})=>receipt.push({event,at:new Date().toISOString(),...data});
  const click=async selector=>{await page.locator(selector).click({timeout:Math.max(1,remainingMs())});note('click',{selector});};
  await waitForPhase(()=>{const g=window.__inkwave,G=window.__G;return !!(g?.debug&&Number.isFinite(g.bootMs)&&G?.mode==='menu'&&g.match?.attract&&g.menus?.current==='main'&&g.menus?._scr?.name==='main');},'native main menu readiness');
  note('native-menu-ready');
  await click('.iw-main [data-id="play"]');
  await waitForPhase(()=>window.__inkwave?.menus?.current==='mode','native mode menu');
  // A pointer left on the prior screen's PLAY tile can land over an enlarged
  // neighbouring mode card during the transition. Clear that genuine hover
  // before choosing Turf with the ordinary hit-tested pointer gesture.
  await page.mouse.move(1, 1);
  note('mode-pointer-hover-cleared');
  // The separate Range card intercepts direct Turf taps on some touch-sized
  // screens. Performance capture may use genuine keyboard navigation; touch
  // admission itself remains covered by independent native UI tests.
  const turfSelector='.iw-modesel [data-id="mode-turf"]',turf=page.locator(turfSelector);
  const touchPrimary=await page.evaluate(()=>navigator.maxTouchPoints>0&&matchMedia('(pointer:coarse)').matches);
  if(touchPrimary){
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    const focus=await page.evaluate(()=>{
      const m=window.__inkwave?.menus;
      return {screen:m?.current??null,button:m?._focus?.dataset?.id??null};
    });
    if(focus.screen!=='mode'||focus.button!=='mode-turf')
      throw Error('Native Turf keyboard focus mismatch: '+JSON.stringify(focus));
    note('native-turf-focused',{focus,inputs:['ArrowLeft','ArrowLeft']});
    await page.keyboard.press('Enter');
    note('keyboard-activate-on-touch',{selector:turfSelector,key:'Enter'});
  }else{
    await turf.press('Enter',{timeout:Math.max(1,remainingMs())});
    note('keyboard-activate',{selector:turfSelector,key:'Enter'});
  }
  await waitForPhase(()=>window.__inkwave?.menus?.current==='setup','native setup menu');
  await click('.iw-setup [data-id="map-tidewater"]');
  const config=await page.evaluate(()=>{const g=window.__inkwave,s=g.menus?._setup;return {mode:s?.mode,map:s?.mapId,difficulty:s?.difficulty,duration:s?.duration,weapon:g.profile?.weapon,time:g.menus?._stageTime?.(s?.mapId)};});
  if(config.mode!=='turf'||config.map!=='tidewater'||config.difficulty!=='normal'||config.duration!==180||config.weapon!=='shooter'||config.time!=='day')throw new Error('Native projectile menu configuration mismatch: '+JSON.stringify(config));
  note('native-setup-verified',{config});
  // The real handler invokes prepareMatch during this gesture, then the wipe,
  // then startMatch. Never call audio readiness or startMatch from this helper.
  await click('.iw-setup [data-id="start"].iw-btn--start');
  note('native-start-clicked',{attempt:1});
}
