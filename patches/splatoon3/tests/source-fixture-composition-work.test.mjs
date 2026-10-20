import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { memoizeFixtureSourceAdapter, memoizeFixtureVmCompiler } from './fixture-cache.mjs';
import { pathToFileURL } from 'node:url';

// Exercise the real loader without booting gameplay or replacing its branches.
// Synthetic modules expose source selection, adapter side effects and caching.
const source = fs.readFileSync(new URL('./source-fixture.mjs', import.meta.url), 'utf8');
const start = source.indexOf('  function load(file) {');
const end = source.indexOf('\n  const characterExports', start);
assert.ok(start >= 0 && end > start, 'fixture loader boundaries remain explicit');
const loader = source.slice(start, end);

function exercise({ built, upstream, production, custom }) {
  const ROOT = path.resolve('fixture-test-root');
  const UPSTREAM = path.join(ROOT, 'inkwave-public');
  const file = upstream ? path.join(UPSTREAM, 'src/actor.js') : path.join(ROOT, 'patches/model.mjs');
  const identifier = built && !upstream ? path.join(UPSTREAM, 'patches/model.mjs') : file;
  // Built runtime files are redirected under UPSTREAM before adapter selection.
  const resolvedUpstream = upstream || built;
  const relative = path.relative(resolvedUpstream ? UPSTREAM : ROOT, identifier);
  const calls = [], reads = [], modules = new Map();
  const native = (rel, raw) => { calls.push(['native', rel]); return `native(${raw})`; };
  const globals = {
    ROOT, UPSTREAM, BUILT: built, productionComposition: production,
    generation: null,
    path, modules, context: {}, pathToFileURL,
    fs: { readFileSync(file, encoding) { reads.push([file, encoding]); return 'raw'; } },
    adaptNative: native,
    adaptConstrainedSource: custom ? () => { throw Error('unused default adapter'); } : native,
    adaptProduction(rel, raw) { calls.push(['production', rel]); return `production(${raw})`; },
    adaptRuntime(rel, raw) { calls.push(['runtime', rel]); return `runtime(${raw})`; },
    cachedVmModule(source, options) { return { source, options }; },
    vm: { SourceTextModule: class {
      constructor(source, options) { this.source = source; this.options = options; }
    } },
  };
  const context = vm.createContext(globals);
  vm.runInContext(`const generation = null;\n${loader}\nglobalThis.loadTest = load;`, context);
  const first = context.loadTest(file);
  assert.equal(context.loadTest(file), first, 'module identity is cached');
  assert.deepEqual(reads, [[identifier, 'utf8']], 'cached load does not reread source');
  assert.equal(first.options.identifier, identifier);
  assert.equal(first.options.context, globals.context);
  const meta = {};
  first.options.initializeImportMeta(meta);
  assert.equal(meta.url, pathToFileURL(identifier).href);

  let expectedSource, expectedCalls;
  if (built) { expectedSource = 'raw'; expectedCalls = []; }
  else if (!upstream) { expectedSource = 'runtime(raw)'; expectedCalls = [['runtime', relative]]; }
  else if (!production) { expectedSource = 'native(raw)'; expectedCalls = [['native', relative]]; }
  else {
    expectedSource = 'production(raw)';
    expectedCalls = custom ? [['native', relative], ['production', relative]] : [['production', relative]];
  }
  assert.equal(first.source, expectedSource, 'production always receives raw source');
  assert.deepEqual(calls, expectedCalls, 'custom callbacks retain side effects; only default discarded work is skipped');
}

for (const built of [false, true]) {
  for (const upstream of [false, true]) {
    for (const production of [false, true]) {
      for (const custom of [false, true]) {
        const options = { built, upstream, production, custom };
        test(`fixture loader ${JSON.stringify(options)}`, () => exercise(options));
      }
    }
  }
}

test('source transform cache compares complete input bytes, not only paths', () => {
  let calls = 0;
  const adapt = memoizeFixtureSourceAdapter((rel, code) => {
    calls++;
    if (code === 'corrupt') throw Error('adapter still rejects source drift');
    return rel + ':' + code;
  }, 70);
  assert.equal(adapt('src/game.js', 'const a=1'), 'src/game.js:const a=1');
  assert.equal(adapt('src/game.js', 'const a=1'), 'src/game.js:const a=1');
  assert.equal(calls, 1, 'identical bytes reuse adapter output');
  assert.equal(adapt('src/game.js', 'const a=2'), 'src/game.js:const a=2');
  assert.equal(calls, 2, 'any source edit reruns the real adapter');
  assert.throws(() => adapt('src/game.js', 'corrupt'), /source drift/);
  assert.throws(() => adapt('src/game.js', 'corrupt'), /source drift/);
  assert.equal(calls, 4, 'exceptions are never cached as passing results');
});

test('no-VM-flag CLI imports can validate arguments before creating a fixture', () => {
  const compile = memoizeFixtureVmCompiler(undefined);
  assert.equal(typeof compile, 'function');
  assert.throws(() => compile('export const x=1;', {identifier:'x.mjs'}), /SourceTextModule constructor required/);
});

test('fresh VM contexts execute correct bytecode after source edits', {skip: !vm.SourceTextModule}, async () => {
  const compile = memoizeFixtureVmCompiler(vm.SourceTextModule);
  const id = 'test-compiled-realm-isolation.mjs';
  for (const [source, state, expected] of [
    ['export const value = globalThis.seed + 1;', 20, 21],
    ['export const value = globalThis.seed + 1;', 30, 31],
    ['export const value = globalThis.seed + 2;', 40, 42],
    ['export const value = globalThis.seed + 2;', 50, 52],
    ['export const value = globalThis.seed + 1;', 60, 61],
  ]) {
    const mod = compile(source, {identifier: id, context: vm.createContext({seed: state})});
    await mod.link(() => { throw Error('unexpected import'); });
    await mod.evaluate();
    assert.equal(mod.namespace.value, expected, 'no VM state or old source is retained');
  }
  assert.throws(() => compile('export const = 1', {identifier: id, context: vm.createContext({seed: 1})}), /Unexpected token/);
  const mod = compile('export const value = 123;', {identifier: id, context: vm.createContext({seed: 1})});
  await mod.link(() => { throw Error('unexpected import'); });
  await mod.evaluate();
  assert.equal(mod.namespace.value, 123, 'syntax failure cannot poison the cache');
});

test('cached import linking uses the current realm, never a previous dependency', {skip: !vm.SourceTextModule}, async () => {
  const compile = memoizeFixtureVmCompiler(vm.SourceTextModule);
  for (const offset of [3, 9]) {
    const context = vm.createContext({});
    const parent = compile("import { n } from './dependency.mjs'; export const result = n * 2;", {context, identifier:'parent.mjs'});
    const dependency = new vm.SourceTextModule('export const n = ' + offset, {context, identifier:'dependency.mjs'});
    await parent.link(spec => {
      assert.equal(spec, './dependency.mjs');
      return dependency;
    });
    await parent.evaluate();
    assert.equal(parent.namespace.result, offset * 2);
  }
});
