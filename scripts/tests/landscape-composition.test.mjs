import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { adaptBuildSource } from '../inkwave-source-composition.mjs';
import { BUILD_ONLY_PATCH_MODULES } from '../lib/inkwave-build-only-modules.mjs';
import { qualityIdentity } from '../../patches/local-quality/adapter.mjs';
import { adaptLandscapeHome } from '../../patches/local-quality/landscape-home-adapter.mjs';
import { adaptLandscapeWeapons } from '../../patches/local-quality/landscape-weapons-adapter.mjs';
import { adaptLandscapeOnline } from '../../patches/local-quality/landscape-online-adapter.mjs';
import { adaptLandscapeSettings } from '../../patches/local-quality/landscape-settings-adapter.mjs';

const root = new URL('../../', import.meta.url);
const read = rel => fs.readFileSync(new URL(rel, root), 'utf8');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

test('short-landscape fixes preserve the reviewed immutable upstream input bytes', () => {
  const pinned = {
    'inkwave-public/src/ui/menus.js': '9b8c5f5adeec0e94ab64fb4eb2d802526bebdb2059547130bd0713e387ab2a1e',
    'inkwave-public/styles/ui.css': 'dc3959f4efe8154ca3ff64b8813f9bec1ded4acf97e83c93a088c20c74307087',
    'inkwave-public/styles/mobile.css': '4d3195aff695ebb40cc0deca01c947e713d16675276fc20c93013619dd74d724',
  };
  for (const [file, expected] of Object.entries(pinned)) assert.equal(hash(read(file)), expected, file);
});

test('all four fixes are build-only and participate in exact-source quality identity', () => {
  const identity = qualityIdentity();
  for (const name of ['home', 'weapons', 'online', 'settings']) {
    const file = `landscape-${name}-adapter.mjs`;
    assert(BUILD_ONLY_PATCH_MODULES.has('patches/local-quality/' + file), file);
    assert.equal(identity[file], hash(read('patches/local-quality/' + file)), file);
  }
});

test('the production composition emits each scoped style fix once without runtime adapter imports', () => {
  const ui = adaptBuildSource('styles/ui.css', read('inkwave-public/styles/ui.css'));
  const mobile = adaptBuildSource('styles/mobile.css', read('inkwave-public/styles/mobile.css'));
  const menus = adaptBuildSource('src/ui/menus.js', read('inkwave-public/src/ui/menus.js'));
  for (const marker of [
    'Short landscape weapon catalogue: readable names, not clipped rows.',
    'Short-landscape settings: controls before decorative preview.',
  ]) assert.equal((ui + mobile).split(marker).length - 1, 1, marker);
  assert.equal(menus.split("'aria-label': w.name").length - 1, 1);
  assert.equal(menus.split('const syncTabSelection =').length - 1, 1);
  assert(!/from\s*['"][^'"]*landscape-(?:home|weapons|online|settings)-adapter/.test(menus));
});

test('every new adapter leaves non-menu and gameplay owners unchanged', () => {
  for (const adapt of [adaptLandscapeHome, adaptLandscapeWeapons, adaptLandscapeOnline, adaptLandscapeSettings]) {
    for (const rel of ['src/main.js', 'src/game/weapons.js', 'src/net/session.js', 'styles/hud.css']) {
      assert.equal(adapt(rel, 'unrelated source sentinel'), 'unrelated source sentinel', rel);
    }
  }
});
