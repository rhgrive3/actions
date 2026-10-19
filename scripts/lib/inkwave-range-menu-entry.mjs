// Match the shipped menu's current-screen and effective-opacity input guard.
// Playwright visible/actionable alone admits opacity-zero entrance frames.
export function rangeMenuControlReady({selector,menu}) {
  const m=window.__inkwave?.menus,root=m?._scr?.el;
  if(!root||m.current!==menu||m._scr.name!==menu||root.inert)return false;
  const controls=[...document.querySelectorAll(selector)];
  if(controls.length!==1||!root.contains(controls[0]))return false;
  const control=controls[0];
  if(control.disabled||control.closest('.is-leaving'))return false;
  let opacity=1;
  for(let e=control.closest('[data-nav]')||control;e&&e!==root.parentNode;e=e.parentElement){
    const value=Number(getComputedStyle(e).opacity);
    if(!Number.isFinite(value))return false;
    opacity*=value;if(e===root)break;
  }
  return opacity>0.6;
}

// Browser QA enters through the same trusted menu input as a player. This lets
// the shipped prepareMatch handler own audio activation and admission.
export async function enterRangeFromMenu(page, base, {touch=false, timeout=240000,onProgress=()=>{}}={}) {
  await page.goto(base+'/?skipTitle');
  await page.waitForFunction(()=>window.__inkwave?.menus?.current==='main',null,{timeout});
  const gestures=[];
  const receipt={route:['main'],gestures};onProgress(receipt);
  for(const [id,menu] of [['play','mode'],['mode-range',null]]) {
    const selector=`.iw-ui [data-id="${id}"]`;
    await page.evaluate(selector=>{
      window.__rangeEntryGesture=null;
      const capture=e=>{
        if(!e.target?.closest?.(selector))return;
        window.__rangeEntryGesture={type:e.type,trusted:e.isTrusted,selector};
        document.removeEventListener('click',capture,true);
      };
      document.addEventListener('click',capture,true);
    },selector);
    // Readiness and the single pointer action share the old action budget.
    const deadline=Date.now()+timeout;
    const remaining=()=>{const ms=deadline-Date.now();if(!(ms>0))throw Error('Range menu action deadline exceeded');return ms;};
    await page.waitForFunction(rangeMenuControlReady,{selector,menu:id==='play'?'main':'mode'},{timeout:remaining()});
    const button=page.locator(selector);
    if(touch)await button.tap({timeout:remaining()});else await button.click({timeout:remaining()});
    remaining();
    const gesture=await page.evaluate(()=>window.__rangeEntryGesture);
    if(!gesture?.trusted||gesture.selector!==selector)throw Error('Range entry requires trusted menu input: '+id);
    gestures.push(gesture);onProgress(receipt);
    if(menu){await page.waitForFunction(expected=>window.__inkwave?.menus?.current===expected,menu,{timeout});receipt.route.push(menu);onProgress(receipt);}
  }
  await page.waitForFunction(()=>window.__G?.match?.range&&window.__G.match.state==='playing',null,{timeout});
  receipt.route.push('range');onProgress(receipt);return receipt;
}
