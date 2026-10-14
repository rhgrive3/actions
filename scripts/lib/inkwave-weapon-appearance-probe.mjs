// Runs inside the existing real-browser loadout gate, against its verified PR build.
// Pointer/keyboard are trusted Playwright input. Pad accept exercises the native
// menu API; this does not claim physical-controller or retail-render parity.
export async function checkWeaponAppearancePicker({ page, evidence }) {
  const initial = await page.evaluate(async () => {
    const AP = await import(new URL('patches/splatoon3/runtime/weapon-appearance.mjs',document.baseURI).href);
    const R = await import(new URL('patches/splatoon3/runtime/weapon-models/registry.mjs',document.baseURI).href);
    const { WEAPONS } = await import(new URL('src/config.js',document.baseURI).href);
    const m=globalThis.s3ProbeG.game.menus, id='shooter-01', w=WEAPONS[id];
    if(!w || !R.weaponVariantSpec(w.sourceRow)) throw Error('Appearance probe requires the implemented Tentatek kit');
    const result={originalWeapon:m.api.getLoadout().weapon,originalStorage:localStorage.getItem(AP.WEAPON_APPEARANCE_STORAGE_KEY),id,base:R.weaponBaseModelId(id),defaultId:R.weaponDefaultAppearance(id),options:AP.weaponAppearanceOptions(id)};
    AP.setWeaponAppearance(id,'');
    return result;
  });
  const selector='.iw-loadout:not(.is-leaving) [data-id="weapon-appearance"]';
  const read = () => page.evaluate(async id => {
    const AP=await import(new URL('patches/splatoon3/runtime/weapon-appearance.mjs',document.baseURI).href);
    const {WEAPONS}=await import(new URL('src/config.js',document.baseURI).href);
    const m=globalThis.s3ProbeG.game.menus,w=WEAPONS[id],el=m._scr.el.querySelector('[data-id="weapon-appearance"]');
    return {kit:m.api.getLoadout().weapon,sub:w.sub,special:w.special,cost:w.specialCost,selected:AP.selectedWeaponAppearance(id),preference:AP.weaponAppearancePreference(id),label:el?.textContent,candidate:m._candidates().includes(el),focus:m._focus===el};
  },initial.id);
  const waitPreference = value => page.waitForFunction(async ({id,value}) => {
    const AP=await import(new URL('patches/splatoon3/runtime/weapon-appearance.mjs',document.baseURI).href);
    return AP.weaponAppearancePreference(id)===value;
  },{id:initial.id,value});
  const assert = (ok,label) => { if(!ok) throw Error('Appearance picker: '+label); };
  try {
    const card=page.locator('.iw-loadout:not(.is-leaving) [data-id="w-'+initial.id+'"]');
    await card.click();
    const button=page.locator(selector);await button.waitFor({state:'visible'});
    const before=await read();assert(before.kit===initial.id&&before.selected===initial.defaultId,'official kit default');
    assert(before.candidate,'included in native navigation candidates');
    await button.click();await waitPreference(initial.base);const pointer=await read();
    assert(pointer.selected===initial.base&&pointer.focus,'trusted pointer selects explicit Base');
    await page.keyboard.press('Enter');await waitPreference(initial.options[2].id);const keyboard=await read();
    await page.evaluate(()=>globalThis.s3ProbeG.game.menus.nav('accept'));
    await waitPreference(initial.options[3]?.id??null);const pad=await read();
    for(const state of [pointer,keyboard,pad])for(const key of ['kit','sub','special','cost'])assert(state[key]===before[key],key+' unchanged by appearance selection');
    await page.evaluate(()=>globalThis.s3ProbeG.game.menus.show('loadout',{force:true,wipe:false,light:false}));
    await page.locator(selector).waitFor({state:'visible'});const reopened=await read();
    assert(reopened.selected===pad.selected&&reopened.preference===pad.preference,'preference survives reopening');
    if(evidence)await page.screenshot({path:evidence+'/weapon-appearance-picker.png'});
    return {before,pointer,keyboard,pad,reopened,physicalController:false};
  } finally {
    await page.evaluate(async old => {
      const AP=await import(new URL('patches/splatoon3/runtime/weapon-appearance.mjs',document.baseURI).href);
      if(old.originalStorage===null)localStorage.removeItem(AP.WEAPON_APPEARANCE_STORAGE_KEY);
      else localStorage.setItem(AP.WEAPON_APPEARANCE_STORAGE_KEY,old.originalStorage);
      const m=globalThis.s3ProbeG.game.menus;m.api.setLoadout({weapon:old.originalWeapon});
      m.show('loadout',{force:true,wipe:false,light:false});
    },initial);
  }
}
