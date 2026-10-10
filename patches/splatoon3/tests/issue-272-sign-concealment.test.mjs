import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const ROOT = new URL('../../../', import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, ROOT), 'utf8');
const { superJumpSignHiddenFrom, jumpMarkerSnapshot } = await import('../issue-460-marker.mjs');
const { adaptIssue460Source } = await import('../issue-460-adapter.mjs');

const stealth = (team) => ({ team, s3: { modifiers: { stealthJump: true } } });
const plain = (team) => ({ team, s3: { modifiers: { stealthJump: false } } });

test('#272 Stealth Jump hides the super-jump sign from the opposing team only', () => {
  const jumper = stealth(0);
  assert.equal(superJumpSignHiddenFrom(jumper, { team: 1 }), true);
  assert.equal(superJumpSignHiddenFrom(jumper, { team: 0 }), false, 'teammate keeps the sign');
  assert.equal(superJumpSignHiddenFrom(jumper, jumper), false, 'jumper keeps their own sign');
});

test('#272 without Stealth Jump the sign is never concealed', () => {
  assert.equal(superJumpSignHiddenFrom(plain(0), { team: 1 }), false);
  assert.equal(superJumpSignHiddenFrom({ team: 0 }, { team: 1 }), false);
  assert.equal(superJumpSignHiddenFrom(null, { team: 1 }), false);
});

test('#272 with no known local viewer the sign is treated as hidden (conservative)', () => {
  assert.equal(superJumpSignHiddenFrom(stealth(0), null), true);
  assert.equal(superJumpSignHiddenFrom(stealth(0), undefined), true);
});

test('#272 concealed marker snapshot exposes no countdown or label', () => {
  const hidden = jumpMarkerSnapshot({ progress: 0.5, dur: 2.3, jumper: 'x', concealed: superJumpSignHiddenFrom(stealth(0), { team: 1 }) });
  assert.equal(hidden.concealed, true);
  const shown = jumpMarkerSnapshot({ progress: 0.5, dur: 2.3, jumper: 'x', concealed: superJumpSignHiddenFrom(stealth(0), { team: 0 }) });
  assert.equal(shown.concealed, false);
});

test('#272 owner-side adapter guards the landing ring and passes concealment to the gauge', () => {
  const actor = adaptIssue460Source('src/game/actor.js', read('inkwave-public/src/game/actor.js'));
  assert.ok(actor.includes('if (!superJumpSignHiddenFrom(this, G.local)) G.fx?.ring('), 'landing ring must be guarded');
  assert.ok(actor.includes('concealed: superJumpSignHiddenFrom(this, G.local) }'), 'gauge must receive concealment');
  assert.equal(actor.includes('s.marker = 0; G.fx?.ring('), false, 'unguarded owner ring must not remain in the owner flight path');
});
