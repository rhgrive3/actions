import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const ROOT = new URL('../../../', import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, ROOT), 'utf8');
const { superJumpSignHiddenFrom, jumpMarkerSnapshot, STEALTH_JUMP_SIGN_VISIBLE_DISTANCE } = await import('../issue-460-marker.mjs');
const { adaptIssue460Source } = await import('../issue-460-adapter.mjs');

const stealth = (team) => ({ team, s3: { modifiers: { stealthJump: true } } });
const plain = (team) => ({ team, s3: { modifiers: { stealthJump: false } } });

test('#272 Stealth Jump hides the super-jump sign from the opposing team only (far field / unknown position)', () => {
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

const at = (x, y, z) => ({ x, y, z });
test('#272 Nintendo: only FAR opponents lose the sign; an opponent near the landing point still sees it', () => {
  assert.equal(STEALTH_JUMP_SIGN_VISIBLE_DISTANCE, 5);
  const landing = at(10, 2, -4);
  const jumper = { ...stealth(0), superJumpState: { phase: 'flight', to: landing } };
  const enemy = p => ({ team: 1, pos: p });
  assert.equal(superJumpSignHiddenFrom(jumper, enemy(at(10, 2, -4))), false, 'standing on the landing point');
  assert.equal(superJumpSignHiddenFrom(jumper, enemy(at(13, 2, 0))), false, 'exactly one test line away');
  assert.equal(superJumpSignHiddenFrom(jumper, enemy(at(10, 7.01, -4))), true, 'spherical: far above is far');
  assert.equal(superJumpSignHiddenFrom(jumper, enemy(at(30, 2, -4))), true, 'far opponent');
  // Explicit remote landing point overrides the (absent) remote flight state.
  assert.equal(superJumpSignHiddenFrom(stealth(0), enemy(at(0, 0, 1)), at(0, 0, 0)), false);
  assert.equal(superJumpSignHiddenFrom(stealth(0), enemy(at(0, 0, 9)), at(0, 0, 0)), true);
  // Unknown landing point or non-finite viewer stays conservative.
  assert.equal(superJumpSignHiddenFrom(stealth(0), enemy(at(0, 0, 0))), true);
  assert.equal(superJumpSignHiddenFrom(stealth(0), enemy(at(NaN, 0, 0)), at(0, 0, 0)), true);
  // Teammates keep the sign at any distance; without Stealth Jump nobody loses it.
  assert.equal(superJumpSignHiddenFrom(jumper, { team: 0, pos: at(90, 0, 90) }), false);
  assert.equal(superJumpSignHiddenFrom({ ...plain(0), superJumpState: { to: landing } }, enemy(at(90, 0, 90))), false);
});

test('#272 remote (replicated loadout) landing ring and gauge use the same distance concealment', () => {
  const net = adaptIssue460Source('src/net/netmatch.js', read('inkwave-public/src/net/netmatch.js'));
  assert.ok(net.includes('if (!superJumpSignHiddenFrom(a, G.local, n.sjTo)) G.fx?.ring('), 'remote ring must be guarded');
  assert.ok(net.includes('concealed: superJumpSignHiddenFrom(a, G.local, n.sjTo) }'), 'remote gauge must receive concealment');
  assert.equal(net.includes('n.sjRing = 0; G.fx?.ring('), false, 'unguarded remote ring must not remain');
});
