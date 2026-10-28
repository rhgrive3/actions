// Browser-test navigation only. Production menu handlers own preparation,
// screen wipe, recorded-audio admission, match construction and recovery.
export async function startProjectileThroughMenu(page,{waitForPhase,remainingMs,receipt}){
  const note=(event,data={})=>receipt.push({event,at:new Date().toISOString(),...data});
  const budget=()=>{const left=remainingMs();if(!Number.isFinite(left)||left<=0)throw Error('Native menu navigation deadline exceeded');return left;};
  const bounded=async(action,label)=>{const left=budget();let timer;try{return await Promise.race([
    Promise.resolve().then(action),new Promise((_,reject)=>{timer=setTimeout(()=>{
      // Closing the owned page stops the failed lane; a dispatched Playwright
      // input cannot be claimed retroactively canceled by Promise.race alone.
      note('native-action-timeout',{label,pageCloseRequested:true});
      try{Promise.resolve(page.close({runBeforeUnload:false})).catch(()=>{});}catch{}
      reject(Error('Native menu navigation deadline exceeded: '+label));
    },left);})
  ]);}finally{clearTimeout(timer);}};
  const click=async selector=>{budget();note('native-action-attempt',{kind:'click',selector});await bounded(()=>page.locator(selector).click({timeout:budget()}),'click '+selector);budget();note('click',{selector});};
  await bounded(()=>waitForPhase(()=>{const g=window.__inkwave,G=window.__G;return !!(g?.debug&&Number.isFinite(g.bootMs)&&G?.mode==='menu'&&g.match?.attract&&g.menus?.current==='main'&&g.menus?._scr?.name==='main');},'native main menu readiness'),'main readiness');
  note('native-menu-ready');
  await click('.iw-main [data-id="play"]');
  await bounded(()=>waitForPhase(()=>window.__inkwave?.menus?.current==='mode','native mode menu'),'mode readiness');
  // A pointer left on the prior screen's PLAY tile can land over an enlarged
  // neighbouring mode card during the transition. Clear that genuine hover
  // before choosing Turf with the ordinary hit-tested pointer gesture.
  await bounded(()=>page.mouse.move(1, 1),'clear pointer hover');budget();
  note('mode-pointer-hover-cleared');
  await bounded(()=>waitForPhase(()=>{
    const m=window.__inkwave?.menus,root=m?._scr?.el;
    if(!root||m.current!=='mode'||m._scr.name!=='mode'||root.inert)return false;
    const controls=[...document.querySelectorAll('.iw-modesel [data-id="mode-turf"]')];
    if(controls.length!==1||!root.contains(controls[0]))return false;
    const control=controls[0];if(!control.isConnected||control.disabled||control.closest('.is-leaving'))return false;
    let opacity=1;
    for(let e=control.closest('[data-nav]')||control;e&&e!==root.parentNode;e=e.parentElement){
      const value=Number(getComputedStyle(e).opacity);if(!Number.isFinite(value))return false;
      opacity*=value;if(e===root)break;
    }
    return opacity>0.6;
  },'native turf pointer readiness'),'turf readiness');
  // This is performance-capture admission, not proof of touch UI acceptance.
  // On coarse touch screens Range can intercept a genuine Turf tap. Navigate
  // through the native keyboard handler, then verify its private focus owner
  // and the still-ready exact Turf control before accepting. No synthetic DOM
  // event, forced click, or game-state mutation is used.
  const turfSelector='.iw-modesel [data-id="mode-turf"]';
  const touchPrimary=await bounded(()=>page.evaluate(()=>navigator.maxTouchPoints>0&&matchMedia('(pointer:coarse)').matches),'touch capability');budget();
  if(touchPrimary){
    // Observe the real responsive card grid after every native input. Range
    // may route Left to Boss, while the grid can have one, two or more columns.
    // A bounded route fails closed rather than guessing or forcing activation.
    const readFocus=()=>page.evaluate(()=>{
      const m=window.__inkwave?.menus,root=m?._scr?.el,row=root?.querySelector('.iw-modesel__row');
      const cards=row?[...row.querySelectorAll('.iw-mode')]:[];
      const controls=[...document.querySelectorAll('.iw-modesel [data-id="mode-turf"]')];
      const control=controls.length===1?controls[0]:null;
      const tracks=row?getComputedStyle(row).gridTemplateColumns.trim():'';
      const visualColumns=tracks&&tracks!=='none'&&!tracks.includes('(')?tracks.split(/\s+/).length:0;
      // The native focus graph can have been built before a viewport resize.
      // Current visual columns and width are diagnostics, not graph topology.
      const width=window.innerWidth;
      let opacity=1;
      if(control&&root)for(let e=control.closest('[data-nav]')||control;e&&e!==root.parentNode;e=e.parentElement){
        const value=Number(getComputedStyle(e).opacity);if(!Number.isFinite(value)){opacity=NaN;break;}
        opacity*=value;if(e===root)break;
      }
      return {screen:m?.current??null,screenName:m?._scr?.name??null,button:m?._focus?.dataset?.id??null,
        focused:cards.indexOf(m?._focus),target:cards.indexOf(control),visualColumns,width,
        focusReady:!!(cards.includes(m?._focus)&&m._focus.isConnected&&!m._focus.disabled&&!m._focus.closest('.is-leaving')),
        ready:!!(control&&control.isConnected&&root&&!root.inert&&root.contains(control)&&!control.disabled&&!control.closest('.is-leaving')&&opacity>0.6)};
    });
    const valid=f=>f.screen==='mode'&&f.screenName==='mode'&&f.ready&&f.focusReady&&Number.isFinite(f.width)&&f.width>0&&Number.isInteger(f.visualColumns)&&f.visualColumns>=1&&Number.isInteger(f.focused)&&f.focused>=0&&Number.isInteger(f.target)&&f.target>=0;
    let reached=false,tryLeft=false;
    for(let step=0;step<12;step++){
      budget();const focus=await bounded(readFocus,'read native focus');budget();
      if(!valid(focus))throw Error('Native Turf keyboard focus unavailable: '+JSON.stringify(focus));
      if(focus.focused===focus.target&&focus.button==='mode-turf'){
        note('native-turf-focused',{focus,steps:step});
        budget();note('native-action-attempt',{kind:'key',key:'Enter',selector:turfSelector});await bounded(()=>page.keyboard.press('Enter'),'activate Turf');budget();
        note('keyboard-activate-on-touch',{selector:turfSelector,key:'Enter',steps:step});
        reached=true;break;
      }
      // Range is attached to Boss by a native special edge. On the mode
      // grid try Up first; a real no-movement bump means try Left at that
      // same focus. The next move is based on observed focus, never width.
      const key=focus.button==='mode-range'||tryLeft?'ArrowLeft':'ArrowUp';
      budget();note('native-action-attempt',{kind:'key',key});await bounded(()=>page.keyboard.press(key),'navigate '+key);budget();const after=await bounded(readFocus,'verify native focus');budget();
      if(!valid(after)||after.target!==focus.target||after.width!==focus.width)
        throw Error('Native Turf focus navigation stalled: '+JSON.stringify({key,before:focus,after}));
      const moved=after.focused!==focus.focused;
      note('native-focus-step',{key,from:focus.button,to:after.button,moved});
      if(!moved&&key==='ArrowLeft')throw Error('Native Turf focus navigation stalled: '+JSON.stringify({key,before:focus,after}));
      tryLeft=!moved;
    }
    if(!reached)throw Error('Native Turf keyboard route exhausted without verified focus');
  }else{
    // Desktop keeps the prior native hit-tested click; DOM focus alone does
    // not establish Menus._focus for a locator-targeted Enter.
    await click(turfSelector);
  }
  await bounded(()=>waitForPhase(()=>window.__inkwave?.menus?.current==='setup','native setup menu'),'setup readiness');
  await click('.iw-setup [data-id="map-tidewater"]');
  const config=await bounded(()=>page.evaluate(()=>{const g=window.__inkwave,s=g.menus?._setup;return {mode:s?.mode,map:s?.mapId,difficulty:s?.difficulty,duration:s?.duration,weapon:g.profile?.weapon,time:g.menus?._stageTime?.(s?.mapId)};}),'read setup');budget();
  if(config.mode!=='turf'||config.map!=='tidewater'||config.difficulty!=='normal'||config.duration!==180||config.weapon!=='shooter'||config.time!=='day')throw new Error('Native projectile menu configuration mismatch: '+JSON.stringify(config));
  note('native-setup-verified',{config});
  // The real handler invokes prepareMatch during this gesture, then the wipe,
  // then startMatch. Never call audio readiness or startMatch from this helper.
  await click('.iw-setup [data-id="start"].iw-btn--start');
  note('native-start-clicked',{attempt:1});
}
