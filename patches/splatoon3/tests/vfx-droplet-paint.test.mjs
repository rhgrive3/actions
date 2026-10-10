import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

// Splatoon 3 turf comes from the weapon/blast paint its source tables define.
// Landing VFX droplets must not create turf (upstream did so offline only) nor
// leave paint-like specks that are not turf.
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const composed = rel => adaptBuildSource(rel, fs.readFileSync(path.join(ROOT, 'inkwave-public', rel), 'utf8'));

test('upstream still has the offline droplet-to-turf hook this patch removes', () => {
  const main = fs.readFileSync(path.join(ROOT, 'inkwave-public/src/main.js'), 'utf8');
  assert.match(main, /G\.fx\.onDropletLand = \(point, normal, color, size\) => \{[\s\S]*?G\.paint\.splat\(/);
});

test('production composition: VFX droplet landings never reach PaintSystem.splat', () => {
  const main = composed('src/main.js');
  const hook = main.match(/G\.fx\.onDropletLand = ([^\n]*)/);
  assert.ok(hook, 'hook still installed so FX skips its fallback');
  const fn = hook[1].split(';')[0].trim();
  assert.equal(fn, '() => {}');
  assert.equal(new Function(`return ${fn}`)()(), undefined);
});

test('production composition: VFX droplets leave no paint-like speck', () => {
  const hooks = composed('src/fx/fxHooks.js');
  const hook = hooks.match(/G\.fx\.onSpeck = ([^\n]*)/);
  assert.ok(hook, 'a no-op keeps FX from drawing its fallback disc decal');
  assert.equal(hook[1].split(';')[0].trim(), '() => {}');
  assert.doesNotMatch(hooks, /P\.speck\(/);
});
