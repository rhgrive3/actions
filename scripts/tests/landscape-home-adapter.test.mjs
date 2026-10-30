import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptLandscapeHome } from '../../patches/local-quality/landscape-home-adapter.mjs';

test('home geometry is a build-time UI-only append, not an input mutation', () => {
  const source = fs.readFileSync(new URL('../../inkwave-public/styles/ui.css', import.meta.url), 'utf8');
  const next = adaptLandscapeHome('styles/ui.css', source);
  assert(next.startsWith(source));
  assert.equal(adaptLandscapeHome('styles/mobile.css', source), source);
  assert.equal(adaptLandscapeHome('src/ui/menus.js', source), source);
  assert.throws(() => adaptLandscapeHome('styles/ui.css', next), /repeated CSS/);
});

test('every added selector is touch-scoped and inside short-landscape media gates', () => {
  const css = adaptLandscapeHome('styles/ui.css', '');
  assert.equal((css.match(/@media /g) || []).length, 3);
  for (const line of css.split('\n').filter(line => line.includes('@media '))) {
    assert.match(line, /orientation: landscape/);
    assert.match(line, /max-height: 500px/);
  }
  for (const line of css.split('\n').filter(line => line.trimStart().startsWith(':is('))) {
    assert.match(line, /:is\(html\.iw-touch \.iw-ui, \.iw-ui\.is-touch\) \.iw-main\.iw-main/);
  }
  assert(!css.includes('!important'));
  assert(!css.includes('display: none'));
  assert(!css.includes('@keyframes'));
  assert(!css.includes('background:'));
  assert.match(css, /min-height: 48px/);
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});
