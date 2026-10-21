// Test-harness observation only. No reload, request interception or game mutation.
export function criticalBootRequest(rawUrl, resourceType, documentUrl) {
  const request = new URL(rawUrl), base = new URL(documentUrl);
  return request.origin === base.origin && request.pathname.startsWith(new URL('.', base).pathname)
    && (resourceType === 'document' || (resourceType === 'script' && /\.(?:m?js)$/.test(request.pathname)));
}
export function rankedBootState() {
  const shell = document.getElementById('inkwave-startup-shell');
  const retry = document.getElementById('inkwave-startup-retry');
  if (shell && !shell.hidden && retry && !retry.hidden) return {failed: document.getElementById('inkwave-startup-status')?.textContent || 'Explicit startup failure'};
  return globalThis.RG?.game?.menus && RG.s3?.installed && RG.mode !== 'boot' ? {ready:true} : false;
}
export async function observeRankedBoot(page, url, receipt, start) {
  receipt.url=url; receipt.startedAt=new Date().toISOString(); receipt.status='starting'; receipt.failures=[];
  let rejectFailure, finished=false;
  const failure = new Promise((_, reject) => { rejectFailure=reject; });
  // Attach before navigation: a static module can fail before DOMContentLoaded.
  const fail = event => { event.observedAt=new Date().toISOString(); if(receipt.failures.length<16) receipt.failures.push(event); rejectFailure(new Error(`Ranked boot ${event.kind}: ${event.status || event.message || ''} ${event.url || ''}`)); };
  const response = r => { if(r.status()>=400 && criticalBootRequest(r.url(),r.request().resourceType(),url)) fail({kind:'critical-http',status:r.status(),url:r.url()}); };
  const requestfailed = r => { if(criticalBootRequest(r.url(),r.resourceType(),url)) fail({kind:'critical-request',url:r.url(),message:r.failure()?.errorText}); };
  const pageerror = e => fail({kind:'pageerror',message:e.message});
  page.on('response',response); page.on('requestfailed',requestfailed); page.on('pageerror',pageerror);
  try {
    await Promise.race([failure, (async()=>{
      await start();
      if(finished)return; // A failed navigation must not enqueue a later readiness poll.
      const handle=await page.waitForFunction(rankedBootState,null,{timeout:180000});
      const state=await handle.jsonValue(); await handle.dispose();
      if(state.failed){receipt.failures.push({kind:'loader-error',message:state.failed,observedAt:new Date().toISOString()});throw new Error('Ranked boot loader-error: '+state.failed);}
      if(!state.ready)throw new Error('Ranked boot returned no readiness proof');
    })()]);
    receipt.status='ready';
  } catch(error) { receipt.status='failed'; receipt.error=error.message; throw error; }
  finally {finished=true;receipt.finishedAt=new Date().toISOString();page.off('response',response);page.off('requestfailed',requestfailed);page.off('pageerror',pageerror);}
}
