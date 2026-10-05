// #579 map input ownership: the Turf Map keeps steering its own cursor/state,
// the gameplay camera output stays frozen while the map is up, and neither the
// gamepad, keyboard nor touch map paths change behaviour.
//
// The fix only advances the gameplay look filter (padLook / edgeT) without
// applying it, so these cases also prove no map-cursor stick input leaks into
// rig.yaw / rig.pitch and that no intent, movement or super-jump path is
// touched. Patched and unpatched runs are compared side by side.
import assert from 'node:assert/strict';
import test from 'node:test';
import { NEUTRAL, pad, saturated } from './map-look-fixture.mjs';

const HZ = 60;
const frames = async (h, n) => { for (let i = 0; i < n; i++) h.frame(1 / HZ); };

// Minimal MobileInput stand-in for player.js: touch map open, gyro off, no motion.
const touchStub = (over = {}) => ({
  active: true, root: {}, mapOpen: true, moveX: 0, moveY: 0, lookDX: 0, lookDY: 0,
  gyro: { enabled: false }, down: () => false, wasPressed: () => false,
  consumeJumpTarget: () => -1, ...over,
});

test('the Turf Map owns the right stick: the gameplay camera stays frozen while the map is open', async () => {
  const h = await saturated(true, HZ, 1);
  h.openMap();
  const yaw0 = h.rig.yaw, pitch0 = h.rig.pitch;
  await frames(h, 2 * HZ);
  assert.equal(h.rig.yaw, yaw0, 'map-cursor stick input must not move the gameplay camera');
  assert.equal(h.rig.pitch, pitch0, 'map-cursor stick input must not move the gameplay pitch');
  assert.ok(h.controller.padLook.x > 0.9, 'the gameplay filter must still track the live held stick');
  h.closeMap();
  const start = h.rig.yaw;
  h.frame(1 / HZ);
  assert.notEqual(h.rig.yaw, start, 'the camera must resume from the current stick');
});

test('keyboard map (KeyM) freezes the camera, clears the filter and releases with zero residual', async () => {
  const h = await saturated(true, HZ, 1);
  h.setPads(pad(NEUTRAL));
  h.input.keys.add('KeyM');
  const yaw0 = h.rig.yaw;
  await frames(h, HZ);
  assert.equal(h.controller.mapHeld, true, 'the native keyboard map latch must still engage');
  assert.equal(h.rig.yaw, yaw0, 'the camera must be frozen while the keyboard map is held');
  assert.equal(h.controller.padLook.x, 0, 'the filter must read the neutral stick during the map');
  h.input.keys.delete('KeyM');
  const before = h.rig.yaw;
  await frames(h, 30);
  assert.equal(h.rig.yaw, before, 'releasing the keyboard map must apply zero residual');
});

test('touch map (touch.mapOpen) freezes the camera, clears the filter and closes with zero residual', async () => {
  const h = await saturated(true, HZ, 1);
  h.input.mobile = touchStub();
  const yaw0 = h.rig.yaw, pitch0 = h.rig.pitch;
  await frames(h, HZ);
  assert.equal(h.rig.yaw, yaw0, 'the camera must be frozen while the touch map is open');
  assert.equal(h.rig.pitch, pitch0, 'the pitch must be frozen while the touch map is open');
  assert.ok(h.controller.padLook.x > 0.9, 'the filter must track the live held stick during the touch map');
  h.setPads(pad(NEUTRAL));
  await frames(h, HZ);
  // The stick centred after the map opened, so the low-pass decays towards zero
  // instead of sitting exactly on it: after one second the remainder is ~1e-26,
  // far below the ~1e-14 resolution of rig.yaw, so no displacement can result.
  assert.ok(Math.abs(h.controller.padLook.x) < 1e-20, 'the filter must read the neutral stick during the touch map');
  h.input.mobile = touchStub({ mapOpen: false });
  const before = h.rig.yaw;
  await frames(h, 30);
  assert.equal(h.rig.yaw, before, 'closing the touch map must apply zero residual');
});

test('map intent, movement and camera are identical with and without adaptMapLook', async () => {
  const run = async (patched) => {
    const h = await saturated(patched, HZ, 1);
    // Touch map open, left stick + touch move feeding movement, right stick saturated,
    // mouse fire held: everything the map must own or suppress, all at once.
    h.input.mobile = touchStub({ moveX: 0.4, moveY: -0.2 });
    h.setPads(pad([-0.75, 0.5, 1, 0]));
    h.input.mouse.left = true;
    h.openMap();
    await frames(h, 30);
    const it = h.actor.intent;
    return {
      move: [it.move.x, it.move.y, it.move.z],
      fire: it.fire, sub: it.sub, jump: it.jump, squid: it.squid,
      special: it.special, jumpPressed: it.jumpPressed,
      mapHeld: h.controller.mapHeld, yaw: h.rig.yaw, pitch: h.rig.pitch,
    };
  };
  const before = await run(false);
  const after = await run(true);
  assert.deepEqual(after, before, 'adaptMapLook must change nothing but the camera filter internals');
  assert.equal(before.fire, false, 'the map must keep suppressing fire');
  assert.equal(before.sub, false, 'the map must keep suppressing sub weapons');
  assert.equal(before.mapHeld, true, 'the map latch must still engage');
  assert.notDeepEqual(before.move, [0, 0, 0], 'movement/cursor input must still flow while the map is open');
});

for (const patched of [false, true]) {
  test(`gamepad map super-jump cursor still picks a beacon (patched=${patched})`, async () => {
    const h = await saturated(patched, HZ, 1);
    h.actor.canSuperJump = () => true;
    const ally = h.make('shooter');
    ally.team = h.actor.team; ally.alive = true; ally.superJumpState = null;
    h.G.actors.push(ally);
    const jumps = [];
    h.actor.superJump = (target) => jumps.push(target);
    // mapHeld tracks the held map inputs (not rig.mapK): hold the pad map button,
    // then press the d-pad beacon pick while the map stays open.
    h.setPads(pad(NEUTRAL, [8]));
    h.frame(1 / HZ);
    assert.equal(h.controller.mapHeld, true, 'the pad map latch must engage');
    h.setPads(pad(NEUTRAL, [8, 14])); // d-pad beacon pick edge
    h.frame(1 / HZ);
    assert.equal(jumps.length, 1, 'the gamepad beacon pick must fire exactly once while the map is open');
    assert.equal(jumps[0], ally, 'it must jump to the first ally beacon');
    assert.equal(h.actor.intent.fire, false, 'the map must keep suppressing fire during the pick');
  });
}
