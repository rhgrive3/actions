// Reproduce with:
//   node --test patches/splatoon3/tests/main-weapon-catalog-data.test.mjs
// Compare against pinned raw source files with:
//   INKWAVE_MAIN_WEAPON_REFERENCE=/path/to/splat-reference node --test patches/splatoon3/tests/main-weapon-catalog-data.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { MAIN_WEAPON_CATALOG } from '../runtime/main-weapon-catalog-data.mjs';

const EXPECTED_COMMIT = '7280ff9cde8bb1c5dcef46c700c326471584d2e6';
const EXPECTED_FAMILY_COUNTS = {
  shooter: 14,
  blaster: 7,
  roller: 5,
  brush: 3,
  charger: 8,
  slosher: 6,
  splatling: 6,
  dualies: 6,
  brella: 4,
  stringer: 3,
  splatana: 3,
};
const EXPECTED_LEGACY = {
  shooter: ['WeaponShooterNormal', 'Splattershot', 'スプラシューター'],
  roller: ['WeaponRollerNormal', 'Splat Roller', 'スプラローラー'],
  charger: ['WeaponChargerNormal', 'Splat Charger', 'スプラチャージャー'],
  blaster: ['WeaponBlasterMiddle', 'Blaster', 'ホットブラスター'],
  dualies: ['WeaponManeuverNormal', 'Splat Dualies', 'スプラマニューバー'],
  slosher: ['WeaponSlosherStrong', 'Slosher', 'バケットスロッシャー'],
  splatling: ['WeaponSpinnerStandard', 'Heavy Splatling', 'バレルスピナー'],
};
const sourceRoot = process.env.INKWAVE_MAIN_WEAPON_REFERENCE
  ? path.resolve(process.env.INKWAVE_MAIN_WEAPON_REFERENCE)
  : null;

function readSourceJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8'));
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertRetainedValuesMatch(actual, original, location) {
  if (Array.isArray(actual)) {
    assert.ok(Array.isArray(original), `${location} remains an array in source`);
    assert.equal(actual.length, original.length, `${location} preserves the full source array`);
    for (let i = 0; i < actual.length; i += 1) {
      assertRetainedValuesMatch(actual[i], original[i], `${location}[${i}]`);
    }
    return;
  }
  if (actual !== null && typeof actual === 'object') {
    assert.ok(original !== null && typeof original === 'object' && !Array.isArray(original), `${location} remains an object in source`);
    for (const [key, value] of Object.entries(actual)) {
      assert.ok(Object.hasOwn(original, key), `${location}.${key} exists in source`);
      assertRetainedValuesMatch(value, original[key], `${location}.${key}`);
    }
    return;
  }
  assert.deepEqual(actual, original, `${location} equals the retained source value`);
}

test('pinned main weapon catalog has the expected exact coverage and source anchors', () => {
  assert.equal(MAIN_WEAPON_CATALOG.schema, 1);
  assert.equal(MAIN_WEAPON_CATALOG.referenceVersion, '11.3.0');
  assert.equal(MAIN_WEAPON_CATALOG.sourceCommit, EXPECTED_COMMIT);
  assert.equal(MAIN_WEAPON_CATALOG.records.length, 65);

  const ids = MAIN_WEAPON_CATALOG.records.map(record => record.id);
  const actors = MAIN_WEAPON_CATALOG.records.map(record => record.sourceActor);
  assert.equal(new Set(ids).size, 65, 'weapon IDs are unique');
  assert.equal(new Set(actors).size, 65, 'source actors are unique');

  const familyCounts = {};
  for (const record of MAIN_WEAPON_CATALOG.records) {
    familyCounts[record.family] = (familyCounts[record.family] ?? 0) + 1;
  }
  assert.deepEqual(familyCounts, EXPECTED_FAMILY_COUNTS);
  assert.equal(MAIN_WEAPON_CATALOG.records.filter(record => record.legacy).length, 7);
  assert.equal(MAIN_WEAPON_CATALOG.records.filter(record => !record.legacy).length, 58);

  const legacyRecords = new Map(MAIN_WEAPON_CATALOG.records.filter(record => record.legacy).map(record => [record.id, record]));
  for (const [id, [actor, en, ja]] of Object.entries(EXPECTED_LEGACY)) {
    const record = legacyRecords.get(id);
    assert.ok(record, `${id} retains its existing engine implementation`);
    assert.equal(record.sourceActor, actor, `${id} source actor mapping`);
    assert.deepEqual(record.names, { en, ja }, `${id} bilingual source identity`);
  }

  const starter = MAIN_WEAPON_CATALOG.records.find(record => record.sourceActor === 'WeaponShooterFirst');
  assert.equal(starter?.id, 's3-shooter-first');
  assert.equal(starter?.sourceRow, 'Shooter_First_00');
  assert.deepEqual(starter?.names, { en: 'Splattershot Jr.', ja: 'わかばシューター' });

  for (const record of MAIN_WEAPON_CATALOG.records) {
    assert.ok(record.names?.en?.trim(), `${record.id} has an English source name`);
    assert.ok(record.names?.ja?.trim(), `${record.id} has a Japanese source name`);
    assert.match(record.sourcePath, /^data\/parameter\/1130\/weapon\/Weapon[^/]+\.game__GameParameterTable\.json$/);
    assert.ok(record.sourcePath.endsWith(`${record.sourceActor}.game__GameParameterTable.json`));
    assert.match(record.sourceSha256, /^[a-f0-9]{64}$/);
    assert.ok(record.sourceRow.endsWith('_00'), `${record.id} selects its canonical base kit row`);
  }
});

test('curated values and names match the pinned raw reference when supplied', t => {
  if (!sourceRoot) {
    t.skip('set INKWAVE_MAIN_WEAPON_REFERENCE to the downloaded pinned source directory');
    return;
  }

  const info = readSourceJson('data/mush/1130/WeaponInfoMain.json');
  const english = readSourceJson('data/language/USen.json')['CommonMsg/Weapon/WeaponName_Main'];
  const japanese = readSourceJson('data/language/JPja.json')['CommonMsg/Weapon/WeaponName_Main'];

  for (const record of MAIN_WEAPON_CATALOG.records) {
    const bytes = fs.readFileSync(path.join(sourceRoot, record.sourcePath));
    assert.equal(sha256(bytes), record.sourceSha256, `${record.id} source file hash`);
    const original = JSON.parse(bytes.toString('utf8')).GameParameters;
    assertRetainedValuesMatch(record.parameters, original, `${record.id}.parameters`);

    const row = info.find(candidate => candidate.__RowId === record.sourceRow);
    assert.ok(row, `${record.id} source row exists`);
    assert.equal(row.Type, 'Versus', `${record.id} is a versus main weapon row`);
    assert.equal(row.SpecActor.split('/').at(-1).split('.')[0], record.sourceActor, `${record.id} actor matches its row`);
    assert.equal(english[record.sourceRow], record.names.en, `${record.id} English name matches sourceRow`);
    assert.equal(japanese[record.sourceRow], record.names.ja, `${record.id} Japanese name matches sourceRow`);
    if (record.sourceActor === 'WeaponShooterFirst') {
      assert.equal(row.ShopUnlockRank, -1, 'starter identity is retained despite being absent from the shop');
      assert.equal(record.sourceRow, 'Shooter_First_00', 'the starter _00 row wins over the _01 kit row');
    }
  }
});
