import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../adapter.mjs';
export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const compose = (rel, baseline = false) => {
  const src = fs.readFileSync(path.join(ROOT, 'inkwave-public', rel), 'utf8');
  const out = adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, src)));
  return baseline ? out : adaptQualitySource(rel, out);
};
export async function idleFixture({ baseline = false, globals = {}, built = process.env.INKWAVE_IDLE_BUILD } = {}) {
  if (baseline) built = null;
  const upstream = built || path.join(ROOT, "inkwave-public");
  const context = vm.createContext({ console, performance, ...globals });
  const modules = new Map();
  const resolve = (spec, from) => spec === 'three' ? path.join(upstream, 'vendor/three/build/three.module.js')
    : spec.startsWith('three/addons/') ? path.join(upstream, 'vendor/three/jsm', spec.slice(13))
      : (built ? path.resolve(path.dirname(from), spec) : path.resolve(path.dirname(from), spec).replace('/inkwave-public/patches/', '/patches/'));
  function load(file) {
    if (modules.has(file)) return modules.get(file);
    const rel = path.relative(upstream, file);
    const code = built || rel.startsWith('..') ? fs.readFileSync(file, 'utf8') : compose(rel, baseline);
    const mod = new vm.SourceTextModule(code, { context, identifier: file }); modules.set(file, mod); return mod;
  }
  let entry = `
    export * from './inkwave-public/src/core/ctx.js';
    export * from './inkwave-public/src/world/environment.js';
    export * from './inkwave-public/src/audio/music.js';
    export * from './inkwave-public/src/audio/audio.js';
    export * as THREE from 'three';
  `;
  if (built) entry = entry.replaceAll('./inkwave-public/', './');
  const root = new vm.SourceTextModule(entry, { context, identifier: path.join(built || ROOT, 'idle-fixture.mjs') });
  await root.link((spec, from) => load(resolve(spec, from.identifier))); await root.evaluate();
  return root.namespace;
}
export function audioFixture() {
  let seq = 0; const intervals = new Map(), workers = new Set();
  const counts = { nodes: 0, starts: 0, stops: 0, suspended: 0 };
  const param = () => new Proxy({ value: 0 }, { get: (o, k) => k in o ? o[k] : () => {} });
  const node = () => { counts.nodes++; return new Proxy({ gain:param(), frequency:param(), Q:param(), pan:param(), delayTime:param(), playbackRate:param(), detune:param(), connect(){}, disconnect(){}, start(){counts.starts++;}, stop(){counts.stops++;}, setPeriodicWave(){} }, {get(o,k) { return k in o ? o[k] : (o[k] = param()); }}); };
  const ctx = new Proxy({ currentTime: 0, sampleRate: 8000, state:'running', destination:node(), listener:{},
    createBuffer(ch,n,sr){ const data=Array.from({length:ch},()=>new Float32Array(n)); return {getChannelData:i=>data[i],duration:n/sr,length:n,sampleRate:sr}; },
    createPeriodicWave(){return {};}, resume(){return Promise.resolve();}, suspend(){counts.suspended++; return Promise.resolve();}
  }, {get(o,k){return k in o?o[k]:k.startsWith('create')?node:undefined;}});
  class Worker { constructor(){workers.add(this);} postMessage(n){this.delay=n;} terminate(){workers.delete(this);} }
  const globals = { Worker, Blob: class {}, URL:{createObjectURL:()=> 'blob:fixture',revokeObjectURL(){}},
    setTimeout:()=>0, clearTimeout(){}, setInterval(fn){const id=++seq;intervals.set(id,fn);return id;},clearInterval(id){intervals.delete(id);} };
  return {ctx,counts,workers,intervals,globals};
}
