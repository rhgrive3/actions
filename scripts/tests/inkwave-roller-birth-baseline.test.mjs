import test from 'node:test';
import assert from 'node:assert/strict';
import { alignRollerBirthBaseline, assertUnchangedRollerSource } from '../lib/inkwave-roller-birth-baseline.mjs';

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
