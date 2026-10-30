// QA-only native menu navigation; no product edits, online calls or appearance changes.
export const device = Object.freeze({
 id:'ipad-mini-portrait',viewport:{width:744,height:1133},
 isMobile:true,hasTouch:true,deviceScaleFactor:1
});
export async function captureDevice({page,capture,tap,home,waitScreen}){
 const notes={device:'iPad mini CSS portrait viewport',cssViewport:'744x1133',dpr:1,
  scope:'browser emulation, not physical iPad Safari/device density',navigation:'native DOM tap',scroll:'DOM scrollIntoViewIfNeeded only; no synthetic menu click'};
 const ready=async()=>{
  await page.waitForFunction(()=>!document.querySelector('.iw-screen.is-leaving'),null,{timeout:30000});
  await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
 };
 const bottom=async(selector,name,screen)=>{
  const loc=page.locator(selector);const count=await loc.count();
  if(!count)throw Error('required portrait surface missing: '+selector);
  const last=loc.last();await last.scrollIntoViewIfNeeded();await ready();
  await capture(name,{scope:'actual-app-native-menu',screen,notes:{...notes,selector,count,position:'last item brought into viewport; not a full-page screenshot'}});
 };
 await home();await tap('.iw-main__menu [data-id="loadout"]');await waitScreen('loadout');await ready();
 await bottom('.iw-loadout .iw-wcard','ipad-mini-portrait-loadout-bottom','loadout');
 await home();await tap('.iw-main__menu [data-id="settings"]');await waitScreen('settings');await ready();
 const tabs=await page.locator('.iw-settings .iw-tab[data-id]').evaluateAll(xs=>xs.map(x=>x.dataset.id));
 if(!tabs.includes('tab-touch'))throw Error('touch settings must exist in iPad portrait emulation');
 for(const id of tabs){
  if(!/^tab-[a-z0-9-]+$/.test(id))throw Error('unexpected tab identity');
  await tap('.iw-settings [data-id="'+id+'"]');await ready();
  const rows=page.locator('.iw-settings .iw-row');
  const overflow=await rows.last().evaluate(el=>{const r=el.getBoundingClientRect();return r.bottom>innerHeight||r.top<0;});
  if(overflow)await bottom('.iw-settings .iw-row','ipad-mini-portrait-settings-'+id.slice(4)+'-bottom','settings');
 }
 await home();
 return {device:device.id,scope:'supplement to common complete-screen flow',notes};
}
