// Issue #652: the regular Slosher's normal-battle reticle must stay a compact
// circular target marker with surrounding ticks (the structure visible in
// Splatoon 3 Ver. 11.3.0 reference screenshots), not the invented trajectory
// diagram the upstream HUD draws: an arch over the aim point plus a landing
// "bucket" bracket under it, stretched by a per-shot --kk kick transform.
//
// The fix is delivered as a build-only splatoon3 patch transform (upstream
// `inkwave-public/` stays byte-identical per the upstream lock), so the test
// runs the *installed* code path: the same adapter chain CI composes
// (adaptSource -> adaptTouchLayout -> adaptReliability) and then executes the
// actual shipped `_buildReticle` method extracted from that composed source.
// Exact Nintendo pixel radii are deliberately not asserted: the issue keeps
// them unknown until measured from reference material.
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
// The installed source exactly as check-inkwave-patches/build compose it.
const installed = rel => adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, readSource(rel))));

function section(source, start, end) {
  const at = source.indexOf(start), until = source.indexOf(end, at);
  assert.ok(at >= 0 && until > at, `actual method boundary: ${start}`);
  assert.equal(source.indexOf(start, at + start.length), -1, 'unique start');
  return source.slice(at, until);
}

// Instantiate the shipped Hud method with a minimal reticle stub (the fixture
// pattern: only display plumbing is stubbed, the method body is the real one).
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

test('Slosher reticle is the compact circular/tick target marker, not a trajectory diagram', () => {
  const slosher = html('slosher');
  // No ballistic arch over the aim point (issue #652 root).
  assert.equal(slosher.includes('iw-ret__arch'), false, 'trajectory arch must not render');
  assert.equal(slosher.includes('Q0 -26'), false, 'inverted-U arch path must not render');
  // No landing / "bucket" bracket under the aim point.
  assert.equal(slosher.includes('M-10 13'), false, 'landing bracket must not render');
  assert.equal(slosher.includes('M-24 6'), false, 'arch shoulder endpoints must not render');
  // Compact circular target marker with surrounding ticks: the standard
  // structure the shooter reticle already ships (dot + ring + four ticks).
  assert.match(slosher, /<i class="iw-ret__dot"><\/i>/);
  assert.match(slosher, /<circle r="15" class="iw-ret__ring thin"\/>/);
  assert.equal(count(slosher, 'iw-ret__tick'), 4, 'four surrounding tick marks');
  // Structurally identical to the standard target reticle (no slosher-only geometry).
  assert.equal(slosher, html('shooter'));
});

test('the other weapon reticles keep their dedicated structures', () => {
  assert.match(html('charger'), /iw-ret__charge/);
  assert.match(html('charger'), /iw-ret__notch/);
  assert.match(html('blaster'), /<circle r="23" class="iw-ret__ring"/);
  assert.match(html('roller'), /viewBox="-80 -40 160 80"/);
  assert.match(html('dualies'), /iw-ret__twin/);
  assert.match(html('dualies'), /iw-ret__lock/);
  assert.match(html('splatling'), /iw-ret__segs/);
  assert.match(html('splatling'), /iw-ret__charge/);
});

test('no kick-driven arch geometry survives in the installed HUD source', () => {
  const hud = installed('src/ui/hud.js');
  assert.equal(hud.includes('iw-ret__arch'), false, 'arch element never emitted by the installed source');
  assert.equal(hud.includes('--kk'), false, 'slosher --kk kick writer removed from the installed source');
  // Firing recoil must not reshape the slosher reticle any more: _updCrosshair
  // has no slosher-only branch left.
  const upd = section(hud, '  _updCrosshair(f, dt) {', '\n  _updTank(f, dt) {');
  assert.equal(upd.includes("L.kind === 'slosher'"), false, 'no slosher-only crosshair state');
  // Geometry is input-independent (mouse/pad/touch/gyro share this builder).
  assert.equal(count(hud, '  _buildReticle(kind) {'), 1, 'single shared reticle builder');
  // Upstream stays pristine (byte-identical to the locked snapshot); the rule
  // left in styles/hud.css can only ever match the never-emitted arch class,
  // so it cannot paint anything.
  assert.ok(readSource('src/ui/hud.js').includes('iw-ret__arch'), 'upstream file itself is untouched');
  const css = readSource('styles/hud.css');
  const kkRules = css.split('}').filter(chunk => chunk.includes('--kk'));
  assert.ok(kkRules.length <= 1, 'kick transform limited to the arch rule');
  for (const rule of kkRules) assert.match(rule, /\.iw-ret--slosher \.iw-ret__arch\s*\{/, 'kick rule targets only the never-emitted arch');
});

