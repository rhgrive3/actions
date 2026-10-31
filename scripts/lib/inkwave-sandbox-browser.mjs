// Explicit opt-in is essential: Playwright disables Chromium's sandbox by default.
// A failed supported launch is a blocker, never a reason to retry insecurely.
export function sandboxBrowserOptions(env = process.env) {
  return {headless: true, chromiumSandbox: true,
    ...(env.CHROMIUM_EXECUTABLE_PATH ? {executablePath: env.CHROMIUM_EXECUTABLE_PATH} : {}),
    args: ['--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']};
}
export async function launchSandboxBrowser(chromium, env = process.env) {
  return chromium.launch(sandboxBrowserOptions(env));
}

// Attempt both independent owners before touching either diagnostic collector.
// The optional raw array is private bookkeeping for callers that must preserve
// thrown values; legacy two-argument calls keep the same return shape.
export async function closeWiperCaptureOwners({browser, server}, errors, rawFailures=undefined) {
  const cleanup = {browserClosed: false, serverClosed: false}, failures=[];
  try { await browser?.close(); cleanup.browserClosed = !!browser; }
  catch (error) { failures.push({owner:'browser',error}); }
  try { if (server?.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); cleanup.serverClosed = !!server; }
  catch (error) { failures.push({owner:'server',error}); }
  let collectorFailed=false;
  for(const {owner,error} of failures){
    let message;try { message=String(error?.message ?? error); } catch { message='<unprintable cleanup error>'; }
    try { errors.push(owner+' cleanup: '+message); } catch { collectorFailed=true; }
  }
  if(failures.length&&Array.isArray(rawFailures))try { rawFailures.push(...failures.map(row=>row.error)); } catch { collectorFailed=true; }
  if(collectorFailed)throw failures[0].error;
  return cleanup;
}
