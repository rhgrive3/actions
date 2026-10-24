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
export function rankedHttpFailureDetails(response, documentUrl, artifacts = {}) {
  const request = response.request(), base = new URL(documentUrl), url = new URL(response.url());
  const relative = decodeURIComponent(url.pathname.slice(new URL('.', base).pathname.length));
  const responseHeaders = {};
  // Deliberately omit cookies/authorization and retain only distribution provenance.
  const allowed = new Set(['content-type','content-length','cache-control','etag','last-modified','age','date','server','via','x-cache','x-cache-hits','x-github-request-id','x-github-edge-region','x-served-by','x-fastly-request-id']);
  try { for (const [name,value] of Object.entries(response.headers?.() || {})) if (allowed.has(name.toLowerCase())) responseHeaders[name.toLowerCase()] = value; } catch {}
  let requestTiming = null;
  try { requestTiming = request.timing?.() || null; } catch {}
  return { kind:'critical-http', status:response.status(), url:response.url(), responseHeaders, requestTiming,
    expectedArtifact: Object.hasOwn(artifacts, relative) ? { file:relative, sha256:artifacts[relative] } : null };
}
export async function observeRankedBoot(page, url, receipt, start, { artifacts } = {}) {
  receipt.url=url; receipt.startedAt=new Date().toISOString(); receipt.status='starting'; receipt.failures=[];
  let rejectFailure, finished=false;
  const failure = new Promise((_, reject) => { rejectFailure=reject; });
  // Attach before navigation: a static module can fail before DOMContentLoaded.
  const fail = event => { event.observedAt=new Date().toISOString(); if(receipt.failures.length<16) receipt.failures.push(event); rejectFailure(new Error(`Ranked boot ${event.kind}: ${event.status || event.message || ''} ${event.url || ''}`)); };
  const response = r => { if(r.status()>=400 && criticalBootRequest(r.url(),r.request().resourceType(),url)) fail(rankedHttpFailureDetails(r,url,artifacts)); };
  const requestfailed = r => { if(criticalBootRequest(r.url(),r.resourceType(),url)) fail({kind:'critical-request',url:r.url(),message:r.failure()?.errorText}); };
  const pageerror = e => fail({kind:'pageerror',message:e.message});
  const crash = () => fail({kind:'browser-crash',message:'Browser renderer crashed while starting Ranked'});
  const close = () => fail({kind:'page-close',message:'Ranked page closed before boot proof'});
  page.on('response',response); page.on('requestfailed',requestfailed); page.on('pageerror',pageerror);
  page.on('crash',crash);page.on('close',close);
  try {
    await Promise.race([failure, (async()=>{
      await start();
      if(finished)return; // A failed navigation must not enqueue a later readiness poll.
      // The renderer may run at 1-5 FPS under SwiftShader or mobile overload.
      // Playwright's default waitForFunction polling uses requestAnimationFrame,
      // so a ready startup could be mistaken for a boot hang. Poll by elapsed
      // wall-clock time while retaining exactly the original 180s deadline,
      // readiness predicate and immediate critical HTTP / page-error guards.
      const handle=await page.waitForFunction(rankedBootState,null,{timeout:180000,polling:250});
      const state=await handle.jsonValue(); await handle.dispose();
      if(state.failed){receipt.failures.push({kind:'loader-error',message:state.failed,observedAt:new Date().toISOString()});throw new Error('Ranked boot loader-error: '+state.failed);}
      if(!state.ready)throw new Error('Ranked boot returned no readiness proof');
    })()]);
    receipt.status='ready';
  } catch(error) { receipt.status='failed'; receipt.error=error.message; throw error; }
  finally {finished=true;receipt.finishedAt=new Date().toISOString();page.off('response',response);page.off('requestfailed',requestfailed);page.off('pageerror',pageerror);page.off('crash',crash);page.off('close',close);}
}
