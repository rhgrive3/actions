// Diagnostic-only secure launcher: no forced backend or unsafe arguments.
export async function launchSandboxBrowser(chromium) {
  return await chromium.launch({headless:true,chromiumSandbox:true,args:[]});
}
