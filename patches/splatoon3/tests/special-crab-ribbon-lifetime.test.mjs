import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

const root = new URL('../../../', import.meta.url);
const runtime = new URL('../runtime/', import.meta.url);
const original = fs.readFileSync(new URL('special-vfx.mjs', runtime), 'utf8');
const kitSource = fs.readFileSync(new URL('special-vfx-kit.mjs', runtime), 'utf8');
const hook = 'end(a, t) { this.kit.ribbons.end(t.d.rollRib); },';

async function load(mode, negative = false) {
  let source = negative ? original.replace(hook, '') : original;
  let kit = kitSource;
  if (mode === 'transformed') {
    const { adaptBuildSource } = await import(new URL('scripts/inkwave-source-composition.mjs', root));
    source = adaptBuildSource('patches/splatoon3/runtime/special-vfx.mjs', source);
    kit = adaptBuildSource('patches/splatoon3/runtime/special-vfx-kit.mjs', kit);
  }
  source += '\nexport { Director, DIRECTORS };';
  kit += '\nexport { RibbonPool };';
  if (mode === 'transformed') {
    const { transform } = await import(process.env.ESBUILD_MODULE ? pathToFileURL(process.env.ESBUILD_MODULE) : 'esbuild');
    const options = { loader: 'js', format: 'esm', minify: true, charset: 'utf8', legalComments: 'inline' };
    source = (await transform(source, options)).code;
    kit = (await transform(kit, options)).code;
  }
  const context = vm.createContext({ console });
  const k = new vm.SourceTextModule(kit, { context });
  await k.link(() => { throw Error('Unexpected kit dependency'); }); await k.evaluate();
  const m = new vm.SourceTextModule(source, { context });
  // Unused gameplay dependencies are stubs; Director track/end and RibbonPool
  // lifecycle code below are real source. No renderer or visual claim.
  const imports = new Map([...original.matchAll(/import\s*\{([^}]+)\}\s*from\s*'([^']+)'/g)]
    .map(x => [x[2], x[1].split(',').map(n => n.trim())]));
  await m.link(spec => {
    if (spec === './special-vfx-kit.mjs') return k;
    const names = imports.get(spec);
    assert.ok(names, `Unexpected dependency ${spec}`);
    return new vm.SyntheticModule(names, function () {
      for (const name of names) this.setExport(name, name === 'WAIL_SPEAKER_POSITIONS' ? [] : () => undefined);
    }, { context });
  });
  await m.evaluate(); return { ...m.namespace, RibbonPool: k.namespace.RibbonPool };
}
function fixture(api) {
  const pool = Object.create(api.RibbonPool.prototype);
  Object.assign(pool, { list: [], T: 40, M: 48, _t: {}, _s: {}, _c: {} });
  for (const key of ['pos', 'col', 'rib', 'side', 'face']) pool[key] = {
    array: new Float32Array(1024), itemSize: key === 'col' || key === 'rib' ? 4 : 3,
    clearUpdateRanges() {}, addUpdateRange() {},
  };
  pool.mesh = { geometry: { setDrawRange() {} } };
  const d = Object.create(api.Director.prototype);
  d.kit = { ribbons: pool, glowRibbons: { end() {} } }; d.tracks = new Map(); d.errors = 0;
  const actor = { alive: true, specialActive: { id: 'crabTank', pose: 'ball' } };
  const ribbon = { pts: [[0, 0, 0, 0], [1, 0, 0, 0]], ended: false, o: { life: .5 } };
  pool.list.push(ribbon); const track = { id: 'crabTank', d: { rollRib: ribbon } }; d.tracks.set(actor, track);
  return { d, actor, track, ribbon, pool };
}
for (const mode of ['source', 'transformed']) {
  test(`${mode}: terminal Crab wake cleanup and negative control`, async () => {
    const api = await load(mode);
    for (const reason of ['normal finish', 'death', 'super jump', 'actor removal']) {
      const f = fixture(api);
      if (reason === 'normal finish') f.actor.specialActive = null;
      if (reason === 'death') f.actor.alive = false;
      if (reason === 'super jump') f.actor.superJumpState = {};
      if (reason === 'actor removal') f.d.endTrack(f.actor, f.track);
      else f.d.track(f.actor);
      assert.equal(f.ribbon.ended, true, reason);
      assert.equal(f.ribbon.pts.length, 2, 'existing trail is not erased abruptly');
      f.pool.update(1, {}); assert.equal(f.pool.list.length, 0, reason);
      f.d.endTrack(f.actor, f.track); // idempotent
    }
    const f = fixture(api);
    f.pool.update(1, {}); assert.equal(f.pool.list.length, 1, 'ongoing trail remains registered');
    assert.equal(f.ribbon.ended, false);
    f.d.endTrack(f.actor, { id: 'crabTank', d: {} }); // never entered ball
    const old = fixture(await load(mode, true));
    old.d.endTrack(old.actor, old.track); old.pool.update(1, {});
    assert.equal(old.ribbon.ended, false); assert.equal(old.pool.list.length, 1);
    assert.equal(old.ribbon.pts.length, 0, 'negative control reproduces stranded empty trail');
  });
}
