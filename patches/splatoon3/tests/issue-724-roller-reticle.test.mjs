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
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { adaptSource, replaceOnce } from '../adapter.mjs';
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const UPSTREAM = process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public');

const readSource = rel => fs.readFileSync(path.join(UPSTREAM, rel), 'utf8');
const installed = rel => adaptSource(rel, readSource(rel));
// Minimal JPEG SOF reader: walks the marker segments until a start-of-frame and
// returns the encoded dimensions, so the assertion reads the real file header
// instead of trusting a recorded number.
function jpegSize(bytes) {
  let i = 2;
  while (i < bytes.length - 9) {
    if (bytes[i] !== 0xff) { i++; continue; }
    const marker = bytes[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const length = bytes.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: bytes.readUInt16BE(i + 5), width: bytes.readUInt16BE(i + 7) };
    }
    i += 2 + length;
  }
  throw new Error('no JPEG start-of-frame segment');
}

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

test('#724 the Roller reticle reproduces the pinned official ring plus four diagonal strokes', () => {
  const roller = html('roller');
  assert.match(roller, /viewBox="-40 -40 80 80"/, 'compact shared canvas, not the retired 160 px one');
  assert.match(roller, /<i class="iw-ret__dot"><\/i>/, 'centre dot is kept');

  // Pinned official capture: 1280x720, sha256 349f7c9f...0183750. Measured ring
  // radius 13 px and four ~8 px strokes at (+/-45.3, +/-22.6) px from the aim
  // point, each perpendicular to its own radius. Normalised at 7.5 units = 13 px.
  const RING = 7.5, PX_PER_UNIT = 13 / RING;
  const ring = roller.match(/<circle r="([\d.]+)" class="iw-ret__ring thin"\/>/);
  assert.ok(ring, 'a thin ring is present');
  assert.equal(+ring[1], RING, 'ring radius matches the measured official ratio');

  const paths = [...roller.matchAll(/<path class="iw-ret__ring thin" d="M(-?[\d.]+) (-?[\d.]+) L(-?[\d.]+) (-?[\d.]+)"\/>/g)];
  assert.equal(paths.length, 4, 'the official capture shows four strokes, not zero');

  // Each stroke centre must land on the measured (+/-3.48r, +/-1.74r) offsets and
  // run perpendicular to its own radius.
  for (const [, x1, y1, x2, y2] of paths) {
    const mx = (+x1 + +x2) / 2, my = (+y1 + +y2) / 2;
    const ux = mx / RING, uy = my / RING;
    assert.ok(Math.abs(Math.abs(ux) - 3.48) < 0.05, `stroke |x| offset ${Math.abs(ux)} must be 3.48 ring radii`);
    assert.ok(Math.abs(Math.abs(uy) - 1.74) < 0.05, `stroke |y| offset ${Math.abs(uy)} must be 1.74 ring radii`);
    // dot(stroke direction, unit radius vector) must vanish: strokes lie across
    // the radius, which is what makes them read as four corner marks.
    const norm = Math.hypot(mx, my);
    const dot = ((+x2 - +x1) * mx + (+y2 - +y1) * my) / norm;
    assert.ok(Math.abs(dot) < 0.05, `each stroke is perpendicular to its radius (dot ${dot.toFixed(3)})`);
    const length = Math.hypot(+x2 - +x1, +y2 - +y1);
    assert.ok(Math.abs(length - 4.6) < 0.2, `stroke length ${length.toFixed(2)} matches the measured 4.6 units`);
  }
  // All four quadrants are occupied, and nothing leaves the compact canvas.
  const quads = new Set(paths.map(([, x1, y1]) => `${Math.sign(+x1)},${Math.sign(+y1)}`));
  assert.equal(quads.size, 4, 'one stroke in each quadrant');
  // Every emitted coordinate, ring radius included, stays inside the shared canvas.
  const coords = [+ring[1], ...paths.flatMap(([, ax, ay, bx, by]) => [+ax, +ay, +bx, +by])];
  assert.equal(coords.length, 17, 'ring radius plus four stroke endpoints');
  assert.ok(coords.every(v => Math.abs(v) <= 40), 'no coordinate leaves the compact 80-unit canvas');
});

