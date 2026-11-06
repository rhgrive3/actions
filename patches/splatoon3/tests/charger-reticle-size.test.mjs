// Charger-family charge circle at 60% radius (owner request 2026-11-05).
// Composed-source check: radius, notch / cross-line geometry, unchanged strokes,
// and the lifecycle owners (idle, delay, full, scope) still present. Browser
// rendering is covered by scripts/check-inkwave-reticle-viewport.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { CHARGER_RING } from '../charger-reticle-size-adapter.mjs';

const ROOT = new URL('../../../', import.meta.url);
const read = rel => fs.readFileSync(new URL('inkwave-public/' + rel, ROOT), 'utf8');

test('radius is 60% of the previous ring; notches and cross lines keep their proportions', () => {
  assert.equal(CHARGER_RING.radius / CHARGER_RING.previousRadius, CHARGER_RING.ratio);
  assert.equal(CHARGER_RING.ratio, .6);
  assert.ok(Math.abs(CHARGER_RING.notchInner - 19 * .6) < 1e-9 && Math.abs(CHARGER_RING.notchOuter - 22 * .6) < 1e-9);
  assert.ok(Math.abs(CHARGER_RING.lineStart - 21 * .6) < 1e-9 && Math.abs(CHARGER_RING.lineLength - 10 * .6) < 1e-9);
  assert.ok(Math.abs(CHARGER_RING.downStart - 20 * .6) < 1e-9 && Math.abs(CHARGER_RING.downLength - 7 * .6) < 1e-9);
  assert.ok(Math.abs(CHARGER_RING.lineDrawIn - 6 * .6) < 1e-9);
});

test('composed HUD builds the smaller ring once, with a matching dash length', () => {
  const hud = adaptBuildSource('src/ui/hud.js', read('src/ui/hud.js'));
  assert.equal((hud.match(/const C = 2 \* Math\.PI \* 9;/g) || []).length, 1);
  assert.doesNotMatch(hud, /const C = 2 \* Math\.PI \* 15;/);
  assert.equal((hud.match(/<circle r="9" class="iw-ret__track"\/><circle r="9" class="iw-ret__charge"/g) || []).length, 1);
  assert.match(hud, /<path d="M0 -11\.4 L0 -13\.2"\/><path d="M11\.4 0 L13\.2 0"\/>/);
  // Lifecycle owners untouched: delay, full, idle, reach marks and the arc writer.
  assert.match(hud, /this\.ret\.classList\.toggle\('is-charge-delay', delayed\)/);
  assert.match(hud, /this\.ret\.classList\.toggle\('is-full', full\); if \(full\) this\._restart\(this\.ret, 'is-flash'\)/);
  assert.match(hud, /this\.ret\.classList\.toggle\('is-idle', retIdle\)/);
  assert.match(hud, /this\._chargeEl\.style\.strokeDashoffset = this\._chargeC \* \(1 - c\)/);
});

test('composed CSS keeps stroke widths and scopes the line geometry to the Charger reticle', () => {
  const css = adaptBuildSource('styles/hud.css', read('styles/hud.css'));
  const tail = css.slice(css.lastIndexOf('Charger-family charge circle at 60 % radius'));
  assert.match(tail, /\.iw-ret--charger \.iw-ret__line\.l \{ left: -18\.6px; \}/);
  assert.match(tail, /\.iw-ret--charger \.iw-ret__line\.r \{ left: 12\.6px; \}/);
  assert.match(tail, /\.iw-ret--charger \.iw-ret__line\.d \{ top: 12px; width: 1\.75px; height: 4\.2px; \}/);
  assert.doesNotMatch(tail, /stroke-width/, 'ring, arc and notch strokes keep their original widths');
  assert.match(css, /\.iw-ret--charger \.iw-ret__track \{ stroke-width: 1\.4;/);
  assert.match(css, /\.iw-ret--charger \.iw-ret__charge \{ stroke: var\(--self-light\); stroke-width: 2\.9;/);
  // Other reticles keep the shared cross-line rule.
  assert.match(css, /\n\.iw-ret__line\.l \{ left: -31px; \}/);
});
