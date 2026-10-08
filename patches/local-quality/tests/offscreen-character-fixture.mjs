import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../adapter.mjs';
import { adaptNetworkSource } from '../../network-replication/adapter.mjs';
import { adaptRange } from '../../practice-range/adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.join(ROOT, 'inkwave-public');
let cached;

const compose = (rel, code) => adaptRange(rel,
  adaptNetworkSource(rel,
    adaptQualitySource(rel,
      adaptReliability(rel,
        adaptTouchLayout(rel, adaptSource(rel, code))))));

export function offscreenCharacterRuntime() {
  return cached ??= (async () => {
    const context = vm.createContext({ console, performance, innerHeight: 720, innerWidth: 1280 });
    const modules = new Map();
    const load = requested => {
      const patchPrefix = path.join(SRC, 'patches') + path.sep;
      const sourcePrefix = path.join(ROOT, 'src') + path.sep;
      const file = requested.startsWith(patchPrefix)
        ? path.join(ROOT, path.relative(SRC, requested))
        : requested.startsWith(sourcePrefix)
          ? path.join(SRC, path.relative(ROOT, requested))
          : requested;
      if (modules.has(file)) return modules.get(file);
      const rel = file.startsWith(SRC + path.sep)
        ? path.relative(SRC, file).split(path.sep).join('/')
        : 'patches/' + path.relative(path.join(ROOT, 'patches'), file).split(path.sep).join('/');
      const source = compose(rel, fs.readFileSync(file, 'utf8'));
      const module = new vm.SourceTextModule(source, { context, identifier: file });
      modules.set(file, module);
      return module;
    };
    const entry = new vm.SourceTextModule(`
      export * from './inkwave-public/src/game/character.js';
      export { Actor } from './inkwave-public/src/game/actor.js';
      export * as THREE from 'three';
      export { G } from './inkwave-public/src/core/ctx.js';
      export { installWalkMotion } from './patches/splatoon3/runtime/walk.mjs';
      export { installRollerMotion } from './patches/splatoon3/runtime/roller.mjs';
    `, { context, identifier: path.join(ROOT, 'offscreen-entry.mjs') });
    await entry.link((specifier, from) => load(
      specifier === 'three'
        ? path.join(SRC, 'vendor/three/build/three.module.js')
        : specifier.startsWith('three/addons/')
          ? path.join(SRC, 'vendor/three/jsm', specifier.slice('three/addons/'.length))
          : path.resolve(path.dirname(from.identifier), specifier)));
    await entry.evaluate();
    const api = { ...entry.namespace };
    api.profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json'), 'utf8'));
    api.installWalkMotion(api, api.profile);
    api.installRollerMotion(api, api.profile);
    return api;
  })();
}
