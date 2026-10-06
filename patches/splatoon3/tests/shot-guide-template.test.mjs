import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adaptSource } from '../adapter.mjs';

const adapterUrl = new URL('../adapter.mjs', import.meta.url);
const rawHud = fs.readFileSync(new URL('../../../inkwave-public/src/ui/hud.js', import.meta.url), 'utf8');
const rel = 'src/ui/hud.js';

// Recreate only the merge regression in the complete real adapter. Absolute
// import URLs and its original import.meta.url keep all real dependencies.
async function brokenAdapter() {
  let source = fs.readFileSync(adapterUrl, 'utf8');
  for (const name of ['guideX', 'guideY']) {
    const expression = String.fromCharCode(36) + '{' + name + '.toFixed(1)}';
    source = source.replaceAll('\\' + expression, expression);
  }
  source = source.replace(/^import\s+(.+?)\s+from\s+(['"])(\.[^'"]+)\2;/gm,
    (_line, bindings, _quote, spec) => 'import ' + bindings + ' from ' + JSON.stringify(new URL(spec, adapterUrl).href) + ';');
  source = source.replaceAll('import.meta.url', JSON.stringify(adapterUrl.href));
  return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
}

test('old unescaped ShotGuide template fails during actual HUD adaptation', async () => {
  const broken = await brokenAdapter();
  assert.throws(() => broken.adaptSource(rel, rawHud), { name: 'ReferenceError', message: /guideX/ });
});

test('corrected HUD parses and retains runtime projection interpolation and cache', () => {
  const source = adaptSource(rel, rawHud);
  assert.doesNotThrow(() => new vm.SourceTextModule(source));
  const start = source.indexOf('    // S3 weapon ShotGuide projection:');
  const end = source.indexOf('    // per-shot kick (recoil events)', start);
  assert.ok(start >= 0 && end > start);
  // Execute the generated native HUD fragment, not a copied projection formula.
  const update = new Function('G', 'L', 'innerWidth', 'innerHeight', source.slice(start, end));
  for (const kind of ['slosher', 'blaster']) {
    const calls = [], actor = { weapon: { kind } }, cam = {};
    const hud = { _local: () => actor, _project: () => ({ x: .25, y: -.5, z: 0 }),
      xh: { style: { setProperty: (...args) => calls.push(args) } } };
    const G = { camera: cam, projectiles: { s3WeaponGuide: () => ({ x: 1, y: 2, z: 3 }) } };
    const L = { kind };
    update.call(hud, G, L, 1280, 720);
    assert.equal(L.guide, '160.0|180.0');
    assert.deepEqual(calls, [['--gx', '160.0px'], ['--gy', '180.0px']]);
    update.call(hud, G, L, 1280, 720);
    assert.equal(calls.length, 2, 'unchanged projection does not rewrite style');
    L.kind = 'shooter';
    update.call(hud, G, L, 1280, 720);
    assert.equal(L.guide, '0.0|0.0');
  }
});
