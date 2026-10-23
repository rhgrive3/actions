import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { BEAM, RIBBON, PUFF } from '../runtime/special-vfx-kit.mjs';

export const RATES = [30, 60, 120, 144, 240];
export const source = fs.readFileSync(new URL('../runtime/special-vfx.mjs', import.meta.url), 'utf8');
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Execute the actual director method. Geometry calls are recorded CPU stubs;
// these measurements do not imply browser/GPU or retail-footage parity.
export function harness({ code = source, random = null } = {}) {
  const begin = code.indexOf('  zipcaster: {', code.indexOf('const DIRECTORS = {'));
  const end = code.indexOf('  // ---------------------------------------------------------------- Crab Tank', begin);
  assert.ok(begin >= 0 && end > begin, 'unique Zipcaster director boundaries');
  let seed = 23, calls = 0;
  const rng = () => { calls++; return random ? random() : ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296); };
  const rnd = (a = 1, b = 0) => b + rng() * (a - b);
  const clamp01 = x => Math.max(0, Math.min(1, x));
  const frame = new Function('vfxRandom', 'rnd', 'clamp01', 'easeOut', 'BEAM', 'RIBBON', 'PUFF',
    'return ({' + code.slice(begin, end) + '}).zipcaster.frame;')(
    rng, rnd, clamp01, x => 1 - (1 - clamp01(x)) ** 3, BEAM, RIBBON, PUFF);
  const rows = [], beams = [], ribbons = [], pushes = [];
  const snapshot = args => JSON.parse(JSON.stringify(args));
  const d = {
    v: Array.from({ length: 8 }, () => new THREE.Vector3()),
    bone: () => null,
    chest: (a, out, h) => out.set(a.pos.x, a.pos.y + h, a.pos.z),
    beam(...args) { const r = { v: Array(16).fill(0), args: snapshot(args) }; beams.push(r); return r; },
    setBeam(r, ...args) { r.update = snapshot(args); r.v[11] = args[4]; },
    ribbon(...args) { const r = { args: snapshot(args) }; ribbons.push(r); return r; },
    pushRibbon(...args) { pushes.push(snapshot(args)); },
    kit: { ribbons: { end(r) { r.ended = true; } } },
    drop(...args) { rows.push(['drop', ...snapshot(args)]); },
    puff(...args) { rows.push(['puff', ...snapshot(args)]); },
  };
  const actor = { pos: new THREE.Vector3(1, 2, 3), vel: new THREE.Vector3(8, 2, 4),
    _s3AllSpecialState: { phase: 'hookFlight', zipTarget: new THREE.Vector3(1, 3, 15), hookFlightT: .05, hookFlightDuration: .1 } };
  const track = { d: {}, color: [.7, .2, .1] };
  return { actor, track, d, rows, beams, ribbons, pushes, randomCalls: () => calls,
    step(dt) { frame.call(d, actor, track, dt); },
    run(hz, seconds = 1, phase = 'hookFlight') {
      actor._s3AllSpecialState.phase = phase;
      for (let i = 0; i < Math.round(hz * seconds); i++) this.step(1 / hz);
      return this;
    },
    summary() { return { drops: rows.filter(r => r[0] === 'drop').length,
      coat: rows.filter(r => r[0] === 'puff').length, randomCalls: calls, hash: digest(rows) }; },
  };
}
