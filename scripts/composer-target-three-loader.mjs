import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const THREE_ROOT = new URL('../inkwave-public/vendor/three/', import.meta.url);

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'three') {
    return { url: new URL('build/three.module.js', THREE_ROOT).href, shortCircuit: true };
  }
  if (specifier.startsWith('three/addons/')) {
    const addonPath = specifier.slice('three/addons/'.length);
    return { url: new URL(`jsm/${addonPath}`, THREE_ROOT).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith(THREE_ROOT.href) && url.endsWith('.js')) {
    return {
      format: 'module',
      source: await fs.readFile(fileURLToPath(url), 'utf8'),
      shortCircuit: true,
    };
  }
  return nextLoad(url, context);
}
