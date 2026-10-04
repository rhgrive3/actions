// Acceptance inside the already-loaded production app; uses actual Actor -> Game
// HUD frames and actual native Judd DOM/FX. No replacement HUD implementation.
import path from 'node:path';
export async function checkHudAuthority({ page, evidence }) {
  const result = await page.evaluate(async () => {
    const { G } = await import(new URL('src/core/ctx.js', document.baseURI).href);
    const g=G.game,a=g.match.local,h=g.hud;
    if(!h.sp.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))throw Error('Desktop special gauge is hidden');
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
    for(const width of [1280]){
      await page.setViewportSize({width,height:width===375?812:800});
      await page.evaluate(async()=>{const {G}=await import(new URL('src/core/ctx.js',document.baseURI).href);const a=G.game.match.local;globalThis.__hudSavedSpecial=a.special;a.special=a.specialCost()*.47;G.game._updateHud(1/60);});
      await page.screenshot({path:path.join(evidence,`special-23-segments-${width}.png`),animations:'disabled',timeout:90000});
      await page.evaluate(async()=>{const {G}=await import(new URL('src/core/ctx.js',document.baseURI).href);G.game.match.local.special=globalThis.__hudSavedSpecial;delete globalThis.__hudSavedSpecial;G.game._updateHud(1/60);});
    }
  } finally {if(viewport)await page.setViewportSize(viewport);}
  // Desktop CI explicitly mounts the actual touch controller. This is native
  // DOM/frame coverage, not a claim of physical phone or permission testing.
  const resumeForTouch=await page.evaluate(async()=>{
    const {G}=await import(new URL('src/core/ctx.js',document.baseURI).href);
    // Release desktop pointer lock through the normal pause path before resizing.
    // A deferred locked mousemove must not retake keyboard ownership mid-capture.
    if(document.pointerLockElement&&!G.game.match.paused){G.game.pause();return true;}
    return false;
  });
  if(resumeForTouch)await page.waitForFunction(()=>!document.pointerLockElement);
  await page.setViewportSize({width:844,height:390});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  try {
    result.touch=await page.evaluate(async(resumeForTouch)=>{
      const {G}=await import(new URL('src/core/ctx.js',document.baseURI).href);
      const {MobileInput}=await import(new URL('src/core/mobile.js',document.baseURI).href);
      const g=G.game,a=g.match.local,original=g.input.mobile;
      const m=original.root?original:new MobileInput(original.canvas,g.input);
      const saved={original,m,created:m!==original,device:g.input.lastDevice,special:a.special,active:a.specialActive,visible:m.visible,touch:document.documentElement.classList.contains('iw-touch-ui')};
      globalThis.__hudTouchFixture=saved;
      if(!m.active){m.active=true;m._install();}
      g.input.mobile=m;g.input.lastDevice='touch';document.documentElement.classList.add('iw-touch-ui');m.setVisible(true);
      if(resumeForTouch)g.resume();
      const rows=[];
      for(const [fraction,ready,filled]of [[0,false,0],[.47,false,10],[.99999,false,22],[1,true,23],[1,true,23],[0,false,0],[.47,false,10]]){
        a.specialActive=null;a.special=a.specialCost()*fraction;g._updateHud(1/60);
        const count=m.els.special.querySelectorAll('.iwm-sp-segment').length;
        const lit=m.els.special.querySelectorAll('.iwm-sp-segment.is-filled').length;
        if(count!==23||lit!==filled||m.els.special.classList.contains('is-ready')!==ready)throw Error('Touch special segment state drift');
        rows.push({fraction,count,lit,ready});
      }
      if(getComputedStyle(g.hud.sp).display!=='none')throw Error('Touch replacement did not hide desktop gauge');
      if(!m.els.special.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))throw Error('Touch special button is not visible');
      return rows;
    },resumeForTouch);
    await page.evaluate(async()=>{await Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
    const touchState=()=>page.evaluate(async()=>{
      const {G}=await import(new URL('src/core/ctx.js',document.baseURI).href),m=G.game.input.mobile;
      return {owner:G.game.input.lastDevice,buttonVisible:!!m.els?.special?.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}),desktopHidden:getComputedStyle(G.game.hud.sp).display==='none',segments:m.els?.special?.querySelectorAll('.iwm-sp-segment').length};
    });
    const requireTouch=state=>{if(state.owner!=='touch'||!state.buttonVisible||!state.desktopHidden||state.segments!==23)throw Error('Touch capture lost native ownership/visibility: '+JSON.stringify(state));};
    result.touchBeforeCapture=await touchState();requireTouch(result.touchBeforeCapture);
    await page.locator('.iwm-b--special').screenshot({path:path.join(evidence,'special-23-segments-touch-button.png'),animations:'disabled',timeout:90000});
    await page.screenshot({path:path.join(evidence,'special-23-segments-touch.png'),animations:'disabled',timeout:90000});
    result.touchAfterCapture=await touchState();requireTouch(result.touchAfterCapture);
  } finally {
    await page.evaluate(async()=>{
      const s=globalThis.__hudTouchFixture;if(!s)return;
      const {G}=await import(new URL('src/core/ctx.js',document.baseURI).href);
      G.game.input.mobile=s.original;G.game.input.lastDevice=s.device;G.game.match.local.special=s.special;G.game.match.local.specialActive=s.active;
      if(s.created)s.m.destroy();else s.m.setVisible(s.visible);
      document.documentElement.classList.toggle('iw-touch-ui',s.touch);G.game._updateHud(1/60);delete globalThis.__hudTouchFixture;
    });
    if(viewport)await page.setViewportSize(viewport);
  }
  result.alphaTies=await page.evaluate(async()=>{
    const {G}=await import(new URL('src/core/ctx.js',document.baseURI).href);
    const {Match}=await import(new URL('src/game/match.js',document.baseURI).href);
    // Invoke the loaded native judge with frozen coverage and an isolated result
    // sink. Do not finish the live rendering match or send network traffic.
    const coverage=G.paint.coverage,net=G.netm,random=Math.random,rows=[];
    try {
      Math.random=()=>{throw Error('Exact Turf judge used randomness');};
      for(const [values,winner]of [[[0,0],0],[[.4,.4],0],[[.4,.3996],0],[[.3996,.4],1]])for(const team of [0,1]){
        const cov=Object.freeze(values.slice()),m=Object.create(Match.prototype);let packet;
        Object.assign(m,{local:{team},bossMode:null,setState(state){this.state=state;}});
        G.paint.coverage=()=>cov;G.netm={sendResult(value){packet=value;}};m._judge();
        if(m.result.winner!==winner||packet.winner!==winner||m.result.coverage!==cov||m.state!=='judge')throw Error('Native Alpha result mismatch');
        rows.push({coverage:values,winner:m.result.winner,localTeam:team});
      }
    } finally {G.paint.coverage=coverage;G.netm=net;Math.random=random;}
    return rows;
  });
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
