import fs from 'node:fs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { SPARK, SHELL, DISC } from '../runtime/special-vfx-kit.mjs';

export const frozen = JSON.parse(fs.readFileSync(new URL('./fixtures/booyah-vfx-before-726e338a.json', import.meta.url), 'utf8'));
export const source = fs.readFileSync(new URL('../runtime/special-vfx.mjs', import.meta.url), 'utf8');
export const roles = { round: ['ROUND_FX', 'booyahBomb'], object: ['OBJECT_FX', 'booyahBlast'], director: ['DIRECTORS', 'booyahBomb'] };
export function section(text, role) {
  const [table, key] = roles[role], start = text.indexOf('  ' + key + ': {', text.indexOf('const ' + table + ' = {'));
  if (start < 0) throw Error('Missing recipe: ' + role);
  return text.slice(start, text.indexOf('\n  },', start) + '\n  },'.length);
}
export const clamp01 = x => Math.max(0, Math.min(1, x));
export const smooth = x => { x = clamp01(x); return x * x * (3 - 2 * x); };
export const validDt = dt => dt > 0 && Number.isFinite(dt);
const snapshot = x => x?.isVector3 ? x.toArray() : Array.isArray(x) ? x.map(snapshot)
  : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).filter(([, v]) => typeof v !== 'function').map(([k, v]) => [k, snapshot(v)])) : x;

// Execute actual source methods. Spawners capture their arguments; this is a
// recipe test, not a renderer, native clock or Nintendo particle measurement.
export function rawSession(role, { old = false, seeded = false } = {}) {
  let word = 23, calls = 0;
  const random = () => { calls++; return seeded ? ((word = (Math.imul(word, 1664525) + 1013904223) >>> 0) / 4294967296) : .2; };
  const rnd = (a = 1, b = 0) => b + random() * (a - b);
  const recipe = new Function('vfxRandom', 'rnd', 'clamp01', 'smooth', 'SPARK', 'SHELL', 'DISC', 'RIBBON', 'TAU', 'SPECIAL_VFX_CALIBRATION',
    'return ({' + (old ? frozen.sections[role] : section(source, role)) + '}).' + roles[role][1] + ';')(
    random, rnd, clamp01, smooth, SPARK, SHELL, DISC, { GLOW: 0 }, Math.PI * 2, { booyah: { blastSeconds: 40 / 60 } });
  const rows = [], shapes = [];
  const d = { v: Array.from({ length: 8 }, () => new THREE.Vector3()), up: new THREE.Vector3(0, 1, 0), camPos: new THREE.Vector3(0, 4, -8), time: 0,
    hdr: (c, k, w = 0) => c.map(v => v * k + w * .32), near: () => true, pushRibbon() {}, activation() {}, ribbon: () => ({}) };
  for (const name of ['spark', 'drop', 'flash', 'streaks', 'chunks', 'petals']) d[name] = (...args) => rows.push([name, ...snapshot(args)]);
  for (const name of ['shell', 'disc']) d[name] = (...args) => {
    const rec = { t: 0, v: new Float32Array(16), follow: args.at(-1)?.follow };
    rec.v[7] = .375; shapes.push(rec); return rec;
  };
  const a = { pos: new THREE.Vector3(1, 2, 3), _s3AllSpecialState: { charge: 1 } };
  const o = { pos: a.pos.clone(), frameCount: 20, maxRadius: 12.6 };
  const p = { pos: a.pos.clone() };
  const r = { d: {}, color: [.8, .3, .1], last: p.pos.clone(), start: 0 };
  if (role !== 'director') recipe.start.call(d, r, role === 'round' ? p : o);
  const step = dt => {
    if (validDt(dt)) d.time += dt;
    recipe.frame.call(d, role === 'director' ? a : r, role === 'director' ? r : role === 'round' ? p : o, dt);
    if (validDt(dt)) for (const rec of shapes) { rec.t += dt; rec.follow?.(rec); }
  };
  return { recipe, d, r, a, p, o, rows, step, calls: () => calls,
    count: kind => rows.filter(row => row[0] === (kind === 'drop' ? 'drop' : 'spark') && (kind === 'drop' || row[1] === kind)).length };
}
export function measureRaw(hz, old = false) {
  const object = rawSession('object', { old }), round = rawSession('round', { old }), director = rawSession('director', { old });
  const scatter = rawSession('object', { old }); scatter.o.frameCount = 60; scatter.r.blasted = true;
  for (let k = 0; k < hz; k++) { object.step(1 / hz); scatter.step(1 / hz); round.step(1 / hz); director.step(1 / hz); }
  return { hz, angle: +(object.r.d.warn.v[7] - .375).toFixed(6), suction: object.count(SPARK.STREAK), scatter: scatter.count('drop'),
    flightStars: round.count(SPARK.STAR), chargedStars: director.count(SPARK.STAR) };
}
export { SPARK };
