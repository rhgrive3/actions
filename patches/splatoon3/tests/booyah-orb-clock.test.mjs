import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {compactModuleStrings} from '../../../scripts/lib/inkwave-source-compaction.mjs';
import {nonWailVfxTicks} from '../runtime/nonwail-vfx-clock.mjs';

// Executes the actual director and retained-shell callback, not a copied curve.
// This is source-only presentation verification, not GPU or retail-frame evidence.
const source = adaptBuildSource('patches/splatoon3/runtime/special-vfx.mjs', fs.readFileSync(new URL('../runtime/special-vfx.mjs', import.meta.url), 'utf8'));
const transformBody = body => process.env.SPECIAL_VFX_ESBUILD ? compactModuleStrings(createRequire(import.meta.url)(process.env.SPECIAL_VFX_ESBUILD).transformSync('function recipe(){'+body+'}', {loader:'js', minify:true, charset:'utf8',keepNames:true}).code).code + ';return recipe();' : body;
function orb(raw = source) {
  const actor = raw.slice(raw.indexOf('  booyahBomb: {', raw.indexOf('const DIRECTORS =')), raw.indexOf('  // ---------------------------------------------------------------- Ultra Stamp'));
  const shell = raw.slice(raw.indexOf('  shell(add,'), raw.indexOf('  disc(add,'));
  assert.ok(actor.startsWith('  booyahBomb: {') && shell.startsWith('  shell(add,'));
  const clamp01 = n => Math.max(0, Math.min(1, n));
  const api = Function('clamp01', 'easeOut', 'vfxRandom', 'SHELL', 'DISC', 'nonWailVfxTicks', transformBody(`return {${shell},${actor}};`))(clamp01, n => 1 - (1 - clamp01(n)) ** 3, () => 0.5, {ORB: 0}, {RUNE: 0}, nonWailVfxTicks);
  const pool = {add(life, values, follow) { return {life, v: new Float32Array(values), t: 0, follow}; }};
  const director = {kit:{shells:pool}, time:0, v:[{set(x,y,z){Object.assign(this,{x,y,z});return this;}}], up:{}, hdr:c=>c, shell:api.shell, disc:()=>({})};
  const actorState = {pos:{x:2,y:3,z:4},_s3AllSpecialState:{charge:0.5}};
  const track={color:[1,0,0],d:{},start:0};
  api.booyahBomb.frame.call(director,actorState,track,0);
  return {record:track.d.orb, director, actorState};
}
function advance(raw, steps) {
  const state=orb(raw),r=state.record;
  for (const dt of steps) {r.t+=dt;state.director.time=r.t;r.follow(r,dt);}
  return state;
}
for (const hz of [30,60,120,144]) test(`Booyah charge orb preserves 3 radians per second at ${hz}Hz`,()=>{
  const {record:r}=advance(source,Array(hz).fill(1/hz));
  assert.ok(Math.abs(r.v[7]-3)<1e-5);
  assert.deepEqual(Array.from(r.v.slice(0,3)),[2,5.099999904632568,4]);
});
test('irregular cadence and repeated zero-time callbacks do not advance the orb',()=>{
  const {record:r}=advance(source,[.1,.3,0,.125,.475,0,0]);
  assert.equal(r.v[7],3);
  for(let i=0;i<10;i++)r.follow(r,0);
  assert.equal(r.v[7],3);
});
test('negative control detects the previous render-count-dependent rotation',()=>{
  // Model the former per-callback rotation fault, not literal historical source: the current shell resets its angle before this callback.
  const rotation = 'rec.v[7] = rec.t * 3;';
  assert.equal(source.split(rotation).length - 1, 1);
  const old=source.replace(rotation, 'rec.v[7] = (rec._booyahRenderCount = (rec._booyahRenderCount || 0) + 1) * 0.05;');
  assert.notEqual(old,source);
  const at30=advance(old,Array(30).fill(1/30)).record.v[7];
  const at120=advance(old,Array(120).fill(1/120)).record.v[7];
  assert.ok(Math.abs(at30-1.5)<1e-5 && Math.abs(at120-6)<1e-5);
});
