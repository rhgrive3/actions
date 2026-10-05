import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

test('responsive menu fixture installs the published runtime before constructing native Menus', () => {
  // Fixture-generation contract only; real DOM/storage remains a browser gate.
  const source = fs.readFileSync(new URL('../check-inkwave-responsive.mjs', import.meta.url), 'utf8');
  const installer = source.match(/const runtimeInstaller = patchStyles \? `([\s\S]*?)` : '';/)?.[1];
  const module = source.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(installer && module, 'published-runtime fixture fragments must exist');
  assert.match(installer, /import \{ install \} from '\/patches\/splatoon3\/runtime\/install\.mjs'/);
  const composed = module.replace('${runtimeInstaller}', installer);
  assert.ok(composed.indexOf('install(tuning);') < composed.indexOf('new Menus('));
  assert.match(source, /type="importmap"/);
  assert.match(source, /\.\.\.runtimeFiles/);
  assert.match(source, /Missing installed UI input/);
  const parsed = spawnSync(process.execPath, ['--check', '--input-type=module'], { input: composed, encoding: 'utf8' });
  assert.equal(parsed.status, 0, parsed.stderr);
  const core = fs.readFileSync(new URL('../check-inkwave-responsive-core.mjs', import.meta.url), 'utf8');
  const cleanup = core.slice(core.indexOf("selectOption('none')"), core.indexOf("const card = page.locator('.iw-loadout .iw-wcard')"));
  assert.match(cleanup, /await tap\(page, '\.s3-gear summary'\)/);
  assert.match(cleanup, /gear panel closes before returning to weapon selection/);
  assert.doesNotMatch(cleanup, /force\s*:\s*true/);
});