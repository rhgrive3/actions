import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { installProjectileCaptureUiGate, withProjectileCaptureUi } from '../lib/inkwave-projectile-capture-ui.mjs';
import { completeNativeTurfIntro } from '../lib/inkwave-projectile-ci-intro.mjs';
import { nativeTurfIntroWithUiFunction } from '../lib/inkwave-projectile-intro-ui.mjs';
import { atomicIntroFunction, requireAtomicIntro } from '../lib/inkwave-projectile-atomic-intro.mjs';

// Real Chromium DOM, timers, animation lifecycle and WebGL canvas. These are
// composed production intro/lineup/visibility/loop/match methods, not a whole
// game build: unrelated 3D work, actor assets and audio are explicit fixtures.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
import {nativeIntroMethods as methods,installNativeIntroFixture} from './fixtures/inkwave-projectile-native-intro.mjs';
const admission = () => window.__G.mode === 'match' && window.__inkwave.match === window.__G.match && ['intro', 'playing'].includes(window.__G.match.state);
const playing = () => window.__G.mode === 'match' && window.__inkwave.match === window.__G.match && window.__G.match.state === 'playing';
const callback = deadline => atomicIntroFunction(nativeTurfIntroWithUiFunction(completeNativeTurfIntro, deadline),
  withProjectileCaptureUi(playing, { phase:'playing', settled:false }),
  withProjectileCaptureUi(admission, { phase:'admission', allowIntro:true, settled:false, cinematicAdmission:true }), { asyncIntro:true });

async function fixture(browser) {
  const page = await browser.newPage({ viewport:{width:1280,height:720} });
  await page.setContent(`<style>
    html,body{margin:0;width:100%;height:100%}canvas{width:1280px;height:720px}
    .iw-hud{position:absolute;inset:0;opacity:1;visibility:visible;transition:opacity .35s,visibility 0s}
    .iw-hud.is-hidden{opacity:0;visibility:hidden}.iw-hud-over{position:absolute;inset:0;pointer-events:none}
  </style><canvas id="game-canvas" width="1280" height="720"></canvas><div id="ui-root"><div class="iw-hud is-hidden"></div><div class="iw-hud-over"></div></div>`);
  await page.evaluate(installNativeIntroFixture, methods);
  await page.evaluate(installProjectileCaptureUiGate);
  return page;
}

let browser;
test.before(async()=>{browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});});
test.after(async()=>{await browser?.close();});

test('native Match-clock presentation and real CSS settle before live gameplay',async()=>{
  const page=await fixture(browser);
  try {
    const early=await page.evaluate(()=>({admission:window.__iwProjectileCaptureUiGate({phase:'admission',allowIntro:true,settled:false,cinematicAdmission:true}),capture:window.__iwProjectileCaptureUiGate()}));
    assert.equal(early.admission.ready,true);assert.equal(early.admission.admissionKind,'native-intro-structure');
    assert.equal(early.admission.hud.flag,false);assert.equal(early.admission.ui.lineupCount,1);assert.equal(early.capture.ready,false);
    const deadline=Date.now()+10000,fn=callback(deadline);
    // Start the actual production rAF loop only after the helper has frozen the
    // cinematic, in the same browser task. Native DOM/CSS timers remain real.
    const wrapped=new Function(`return async function(){const pending=(${fn.toString()})();window.startNativeLoop();return pending;}`)();
    const result=await requireAtomicIntro(page,wrapped,deadline);
    assert.equal(result.playingReady,true);assert.equal(result.intro.frames,253);assert.equal(result.intro.matchTimeAfter,180);
    const nativeIntroStartedAtMs=await page.evaluate(()=>window.nativeIntroStartedAtMs);
    assert(result.intro.uiWait.uiReadyAtMs-nativeIntroStartedAtMs>=3500,'production lineup timer was not fast-forwarded');
    const state=await page.evaluate(()=>({calls:window.calls,ui:window.__iwProjectileIntroUiReceipt,g:window.__inkwave.frozen,skip:window.__inkwave._skipRender,strict:window.__iwProjectileCaptureUiGate()}));
    assert.equal(state.calls.renderedIntroFrames,0);assert.equal(state.calls.skippedLiveFrames,0);
    assert.equal(state.g,false);assert.equal(state.skip,false);assert.equal(state.ui.lastUi.hud.dom.effectiveOpacity,1);
    assert.equal(state.ui.lastUi.ui.lineupCount,0);assert.equal(state.ui.outcome,'completed');
    assert.equal(state.strict.ready,false,'GO banner still blocks capture');
    await page.waitForFunction(()=>window.__iwProjectileCaptureUiGate({phase:'settled'}).ready===true,{},{timeout:6000});
    const settled=await page.evaluate(()=>window.__iwProjectileCaptureUiGate({phase:'before-screenshot',requireReady:true}));
    assert.equal(settled.ready,true);assert.equal(settled.ui.startupBannerCount,0);assert.equal(settled.hud.observation.animationsTotal,0);
  } finally {await page.close();}
});

