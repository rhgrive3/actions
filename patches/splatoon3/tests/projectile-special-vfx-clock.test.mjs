import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {compactModuleStrings} from '../../../scripts/lib/inkwave-source-compaction.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

// Execute the actual composed recipes and retained-record callbacks without a
// GPU. This is a render-cadence contract, NOT retail footage or browser evidence.
const rel = 'patches/splatoon3/runtime/special-vfx.mjs';
const source = fs.readFileSync(process.env.SPECIAL_VFX_SOURCE || new URL('../runtime/special-vfx.mjs', import.meta.url), 'utf8');
const composed = adaptBuildSource(rel, source);
const evaluated = composed.replace(/^import .*;\n/gm, '').replace(/^export default .*;$/gm, '').replace(/^export /gm, '');
const enums = new Proxy({}, { get: () => 1 });
const context = vm.createContext({
  console, vfxRandom: () => 0.25, inkVacState: actor => actor.state,
  WAIL_SPEAKER_POSITIONS: [], SPARK: enums, PUFF: enums, RIBBON: enums,
  BEAM: enums, SHELL: enums, BAND: enums, DISC: enums,
});
let program = evaluated + '\nglobalThis.recipes = { Director, DIRECTORS, OBJECT_FX };';
if (process.env.SPECIAL_VFX_ESBUILD) program = compactModuleStrings(createRequire(import.meta.url)(process.env.SPECIAL_VFX_ESBUILD).transformSync(program, {loader:'js', minify:true, charset:'utf8'}).code).code;
vm.runInContext(program, context);
const { Director, DIRECTORS, OBJECT_FX } = context.recipes;
class Vec {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x, y, z) { Object.assign(this, { x, y, z }); return this; }
  copy(v) { return this.set(v.x, v.y, v.z); }
  setY(y) { this.y = y; return this; }
  addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
}
function fixture() {
  const records = [], pool = { add(life, values, follow) {
    const r = { life, v: new Float32Array(values), follow, t: 0 }; records.push(r); return r;
  }};
  const director = Object.assign(Object.create(Director.prototype), {
    v: Array.from({ length: 8 }, () => new Vec()), up: new Vec(0, 1, 0),
    tracks: new Map(), time: 0, kit: { discs: pool, inkDiscs: pool, bands: pool, inkBands: pool },
    aim: (_, out) => out.set(0, 0, 1), near: () => false, flash() {}, ribbon() { return {}; },
  });
  return { director, records };
}
const close = (a, b, label) => assert.ok(Math.abs(a - b) < 2e-6, `${label}: ${a} != ${b}`);
function runVac(hz) {
  const { director, records } = fixture();
  const actor = { pos: new Vec(), state: { phase: 'inhale', charge: 0.5 }, intent: { fire: true } };
  const track = { color: [0.2, 0.4, 0.8], d: {} }; director.tracks.set(actor, track);
  const snapshots = [];
  for (let i = 0; i < hz; i++) {
    actor.intent.fire = i < hz / 2;
    director.time = (i + 1) / hz;
    DIRECTORS.inkVac.frame.call(director, actor, track, 1 / hz);
    const rec = records[0]; rec.t = director.time; rec.follow(rec);
    if (i === hz / 2 - 1 || i === hz - 1) snapshots.push(Array.from(rec.v));
  }
  actor.state.phase = 'exhale';
  assert.equal(records[0].follow(records[0]), false, 'inhale record terminates on exhale');
  return snapshots;
}
test('Ink Vac vortex rotation and inhale/release opacity agree at 30/60/120 Hz', () => {
  const reference = runVac(60);
  for (const hz of [30, 120]) runVac(hz).forEach((v, i) => {
    for (const index of [0, 1, 2, 3, 4, 5, 6, 7, 11]) close(v[index], reference[i][index], `${hz} Hz sample ${i} slot ${index}`);
  });
  close(reference[0][7], Math.PI / 2 + 1.5, 'existing 60 Hz angle');
  close(reference[0][11], 0.85 * (1 - 0.8 ** 30), 'existing 60 Hz fade-in');
  close(reference[1][11], reference[0][11] * 0.8 ** 30, 'existing 60 Hz release');
});
function runObject(kind, hz) {
  const { director, records } = fixture(), object = { pos: new Vec(1, 2, 3), age: 0, phase: 'landed', flight: 82 / 60, dur: 51 / 60, currentRadius: 4 };
  OBJECT_FX[kind].start.call(director, { d: {}, color: [0.2, 0.4, 0.8] }, object);
  for (let i = 0; i < hz / 2; i++) {
    object.age = (i + 1) / hz;
    for (const rec of records) { rec.t = object.age; rec.follow(rec); }
  }
  return records.map(r => Array.from(r.v));
}
for (const kind of ['marker', 'strike']) test(`${kind} retained rotation agrees at 30/60/120 Hz`, () => {
  const reference = runObject(kind, 60);
  for (const hz of [30, 120]) runObject(kind, hz).forEach((v, i) => v.forEach((n, j) => close(n, reference[i][j], `${kind} ${hz} Hz record ${i} slot ${j}`)));
  const slot = kind === 'marker' ? 7 : 3;
  const rates = kind === 'marker' ? [1.8] : [13.2, -9, 18];
  reference.forEach((v, i) => close(v[slot], Math.PI / 2 + rates[i] * 0.5, 'existing 60 Hz calibration'));
});
test('re-evaluating a retained frame at the same elapsed time does not advance animation', () => {
  const { director, records } = fixture();
  OBJECT_FX.strike.start.call(director, { d: {}, color: [1, 0, 0] }, { pos: new Vec(), currentRadius: 3 });
  for (const rec of records) { rec.t = 0.25; rec.follow(rec); const angle = rec.v[3]; rec.follow(rec); assert.equal(rec.v[3], angle); }
});
