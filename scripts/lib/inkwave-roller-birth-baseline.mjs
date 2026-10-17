import assert from 'node:assert/strict';

// The render comparator requires identical physics. PR #1512 intentionally
// changes two birth expressions; replay exactly those expressions in the
// main reference before building it, leaving every other instruction intact.
// This is an INKWAVE regression reference, not Nintendo implementation proof.
const lateralBefore = 'const side=fan*(unit.SpawnPositionWidth||0),j=unit.SpawnPositionRandomCube||0;';
const lateralAfter = 'const side=fan*(unit.SpawnPositionWidth||0)*0.5,j=unit.SpawnPositionRandomCube||0;';
const verticalBefore = 'p.pos.y+=(unit.SpawnPositionOffsetHeight||0)+(unit.SpawnPositionHeight||0);';
const verticalAfter = 'const baseHeight=unit.SpawnPositionOffsetHeight||0;\n  const perGlobHeight=unit.SpawnPositionHeight||0;\n  p.pos.y+=vertical ? baseHeight+offset*perGlobHeight : baseHeight+perGlobHeight;';
const verticalLegacyReference = 'p.pos.y+=(unit.SpawnPositionOffsetHeight||0)+(vertical?offset:1)*(unit.SpawnPositionHeight||0);';
// PR #1512 8f2c1a840: keep the reviewed expression byte-identical to the
// candidate, without copying a candidate file or changing other physics.
// The earlier compact reference is accepted only as a known migration input.
const verticalReference = verticalAfter;

const count = (source, text) => source.split(text).length - 1;
export function alignRollerBirthBaseline(baseline, candidate) {
  assert.equal(count(candidate, lateralAfter), 1, 'candidate must contain the reviewed horizontal total-width rule exactly once');
  assert.equal(count(candidate, verticalAfter), 1, 'candidate must contain the reviewed indexed-height rule exactly once');
  assert.equal(count(candidate, lateralBefore) + count(candidate, verticalBefore) + count(candidate, verticalLegacyReference), 0, 'candidate contains no legacy birth rule');
  let source = baseline;
  const changes = [];
  for (const [name, before, after, replacement] of [
    ['horizontal-total-width', lateralBefore, lateralAfter, lateralAfter],
    ['vertical-indexed-height', verticalBefore, verticalAfter, verticalReference],
  ]) {
    const oldCount = count(source, before);
    const newCount = count(source, after);
    const legacyCount = name === 'vertical-indexed-height' ? count(source, verticalLegacyReference) : 0;
    assert.equal(oldCount + newCount + legacyCount, 1, `baseline has one known ${name} rule; unknown or duplicate code cannot be admitted`);
    if (oldCount || legacyCount) {
      const replaced = legacyCount ? verticalLegacyReference : before;
      source = source.replace(replaced, replacement);
      changes.push({ name, before: replaced, after: replacement });
    }
  }
  return { source, changes };
}

export function assertUnchangedRollerSource(beforeProfile, afterProfile) {
  const before = beforeProfile.weaponsFidelityCompletion?.weapons?.roller;
  const after = afterProfile.weaponsFidelityCompletion?.weapons?.roller;
  assert.ok(before?.WideSwingUnitGroupParam && before?.VerticalSwingUnitGroupParam, 'baseline has pinned roller source groups');
  assert.deepEqual(after, before, 'the render reference adjustment does not admit changes to source roller parameters');
}

// Pool identity is independent of the reviewed Roller birth expressions. The
// native allocator must not expose a stale Slosher index on a reused Roller.
const poolBefore = 'p.fidelitySloshUnit=null;p.fidelitySloshDownward=null;';
const poolAfter = 'p.fidelitySloshUnit=null;p.fidelitySloshIndex=null;p.fidelitySloshDownward=null;';
export function alignProjectilePoolBaseline(baseline, candidate) {
  assert.equal(count(candidate, poolAfter), 1, 'candidate contains the reviewed native pool initializer exactly once');
  assert.equal(count(candidate, poolBefore), 0, 'candidate contains no legacy pool initializer');
  const oldCount = count(baseline, poolBefore), newCount = count(baseline, poolAfter);
  assert.equal(oldCount + newCount, 1, 'baseline has one known pool initializer; unknown or duplicate code cannot be admitted');
  return oldCount
    ? { source: baseline.replace(poolBefore, poolAfter), changes: [{ name: 'native-pool-slosher-index-reset', before: poolBefore, after: poolAfter }] }
    : { source: baseline, changes: [] };
}
