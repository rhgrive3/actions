import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../adapter.mjs';
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export async function resourceFixture({ baseline = false, globals = {} } = {}) {
  const context = vm.createContext({ console, performance, ...globals });
  const modules = new Map(), source = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const resolve = (spec, from) => spec === 'three' ? path.join(ROOT, 'inkwave-public/vendor/three/build/three.module.js')
    : spec.startsWith('three/addons/') ? path.join(ROOT, 'inkwave-public/vendor/three/jsm', spec.slice(13))
      : path.resolve(path.dirname(from), spec).replace('/inkwave-public/patches/', '/patches/').replace(path.join(ROOT, 'src/'), path.join(ROOT, 'inkwave-public/src/'));
  function load(file) {
    if (modules.has(file)) return modules.get(file);
    let code = fs.readFileSync(file, 'utf8');
    const rel = path.relative(path.join(ROOT, 'inkwave-public'), file);
    if (!rel.startsWith('..')) {
      code = adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code)));
      if (!baseline) code = adaptQualitySource(rel, code);
    }
    const mod = new vm.SourceTextModule(code, { context, identifier: file }); modules.set(file, mod); return mod;
  }
  const root = new vm.SourceTextModule(`
    export * from './inkwave-public/src/core/ctx.js';
    export * from './inkwave-public/src/config.js';
    export * from './inkwave-public/src/game/match.js';
    export * from './inkwave-public/src/game/showcase.js';
    export { Character } from './inkwave-public/src/game/character.js';
    export * from './inkwave-public/src/world/environment.js';
    export * from './inkwave-public/src/core/shadowcache.js';
    export * from './patches/local-quality/depth-cache.mjs';
    export * as THREE from 'three';
  `, { context, identifier: path.join(ROOT, 'resource-fixture.mjs') });
  await root.link((spec, from) => load(resolve(spec, from.identifier))); await root.evaluate();
  return root.namespace;
}
