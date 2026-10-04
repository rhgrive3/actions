// Acceptance inside the already-loaded production app; uses actual Actor -> Game
// HUD frames and actual native Judd DOM/FX. No replacement HUD implementation.
import path from 'node:path';
export async function checkHudAuthority({ page, evidence }) {
  const result = await page.evaluate(async () => {
    const { G } = await import(new URL('src/core/ctx.js', document.baseURI).href);
    const g=G.game,a=g.match.local,h=g.hud;
    const saved={special:a.special,active:a.specialActive};
    const frames=[];
    try {
      for(const [fraction,ready,filled] of [[0,false,0],[.47,false,10],[.9999,false,22],[1,true,23],[1,true,23],[0,false,0],[.5,false,11]]){
        a.specialActive=null;a.special=a.specialCost()*fraction;g._updateHud(1/60);
        const count=h.sp.querySelectorAll('.iw-sp__segment').length;
        const lit=h.sp.querySelectorAll('.iw-sp__segment.is-filled').length;
        const isReady=h.sp.classList.contains('is-ready');
        if(count!==23||lit!==filled||isReady!==ready)throw Error(`Special state ${fraction}: ${count}/${lit}/${isReady}`);
        if(h.sp.querySelector('.iw-sp__pct,.iw-sp__liquid')||/%/.test(h.sp.textContent))throw Error('Precise/continuous gauge leaked');
        if(h.sp.getAttribute('aria-valuenow')!==String(filled))throw Error('Accessible segment count drift');
        const color=getComputedStyle(h.sp.querySelector('.iw-sp__segment')).fill;
        if(!color||color==='none')throw Error('Segment has no paint');
        frames.push({fraction,count,lit,isReady,color});
      }
    } finally {a.special=saved.special;a.specialActive=saved.active;g._updateHud(1/60);}
    return {frames};
  });
  const viewport=page.viewportSize();
  try {
    for(const width of [1280,375]){
      await page.setViewportSize({width,height:width===375?812:800});
      await page.evaluate(async()=>{const {G}=await import(new URL('src/core/ctx.js',document.baseURI).href);const a=G.game.match.local;globalThis.__hudSavedSpecial=a.special;a.special=a.specialCost()*.47;G.game._updateHud(1/60);});
      await page.screenshot({path:path.join(evidence,`special-23-segments-${width}.png`),animations:'disabled',timeout:90000});
      await page.evaluate(async()=>{const {G}=await import(new URL('src/core/ctx.js',document.baseURI).href);G.game.match.local.special=globalThis.__hudSavedSpecial;delete globalThis.__hudSavedSpecial;G.game._updateHud(1/60);});
    }
  } finally {if(viewport)await page.setViewportSize(viewport);}
  result.judges=await page.evaluate(async()=>{
    const {G}=await import(new URL('src/core/ctx.js',document.baseURI).href),h=G.game.hud,rows=[];
    const paused=h.paused;h.paused=true;
    try {
      for(const [winner,percents] of [[0,[40,39.96]],[1,[39.96,40]],[0,[40,40]],[1,[40,40]]]){
        const t=h._fxTime,p=h.judge({winner,percents}),tick=h._fxMap.get('judge');
        h._fxTime=t+3.9;tick(0);
        const el=h.overLayer.querySelector('.iw-jd:not(.is-out)');
        if(!el||!el.classList.contains(winner===0?'is-win-a':'is-win-b')||el.classList.contains('is-tie'))throw Error('Judd contradicted authoritative winner');
        const nums=[...el.querySelectorAll('.iw-jd__num')].map(n=>n.textContent);
        h._fxTime=t+5.2;tick(0);const actual=await p;
        if(actual.winner!==winner)throw Error('Judd completion drift');
        rows.push({winner,percents,nums});
      }
    } finally {h.paused=paused;}
    return rows;
  });
  await page.waitForTimeout(800);
  if(await page.locator('.iw-jd').count())throw Error('Judd overlay survived completed cleanup');
  return result;
}
