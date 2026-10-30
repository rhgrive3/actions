// Browser-only fault acceptance. Uses the real emitted app and public rematch API.
// Only the async character-warm boundary is instrumented; production functions
// are neither copied nor extracted. Normal warm calls delegate unchanged.
export async function verifyRematchFailureRecovery(page, { evidenceDir, contentHash }) {
  const receipts = [];
  for (const scenario of ['warm-rejection-retry', 'stale-warm-rejection']) {
    const key = '__inkwaveRematchFailureQA';
    try {
      await page.evaluate(() => {
        const g = window.__inkwave, G = window.__G;
        if (!g?.api?.rematch || typeof g._warmCharacters !== 'function' || !G?.match || G.match.attract)
          throw Error('Rematch fault acceptance requires the real live app');
        G.match.time = 0.05; // Existing lifecycle driver uses this same result transition.
      });
      await page.waitForFunction(() => window.__inkwave?.menus?.current === 'results', null, { timeout: 300000 });
      await page.evaluate(({ key, scenario }) => {
        const g = window.__inkwave, G = window.__G;
        if (window[key]) throw Error('Prior rematch instrumentation was not released');
        const warm = g._warmCharacters, descriptor = Object.getOwnPropertyDescriptor(g, '_warmCharacters');
        if (typeof g.menus.toast !== 'function') throw Error('Real menu toast function is required');
        const toast = g.menus.toast, toastDescriptor = Object.getOwnPropertyDescriptor(g.menus, 'toast');
        const qa = window[key] = { scenario, calls: 0, reached: false, oldSettled: false, oldRejected: null, toastCount: 0, beforeOptions: JSON.stringify(g.lastMatchOpts) };
        let rejectGate, gateSettled = false;
        const gate = new Promise((resolve, reject) => { rejectGate = reject; });
        // Cleanup may reject before the app reaches warm. Handle that path,
        // while returning the original rejected gate to production unchanged.
        gate.catch(() => {});
        // No artificial rejection is created until the public operation owns it.
        g._warmCharacters = function (...args) {
          qa.calls++;
          if (qa.calls === 1) { qa.reached = true; return gate; }
          return warm.apply(this, args);
        };
        g.menus.toast = function (...args) { qa.toastCount++; return toast.apply(this, args); };
        qa.reject = () => { if (!gateSettled) { gateSettled = true; rejectGate(Error('INKWAVE_QA_EXPECTED_REMATCH_WARM_REJECTION')); } };
        qa.restore = () => {
          if (descriptor) Object.defineProperty(g, '_warmCharacters', descriptor); else delete g._warmCharacters;
          if (toastDescriptor) Object.defineProperty(g.menus, 'toast', toastDescriptor); else delete g.menus.toast;
        };
        qa.old = Promise.resolve(g.api.rematch()).then(() => { qa.oldSettled = true; }, error => { qa.oldRejected = String(error?.message || error); qa.oldSettled = true; });
      }, { key, scenario });
      await page.waitForFunction(key => window[key]?.reached, key, { timeout: 300000 });
      if (scenario === 'warm-rejection-retry') {
        await page.evaluate(key => window[key].reject(), key);
        await page.waitForFunction(key => window[key]?.oldSettled, key, { timeout: 300000 });
        const recovered = await page.evaluate(key => {
          const q=window[key],g=window.__inkwave,G=window.__G;
          return { rejected:q.oldRejected,menu:g.menus.current,mode:G.mode,attract:!!g.match?.attract,toastCount:q.toastCount };
        }, key);
        if (recovered.rejected || recovered.menu !== 'main' || recovered.mode !== 'menu' || !recovered.attract || recovered.toastCount !== 1)
          throw Error('Public rematch did not recover its failed warm: '+JSON.stringify(recovered));
        await page.screenshot({ path: evidenceDir+'/'+scenario+'-recovered.png', timeout: 60000 });
        await page.evaluate(key => { const q=window[key]; q.retrySettled=false; q.retryRejected=null; q.retry=Promise.resolve(window.__inkwave.api.rematch()).then(()=>{q.retrySettled=true;},error=>{q.retryRejected=String(error?.message||error);q.retrySettled=true;}); }, key);
      } else {
        // A newer public rematch must win while the old warm promise is pending.
        await page.evaluate(key => { const q=window[key]; q.retrySettled=false; q.retryRejected=null; q.retry=Promise.resolve(window.__inkwave.api.rematch()).then(()=>{q.retrySettled=true;},error=>{q.retryRejected=String(error?.message||error);q.retrySettled=true;}); }, key);
      }
      await page.waitForFunction(key => window[key]?.retrySettled, key, { timeout: 300000 });
      const retryError=await page.evaluate(key=>window[key].retryRejected,key);
      if(retryError) throw Error('Public rematch retry rejected: '+retryError);
      await page.waitForFunction(() => { const G=window.__G,g=window.__inkwave;return G?.mode==='match'&&g?.match===G.match&&!G.match.attract&&G.match.state==='playing'&&g.menus.current===null; }, null, { timeout: 300000 });
      if (scenario === 'stale-warm-rejection') {
        await page.evaluate(key => { const q=window[key],g=window.__inkwave;q.winner=g.match;q.winnerFlow=g._matchFlow;q.winnerOptions=JSON.stringify(g.lastMatchOpts);q.reject(); }, key);
        await page.waitForFunction(key => window[key]?.oldSettled, key, { timeout: 300000 });
      }
      const receipt = await page.evaluate(key => {
        const q=window[key],g=window.__inkwave,G=window.__G;
        return { scenario:q.scenario,calls:q.calls,oldSettled:q.oldSettled,oldRejected:q.oldRejected,retrySettled:q.retrySettled,retryRejected:q.retryRejected,toastCount:q.toastCount,
          mode:G.mode,menu:g.menus.current,attract:!!g.match?.attract,playing:g.match?.state==='playing',liveMatch:g.match===G.match,
          optionsPreserved:JSON.stringify(g.lastMatchOpts)===q.beforeOptions,
          winnerPreserved:q.scenario!=='stale-warm-rejection'||(g.match===q.winner&&g._matchFlow===q.winnerFlow&&JSON.stringify(g.lastMatchOpts)===q.winnerOptions) };
      }, key);
      const expectedToasts=scenario==='warm-rejection-retry'?1:0;
      if (receipt.calls!==2 || !receipt.oldSettled || receipt.oldRejected || receipt.toastCount!==expectedToasts || receipt.mode!=='match' || receipt.menu!==null || receipt.attract || !receipt.playing || !receipt.liveMatch || !receipt.optionsPreserved || !receipt.winnerPreserved)
        throw Error('Rematch retry/late rejection violated live ownership: '+JSON.stringify(receipt));
      await page.screenshot({ path:evidenceDir+'/'+scenario+'-playing.png',timeout:60000 });
      receipts.push({...receipt,contentHash});
    } finally {
      // Release any pending synthetic rejection; handlers were attached immediately.
      // Never await a potentially stalled app operation during cleanup.
      await page.evaluate(key => {const q=window[key];if(q){q.reject();q.restore();delete window[key];}}, key);
    }
  }
  return receipts;
}