test('negative control: immediate native completion cannot bypass lineup and GO settlement',async()=>{
  const page=await fixture(browser);
  try {await page.evaluate(completeNativeTurfIntro);await page.waitForTimeout(3100);
    const r=await page.evaluate(()=>({hud:window.__inkwave.hud._visible,gate:window.__iwProjectileCaptureUiGate()}));
    assert.equal(r.hud,true);assert.equal(r.gate.ready,false);assert(r.gate.failed.includes('lineup'));
  }finally{await page.close();}
});

test('real pending/paused HUD animation blocks settled capture even at opacity one',async()=>{
  const page=await fixture(browser);
  try {
    const r=await page.evaluate(()=>{
      const g=window.__inkwave;g.hud.setVisible(true);document.querySelector('.iw-lineup').remove();
      // Test fault injection only: non-changing opacity must not allow a live animation.
      const a=g.hud.el.animate([{opacity:1},{opacity:1}],{duration:1000});a.pause();
      return {loose:window.__iwProjectileCaptureUiGate({allowIntro:true,settled:false}),strict:window.__iwProjectileCaptureUiGate({allowIntro:true})};
    });
    assert.equal(r.loose.hud.dom.effectiveOpacity,1);assert.equal(r.strict.ready,false);assert(r.strict.failed.includes('hudSettled'));
  }finally{await page.close();}
});

for(const fault of ['hidden ancestor','permanent lineup','ownership change','native pause'])test(fault+' never completes intro and restores cinematic controls at deadline/failure',async()=>{
  const page=await fixture(browser);
  try {
    await page.evaluate(fault=>{
      const g=window.__inkwave;
      if(fault==='hidden ancestor')g.hud.el.parentElement.style.opacity='0';
      if(fault==='permanent lineup')document.querySelector('.iw-lineup').remove=()=>{};
      if(fault==='ownership change')setTimeout(()=>{window.__G.match={};},25);
      if(fault==='native pause')setTimeout(()=>{g.match.paused=true;},25);
    },fault);
    const deadline=Date.now()+(fault==='ownership change'||fault==='native pause'?175:3800);
    await assert.rejects(requireAtomicIntro(page,callback(deadline),deadline),/deadline|budget|ownership/);
    // Host timeout is not cancellation. Let the browser's same deadline check
    // run and restore before inspecting, without ever accepting a late result.
    await page.waitForFunction(()=>window.__iwProjectileIntroUiReceipt?.restoredAtMs,{},{timeout:1000});
    const s=await page.evaluate(()=>({calls:window.calls,frozen:window.__inkwave.frozen,skip:window.__inkwave._skipRender,state:window.__inkwave.match.state,receipt:window.__iwProjectileIntroUiReceipt}));
    assert.equal(s.calls.frames,180);assert.equal(s.calls.liveFrames,0);assert.equal(s.state,'intro');assert.equal(s.frozen,false);assert.equal(s.skip,false);assert.equal(s.receipt.outcome,'failed');
  }finally{await page.close();}
});

test('browser callback entered after deadline cannot freeze or step even if later UI becomes ready',async()=>{
  const page=await fixture(browser);
  try {await assert.rejects(page.evaluate(callback(Date.now()-1)),/deadline expired/);
    const calls=await page.evaluate(()=>window.calls);assert.equal(calls.freeze,0);assert.equal(calls.frames,0);
  }finally{await page.close();}
});
