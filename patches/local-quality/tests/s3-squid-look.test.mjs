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

test('S3 squid look: own-ink mound replaces the local see-through squid only while swimming on the ground', () => {
  const ch = compose('src/game/character.js');
  new vm.SourceTextModule(ch);
  assert.match(ch, /function s3BulgeGeometry\(\)/);
  assert.match(ch, /this\.squid\.bulge = bulge;/);
  const upd = ch.slice(ch.indexOf('  _updateSquid(dt, s) {'));
  assert.match(upd, /const bulgeOn = !!sq\.bulge && form === 'swim' && !airborne && this\.isLocal/);
  assert.match(upd, /if \(bulgeOn\) \{\n\s+sq\.ghost\.visible = false;/, 'the mound takes over from the ghost, never both');
  assert.match(ch, /this\._ownMats\.push\(bulgeMat\)/, 'mound material is released by the native dispose path');
  assert.ok(JSON.stringify(qualityIdentity()).includes('s3-squid-look-adapter.mjs'));
});

test('S3 squid look: face trails travel, dry squid lies flat, arms bundle and feelers sit under the face', () => {
  const ch = compose('src/game/character.js');
  assert.match(ch, /for \(const m of \[body, ghost, dark, eyes\]\) m\.rotation\.y = Math\.PI;/);
  assert.match(ch, /_e1\.set\(Math\.PI \/ 2 - 0\.52 - tilt \* 0\.5, this\.sqYaw/);
  const geo = compose('src/game/character-geo.js');
  new vm.SourceTextModule(geo);
  assert.match(geo, /const feeler = k === 0 \|\| k === N - 1;/);
  assert.match(geo, /\(feeler \? 2\.0 : 0\.62\)/);
  assert.match(geo, /feeler \? lerp\(tint\(tA\[i\]\), -0\.95/);
});

test('S3 squid look: missing or duplicated anchors fail closed; other files pass through', () => {
  for (const rel of ['src/game/character.js', 'src/game/character-geo.js']) {
    const raw = readSource(rel);
    for (const input of ['', raw + raw]) assert.throws(() => adaptS3SquidLook(rel, input), /S3 squid look conflict/);
  }
  assert.equal(adaptS3SquidLook('src/game/actor.js', 'unchanged'), 'unchanged');
});
