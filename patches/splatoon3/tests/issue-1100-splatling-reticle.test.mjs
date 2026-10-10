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
