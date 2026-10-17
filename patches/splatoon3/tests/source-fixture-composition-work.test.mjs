import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
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
    path, modules, context: {}, pathToFileURL,
    fs: { readFileSync(file, encoding) { reads.push([file, encoding]); return 'raw'; } },
    adaptNative: native,
    adaptConstrainedSource: custom ? () => { throw Error('unused default adapter'); } : native,
    adaptProduction(rel, raw) { calls.push(['production', rel]); return `production(${raw})`; },
    adaptRuntime(rel, raw) { calls.push(['runtime', rel]); return `runtime(${raw})`; },
    vm: { SourceTextModule: class {
      constructor(source, options) { this.source = source; this.options = options; }
    } },
  };
  const context = vm.createContext(globals);
  vm.runInContext(`${loader}\nglobalThis.loadTest = load;`, context);
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
