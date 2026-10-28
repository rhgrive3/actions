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
    // Follow native focus through the actual rendered responsive grid. The
    // Practice Range card is appended after six modes; two ArrowLeft presses
    // do NOT necessarily reach Turf on a three-column mobile viewport.
    const readFocus=()=>page.evaluate(()=>{
      const m=window.__inkwave?.menus,row=m?._scr?.el?.querySelector('.iw-modesel__row');
      const cards=row?[...row.querySelectorAll('.iw-mode')]:[];
      const focused=cards.indexOf(m?._focus);
      const target=cards.findIndex(c=>c.dataset.id==='mode-turf');
      const columns=row?Math.max(1,getComputedStyle(row).gridTemplateColumns.trim().split(/\s+/).length):0;
      return {screen:m?.current??null,button:m?._focus?.dataset?.id??null,focused,target,columns};
    });
    let reached=false;
    for(let step=0;step<12;step++){
      const focus=await readFocus();
      if(focus.screen!=='mode'||focus.focused<0||focus.target<0||focus.columns<1)
        throw Error('Native Turf keyboard focus unavailable: '+JSON.stringify(focus));
      if(focus.focused===focus.target&&focus.button==='mode-turf'){
        await page.keyboard.press('Enter');
        note('keyboard-activate-on-touch',{selector:turfSelector,key:'Enter',steps:step});
        reached=true;
        break;
      }
      // Range's own native menu handler routes Left to Boss. From the other
      // cards navigate the grid up when possible, otherwise left. Every
      // movement must be observed; no guessed or forced activation.
      const key=focus.button==='mode-range'?'ArrowLeft':
        focus.focused-focus.columns>=focus.target?'ArrowUp':'ArrowLeft';
      await page.keyboard.press(key);
      const after=await readFocus();
      if(after.screen!=='mode'||after.focused===focus.focused)
        throw Error('Native Turf focus navigation stalled: '+JSON.stringify({key,before:focus,after}));
      note('native-focus-step',{key,from:focus.button,to:after.button});
    }
    if(!reached)throw Error('Native Turf keyboard route exhausted without verified focus');
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
