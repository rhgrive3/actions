import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {configDependency} from './config-fixture.mjs';

async function fixture() {
  const root = process.env.INKWAVE_UPSTREAM_SOURCE || new URL('../../../inkwave-public/', import.meta.url);
  const read = rel => fs.readFileSync(root instanceof URL ? new URL(rel, root) : path.join(root, rel), 'utf8');
  const context = vm.createContext({console, Math, clearTimeout});
  const synthetic = values => new vm.SyntheticModule(Object.keys(values), function () {
    for (const [key, value] of Object.entries(values)) this.setExport(key, value);
  }, {context});
  const config = new vm.SourceTextModule(read('src/config.js'), {context});
  await config.link(spec => configDependency(spec, context)); await config.evaluate();
  const ctx = new vm.SourceTextModule(adaptBuildSource('src/core/ctx.js', read('src/core/ctx.js')), {context});
  await ctx.link(() => synthetic(THREE)); await ctx.evaluate();
  const {G, emit} = ctx.namespace; G.settings = {quality: 'low'};
  const mod = new vm.SourceTextModule(adaptBuildSource('src/fx/screenfx.js', read('src/fx/screenfx.js')), {context});
  await mod.link(spec => spec === 'three' ? synthetic(THREE) : spec.includes('ShaderPass')
    ? synthetic({ShaderPass: class { constructor(material) { this.material = material; } }})
    : spec.endsWith('ctx.js') ? ctx : config);
  await mod.evaluate();
  const fx = new mod.namespace.ScreenFX({renderer: {}, setExtraPass() {}}, G);
  return {fx, emit};
}

test('hidden-menu match retirement releases only its cached local Actor, without updating or resetting FX', async () => {
  const {fx, emit} = await fixture(), local = {}, other = {};
  fx._local = local;
  fx.s.chroma = .73; fx.s.satPop = .41;
  const state = JSON.stringify(fx.s), lens = fx.lens, parts = fx.lens.parts;
  fx.update = () => { throw Error('hidden-world update must not be required'); };
  fx.reset = () => { throw Error('retirement must not reset visual state'); };
  emit('match:dispose', {match: {actors: [other]}});
  assert.equal(fx._local, local, 'unrelated roster cannot erase the current local');
  emit('match:dispose', {});
  assert.equal(fx._local, local);
  const retired = {actors: [local]}; emit('match:dispose', {match: retired});
  assert.equal(fx._local, null);
  emit('match:dispose', {match: retired}); assert.equal(fx._local, null);
  fx._local = other; emit('match:dispose', {match: retired});
  assert.equal(fx._local, other, 'late old-roster notification preserves the newer Actor');
  assert.equal(JSON.stringify(fx.s), state); assert.equal(fx.lens, lens); assert.equal(fx.lens.parts, parts);
});
