import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource, qualityIdentity } from '../adapter.mjs';
import { adaptS3HudLook, S3_SQUID_BADGE, S3_TOOTH, S3_BADGE_SVG } from '../s3-hud-look-adapter.mjs';
import { SPECIAL_SEGMENTS, specialGaugeSVG } from '../hud-authority-adapter.mjs';
import { readSource } from '../../reliability/tests/hud-fixture.mjs';

const compose = (rel, input = readSource(rel)) => adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, input))));

test('S3 look: roster silhouette, squid splat bar and Japanese word order compose on the finished HUD', () => {
  const hud = compose('src/ui/hud.js');
  assert.ok(hud.includes(`const BADGE_PATH = '${S3_SQUID_BADGE}';`));
  assert.match(hud, /iw-kcard--\$\{kind\}\$\{isJa \? ' iw-kcard--ja' : ''\}/);
  assert.match(hud, /h\('span', \{ class: 'iw-kcard__w', html: SQUID \}\)/);
  assert.match(hud, /isJa \? 'をたおした!' : 'SPLATTED'/);
  assert.ok(JSON.stringify(qualityIdentity()).includes('s3-hud-look-adapter.mjs'));
});

test('S3 look: gauge teeth use the measured count, arc, radii and colours', () => {
  const svg = specialGaugeSVG();
  assert.equal(SPECIAL_SEGMENTS, 23);
  assert.equal((svg.match(/class="iw-sp__segment"/g) || []).length, 23);
  // No tooth reaches into the upper-left quarter (x < 50 and y < 50 in the 100 box).
  for (const [, x, y] of svg.matchAll(/class="iw-sp__segment" d="M([\d.]+) ([\d.]+)/g)) assert.ok(!(+x < 49 && +y < 49), `tooth at ${x},${y}`);
  assert.match(svg, /class="iw-sp__burst"/);
  const css = compose('styles/hud.css');
  assert.ok(css.includes(`.iw-sp__segment.is-filled { fill: ${S3_TOOTH.fill}; stroke: ${S3_TOOTH.edge};`));
  // The look layer follows the authority layer, so its colours win at equal specificity.
  assert.ok(css.lastIndexOf('.iw-sp__segment.is-filled') > css.indexOf('#425: discrete fill'));
});

test('S3 look: touch SP keeps its geometry; only artwork and text minimums change', () => {
  const css = compose('styles/mobile.css');
  const look = css.slice(css.indexOf('Splatoon 3 colours on the touch SP button'));
  assert.ok(look.length > 0);
  // The button box itself (not its icon) owns the layout-editor geometry and hit area.
  assert.doesNotMatch(look, /\.iwm-b--special(\.is-[\w-]+)?\s*\{[^}]*\b(left|top|width|height|inset|translate|scale|pointer-events)\s*:/);
  assert.match(look, /font-size: max\(12px/);
});

test('S3 look: missing or duplicated anchors fail closed', () => {
  const raw = readSource('src/ui/hud.js');
  for (const input of ['', raw + raw]) assert.throws(() => adaptS3HudLook('src/ui/hud.js', input), /S3 HUD look conflict/);
  assert.equal(adaptS3HudLook('src/game/actor.js', 'unchanged'), 'unchanged');
});

test('S3 look: HUD fonts ship with the quality layer and stay scoped to in-match text', async () => {
  const fs = await import('node:fs');
  const css = compose('styles/hud.css');
  for (const file of ['iw-s3-digits.woff2', 'iw-s3-jp.woff2']) {
    assert.ok(css.includes(`url('../patches/local-quality/fonts/${file}')`), file);
    const bytes = fs.readFileSync(new URL(`../fonts/${file}`, import.meta.url));
    assert.equal(bytes.subarray(0, 4).toString('latin1'), 'wOF2', file);
  }
  assert.ok(fs.existsSync(new URL('../fonts/OFL-RoundedMplus1c.txt', import.meta.url)), 'OFL text ships with the subset');
  assert.match(css, /\.iw-timer__txt \{ font-family: 'IW S3 Digits'/);
  // Menus keep their own type: the JP subset is only named inside HUD selectors.
  for (const rule of css.match(/[^{}]*\{[^}]*'IW S3 JP'[^}]*\}/g)) {
    const selector = rule.slice(0, rule.indexOf('{'));
    if (!selector.includes('@font-face')) assert.match(selector, /iw-hud|iw-squad/, selector);
  }
  assert.ok(JSON.stringify(qualityIdentity()).includes('fonts/iw-s3-jp.woff2'));
});

test('S3 look: squid-form ink tank rides beside the squid only while refilling', () => {
  const hud = compose('src/ui/hud.js');
  const start = hud.indexOf('  _updTank(f, dt) {'), body = hud.slice(start, hud.indexOf('  _drawTank(', start));
  assert.match(body, /me\.form === 'squid' && !me\.superJumpState/);
  assert.match(body, /classList\.toggle\('is-swim', swimTank\)/);
  // Full tank hides shortly after in squid form; kid form keeps the original 1.4 s linger.
  assert.match(body, /const idle = L\.fullT > \(swimTank \? 0\.35 : 1\.4\);/);
  assert.match(body, /this\._project\(G\.camera, me\.pos\.x, me\.pos\.y \+ 0\.3, me\.pos\.z\)/);
  const draw = hud.slice(hud.indexOf('  _drawTank('), hud.indexOf('  // ---------------------------------------------------------------- special gauge'));
  assert.match(draw, /T2\.well/); assert.doesNotMatch(draw, /bubbles\[i\]/, 'S3 tank has no bubbles');
  const css = compose('styles/hud.css');
  assert.doesNotMatch(css.slice(css.indexOf('.iw-xh .iw-tank.is-swim {')).split('}')[0], /opacity:/, 'swim layout must not override the refill-only idle fade');
});

test('S3 look: a pinned squiggle joins the squid to the tank foot and beats while refilling', () => {
  const hud = compose('src/ui/hud.js');
  const tube = hud.slice(hud.indexOf('  _s3TankTube(ink, dt) {'), hud.indexOf('  _drawTank('));
  assert.ok(tube.length > 0);
  assert.match(hud, /this\._s3TankTube\(ink, dt\);/);
  assert.match(tube, /env = Math\.sin\(Math\.PI \* u\)/, 'both ends stay pinned');
  assert.match(tube, /const flowing = ink < 0\.995;/);
  assert.doesNotMatch(tube.split('if (!L.tubeGeo')[1].split('\n')[0], /offset(Height|Width|Left|Top)/, 'no per-frame layout read in the guard');
});

test('S3 look: the badge mask file matches the roster silhouette and stays out of the precached stylesheet', async () => {
  const fs = await import('node:fs');
  assert.equal(fs.readFileSync(new URL('../hud/s3-squid-badge.svg', import.meta.url), 'utf8'), S3_BADGE_SVG);
  const css = compose('styles/hud.css');
  assert.doesNotMatch(css, /data:image\/svg\+xml/, 'no inline SVG data URI in hud.css');
  assert.match(css, /@supports \(mask-image: none\) \{\n\.iw-sq__badge::before \{[^}]*mask: url\('\.\.\/patches\/local-quality\/hud\/s3-squid-badge\.svg'\)/);
  assert.ok(JSON.stringify(qualityIdentity()).includes('hud/s3-squid-badge.svg'));
});
