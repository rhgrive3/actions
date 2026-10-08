// Issue #871: the standard Shooter's outer spread guide must render as the four
// corners of a rectangle (Splatoon 3 Ver. 11.3.0 system reference), not the four
// cardinal tick pills the upstream default branch draws. The fix lives entirely
// in the build-only patch chain (upstream inkwave-public/ stays byte-identical),
// so the test runs the *installed* code path — the same full production adapter
// composition scripts/build-inkwave.mjs applies — and then executes the actual
// shipped `_buildReticle` method. Exact Nintendo pixel dimensions are
// deliberately not asserted: the issue keeps them unknown until measured from
// reference material, and this fix only reuses the existing tick envelope.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';
import { adaptNetworkSource } from '../../network-replication/adapter.mjs';
import { adaptRange } from '../../practice-range/adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const UPSTREAM = process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public');
const readSource = rel => fs.readFileSync(path.join(UPSTREAM, rel), 'utf8');
// The installed source exactly as scripts/build-inkwave.mjs composes it
// (adaptSource -> touch -> reliability -> quality -> network -> range).
const installed = rel => adaptRange(rel, adaptNetworkSource(rel, adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, readSource(rel)))))));
const composedHud = installed('src/ui/hud.js');
const style = fs.readFileSync(new URL('../ui.css', import.meta.url), 'utf8');

function section(source, start, end) {
  const at = source.indexOf(start), until = source.indexOf(end, at);
  assert.ok(at >= 0 && until > at, `actual method boundary: ${start}`);
  assert.equal(source.indexOf(start, at + start.length), -1, 'unique start');
  return source.slice(at, until);
}

// Instantiate the shipped Hud method with a minimal reticle stub (fixture
// pattern: only display plumbing is stubbed, the method body is the real one).
// The stub element must support remove()/insertAdjacentHTML() because the
// composed Splatling branch rewrites its charge meter through the DOM.
const stubEl = () => ({ remove() {}, insertAdjacentHTML() {}, style: { setProperty() {} }, dataset: {}, classList: { toggle() {} } });
function buildReticle(kind) {
  const method = section(composedHud, '  _buildReticle(kind) {', '\n  _updCrosshair(f, dt) {');
  const Hud = new Function(`return class {${method}\n};`)();
  const hud = new Hud();
  hud._L = {};
  hud.ret = { className: '', innerHTML: '', style: { setProperty() {} }, querySelector: () => stubEl() };
  hud._buildReticle(kind);
  return hud.ret.innerHTML;
}

const count = (haystack, needle) => haystack.split(needle).length - 1;

test('#871 Shooter renders four corner outer markers, not cardinal ticks', () => {
  const shooter = buildReticle('shooter');
  assert.equal(count(shooter, 'iw-ret__corner '), 4, 'four corner markers');
  assert.deepEqual([...shooter.matchAll(/class="iw-ret__corner (nw|ne|sw|se)"/g)].map(m => m[1]),
    ['nw', 'ne', 'sw', 'se'], 'one corner per rectangle quadrant');
  assert.equal(count(shooter, 'iw-ret__tick'), 0, 'no cardinal tick bars remain for Shooter');
  // Center/inner aim feedback stays the shipped structure.
  assert.match(shooter, /<i class="iw-ret__dot"><\/i>/);
  assert.match(shooter, /<circle r="15" class="iw-ret__ring thin"\/>/);
  // The non-Shooter fallback branch keeps its original cardinal geometry.
  assert.equal(count(buildReticle('unknown-kind-probe'), 'iw-ret__tick'), 4,
    'unknown kinds still fall through to the legacy tick reticle');
});

test('#871 spread expands and contracts the corner envelope symmetrically from the same --sp state', () => {
  // The authoritative spread writer is untouched: one source of truth for the
  // corner width and every other accuracy consumer.
  assert.match(composedHud, /this\.ret\.style\.setProperty\('--sp', sp\.toFixed\(1\)\)/);
  const box = style.match(/\.iw-ret--shooter \.iw-ret__corners\s*\{([^}]+)\}/s)?.[1] || '';
  assert.ok(box, 'the scoped corner box rule exists');
  // Rest envelope reuses the former ticks' bounds (17px offset + half pill);
  // only horizontal width follows --sp, symmetric about the aim point.
  assert.match(box, /width:\s*calc\(45px \+ var\(--sp, 0\) \* 2px\)/);
  assert.match(box, /height:\s*45px/);
  assert.match(box, /translate:\s*-50% -50%/);
  assert.match(box, /transition:\s*width \.06s linear, height \.06s linear/,
    'cadence keeps the former tick transition');
  // Corner arms keep the former pill draw dimensions (no new pixel constants).
  assert.match(style, /\.iw-ret--shooter \.iw-ret__corner\s*\{\s*position: absolute; width: 11px; height: 11px;/);
  assert.match(style, /\.iw-ret--shooter \.iw-ret__corner::before\s*\{[^}]*width: 11px; height: 3px;/);
  // Each corner mirrors into its quadrant so growth stays symmetric.
  assert.match(style, /\.iw-ret--shooter \.iw-ret__corner\.ne\s*\{[^}]*scaleX\(-1\)/);
  assert.match(style, /\.iw-ret--shooter \.iw-ret__corner\.sw\s*\{[^}]*scaleY\(-1\)/);
  assert.match(style, /\.iw-ret--shooter \.iw-ret__corner\.se\s*\{[^}]*scale\(-1\)/);
});

test('#871 Shooter corner geometry is isolated from the other weapons, Range and network state', () => {
  // Every other weapon branch keeps its dedicated structure.
  const kinds = {
    charger: /iw-ret__charge/, blaster: /<circle r="23"/,
    dualies: /iw-ret__twin/, splatling: /iw-ret__segs/, roller: /iw-ret__ring/,
    slosher: /iw-ret__tick/,
  };
  for (const [kind, re] of Object.entries(kinds)) assert.match(buildReticle(kind), re, `${kind} branch intact`);
  // Dualies/Splatling keep their own tick usage; only Shooter lost its ticks.
  assert.ok(count(buildReticle('dualies'), 'iw-ret__tick') >= 1, 'dualies ticks untouched');
  assert.ok(count(buildReticle('splatling'), 'iw-ret__tick') >= 1, 'splatling ticks untouched');
  // The scoped stylesheet is Shooter-only and linked by the actual build entry.
  assert.match(style, /\.iw-ret--shooter \.iw-ret__corner/);
  assert.doesNotMatch(style, /\.iw-ret--(?:blaster|dualies|charger|roller|slosher|splatling) \.iw-ret__corner/);
  const html = installed('index.html');
  assert.match(html, /href="\.\/patches\/splatoon3\/ui\.css"/,
    'the S3 build entry loads the scoped corner styles');
  // Range/quality/network isolation: the corner branch lands in adaptSource and
  // every downstream production layer (touch, reliability, quality, network,
  // range) leaves it in place — full composition must still carry it.
  const sourceOnly = adaptSource('src/ui/hud.js', readSource('src/ui/hud.js'));
  assert.ok(sourceOnly.includes('iw-ret__corner'), 'adaptSource installs the corner branch');
  assert.equal(composedHud.includes('iw-ret__corner'), sourceOnly.includes('iw-ret__corner'),
    'no downstream layer (touch/reliability/quality/network/range) drops the corner root');
  assert.equal(composedHud.includes('iw-ret__corner'), true);
});
