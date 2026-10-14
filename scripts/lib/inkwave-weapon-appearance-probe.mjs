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
    // The live Menus owner rejects input while the newly mounted panel is
    // still fading in. Visible DOM does not imply that the menu admits clicks.
    await page.waitForFunction(id => {
      const m=globalThis.s3ProbeG.game.menus, root=m._scr?.el;
      const card=root?.querySelector('[data-id="w-'+id+'"]');
      if (!card || m.current!=='loadout' || !root.isConnected || root.inert || m._modal) return false;
      let opacity=1;
      for (let el=card; el; el=el.parentElement) {
        opacity *= Number(getComputedStyle(el).opacity);
        if (el===root) break;
      }
      return opacity>0.6;
    }, initial.id, {timeout:15000});
    await card.click();
    // Wait for native loadout admission rather than assuming Playwright's
    // successful pointer dispatch means the menu accepted the event.
    await page.waitForFunction(id => globalThis.s3ProbeG.game.menus.api.getLoadout().weapon===id,
      initial.id, {timeout:15000});
    const button=page.locator(selector);await button.waitFor({state:'visible'});
    const before=await read();
    assert(before.kit===initial.id&&before.selected===initial.defaultId,
      'official kit default '+JSON.stringify({before,defaultId:initial.defaultId}));
    assert(before.candidate,'included in native navigation candidates');
    // Pointer focus is an event-time property: subsequent hover/navigation can
    // legitimately move the focus before the async storage read completes.
    // Verify a trusted native click and focus *during that click*, not later.
    await page.evaluate(() => {
      const m=globalThis.s3ProbeG.game.menus;
      const el=m._scr.el.querySelector('[data-id="weapon-appearance"]');
      m.__appearanceClickTrace=[];
      el.addEventListener('click',event => {
        m.__appearanceClickTrace.push({
          trusted:event.isTrusted,bound:m._binds.has(el),focused:m._focus===el
        });
      },{once:true});
    });
    await button.click();await waitPreference(initial.base);
    const pointer=await read();
    pointer.admission=await page.evaluate(() => globalThis.s3ProbeG.game.menus.__appearanceClickTrace?.[0]??null);
    assert(pointer.selected===initial.base&&pointer.candidate&&pointer.admission?.trusted&&
      pointer.admission?.bound&&pointer.admission?.focused,
      'trusted pointer selects explicit Base '+JSON.stringify(pointer));
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
