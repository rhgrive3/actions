import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource, qualityIdentity } from '../adapter.mjs';
import { adaptS3HudLook, S3_SQUID_BADGE, S3_TOOTH } from '../s3-hud-look-adapter.mjs';
import { SPECIAL_SEGMENTS, specialGaugeSVG } from '../hud-authority-adapter.mjs';
import { readSource } from '../../reliability/tests/hud-fixture.mjs';

const compose = (rel, input = readSource(rel)) => adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, input))));

test('S3 look: roster silhouette, squid splat bar and Japanese word order compose on the finished HUD', () => {
  const hud = compose('src/ui/hud.js');
  assert.ok(hud.includes(`const BADGE_PATH = '${S3_SQUID_BADGE}';`));
  assert.match(hud, /iw-kcard--\$\{kind\}\$\{isJa \? ' iw-kcard--ja' : ''\}/);
  assert.match(hud, /h\('span', \{ class: 'iw-kcard__w', html: SQUID \}\)/);
  assert.match(hud, /isJa \? 'をたおした！' : 'SPLATTED'/);
  assert.ok(JSON.stringify(qualityIdentity()).includes('s3-hud-look-adapter.mjs'));
});

test('S3 look: gauge teeth use the measured count, radii and colours', () => {
  const svg = specialGaugeSVG();
  assert.equal(SPECIAL_SEGMENTS, 30);
  assert.equal((svg.match(/class="iw-sp__segment"/g) || []).length, 30);
  assert.match(svg, /class="iw-sp__burst"/);
  const css = compose('styles/hud.css');
  assert.ok(css.includes(`.iw-sp__segment.is-filled { fill: ${S3_TOOTH.fill}; stroke: ${S3_TOOTH.edge};`));
  // The look layer follows the authority layer, so its colours win at equal specificity.
  assert.ok(css.lastIndexOf('.iw-sp__segment.is-filled') > css.indexOf('#425: discrete fill'));
});

test('S3 look: touch SP keeps its geometry; only artwork and text minimums change', () => {
  const css = compose('styles/mobile.css');
  const look = css.slice(css.indexOf('Splatoon 3 dial on the touch SP button'));
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
