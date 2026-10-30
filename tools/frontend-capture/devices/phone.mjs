// Device-only capture supplement. Common runner owns build/server/sandbox/network guards.
export const PRODUCT_HEAD='379533f541d86346a068e397f879cb6c13590ffd';
export const devices=[
 {id:'phone-portrait',viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1},
 {id:'phone-landscape',viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:1}
];
export const device=devices[0];
export const deviceScope='CSS viewport emulation with touch; DPR1 original pixels, not physical-device verification';
export const sourceEvidence=['scripts/check-inkwave-mobile-menus.mjs','scripts/check-inkwave-responsive-core.mjs','inkwave-public/src/ui/menus.js','inkwave-public/styles/mobile.css'];
// Real native input admission, not a force-click or game/menu state mutation.
// The original production capture guard ignores controls during opacity-zero entrance.
export function nativeTapReady({selector,screen}){
 const g=globalThis.__inkwave,m=g?.menus,root=m?._scr?.el;
 if(!g?.debug||!Number.isFinite(g.bootMs)||!root||root.inert||m.current!==screen||m._scr.name!==screen)return false;
 const controls=[...document.querySelectorAll(selector)];if(controls.length!==1)return false;
 const c=controls[0];if(!c.isConnected||c.disabled||!root.contains(c)||c.closest('.is-leaving')||m._modal&&!m._modal.contains(c))return false;
 let opacity=1,reached=false;
 for(let el=c.closest('[data-nav]')||c;el&&el!==root.parentNode;el=el.parentElement){const x=Number(getComputedStyle(el).opacity);if(!Number.isFinite(x))return false;opacity*=x;if(el===root){reached=true;break;}}
 const r=c.getBoundingClientRect();return reached&&opacity>.6&&r.width>0&&r.height>0;
}
async function scrollBottom(page,screen){
 return page.evaluate(screen=>{
  const m=globalThis.__inkwave?.menus,root=m?._scr?.el;if(m?.current!==screen||m?._scr?.name!==screen||!root)throw Error('Expected native menu '+screen);
  const rows=[];for(const el of [root,...root.querySelectorAll('*')]){const css=getComputedStyle(el),r=el.getBoundingClientRect();if(r.width<=0||r.height<=0||!/(auto|scroll)/.test(css.overflowY)||el.scrollHeight<=el.clientHeight+1)continue;
   const before=el.scrollTop;el.scrollTop=el.scrollHeight;rows.push({tag:el.tagName,cls:el.className,before,after:el.scrollTop,clientHeight:el.clientHeight,scrollHeight:el.scrollHeight});
  }return rows;
 },screen);
}
// Common runner already captures all screens/tabs. These are portrait lower-fold
// supplements only; no room creation/join, settings reset, equipment/model edits.
export async function captureDevice({page,capture,tap,home,waitScreen}){
 const viewport=page.viewportSize();
 await home();await tap('.iw-main [data-id="settings"]');await waitScreen('settings');
 const ids=await page.locator('.iw-settings .iw-tab').evaluateAll(es=>es.map(e=>e.dataset.id));
 for(const id of ids){await tap('.iw-settings [data-id="'+id+'"]');const panels=await scrollBottom(page,'settings');if(panels.length)await capture('phone-settings-'+id+'-lower',{scope:'native-menu-viewport-scroll',screen:'settings',notes:{viewport,deviceScope,panels,navigation:'native tab tap; DOM scroll only; setting values unchanged',coverage:'supplement to common top-of-tab screenshot'}});}
 for(const screen of ['loadout','howto','credits']){
  await home();await tap('.iw-main [data-id="'+screen+'"]');await waitScreen(screen);
  const panels=await scrollBottom(page,screen);if(panels.length)await capture('phone-'+screen+'-lower',{scope:'native-menu-viewport-scroll',screen,notes:{panels,navigation:'native main-menu tap; DOM scroll only; no loadout changes',coverage:'lower-fold supplement, not every possible weapon/profile state'}});
 }
 await home();
}
