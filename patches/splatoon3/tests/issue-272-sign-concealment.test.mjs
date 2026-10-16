import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const ROOT = new URL('../../../', import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, ROOT), 'utf8');
const { superJumpSignHiddenFrom, superJumpSignOpacityFor, jumpMarkerSnapshot, STEALTH_JUMP_SIGN_FULL_DISTANCE, STEALTH_JUMP_SIGN_VISIBLE_DISTANCE } = await import('../issue-460-marker.mjs');
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
  assert.ok(actor.includes('concealed: superJumpSignHiddenFrom(this, G.local), opacity:'), 'gauge must receive concealment');
  assert.equal(actor.includes('s.marker = 0; G.fx?.ring('), false, 'unguarded owner ring must not remain in the owner flight path');
});

const at = (x, y, z) => ({ x, y, z });
test('#272 Nintendo: only FAR opponents lose the sign; an opponent near the landing point still sees it', () => {
  assert.equal(STEALTH_JUMP_SIGN_FULL_DISTANCE, 2.5);
  assert.equal(STEALTH_JUMP_SIGN_VISIBLE_DISTANCE, 5);
  const landing = at(10, 2, -4);
  const jumper = { ...stealth(0), superJumpState: { phase: 'flight', to: landing } };
  const enemy = p => ({ team: 1, pos: p });
  assert.equal(superJumpSignHiddenFrom(jumper, enemy(at(10, 2, -4))), false, 'standing on the landing point');
  assert.equal(superJumpSignHiddenFrom(jumper, enemy(at(13, 2, 0))), true, 'one test line away is the fully faded edge');
  assert.equal(superJumpSignHiddenFrom(jumper, enemy(at(10, 2, 0.9))), false, 'inside the fade band');
  assert.equal(superJumpSignHiddenFrom(jumper, enemy(at(10, 7.01, -4))), true, 'spherical: far above is far');
  assert.equal(superJumpSignHiddenFrom(jumper, enemy(at(30, 2, -4))), true, 'far opponent');
  // Explicit remote landing point overrides the (absent) remote flight state.
  assert.equal(superJumpSignHiddenFrom(stealth(0), enemy(at(0, 0, 1)), at(0, 0, 0)), false);
  assert.equal(superJumpSignHiddenFrom(stealth(0), enemy(at(0, 0, 9)), at(0, 0, 0)), true);
  assert.equal(superJumpSignHiddenFrom(stealth(0), enemy(at(0, 0, 4.9)), at(0, 0, 0)), false);
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
  assert.ok(net.includes('concealed: superJumpSignHiddenFrom(a, G.local, n.sjTo), opacity:'), 'remote gauge must receive concealment');
  assert.equal(net.includes('n.sjRing = 0; G.fx?.ring('), false, 'unguarded remote ring must not remain');
});

test('#272 the sign fades linearly from 2.5 to 5 units for opponents and stays opaque for allies', async () => {
  const o = (d, team = 1) => superJumpSignOpacityFor(stealth(0), { team, pos: at(d, 0, 0) }, at(0, 0, 0));
  assert.equal(o(0), 1); assert.equal(o(2.5), 1);
  assert.ok(Math.abs(o(3.75) - 0.5) < 1e-12); assert.ok(Math.abs(o(4.5) - 0.2) < 1e-12);
  assert.equal(o(5), 0); assert.equal(o(30), 0);
  assert.equal(o(30, 0), 1, 'teammate');
  assert.equal(superJumpSignOpacityFor(plain(0), { team: 1, pos: at(30, 0, 0) }, at(0, 0, 0)), 1, 'no Stealth Jump');
  const half = jumpMarkerSnapshot({ progress: 0.25, dur: 2, jumper: 'x', opacity: o(3.75) });
  assert.equal(half.concealed, false); assert.ok(Math.abs(half.opacity - 0.5) < 1e-12); assert.equal(half.label, 'x');
  const gone = jumpMarkerSnapshot({ progress: 0.25, dur: 2, jumper: 'x', opacity: o(6) });
  assert.equal(gone.concealed, true); assert.equal(gone.countdown, 0); assert.equal(gone.label, '');
  assert.equal(jumpMarkerSnapshot({ progress: 0.25, dur: 2, jumper: 'x' }).opacity, 1, 'default is opaque');
  // The gauge scales arc, track and label alpha by the snapshot opacity.
  const THREE = await import(new URL('../../../inkwave-public/vendor/three/build/three.module.js', import.meta.url));
  const { createArrivalGauge } = await import('../issue-460-gauge.mjs');
  const gauge = createArrivalGauge({ THREE, doc: null });
  assert.equal(gauge.update(half, 0xff0000), true);
  assert.ok(Math.abs(gauge.arc.material.uniforms.uAlpha.value - 0.475) < 1e-12);
  assert.ok(Math.abs(gauge.track.material.opacity - 0.11) < 1e-12);
  assert.equal(gauge.update(jumpMarkerSnapshot({ progress: 0.25, dur: 2 }), 0xff0000), true);
  assert.ok(Math.abs(gauge.arc.material.uniforms.uAlpha.value - 0.95) < 1e-12);
  assert.equal(gauge.update(gone, 0xff0000), false); assert.equal(gauge.group.visible, false);
  gauge.dispose();
});

test('#272 owner and remote landing rings carry the fade alpha', () => {
  const actor = adaptIssue460Source('src/game/actor.js', read('inkwave-public/src/game/actor.js'));
  const net = adaptIssue460Source('src/net/netmatch.js', read('inkwave-public/src/net/netmatch.js'));
  assert.ok(actor.includes('{ radius: 1.6, life: 0.5, alpha: 0.95 * superJumpSignOpacityFor(this, G.local) }'));
  assert.ok(actor.includes('opacity: superJumpSignOpacityFor(this, G.local) }'));
  assert.ok(net.includes('{ radius: 1.6, life: 0.5, alpha: 0.95 * superJumpSignOpacityFor(a, G.local, n.sjTo) }'));
  assert.ok(net.includes('opacity: superJumpSignOpacityFor(a, G.local, n.sjTo) }'));
});