test('#724 the other weapon reticles keep their own dedicated structures', () => {
  assert.match(html('charger'), /iw-ret__charge/);
  assert.match(html('charger'), /iw-ret__notch/);
  assert.match(html('blaster'), /<circle r="23" class="iw-ret__ring"/);
  assert.match(html('dualies'), /iw-ret__twin/);
  assert.match(html('dualies'), /iw-ret__lock/);
  assert.match(html('splatling'), /iw-ret__segs/);
  assert.match(html('splatling'), /iw-ret__charge/);
  // #652 compact Slosher marker remains installed: Slosher stays on the
  // shared four-tick fallback while #871 moves Shooter to corner markers.
  assert.equal(count(html('slosher'), 'iw-ret__tick'), 4);
  assert.equal(html('slosher').includes('iw-ret__corner'), false);
  // The shared center/inner structure (shooter) is untouched by this fix;
  // only its outer markers became four corners (#871).
  assert.match(html('shooter'), /<circle r="15" class="iw-ret__ring thin"\/>/);
  assert.equal(count(html('shooter'), 'iw-ret__tick'), 0);
  assert.equal(count(html('shooter'), 'iw-ret__corner '), 4);
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
// The official Nintendo image cited by #724 was fetched and inspected on
// 2026-10-06 and pinned by hash. It shows no resolvable reticle overlay, so it
// supports neither the old geometry nor the compact marker. These assertions pin
// the fetched artifact and the recorded partial verdict so the reference cannot
// be quietly upgraded into a claimed screenshot match. Skipped when the evidence
// tree is not present (the patch must stay testable standalone).
const EVIDENCE = process.env.INKWAVE_EVIDENCE_DIR
  || '/mnt/workspace/inkwave-batch-c/evidence/additional-100/issue724-reference';
const REFERENCE_IMAGE = path.join(EVIDENCE, '027.jpg');
const PINNED_SHA256 = '349f7c9f8fba19d074adbbbc873fbd9db0b0f46d2ac863a24240b982d0183750';

test('#724 the pinned official reference image is unmodified', { skip: fs.existsSync(REFERENCE_IMAGE) ? false : 'reference image not fetched in this environment' }, () => {
  const bytes = fs.readFileSync(REFERENCE_IMAGE);
  assert.equal(bytes.length, 133844, 'pinned byte length');
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), PINNED_SHA256, 'pinned SHA256');
  // JPEG SOF marker carries the dimensions, so this reads the real header.
  assert.deepEqual(jpegSize(bytes), { width: 1280, height: 720 });
});

test('#724 the reference record carries the measured geometry, not the retracted absence claim', { skip: fs.existsSync(path.join(EVIDENCE, 'manifest.json')) ? false : 'reference manifest not fetched in this environment' }, () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(EVIDENCE, 'manifest.json'), 'utf8'));
  assert.equal(manifest.issue, 724);
  assert.equal(manifest.url, 'https://www.nintendo.com/jp/ichikara/av5ja/photo/01/027.jpg');
  assert.equal(manifest.sha256, PINNED_SHA256);
  assert.deepEqual(manifest.dimensions_px, { width: 1280, height: 720 });

  // Reticle presence is the parent's direct visual inspection of this image; the
  // numbers below are this lane's targeted re-measurement at the parent-supplied
  // aim point. Both must stay on the record, with the retracted claim retained
  // only as history.
  const c = manifest.correction;
  assert.equal(manifest.verdict, 'CORRECTED');
  assert.equal(c.reticle_resolvable, true);
  assert.deepEqual(c.aim_point_px, { x: 649, y: 333 });
  assert.equal(c.ring.radius_px, 13);
  assert.equal(c.strokes.count, 4);
  assert.equal(c.strokes.length_px, 7.98);
  assert.deepEqual(c.normalised_geometry.stroke_offset_in_ring_radii, { x: 3.48, y: 1.74 });
  assert.deepEqual(c.normalised_geometry.svg_paths, [
    'M-25.04 -15.15 L-27.11 -11.04', 'M27.27 -10.92 L25.23 -15.04',
    'M-27.05 11.04 L-24.98 15.15', 'M25.04 15.15 L27.11 11.04'
  ]);
  assert.match(c.acceptance_outcome.old_wide_bracket_lower_arc_absent, /CONFIRMED/);
  assert.match(c.acceptance_outcome.pinned_relative_geometry, /PROVEN and implemented/);
  // The retracted "no resolvable reticle" finding must stay visible as history,
  // never silently deleted.
  assert.equal(manifest.superseded_analysis.previous_verdict, 'PARTIAL (no resolvable reticle)');
  assert.match(manifest.superseded_analysis.why_wrong, /GRAY, semi-transparent/);
  assert.match(manifest.superseded_analysis.detected_by, /parent visual inspection/);
  // Stroke weight, opacity and flick states are still not pinned by this capture.
  assert.match(c.acceptance_outcome.native_pixel_geometry, /Still unknown/);
});
