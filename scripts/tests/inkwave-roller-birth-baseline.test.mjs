import test from 'node:test';
import assert from 'node:assert/strict';
import { alignRollerBirthBaseline, alignProjectilePoolBaseline, assertUnchangedRollerSource } from '../lib/inkwave-roller-birth-baseline.mjs';

const before = `unchanged damage and RNG\nconst side=fan*(unit.SpawnPositionWidth||0),j=unit.SpawnPositionRandomCube||0;\np.pos.y+=(unit.SpawnPositionOffsetHeight||0)+(unit.SpawnPositionHeight||0);\nunchanged contact and paint`;
const candidate = `unrelated candidate code must never be copied\nconst side=fan*(unit.SpawnPositionWidth||0)*0.5,j=unit.SpawnPositionRandomCube||0;\nconst baseHeight=unit.SpawnPositionOffsetHeight||0;\n  const perGlobHeight=unit.SpawnPositionHeight||0;\n  p.pos.y+=vertical ? baseHeight+offset*perGlobHeight : baseHeight+perGlobHeight;`;

test('reference changes exactly the two birth rules and never copies candidate gameplay', () => {
  const { source, changes } = alignRollerBirthBaseline(before, candidate);
  assert.equal(changes.length, 2);
  assert.equal(source, before
    .replace('unit.SpawnPositionWidth||0),j=', 'unit.SpawnPositionWidth||0)*0.5,j=')
    .replace('p.pos.y+=(unit.SpawnPositionOffsetHeight||0)+(unit.SpawnPositionHeight||0);',
      'const baseHeight=unit.SpawnPositionOffsetHeight||0;\n  const perGlobHeight=unit.SpawnPositionHeight||0;\n  p.pos.y+=vertical ? baseHeight+offset*perGlobHeight : baseHeight+perGlobHeight;'));
  assert.ok(!source.includes('unrelated candidate code'));
});

test('already-corrected main is unchanged after the correction merges', () => {
  assert.deepEqual(alignRollerBirthBaseline(candidate, candidate), { source: candidate, changes: [] });
});

test('earlier compact vertical reference migrates to the reviewed candidate expression exactly once', () => {
  const compact = 'p.pos.y+=(unit.SpawnPositionOffsetHeight||0)+(vertical?offset:1)*(unit.SpawnPositionHeight||0);';
  const reviewed = 'const baseHeight=unit.SpawnPositionOffsetHeight||0;\n  const perGlobHeight=unit.SpawnPositionHeight||0;\n  p.pos.y+=vertical ? baseHeight+offset*perGlobHeight : baseHeight+perGlobHeight;';
  const corrected = alignRollerBirthBaseline(before, candidate).source;
  const legacy = corrected.replace(reviewed, compact);
  const migrated = alignRollerBirthBaseline(legacy, candidate);
  assert.equal(migrated.source, corrected);
  assert.deepEqual(migrated.changes, [{ name: 'vertical-indexed-height', before: compact, after: reviewed }]);
  assert.deepEqual(alignRollerBirthBaseline(migrated.source, candidate), { source: corrected, changes: [] });
  for (const raw of [legacy + compact, legacy + reviewed, legacy.replace('vertical?offset:1', 'vertical?offset:2')])
    assert.throws(() => alignRollerBirthBaseline(raw, candidate));
  assert.throws(() => alignRollerBirthBaseline(before, candidate + compact));
});

test('unknown, missing, duplicate and mutated birth rules fail closed', () => {
  for (const baseline of [before.replace('Width||0)', 'Width||1)'), before + before, before.replace('p.pos.y+=', 'p.pos.y-=')])
    assert.throws(() => alignRollerBirthBaseline(baseline, candidate));
  for (const subject of [candidate.replace('*0.5,j=', '*0.6,j='), candidate + candidate, before])
    assert.throws(() => alignRollerBirthBaseline(before, subject));
});

test('changed source parameters cannot be hidden by aligning birth rules', () => {
  const profile = { weaponsFidelityCompletion: { weapons: { roller: {
    WideSwingUnitGroupParam: { Unit: [{ SpawnPositionWidth: .8, SpawnPositionRandomCube: .1 }] },
    VerticalSwingUnitGroupParam: { Unit: [{ SpawnPositionHeight: .25, SpawnPositionOffsetHeight: -.25 }] },
  } } } };
  assert.doesNotThrow(() => assertUnchangedRollerSource(profile, structuredClone(profile)));
  const changed = structuredClone(profile);
  changed.weaponsFidelityCompletion.weapons.roller.WideSwingUnitGroupParam.Unit[0].SpawnPositionWidth = 1;
  assert.throws(() => assertUnchangedRollerSource(profile, changed));
  assert.throws(() => assertUnchangedRollerSource({}, profile));
});

test('pool alignment changes one initializer, composes with births, and rejects unknown or duplicate code', () => {
  const oldPool = 'p.fidelitySloshUnit=null;p.fidelitySloshDownward=null;';
  const newPool = 'p.fidelitySloshUnit=null;p.fidelitySloshIndex=null;p.fidelitySloshDownward=null;';
  const base = before + '\n' + oldPool + '\nretained source physics';
  const subject = candidate + '\n' + newPool;
  const birth = alignRollerBirthBaseline(base, subject);
  const pool = alignProjectilePoolBaseline(birth.source, subject);
  assert.equal(pool.source, birth.source.replace(oldPool, newPool));
  assert.equal(pool.changes.length, 1);
  assert.ok(pool.source.endsWith('retained source physics'));
  assert.ok(!pool.source.includes('unrelated candidate code'));
  assert.ok(pool.source.includes('p.pos.y+=vertical ? baseHeight+offset*perGlobHeight : baseHeight+perGlobHeight;'));
  assert.deepEqual(alignProjectilePoolBaseline(pool.source, subject), { source: pool.source, changes: [] });
  for (const raw of [base.replace(oldPool, ''), base + oldPool, base.replace(oldPool, oldPool.replace('null', '0'))])
    assert.throws(() => alignProjectilePoolBaseline(raw, subject));
  for (const raw of [subject.replace(newPool, oldPool), subject + newPool, subject.replace('fidelitySloshIndex=null', 'fidelitySloshIndex=0')])
    assert.throws(() => alignProjectilePoolBaseline(base, raw));
});
