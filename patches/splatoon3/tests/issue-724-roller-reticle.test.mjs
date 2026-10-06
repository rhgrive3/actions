// #724 Roller reticle presentation.
//
// Runs the real HUD._buildReticle body out of the *installed* (adapted) source,
// so these assertions describe what the shipped build emits, not a copy of it.
// Gameplay values are out of scope: projectile, damage, collision, paint and
// range paths are not touched by the #724 connection and are asserted unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adaptSource, replaceOnce } from '../adapter.mjs';
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const UPSTREAM = process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public');

const readSource = rel => fs.readFileSync(path.join(UPSTREAM, rel), 'utf8');
const installed = rel => adaptSource(rel, readSource(rel));
const section = (source, open, close) => {
  const start = source.indexOf(open);
  if (start < 0) throw new Error(`missing section start ${open}`);
  const end = source.indexOf(close, start);
  if (end < 0) throw new Error(`missing section end ${close}`);
  return source.slice(start, end);
};

// Executes the installed method against a minimal DOM stub. Only the fields the
// builder actually touches are provided; nothing about the HUD is re-implemented.
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

test('#724 the Roller reticle emits no invented wide bracket, lower arc or 160 px canvas', () => {
  const roller = html('roller');
  assert.equal(roller.includes('iw-ret__svg wide'), false, 'the Roller-only 160 px canvas class must not be emitted');
  assert.equal(roller.includes('-80 -40 160 80'), false, 'the 160 px wide viewBox must not be emitted');
  assert.equal(roller.includes('M-46 -15'), false, 'left bracket path must not be emitted');
  assert.equal(roller.includes('M46 -15'), false, 'right bracket path must not be emitted');
  assert.equal(roller.includes('M-30 22 Q0 30 30 22'), false, 'lower curved guide must not be emitted');
  assert.equal(roller.includes('Q-60 -15'), false, 'bracket corner geometry must not be emitted');
});

test('#724 the Roller reticle is a compact central aim marker on the shared 80 px canvas', () => {
  const roller = html('roller');
  assert.match(roller, /viewBox="-40 -40 80 80"/, 'compact shared canvas');
  assert.match(roller, /<i class="iw-ret__dot"><\/i>/, 'centre dot is kept');
  assert.equal(count(roller, 'iw-ret__ring'), 1, 'one ring only, no bracket/arc strokes');
  assert.equal(roller.includes('iw-ret__tick'), false, 'no spread ticks are invented for the Roller');
  // Every emitted coordinate stays inside the compact canvas, so the retired
  // 160 px silhouettes cannot be reintroduced through another path.
  for (const [, x, y] of roller.matchAll(/(?:c|circle[^r]*)="(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)"/g)) {
    assert.ok(Math.abs(+x) <= 40 && Math.abs(+y) <= 40, `coordinate ${x} ${y} leaves the compact canvas`);
  }
  assert.match(roller, /<circle r="15"/, 'compact ring radius stays on the shared HUD scale');
});

test('#724 the other weapon reticles keep their own dedicated structures', () => {
  assert.match(html('charger'), /iw-ret__charge/);
  assert.match(html('charger'), /iw-ret__notch/);
  assert.match(html('blaster'), /<circle r="23" class="iw-ret__ring"/);
  assert.match(html('dualies'), /iw-ret__twin/);
  assert.match(html('dualies'), /iw-ret__lock/);
  assert.match(html('splatling'), /iw-ret__segs/);
  assert.match(html('splatling'), /iw-ret__charge/);
  assert.match(html('slosher'), /iw-ret__arch/);
  // The shared compact fallback (shooter) is untouched by this fix.
  assert.match(html('shooter'), /<circle r="15" class="iw-ret__ring thin"\/>/);
  assert.equal(count(html('shooter'), 'iw-ret__tick'), 4);
});

test('#724 the obsolete geometry cannot come back through the installed source or the upstream CSS hook', () => {
  const hud = installed('src/ui/hud.js');
  assert.equal(hud.includes('-80 -40 160 80'), false, 'installed HUD source never emits the wide viewBox');
  assert.equal(hud.includes('iw-ret__svg wide"'), false, 'installed HUD source never emits the wide canvas class');
  // styles/hud.css is upstream and stays byte-identical; its `.wide` rule can
  // now only match an element the installed build no longer creates.
  const css = readSource('styles/hud.css');
  assert.ok(css.includes('.iw-ret__svg.wide { left: -80px; width: 160px; }'), 'upstream stylesheet is untouched');
  assert.equal(hud.includes('iw-ret__svg wide'), false, 'nothing the build emits can match that rule');
  assert.equal(count(hud, '  _buildReticle(kind) {'), 1, 'single shared reticle builder: one branch owns every kind');
});

test('#724 the connection is fail-closed and leaves the locked upstream file pristine', () => {
  const before = readSource('src/ui/hud.js');
  assert.ok(before.includes('viewBox="-80 -40 160 80"'), 'upstream still carries the obsolete geometry (not edited in place)');
  assert.throws(() => adaptSource('src/ui/hud.js', before.replace("kind === 'roller'", "kind === 'rollerX'")),
    /compact Roller reticle/, 'a moved upstream anchor stops the build');
  // Re-adapting already-installed output is a conflict, not a silent double patch.
  assert.throws(() => adaptSource('src/ui/hud.js', installed('src/ui/hud.js')), /INKWAVE patch conflict/);
  assert.throws(() => replaceOnce(before, '    } else if (kind === ', '    } else if (kind === ', 'duplicate anchor'),
    /expected exactly one connection/);
});