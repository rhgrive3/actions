import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { realCharacter } from './real-character-fixture.mjs';
import { installMovementMotion, movementMotionSnapshot } from '../runtime/movement-motion.mjs';
import { FixedClock } from '../runtime/clock.mjs';

const close = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
test('native Actor cancellation does not allocate an untouched Character and disposal stays terminal', async () => {
  const f = await fixture(), api = await realCharacter();
  installMovementMotion({ ...api, Actor: f.Actor }, f.profile);
  const a = f.make(), ch = new api.Character({ weapon: 'shooter', style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  a.character = ch;
  assert.equal(movementMotionSnapshot(ch), null);
  a.reset(); assert.equal(movementMotionSnapshot(ch), null, 'reset cannot invent visual state');
  ch.trigger('squidroll'); ch.update(1 / 60, { form: 'squid', grounded: false });
  assert.equal(movementMotionSnapshot(ch).phase, 'roll');
  ch.dispose(); assert.equal(movementMotionSnapshot(ch), null);
  a.reset(); ch.trigger('squidroll'); ch.update(1 / 60, { form: 'squid' });
  assert.equal(movementMotionSnapshot(ch), null, 'terminal owner is never resurrected');
  ch.dispose();
});
async function rig(hz = 60, weapon = 'shooter') {
  const f = await fixture(), api = await realCharacter();
  installMovementMotion({ ...api, Actor: f.Actor }, f.profile);
  const a = f.make(weapon);
  a.character = new api.Character({ name: 'movement trajectory', weapon, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  a.character.onEvent = null;
  delete a._finishFrame; // actual Actor frame must reach actual Character.update
  const ch = a.character, dt = 1 / hz;
  for (let i = 0; i < hz * 2; i++) ch.update(dt, { form: 'kid', grounded: true, speed: 0, localMove: { x: 0, z: 0 } });
  const draw = () => { a._finishFrame(dt); ch.root.updateMatrixWorld(true); };
  const step = () => { f.G.time += dt; a.update(dt); ch.root.updateMatrixWorld(true); };
  return { f, api, a, ch, dt, draw, step };
}
function squid(r, form = 'swim') {
  const { a, ch, dt } = r;
  a.form = 'squid'; a.intent.squid = true; a.groundTeam = form === 'swim' ? 1 : 0;
  a.submerged = form === 'swim'; a.climbing = form === 'climb';
  a.grounded = form !== 'climb'; a.anim.wallNormal.set(0, 0, 1); a.wallN.set(0, 0, 1);
  for (let i = 0; i < Math.ceil(.5 / dt); i++) r.draw();
  assert.equal(ch.squidRoot.visible, true); assert.equal(ch.kid.visible, false);
}
function frame(ch) {
  return { q: ch.squid.pivot.quaternion.clone(), scale: ch.squid.pivot.scale.clone(),
    root: ch.root.position.clone(), yaw: ch.root.rotation.y,
    head: ch.bones.head.getWorldPosition(ch.root.position.clone()),
    hip: ch.bones.hips.position.clone(), feet: [ch.bones.footL, ch.bones.footR].map(b => b.getWorldPosition(ch.root.position.clone())) };
}

test('real Actor reversal produces a visible full squid rotation then releases it at 30/60/120Hz', async () => {
  const samples = [];
  for (const hz of [30, 60, 120]) {
    const r = await rig(hz); const { a, ch, f, dt } = r;
    try {
      squid(r); a.vel.set(0, 0, 11.52); a.intent.move.set(0, 0, -1); a.intent.jump = true;
      r.step(); assert.ok(a.s3.roll, 'real beforeActions launches the roll');
      assert.equal(movementMotionSnapshot(ch).phase, 'roll');
      a.intent.jump = false;
      let total = 0, maxChange = 0, last = ch.squid.pivot.quaternion.clone();
      const history = [];
      while (a.s3.roll) {
        assert.ok(history.length < hz * 2, 'roll must complete');
        a.pos.addScaledVector(a.vel, dt); r.step();
        const row = frame(ch), motion = movementMotionSnapshot(ch);
        const turn = row.q.angleTo(last); total += turn; maxChange = Math.max(maxChange, turn); last.copy(row.q);
        history.push({ time: history.length * dt, spin: motion.spin, position: row.root.toArray(), quaternion: row.q.toArray(), scale: row.scale.toArray() });
      }
      assert.ok(total > Math.PI * 1.5, `full rig must rotate, not just emit (${total})`);
      assert.ok(maxChange < 1.5, 'no single-tick half-turn snap');
      assert.equal(movementMotionSnapshot(ch).phase, null);
      close(ch.squid.pivot.quaternion.angleTo(ch.sqQuat), 0, 1e-7);
      a.grounded = true; a.vel.set(0, 0, 0); a.intent.move.set(0, 0, 0); r.draw();
      assert.equal(movementMotionSnapshot(ch).phase, null);
      close(a.pos.distanceTo(ch.root.position), 0, 1e-8);
      samples.push({ hz, total, history });
    } finally { ch.dispose(); }
  }
  // All rates evaluate one time curve. These are engine regressions, not a
  // statement that this calibrated curve equals a Switch joint trajectory.
  const quarter = samples.map(s => s.history.find(row => row.spin >= Math.PI / 2)?.time);
  assert.ok(Math.max(...quarter) - Math.min(...quarter) <= 1 / 30 + 1e-9);
});

test('surge charge, partial burst, wall loss and top release reach the actual squid mesh', async () => {
  for (const hz of [30, 60, 120]) {
    const r = await rig(hz); const { a, ch, f, dt } = r;
    try {
      squid(r, 'climb');
      // Collision stubs keep this test's synthetic wall attached; all action
      // and Actor->Character timing code is the actual adapted implementation.
      a._updateClimb = () => {}; a.intent.jump = true;
      for (let i = 0; i < Math.round(.4 * hz); i++) r.step();
      assert.equal(movementMotionSnapshot(ch).phase, 'surge-charge');
      close(a.s3.surge.charge, .4 / f.profile.movement.surge.chargeTime);
      const chargeScale = ch.squid.pivot.scale.y;
      a.intent.jump = false; r.step();
      assert.equal(movementMotionSnapshot(ch).phase, 'surge-burst');
      assert.ok(ch.squid.pivot.scale.y > chargeScale * 1.1, 'release stretches the real mesh');
      assert.equal(a.s3.surge.armorTime, 0, 'partial charge does not claim full armor');
      a._ledgePop(new f.THREE.Vector3(0, 0, -1)); r.draw();
      assert.equal(movementMotionSnapshot(ch).phase, 'surge-top');
      const initial = ch.squid.pivot.quaternion.clone();
      for (let i = 0; i < Math.round(.1 * hz); i++) r.step();
      assert.ok(ch.squid.pivot.quaternion.angleTo(initial) > .7, 'top is a visible rotation, not a wall stretch');
      a.grounded = true; ch.trigger('land', 10); r.draw();
      assert.equal(movementMotionSnapshot(ch).phase, null);
      a.reset(); squid(r, 'climb'); a.intent.jump = true; r.step();
      delete a._updateClimb; a.grounded = false; r.step();
      assert.equal(a.climbing, false); assert.equal(a.s3.surge, null);
      assert.equal(movementMotionSnapshot(ch).phase, null, 'losing wall cancels the visible charge');
    } finally { ch.dispose(); }
  }
});

test('dry squid jump remains an ordinary airborne squid instead of a roll', async () => {
  const r = await rig(), { a, ch, f } = r;
  try {
    squid(r, 'squid'); f.G.paint.sample = () => 0;
    a.vel.set(0, 0, 11.52); a.intent.move.set(0, 0, -1); a.intent.jump = true;
    r.step(); assert.equal(a.s3.roll, null); assert.equal(a.grounded, false);
    assert.equal(movementMotionSnapshot(ch).phase, null);
    assert.equal(ch.squidRoot.visible, true); assert.equal(ch.kid.visible, false);
    const root = ch.root.position.clone(); r.draw(); assert.ok(ch.root.position.equals(root));
  } finally { ch.dispose(); }
});

test('standalone burst previews expire and Super Jump preparation follows the live gear duration', async () => {
  const r = await rig(), { a, ch, f, dt } = r;
  try {
    const wall = { form: 'climb', grounded: false, speed: 0, vy: 0, wallNormal: new r.api.THREE.Vector3(0, 0, 1) };
    ch.trigger('squidsurge', { charge: 1, duration: .1 });
    ch.update(dt, wall); assert.equal(movementMotionSnapshot(ch).phase, 'surge-burst');
    for (let i = 1; i < 6; i++) ch.update(dt, wall);
    assert.equal(movementMotionSnapshot(ch).phase, null, 'preview cannot retain an expired wall stretch');
    close(ch.squid.pivot.quaternion.angleTo(ch.sqQuat), 0, 1e-7);
    ch.update(dt, null); assert.equal(ch.form, 'kid', 'nullable public preview input is still accepted');
    squid(r, 'squid'); a._probeGround = () => { a.grounded = true; };
    a.s3.jumpChargeTime = f.profile.superJump.chargeTime / 2;
    a.superJump(new f.THREE.Vector3(0, 0, 8));
    for (let i = 0; i < 24; i++) r.step();
    assert.equal(movementMotionSnapshot(ch).phase, 'superjump-charge');
    close(movementMotionSnapshot(ch).charge, .6);
    for (let i = 24; i < 40; i++) r.step();
    assert.equal(a.superJumpState.phase, 'flight'); assert.equal(movementMotionSnapshot(ch).phase, 'superjump-flight');
  } finally { ch.dispose(); }
});

test('super jump charge is distinct from idle and flight is actually airborne before kid landing', async () => {
  for (const hz of [30, 60, 120]) {
    const r = await rig(hz); const { a, ch, f, dt } = r;
    try {
      squid(r, 'squid'); const idleY = ch.squid.pivot.scale.y;
      a._probeGround = () => { a.grounded = true; };
      a._resolve = () => { a._onLand(false); a.grounded = true; };
      a.superJump(new f.THREE.Vector3(0, 0, 16));
      const order = [];
      while (a.superJumpState?.phase === 'charge') {
        assert.ok(order.length < hz * 3, 'preparation must complete');
        r.step(); order.push(movementMotionSnapshot(ch).phase);
        if (a.superJumpState?.phase === 'charge' && a.superJumpState.t > 1) assert.ok(ch.squid.pivot.scale.y < idleY * .94, 'visible preparation compresses the real squid');
      }
      assert.equal(a.superJumpState.phase, 'flight'); assert.equal(a.grounded, false);
      assert.equal(ch.grounded, false, 'full Actor finish cannot select dry idle for flight');
      assert.equal(movementMotionSnapshot(ch).phase, 'superjump-flight');
      const p0 = ch.root.position.clone();
      for (let i = 0; i < Math.round(.5 * hz); i++) r.step();
      assert.ok(ch.root.position.y > p0.y + 2, 'actual trajectory rises');
      const direction = new r.api.THREE.Vector3(0, 1, 0).applyQuaternion(ch.squid.pivot.getWorldQuaternion(new r.api.THREE.Quaternion()));
      assert.ok(direction.dot(a.vel.clone().normalize()) > .75, 'mantle follows actual flight velocity');
      for (let i = 0; a.superJumpState && a.superJumpState.t / a.superJumpState.dur < .88; i++) {
        assert.ok(i < hz * 4, 'flight must reach emergence'); r.step();
      }
      assert.equal(a.form, 'kid'); assert.equal(movementMotionSnapshot(ch).phase, null);
      assert.equal(ch.kid.visible, true);
      // Finish the real flight. The synthetic destination's collision supplies
      // support, while native _onLand drives bones through the actual frame.
      for (let i = 0; a.superJumpState; i++) { assert.ok(i < hz * 3, 'flight must land'); r.step(); }
      assert.equal(a.grounded, true); assert.equal(a.invuln, 0);
      const root0 = ch.root.position.clone(), heights = [], scales = [];
      for (let i = 0; i < Math.round(.4 * hz); i++) { r.draw(); heights.push(ch.bones.hips.position.y); scales.push(ch.kid.scale.y); }
      assert.ok(Math.max(...heights) - Math.min(...heights) > .005 && Math.min(...scales) < .99,
        `real landing rig absorbs then recovers (${JSON.stringify({ heights, scales })})`);
      assert.ok(ch.root.position.equals(root0), 'pose leaves camera-followed root fixed');
      assert.ok(order.includes('superjump-charge'));
    } finally { ch.dispose(); }
  }
});

test('wall charge takes over a live roll, full charge releases, and wall roll takes over surge', async () => {
  for (const hz of [30, 60, 120]) {
    const r = await rig(hz), { a, ch, f, dt } = r;
    try {
      squid(r, 'climb'); a._updateClimb = () => {};
      a.s3.actions = { roll: { time: .25, armorTime: .12, armorHP: 100 }, surge: null, chainTimer: 0 };
      ch.trigger('squidroll'); a.intent.jump = true; a.intent.move.set(0, 0, -1);
      r.step(); assert.ok(a.s3.roll.armorTime > 0, 'pose change preserves the existing gameplay armor clock');
      assert.equal(movementMotionSnapshot(ch).phase, 'surge-charge', 'charge must replace a still-live roll');
      for (let i = 1; i < Math.ceil(f.profile.movement.surge.chargeTime * hz); i++) r.step();
      close(a.s3.surge.charge, 1); close(movementMotionSnapshot(ch).charge, 1);
      a.intent.jump = false; r.step();
      assert.ok(a.s3.surge.armorTime > 0); assert.equal(movementMotionSnapshot(ch).phase, 'surge-burst');
      a.intent.move.set(0, 0, 1); a.intent.jump = true; r.step();
      assert.ok(a.s3.roll); assert.equal(a.s3.surge, null);
      assert.equal(movementMotionSnapshot(ch).phase, 'roll');
      a.reset(); r.draw(); assert.equal(movementMotionSnapshot(ch).phase, null);
    } finally { ch.dispose(); }
  }
});

test('form change, death, reset, special and super jump clear offsets including hidden bodies', async () => {
  const r = await rig(), { a, ch, f } = r;
  try {
    for (const ending of ['form', 'death', 'reset', 'special', 'superjump', 'hidden']) {
      a.reset(); ch.setVisible(true); squid(r); a.grounded = false;
      a.s3.actions = { roll: { time: .25 }, surge: null }; ch.trigger('squidroll', { duration: .25 });
      for (let i = 0; i < 6; i++) r.draw();
      assert.ok(movementMotionSnapshot(ch).spin > .7);
      if (ending === 'form') a.form = 'kid';
      if (ending === 'death') a.splat(null, 'motion test');
      if (ending === 'reset') a.reset();
      if (ending === 'special') { a.specialActive = { phase: 'test' }; a.s3.actions.roll = null; }
      if (ending === 'superjump') a.superJump(new f.THREE.Vector3(0, 0, 8));
      if (ending === 'hidden') { ch.setVisible(false); a.s3.actions.roll = null; }
      r.draw();
      assert.notEqual(movementMotionSnapshot(ch).phase, 'roll', ending);
      close(ch.squid.pivot.quaternion.angleTo(ch.sqQuat), 0, 1e-7);
      a.reset(); ch.setVisible(true); a.form = 'kid'; a.grounded = true;
      for (let i = 0; i < 60; i++) r.draw();
      assert.equal(movementMotionSnapshot(ch).phase, null, 'no old action reappears: ' + ending);
      assert.equal(ch.kid.visible, true); assert.equal(ch.squidRoot.visible, false);
    }
  } finally { ch.dispose(); }
});

test('ordinary transform, jump and walk/roller rig paths still run and return to planted feet', async () => {
  for (const hz of [30, 60, 120]) for (const weapon of ['shooter', 'roller']) {
    const r = await rig(hz, weapon), { a, ch, api, dt } = r;
    try {
      const start = frame(ch);
      a.form = 'squid'; a.submerged = true; r.draw();
      assert.ok(ch.kidSY < 1, 'native dive has real compression');
      for (let i = 0; i < Math.round(.5 * hz); i++) r.draw();
      assert.equal(ch.squidRoot.visible, true); assert.equal(ch.kid.visible, false);
      a.form = 'kid'; a.submerged = false;
      for (let i = 0; i < Math.round(.5 * hz); i++) r.draw();
      assert.equal(ch.kid.visible, true); assert.equal(ch.squidRoot.visible, false);
      close(ch.kidSY, 1); close(ch.kidSXZ, 1);
      a.grounded = false; a.vel.set(0, 7, 2); ch.trigger('jump');
      for (let i = 0; i < Math.round(.15 * hz); i++) { a.pos.addScaledVector(a.vel, dt); r.draw(); }
      assert.ok(frame(ch).feet.some((p, i) => p.distanceTo(start.feet[i]) > .08), 'real leg IK responds to jump');
      a.vel.set(0, -8, 0); a._onLand(false); a.grounded = true;
      for (let i = 0; i < hz * 2; i++) r.draw();
      assert.ok(ch.feet.every(f => f.planted), 'landing leaves stable contacts');
      a.vel.set(0, 0, 3); a.intent.move.set(0, 0, 1);
      for (let i = 0; i < hz; i++) { a.pos.addScaledVector(a.vel, dt); r.draw(); }
      assert.equal(ch.moving, true, 'walk hook remains active');
      if (weapon === 'roller') {
        ch.s3RollerFlick = { vertical: true, elapsed: .22, windup: .35, interval: .9 }; ch.trigger('flick'); r.draw();
        assert.ok(Math.abs(ch.P[api.CHARACTER_CHANNELS.ANCR + 2]) > .3, 'existing upright roller IK still applies');
      }
      assert.equal(movementMotionSnapshot(ch).phase, null);
    } finally { ch.dispose(); }
  }
});

test('native collision and full in-world rig finish roll and landing identically under 30/60/120Hz rendering', async () => {
  let expected;
  for (const hz of [30, 60, 120]) {
    const r = await rig(), { a, ch, f, api } = r, V = f.THREE.Vector3;
    const center = new V(0, -.1, 0), half = new V(100, .1, 100);
    const floor = { id: 0, solid: true, center, half, axes: [new V(1, 0, 0), new V(0, 1, 0), new V(0, 0, 1)],
      faces: [-1, -1, 0, -1, -1, -1], aabbMin: center.clone().sub(half), aabbMax: center.clone().add(half) };
    const level = { blocks: [floor], faces: [{ origin: new V(-100, 0, -100), u: new V(1, 0, 0), v: new V(0, 0, 1) }],
      hasRails: false, groundHeight: () => 0, queryBlocks: (_x, _z, _xx, _zz, out) => { out.length = 0; out.push(0); return out; } };
    f.G.level = level; f.G.physics = new f.Physics(level); delete a._integrate;
    api.G.level = level; api.G.physics = f.G.physics; api.G.scene = new api.THREE.Scene(); api.G.scene.add(ch.root);
    try {
      f.G.physics.groundProbe(0, 0, 0, .4, .35, .24, a.ground, false);
      squid(r); a.vel.set(0, 0, 11.52);
      const clock = new FixedClock(), trajectory = []; let airborne = false, landed = false, maxRoll = 0;
      for (let i = 0; i < hz * 2; i++) clock.advance(1 / hz, () => {
        a.intent.move.set(0, 0, clock.ticks < 36 ? -1 : 0); a.intent.jump = clock.ticks === 0;
        r.step(); airborne ||= !a.grounded; landed ||= airborne && a.grounded;
        const motion = movementMotionSnapshot(ch); maxRoll = Math.max(maxRoll, motion.spin);
        const feet = frame(ch).feet;
        // Each Actor fixture is a separate VM realm. Compare numeric host
        // arrays so prototype identity cannot reject identical trajectories.
        trajectory.push({ actor: Array.from(a.pos.toArray()), velocity: Array.from(a.vel.toArray()), grounded: a.grounded,
          phase: motion.phase, pivot: Array.from(ch.squid.pivot.quaternion.toArray()), scale: Array.from(ch.squid.pivot.scale.toArray()), feet: feet.map(v => Array.from(v.toArray())) });
      });
      assert.equal(clock.ticks, 120); assert.equal(landed, true); assert.ok(maxRoll > Math.PI * 1.5);
      assert.equal(movementMotionSnapshot(ch).phase, null); close(a.pos.y, 0);
      close(ch.squid.pivot.quaternion.angleTo(ch.sqQuat), 0, 1e-7);
      if (expected) assert.deepEqual(trajectory, expected); else expected = trajectory;
    } finally { api.G.scene = null; api.G.physics = null; ch.dispose(); }
  }
});
