import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initialize, resolve } from './prop-retention-loader.mjs';

const source = new URL('../../../inkwave-public/', import.meta.url);
const patches = new URL('../../../patches/', import.meta.url);
initialize({ sourceRoot: fileURLToPath(source) });
const next = (specifier, context) => ({ specifier, context });

test('PropKit loader bridges only the authored source/build namespaces and delegates resolution', () => {
  const sourceContext = { parentURL: new URL('src/world/stages/index.js', source).href };
  const stage = resolve('../../../patches/practice-range/stage/layout.mjs', sourceContext, next);
  assert.equal(stage.specifier, new URL('practice-range/stage/layout.mjs', patches).href);
  assert.equal(stage.context, sourceContext);
  const patchContext = { parentURL: new URL('practice-range/stage/layout.mjs', patches).href };
  const mapkit = resolve('../../../src/world/mapkit.js', patchContext, next);
  assert.equal(mapkit.specifier, new URL('src/world/mapkit.js', source).href);
  assert.equal(mapkit.context, patchContext);
  fs.accessSync(fileURLToPath(stage.specifier));
  fs.accessSync(fileURLToPath(mapkit.specifier));
  for (const specifier of ['./cargo/layout.js', '../../../patches-other/no.mjs', 'unrelated-package']) {
    assert.equal(resolve(specifier, sourceContext, next).specifier, specifier);
  }
  const otherContext = { parentURL: new URL('../../../other/file.mjs', import.meta.url).href };
  assert.equal(resolve('../src/world/mapkit.js', otherContext, next).specifier, '../src/world/mapkit.js');
});

test('PropKit source namespace bridge never accepts a missing module', () => {
  const sourceContext = { parentURL: new URL('src/world/stages/index.js', source).href };
  let delegated = 0;
  assert.throws(() => resolve('../../../patches/practice-range/stage/__missing_prop_loader_control__.mjs', sourceContext,
    (specifier) => { delegated++; fs.accessSync(fileURLToPath(specifier)); }), { code: 'ENOENT' });
  assert.equal(delegated, 1);
});
