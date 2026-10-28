// Diagnostic-only transformation: do not edit either admitted source checkout.
// The exact inherited launcher must occur once; any drift fails closed.
export const SECURE_EXPLOSHER_LAUNCH = Object.freeze({headless:true,chromiumSandbox:true,explicitArgs:Object.freeze([])});
const inherited = `  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined, headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });`;
const replacement = `  browser = await chromium.launch({ headless: true, chromiumSandbox: true });`;
export function secureExplosherDriver(source) {
  if(typeof source!=='string'||source.split(inherited).length!==2)throw Error('Inherited Explosher launcher is not the exact reviewed anchor');
  const result=source.replace(inherited,replacement);
  if(/--no-sandbox|--enable-unsafe-swiftshader|--ignore-gpu-blocklist|chromiumSandbox\s*:\s*false/.test(result))throw Error('Unsafe Chromium launch configuration remains in generated driver');
  return result;
}
