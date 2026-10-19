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
    const button=page.locator(selector);
    if(touch)await button.tap({timeout});else await button.click({timeout});
    const gesture=await page.evaluate(()=>window.__rangeEntryGesture);
    if(!gesture?.trusted||gesture.selector!==selector)throw Error('Range entry requires trusted menu input: '+id);
    gestures.push(gesture);onProgress(receipt);
    if(menu){await page.waitForFunction(expected=>window.__inkwave?.menus?.current===expected,menu,{timeout});receipt.route.push(menu);onProgress(receipt);}
  }
  await page.waitForFunction(()=>window.__G?.match?.range&&window.__G.match.state==='playing',null,{timeout});
  receipt.route.push('range');onProgress(receipt);return receipt;
}
