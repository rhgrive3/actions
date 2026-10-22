// Keep Chromium as the existing default; reject accidental/unsupported engines
// before opening a server or creating a browser profile.
export function rematchEngine(argv) {
  const matches = argv.flatMap((value, index) => value === '--engine' ? [index] : []);
  if (matches.length > 1) throw new Error('--engine must appear once');
  if (!matches.length) return 'chromium';
  const value = argv[matches[0] + 1];
  if (value !== 'chromium' && value !== 'webkit') throw new Error('--engine must be chromium or webkit');
  return value;
}

export function rematchLaunchOptions(engine, chromiumExecutable) {
  return {
    headless: true, viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1,
    hasTouch: true, isMobile: true,
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    ...(engine === 'chromium' ? {
      ...(chromiumExecutable ? { executablePath: chromiumExecutable } : {}),
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    } : {}),
  };
}
