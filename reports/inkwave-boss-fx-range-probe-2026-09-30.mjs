// Run from repo root: node reports/inkwave-boss-fx-range-probe-2026-09-30.mjs
// Uses the production BossFX class and vendored Three.js WebGLAttributes in a byte-retaining GL fixture.
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as THREE from '../inkwave-public/vendor/three/build/three.module.js';

const path = 'inkwave-public/src/boss/bossModelFx.js';
const old = execFileSync('git', ['show', 'd5d54d1d37274dfa82467b37b9b8009719783ed3:' + path], { encoding: 'utf8' });
const fixed = fs.readFileSync(path, 'utf8');
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const types = { Float32Array, Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array, Uint8ClampedArray };
const vsrc = fs.readFileSync('inkwave-public/vendor/three/build/three.module.js', 'utf8');
const a = vsrc.indexOf('function WebGLAttributes( gl ) {'), b = vsrc.indexOf('\nvar alphahash_fragment', a);
assert(a >= 0 && b > a);
const WebGLAttributes = vm.runInNewContext(vsrc.slice(a, b) + '\nWebGLAttributes', types);
const cls = s => vm.runInNewContext(s.replace(/^import .*;\n/gm, '').replace('export class BossFX', 'class BossFX') + '\nBossFX', { THREE, ...types });
function uploader() {
  let bound; const c = { init: 0, uploads: 0, bytes: 0 };
  const gl = { FLOAT: 5126, createBuffer: () => ({}), bindBuffer: (_, v) => { bound = v; },
    bufferData: (_, v) => { c.init++; bound.bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength).slice(); },
    bufferSubData: (_, off, v, start = 0, count = v.length - start) => {
      c.uploads++; c.bytes += count * v.BYTES_PER_ELEMENT;
      bound.bytes.set(new Uint8Array(v.buffer, v.byteOffset + start * v.BYTES_PER_ELEMENT, count * v.BYTES_PER_ELEMENT), off);
    }, deleteBuffer() {} };
  const attr = WebGLAttributes(gl);
  return { c, attr, upload(f) { for (const a of attrs(f)) attr.update(a, 34962); } };
}
const attrs = f => [f.inkMesh.instanceMatrix, ...['position', 'aSize', 'aAlpha', 'aSeed'].map(n => f.steam.geometry.attributes[n])];
const state = f => JSON.parse(JSON.stringify({ ni: f.ni, ns: f.ns, live: f.inkMesh.count,
  inkVisible: f.inkMesh.visible, steamVisible: f.steam.visible, drawRange: f.steam.geometry.drawRange,
  I: f.I, S: f.S, geyserT: f.geyserT, geyserDur: f.geyserDur, accS: f.accS, accG: f.accG }));
const pos = new THREE.Vector3(2, 6, -3), dir = new THREE.Vector3(0.3, 1, 0.2).normalize(), ink = new THREE.Color('#18c7e8');
const result = { baseCommit: 'd5d54d1d37274dfa82467b37b9b8009719783ed3',
  sha256: { before: hash(old), fixed: hash(fixed), vendor: hash(vsrc) }, cases: [] };
for (const quality of ['low', 'high']) {
  const f0 = new (cls(old))({ quality, ink }), f1 = new (cls(fixed))({ quality, ink });
  const u0 = uploader(), u1 = uploader(), liveHash = crypto.createHash('sha256');
  u0.upload(f0); u1.upload(f1);
  let comparedLiveAttrs = 0, empty = 0, maxInk = 0, maxSteam = 0;
  for (let frame = 0; frame < 900; frame++) {
    for (const f of [f0, f1]) {
      if ([10, 290, 720].includes(frame)) { f.ink(pos, 3, dir, 6, 0.7, 0.17, 0, 1.2); f.steamPuff(pos, 2, dir, 2.5); }
      if (frame === 85) { f.ink(pos, Math.ceil(f.NI / f.k) + 5, dir, 5); f.steamPuff(pos, Math.ceil(f.NS / f.k) + 5, dir, 2); }
      if (frame === 445) f.geyser(pos, 0.25);
      f.update(1 / 60);
    }
    assert.deepEqual(state(f0), state(f1));
    maxInk = Math.max(maxInk, f0.inkMesh.count); maxSteam = Math.max(maxSteam, f0.ns);
    if (!f0.inkMesh.count && !f0.ns) empty++;
    const x = attrs(f0), y = attrs(f1); u0.upload(f0); u1.upload(f1);
    for (let k = 0; k < x.length; k++) {
      assert.deepEqual(x[k].array, y[k].array);
      const n = k === 0 ? f0.inkMesh.count : f0.steam.geometry.drawRange.count;
      const bytes = n * x[k].itemSize * x[k].array.BYTES_PER_ELEMENT;
      if (bytes) {
        const aa = u0.attr.get(x[k]).buffer.bytes.subarray(0, bytes);
        const bb = u1.attr.get(y[k]).buffer.bytes.subarray(0, bytes);
        assert.deepEqual(aa, bb); liveHash.update(aa); comparedLiveAttrs++;
      }
    }
  }
  assert(empty && maxInk === f0.NI && maxSteam === f0.NS && comparedLiveAttrs,
    JSON.stringify({ quality, empty, maxInk, NI: f0.NI, maxSteam, NS: f0.NS, comparedLiveAttrs }));
  const dispose = [0, 0];
  f0.inkMesh.addEventListener('dispose', () => dispose[0]++);
  f1.inkMesh.addEventListener('dispose', () => dispose[1]++);
  f0.dispose(); f1.dispose();
  assert.deepEqual(dispose, [0, 1]);
  assert.equal(u0.c.init, u1.c.init);
  result.cases.push({ quality, frames: 900, emptyFrames: empty, maxInk, maxSteam,
    baseline: u0.c, fixed: u1.c, comparedLiveAttrs,
    activeBytesSha256: liveHash.digest('hex'), instancedMeshDisposeEvents: dispose,
    allCpuArraysLogicalStateAndLiveGpuBytesEqual: true });
}
result.scope = 'simulated GL uploads with production methods; no GPU/device timing';
console.log(JSON.stringify(result, null, 2));
