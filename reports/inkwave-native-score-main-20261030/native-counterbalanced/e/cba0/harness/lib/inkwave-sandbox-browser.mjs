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

// Attempt every independent cleanup even if one owner fails to close.
export async function closeWiperCaptureOwners({browser, server}, errors) {
  const cleanup = {browserClosed: false, serverClosed: false};
  try { await browser?.close(); cleanup.browserClosed = !!browser; }
  catch (error) { errors.push('browser cleanup: ' + error.message); }
  try { if (server?.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); cleanup.serverClosed = !!server; }
  catch (error) { errors.push('server cleanup: ' + error.message); }
  return cleanup;
}
