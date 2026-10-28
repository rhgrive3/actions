import fs from 'node:fs';
import { markAttributeRange } from '../runtime/instance-color-upload.mjs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';

const source = fs.readFileSync(new URL('../runtime/special-vfx-kit.mjs', import.meta.url), 'utf8');
const start = source.indexOf('class RibbonPool {'), end = source.indexOf('// Instanced shape pools', start);
if (start < 0 || end <= start) throw Error('Production RibbonPool extraction failed');
export const ribbonCandidateSource = source.slice(start, end);
export const ribbonBaselineSource = fs.readFileSync(new URL('./fixtures/ribbon-pool-before-tail-block-20261025.txt', import.meta.url), 'utf8');
export const ribbonAttributes = ['pos', 'col', 'rib', 'side', 'face'];

export function makeRibbonPool(body, trails = 3, points = 48, additive = false) {
  let seed = 31, rngCalls = 0;
  const random = () => { rngCalls++; return ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296); };
  const Pool = new Function('THREE', 'RIBBON_VERT', 'RIBBON_FRAG', 'vfxRandom', 'markAttributeRange', body + '\nreturn RibbonPool;')
    (THREE, '', '', random, markAttributeRange);
  const pool = new Pool(THREE, trails, points, additive, { value: 0 });
  pool._testRib = { values: pool.rib.array.slice(), version: pool.rib.version };
  pool.rngCalls = () => rngCalls;
  return pool;
}

export function ribbonBytes(pool, key) {
  const a = pool[key].array;
  return Buffer.from(a.buffer, a.byteOffset, a.byteLength);
}

export function observeRibbonWrites(pool) {
  const counts = { scalarWrites: 0, blockCopies: 0, copiedFloats: 0 };
  for (const key of ribbonAttributes) {
    const target = pool[key].array;
    pool[key].array = new Proxy(target, {
      get(array, key) {
        if (key === 'copyWithin') return (to, from, end) => {
          counts.blockCopies++; counts.copiedFloats += end - from;
          return array.copyWithin(to, from, end);
        };
        return Reflect.get(array, key, array);
      },
      set(array, key, value) {
        if (/^\d+$/.test(String(key))) counts.scalarWrites++;
        return Reflect.set(array, key, value, array);
      },
    });
  }
  return counts;
}
