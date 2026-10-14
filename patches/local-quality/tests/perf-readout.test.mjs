import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adaptPerfReadout } from '../perf-readout-adapter.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { BUILD_ONLY_PATCH_MODULES } from '../../../scripts/lib/inkwave-build-only-modules.mjs';

const ROOT = new URL('../../../', import.meta.url);
const HUD = fs.readFileSync(new URL('inkwave-public/src/ui/hud.js', ROOT), 'utf8');
const unique = (source, before, after, why) => {
  assert.equal(source.split(before).length - 1, 1, why + ' unique anchor');
  return source.replace(before, after);
};

// Evaluate the adapted _updFps with a minimal HUD receiver under a given URL query.
function fpsText(search, fps, game) {
  const src = adaptPerfReadout('src/ui/hud.js', HUD, unique);
  const start = src.indexOf('  _updFps(fps, dt) {');
  const end = src.indexOf('\n  }\n', start);
  const method = src.slice(start, end + 4).replace('  _updFps(fps, dt) {', 'function _updFps(fps, dt) {');
  const tail = src.slice(src.indexOf('\nconst IW_PERF_READOUT'));
  const el = { textContent: '', style: {}, classList: { toggle() {} } };
  const ctx = vm.createContext({ location: { search }, G: { game } });
  vm.runInContext(tail + '\n' + method + '\nthis._updFps = _updFps;', ctx);
  ctx._updFps.call({ _L: {}, fpsEl: el }, fps, 1);
  return el.textContent;
}

test('perf readout is build-only, composes into the production HUD and compiles', () => {
  assert.equal(BUILD_ONLY_PATCH_MODULES.has('patches/local-quality/perf-readout-adapter.mjs'), true);
  const hud = adaptBuildSource('src/ui/hud.js', HUD);
  assert.match(hud, /iwPerfReadout\(\)/);
  assert.doesNotThrow(() => new vm.SourceTextModule(hud));
  assert.equal(adaptPerfReadout('src/config.js', 'x', unique), 'x');
  assert.throws(() => adaptPerfReadout('src/ui/hud.js', adaptPerfReadout('src/ui/hud.js', HUD, unique), unique));
});

test('without ?perf the counter text is the native one; with ?perf it appends measured cost', () => {
  const game = { fps: 31, perf: { sim: 12.34, render: 4.5, calls: 140 }, R: { dynScale: 0.75 } };
  assert.equal(fpsText('', 58.6, game), '59 FPS');
  assert.equal(fpsText('?x=1', 58.6, game), '59 FPS');
  assert.equal(fpsText('?perfx', 58.6, game), '59 FPS');
  assert.equal(fpsText('', undefined, game), '', 'setting off and no ?perf: counter stays hidden');
  assert.equal(fpsText('?perf', 58.6, game), '59 FPS · CPU 16.8ms (sim 12.3 / draw 4.5) · res 75% · 140 calls');
  assert.equal(fpsText('?a=1&perf', undefined, game), '31 FPS · CPU 16.8ms (sim 12.3 / draw 4.5) · res 75% · 140 calls',
    '?perf shows the counter even with the setting off');
  assert.equal(fpsText('?perf', 60, {}), '60 FPS', 'no measurements yet: plain counter');
});
