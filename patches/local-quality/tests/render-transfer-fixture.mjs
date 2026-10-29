import fs from 'node:fs';
import { parse } from '../../loading-cache/vendor/acorn.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

// Execute the real ring methods and real geometry/shaders, isolated from the
// unrelated FX constructor (which loads asynchronous ink-volume assets).
export function ringFixtureSource(optimized = true) {
  const raw = fs.readFileSync(new URL('../../../inkwave-public/src/fx/fx.js', import.meta.url), 'utf8');
  const code = optimized ? adaptBuildSource('src/fx/fx.js', raw) : raw;
  const ast = parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
  const functions = new Set(['makeQuadGeo', 'markUpdated', 'markFxStaticRange', 'clearFxUploadRanges']);
  const constants = new Set(['UP', 'easeOut', 'R_WAVE', 'GLSL_HASH', 'OUT_CHUNKS', 'RING_VERT', 'RING_FRAG']);
  const methods = new Set(['_initRings', '_ringRaw', 'mark', '_updateRings']);
  let prefix = '', body = '';
  for (let node of ast.body) {
    node = node.declaration || node;
    if (node.type === 'FunctionDeclaration' && functions.has(node.id.name)) prefix += code.slice(node.start, node.end) + '\n';
    if (node.type === 'VariableDeclaration' && node.declarations.some(d => constants.has(d.id.name))) prefix += code.slice(node.start, node.end) + '\n';
    if (node.type === 'ClassDeclaration' && node.id.name === 'FX') {
      for (const method of node.body.body) if (methods.has(method.key.name)) body += code.slice(method.start, method.end) + '\n';
    }
  }
  return `${prefix}\nreturn class RingFixture {
    constructor(cap=64){this.root=new THREE.Group();this._colB=new THREE.Color();this._initRings(cap);}
    _color(c){return c;}
    clear(){this.rings.n=0;this.rings.geo.instanceCount=0;this.marks.n=0;${optimized ? 'this.rings.dirtyStart=this.rings.cap;this.rings.dirtyEnd=0;' : ''}}
    ${body}
  };`;
}
export const randomStream = seed => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
export function ringFixture(THREE, optimized, cap = 64) {
  const C = new Function('THREE', 'rand', ringFixtureSource(optimized))(THREE, randomStream(1729));
  return new C(cap);
}

// Mirrors the range consumption contract: initial allocation uploads the full
// array; a later update consumes all queued ranges then clears them.
export function uploadTracker() {
  const seen = new Map(); let bytes = 0, calls = 0;
  return {
    draw(geo) {
      for (const attribute of Object.values(geo.attributes)) {
        const state = seen.get(attribute);
        if (!state) {
          seen.set(attribute, { version: attribute.version, gpu: attribute.array.slice() });
          bytes += attribute.array.byteLength; calls++;
          attribute.onUploadCallback();
        } else if (state.version !== attribute.version) {
          const ranges = attribute.updateRanges.length ? attribute.updateRanges : [{ start: 0, count: attribute.array.length }];
          for (const range of ranges) {
            state.gpu.set(attribute.array.subarray(range.start, range.start + range.count), range.start);
            bytes += range.count * attribute.array.BYTES_PER_ELEMENT; calls++;
          }
          state.version = attribute.version; attribute.clearUpdateRanges(); attribute.onUploadCallback();
        }
      }
    },
    gpu(attribute) { return seen.get(attribute)?.gpu; },
    stats() { return { bytes, calls }; },
    reset() { bytes = calls = 0; },
  };
}
