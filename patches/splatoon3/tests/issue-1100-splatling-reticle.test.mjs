import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const UPSTREAM = process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public');
const readSource = rel => fs.readFileSync(path.join(UPSTREAM, rel), 'utf8');
const installed = rel => adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, readSource(rel))));

function section(source, start, end) {
  const at = source.indexOf(start), until = source.indexOf(end, at);
  assert.ok(at >= 0 && until > at, `actual method boundary: ${start}`);
  assert.equal(source.indexOf(start, at + start.length), -1, 'unique start');
  return source.slice(at, until);
}

function buildReticle(kind) {
  const method = section(installed('src/ui/hud.js'), '  _buildReticle(kind) {', '\n  _updCrosshair(f, dt) {');
  const Hud = new Function(`return class {${method}\n};`)();
  const hud = new Hud();
  hud._L = {};
  hud.ret = { className: '', innerHTML: '', style: { setProperty() {} }, querySelector: () => null };
  hud._buildReticle(kind);
  return hud.ret;
}

const html = kind => buildReticle(kind).innerHTML;
const count = (haystack, needle) => haystack.split(needle).length - 1;

test('#1100 Heavy Splatling reticle has 4 outer corner ticks (45°, 135°, 225°, 315°)', () => {
  const splatling = html('splatling');

  // Verify exactly 4 outer ticks
  assert.equal(count(splatling, 'iw-ret__tick'), 4, 'Heavy Splatling reticle must have 4 ticks');

  // Verify each corner angle
  assert.match(splatling, /style="--a:45deg"/, 'top-right corner tick at 45deg');
  assert.match(splatling, /style="--a:135deg"/, 'bottom-right corner tick at 135deg');
  assert.match(splatling, /style="--a:225deg"/, 'bottom-left corner tick at 225deg');
  assert.match(splatling, /style="--a:315deg"/, 'top-left corner tick at 315deg');

  // Charge track and segments remain intact
  assert.match(splatling, /class="iw-ret__track"/, 'charge track ring present');
  assert.match(splatling, /class="iw-ret__charge"/, 'charge gauge ring present');
  assert.match(splatling, /class="iw-ret__segs"/, 'charge 8-segment display present');
});

test('#1100 Splatling reticle drives spread envelope via --sp property', () => {
  const hudSrc = installed('src/ui/hud.js');
  const upd = section(hudSrc, '  _updCrosshair(f, dt) {', '\n  _updTank(f, dt) {');

  // Verify splatling is part of the spread-updating weapons in _updCrosshair
  assert.match(upd, /L\.kind === 'splatling'/, 'splatling included in crosshair spread calculation');
  assert.match(upd, /this\.ret\.style\.setProperty\('--sp'/, 'updates --sp CSS variable for accuracy envelope');
});

const bracketCss = () => {
  const css = installed('styles/hud.css');
  const base = css.match(/\.iw-ret--splatling \.iw-ret__tick \{\n\s*--iw-x: calc\((\d+)px \+ var\(--sp, 0\) \* ([\d.]+)px\); --iw-y: calc\((\d+)px \+ var\(--sp, 0\) \* ([\d.]+)px\);/);
  return { css, base };
};

test('#1100 Splatling outer brackets are axis-aligned corners, not spread-rotated ticks', () => {
  const { css, base } = bracketCss();
  assert.ok(base, 'corner bracket base rule with spread-driven outer corner');
  const rules = css.split('}').filter(r => r.includes('.iw-ret--splatling .iw-ret__tick'));
  assert.doesNotMatch(rules.join('}'), /rotate\(var\(--a\)\)/, 'corner brackets are not rotated by the spread angle');
  // each corner keeps an L of two sides that faces outward along its own diagonal
  const corners = {
    '315deg': 'border-top-width: 2px; border-left-width: 2px',
    '45deg': 'border-top-width: 2px; border-right-width: 2px',
    '135deg': 'border-bottom-width: 2px; border-right-width: 2px',
    '225deg': 'border-bottom-width: 2px; border-left-width: 2px',
  };
  for (const [a, sides] of Object.entries(corners)) {
    assert.ok(css.includes(`.iw-ret--splatling .iw-ret__tick[style*="--a:${a}"]`), `corner rule for ${a}`);
    assert.ok(css.includes(sides), `two-sided L for ${a}`);
  }
});

test('#1100 Splatling outer corners clear the charge ring at rest and under spread', () => {
  const { base } = bracketCss();
  const [X0, kx, Y0, ky] = base.slice(1).map(Number);
  const arm = 20, ringReach = 25 + 1; // charge track r=21 plus spin-up segments to r=25
  const nearest = sp => {
    const X = X0 + kx * sp, Y = Y0 + ky * sp;
    // inside arms run from the outer corner inward by `arm`; nearest points are the inner ends
    return Math.min(Math.hypot(X - arm, Y), Math.hypot(X, Y - arm));
  };
  for (const sp of [0, 30, 90]) assert.ok(nearest(sp) > ringReach, `clears ring at sp=${sp}`);
  assert.ok(nearest(90) > nearest(0), 'corners move outward as spread grows');
});

test('#1100 Splatling corner geometry is derived from the recorded S3 capture', () => {
  const { base } = bracketCss();
  const ref = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/reference/splatling-reticle-reference.json'), 'utf8'));
  const s = ref.derivation.scaleInkwavePerReferencePx;
  const outerX = Math.round(s * (-ref.frameOuterExtentPx.left + ref.frameOuterExtentPx.right) / 2);
  const outerY = Math.round(s * (-ref.frameOuterExtentPx.top + ref.frameOuterExtentPx.bottom) / 2);
  assert.equal(Number(base[1]), outerX, 'outer x matches reference extent');
  assert.equal(Number(base[3]), outerY, 'outer y matches reference extent');
  assert.equal(s * ref.ringComponent.outerRadiusPx, ref.derivation.ringTrackRadiusInkwavePx, 'ring scale matches track radius');
  assert.ok(ref.unverified.length >= 3, 'unverified items remain recorded');
});
