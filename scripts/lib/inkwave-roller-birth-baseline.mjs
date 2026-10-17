import assert from 'node:assert/strict';

// The render comparator requires identical physics. PR #1512 intentionally
// changes two birth expressions; replay exactly those expressions in the
// main reference before building it, leaving every other instruction intact.
// This is an INKWAVE regression reference, not Nintendo implementation proof.
const lateralBefore = 'const side=fan*(unit.SpawnPositionWidth||0),j=unit.SpawnPositionRandomCube||0;';
const lateralAfter = 'const side=fan*(unit.SpawnPositionWidth||0)*0.5,j=unit.SpawnPositionRandomCube||0;';
const verticalBefore = 'p.pos.y+=(unit.SpawnPositionOffsetHeight||0)+(unit.SpawnPositionHeight||0);';
const verticalAfter = 'const baseHeight=unit.SpawnPositionOffsetHeight||0;\n  const perGlobHeight=unit.SpawnPositionHeight||0;\n  p.pos.y+=vertical ? baseHeight+offset*perGlobHeight : baseHeight+perGlobHeight;';
// Copy no candidate file: only the reviewed expression is made byte-for-byte
// equivalent in the baseline. Algebraically similar code can differ at an
// exactly grazed 60 Hz contact because of floating point operation order.
const verticalReference = verticalAfter;

const count = (source, text) => source.split(text).length - 1;
export function alignRollerBirthBaseline(baseline, candidate) {
  assert.equal(count(candidate, lateralAfter), 1, 'candidate must contain the reviewed horizontal total-width rule exactly once');
  assert.equal(count(candidate, verticalAfter), 1, 'candidate must contain the reviewed indexed-height rule exactly once');
  assert.equal(count(candidate, lateralBefore) + count(candidate, verticalBefore), 0, 'candidate contains no legacy birth rule');
  let source = baseline;
  const changes = [];
  for (const [name, before, after, replacement] of [
    ['horizontal-total-width', lateralBefore, lateralAfter, lateralAfter],
    ['vertical-indexed-height', verticalBefore, verticalAfter, verticalReference],
  ]) {
    const oldCount = count(source, before), newCount = count(source, after);
    assert.equal(oldCount + newCount, 1, `baseline has one known ${name} rule; unknown or duplicate code cannot be admitted`);
    if (oldCount) {
      source = source.replace(before, replacement);
      changes.push({ name, before, after: replacement });
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
