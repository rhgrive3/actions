import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource, qualityIdentity } from '../adapter.mjs';
import { adaptS3SquidLook } from '../s3-squid-look-adapter.mjs';
import { readSource } from '../../reliability/tests/hud-fixture.mjs';

const compose = (rel, input = readSource(rel)) => adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, input))));

test('S3 squid look: no floor-level own-colour mound; the local swimmer keeps the squid-shaped ghost', () => {
  const ch = compose('src/game/character.js');
  new vm.SourceTextModule(ch);
  assert.doesNotMatch(ch, /s3BulgeGeometry|squid\.bulge|s3Bulge/, 'the hemisphere mound read as an ellipse under the squid');
  const upd = ch.slice(ch.indexOf('  _updateSquid(dt, s) {'));
  assert.match(upd, /const ghost = local && this\.isLocal;\n\s+sq\.ghost\.visible = ghost;/);
  assert.ok(JSON.stringify(qualityIdentity()).includes('s3-squid-look-adapter.mjs'));
});

test('S3 squid look: face trails travel, dry squid lies flat, arms bundle and long feelers attach outside four short supports', () => {
  const ch = compose('src/game/character.js');
  assert.match(ch, /for \(const m of \[body, ghost, dark, eyes\]\) m\.rotation\.y = Math\.PI;/);
  assert.match(ch, /_e1\.set\(Math\.PI \/ 2 - 0\.52 - tilt \* 0\.5, this\.sqYaw/);
  const geo = compose('src/game/character-geo.js');
  new vm.SourceTextModule(geo);
  assert.match(geo, /const feeler = k === 0 \|\| k === N - 1;/);
  assert.match(geo, /\(feeler \? 2\.0 : 0\.28\)/);
  assert.match(geo, /!\[0, 2, 4, 6, 8, 9\]\.includes\(k\)/);
  assert.match(geo, /res\.eyes\.userData\.squidConnectedEye = true/);
  assert.match(geo, /feeler \? lerp\(tint\(tA\[i\]\), -0\.95/);
});

test('S3 squid look: missing or duplicated anchors fail closed; other files pass through', () => {
  for (const rel of ['src/game/character.js', 'src/game/character-geo.js']) {
    const raw = readSource(rel);
    for (const input of ['', raw + raw]) assert.throws(() => adaptS3SquidLook(rel, input), /S3 squid look conflict/);
  }
  assert.equal(adaptS3SquidLook('src/game/actor.js', 'unchanged'), 'unchanged');
});
