import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { SUITES } from './config.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
for (const suite of Object.keys(SUITES)) test(suite + ' browser harness statically links against the shared production helper', async () => {
  const context = vm.createContext({}), cache = new Map();
  const load = async relative => {
    if (cache.has(relative)) return cache.get(relative);
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    const module = new vm.SourceTextModule(source, { context, identifier: relative });
    cache.set(relative, module);
    await module.link(async (specifier, parent) => {
      if (specifier === 'three') return new vm.SyntheticModule([], () => {}, { context, identifier: 'three' });
      assert(specifier.startsWith('./') || specifier.startsWith('../'), 'No unrecorded harness package dependency');
      const target = specifier.startsWith('./shared/')
        ? 'tools/object-presentation-qa/' + specifier.slice('./shared/'.length)
        : path.normalize(path.join(path.dirname(parent.identifier), specifier));
      assert(target.startsWith('tools/object-presentation-qa/'), 'Harness must use the common production helper');
      return load(target);
    });
    return module;
  };
  const browserPath = 'tools/' + suite + '-production-qa/browser.mjs';
  const module = await load(browserPath);
  assert.equal(module.status, 'linked', 'Imports resolve without evaluating a browser');
  assert(cache.has('tools/object-presentation-qa/production-scene.mjs'), 'Uses actual common Environment/Renderer setup');
  const source = fs.readFileSync(path.join(root, browserPath), 'utf8');
  assert.match(source, /export\s+async\s+function\s+run\s*\(/, 'Shared runner entry point');
  assert.match(source, /expectedFrames\s*:\s*[1-9]\d*/, 'Explicit expected PNG denominator');
  for (const file of SUITES[suite].before.concat(SUITES[suite].added)) assert(fs.statSync(path.join(root, file)).isFile());
});
