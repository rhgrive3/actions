import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { adaptQualitySource } from '../adapter.mjs';
let sourceRoot;
export function initialize(data) { sourceRoot = data.sourceRoot; }
export function resolve(specifier, context, nextResolve) {
  if (specifier === 'three') return { url: pathToFileURL(sourceRoot + '/vendor/three/build/three.module.js').href, shortCircuit: true };
  if (specifier.startsWith('three/addons/')) return { url: pathToFileURL(sourceRoot + '/vendor/three/jsm/' + specifier.slice(13)).href, shortCircuit: true };
  return nextResolve(specifier, context);
}
export async function load(url, context, nextLoad) {
  const target = new URL(url);
  if (target.pathname === sourceRoot.replace(/\/$/, '') + '/src/world/props.js') {
    // Negative controls use the exact source from before this migration.
    // The loader still gives it the original src/world/props.js URL so imports resolve unchanged.
    const legacy = target.searchParams.get('patched') === 'false';
    let source = await fs.readFile(legacy
      ? new URL('./fixtures/props-before-direct-migration.js.txt', import.meta.url)
      : target, 'utf8');
    if (!legacy) source = adaptQualitySource('src/world/props.js', source);
    if (target.searchParams.get('practice') === 'true') {
      const registration = new URL('./fixtures/pr183/props.mjs', import.meta.url).href;
      source = 'import { register as registerPractice } from ' + JSON.stringify(registration) + ';\n' + source.replace('export class PropKit {', 'registerPractice(D, {});\nexport class PropKit {');
    }
    return { format: 'module', source, shortCircuit: true };
  }
  return nextLoad(url, context);
}
