// Install the shared viewport cache from the earliest device module.
export function adaptViewportCache(rel, code) {
  if (rel !== 'src/core/device.js') return code;
  if (code.includes('installViewportCache')) throw new Error('INKWAVE viewport cache already applied');
  return "import { installViewportCache } from '../../patches/local-quality/viewport-cache.mjs';\ninstallViewportCache();\n" + code;
}
