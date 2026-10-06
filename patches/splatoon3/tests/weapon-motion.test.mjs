import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { realCharacter } from './real-character-fixture.mjs';
import { installWeaponMotion } from '../runtime/weapon-motion.mjs';

// Real Actor._finishFrame -> real complete Character -> actual skeleton and
// weapon geometry. Only scene collisions, audio and projectile hits are stubbed.
async function rig(kind, enabled = true) {
  const f = await fixture(), api = await realCharacter();
  installWeaponMotion({ ...api, WeaponRunner: f.WeaponRunner }, f.profile);
  const a = f.make(kind), ch = new api.Character({ name: 'weapon regression', weapon: kind,
    color: '#ff8a14', style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  a.character = ch; ch.actor = a; ch.onEvent = null; ch.s3WeaponMotionEnabled = enabled;
  a._finishFrame = f.Actor.prototype._finishFrame;
  f.G.actors = [a]; api.G.actors = [a];
  const launches = [];
  f.G.projectiles.fireSlosh = () => launches.push({ elapsed: ch.t, muzzle: ch.getMuzzle(new api.THREE.Vector3()).toArray() });
  f.G.projectiles.throwBomb = () => launches.push({ kind: 'bomb' });
  const step = (dt, input = {}) => {
    a.ink = 100; a.intent.fire = !!input.fire; a.intent.sub = !!input.sub;
    f.G.time += dt; a.weaponRunner.update(dt, input); a._finishFrame(dt);
    ch.root.updateMatrixWorld(true);
    assert.ok(Array.from(ch.P).every(Number.isFinite), 'actual pose stays finite');
    assert.ok(ch.getMuzzle(new api.THREE.Vector3()).toArray().every(Number.isFinite));
  };
  for (let i = 0; i < 90; i++) step(1 / 60);
  return { f, api, a, ch, step, launches };
}

test('stationary post-dodge fire retains actual low turret stance after movement lock expires', async () => {
  for (const hz of [30, 60, 120]) {
    const old = await rig('dualies', false), patched = await rig('dualies');
    try {
      for (const r of [old, patched]) {
        r.a.intent.fire = true; r.a.intent.move.set(1, 0, 0);
        assert.equal(r.a.weaponRunner.tryDodge(r.a.intent.move), true);
        r.a.intent.move.set(0, 0, 0);
        for (let i = 0; i < 2 * hz; i++) r.step(1 / hz, { fire: true });
        assert.equal(r.a.weaponRunner.lockT, 0);
        assert.equal(r.a.weaponRunner.s3Turret, true);
      }
      assert.ok(old.ch.lockW < .001, 'counterfactual upstream loses stance while runner remains in turret');
      assert.ok(patched.ch.lockW > .999, 'connected runner keeps both arms and bent-leg stance');
      assert.ok(patched.ch.bones.hips.position.y < old.ch.bones.hips.position.y - .025);
      assert.ok(patched.ch.stance[0] > old.ch.stance[0] + .02, 'actual feet remain wider');
      assert.equal(patched.a.weaponRunner.lockT, 0, 'visual view does not change gameplay lock');
      const x = patched.a.pos.clone();
      for (let i = 0; i < hz; i++) patched.step(1 / hz, { fire: false });
      assert.equal(patched.a.weaponRunner.s3Turret, false); assert.ok(patched.ch.lockW < .002);
      assert.ok(patched.a.pos.equals(x), 'animation does not move the actor');
      patched.a.intent.fire = true; patched.a.intent.move.set(1, 0, 0);
      assert.equal(patched.a.weaponRunner.tryDodge(patched.a.intent.move), true);
      patched.a.intent.move.set(0, 0, 0);
      for (let i = 0; i < hz; i++) patched.step(1 / hz, { fire: true });
      patched.a.intent.move.set(1, 0, 0); patched.a.vel.set(1.5, 0, 0);
      for (let i = 0; i < hz; i++) { patched.a.pos.x += 1.5 / hz; patched.step(1 / hz, { fire: true }); }
      assert.equal(patched.a.weaponRunner.s3Turret, false);
      assert.ok(patched.ch.lockW < .002 && patched.ch.moving, 'moving fire releases turret and resumes walking');
    } finally { old.ch.dispose(); patched.ch.dispose(); }
  }
});

test('Slosher heave follows real windup and completes recovery before the next actual throw', async () => {
  for (const hz of [30, 60, 120]) for (const airborne of [false, true]) {
    const old = await rig('slosher', false), r = await rig('slosher');
    try {
      for (const x of [old, r]) { x.a.grounded = !airborne; x.step(1 / hz, { fire: true }); }
      let heaveKicks = 0;
      const hairKick = r.ch._hairKick;
      r.ch._hairKick = function (...args) {
        if (args[0] === 0 && args[1] === 2.4 && args[2] === 1.6) heaveKicks++;
        return hairKick.apply(this, args);
      };
      const C = r.api.CHARACTER_CHANNELS;
      for (let i = 0; i < Math.round(.1 * hz); i++) { old.step(1 / hz); r.step(1 / hz); }
      assert.equal(r.launches.length, 0);
      assert.ok(Math.abs(r.ch.P[C.ANCR] - old.ch.P[C.ANCR]) > .08, 'old curve heaves early; retimed actual bucket remains in windup');
      let guard = hz;
      while (!r.launches.length && guard-- > 0) r.step(1 / hz);
      assert.equal(r.launches.length, 1);
      assert.equal(heaveKicks, 1, 'float release boundary must not apply heave hair/tank impulse twice');
      assert.ok(r.ch.weapon.off.getWorldPosition(new r.api.THREE.Vector3()).toArray().every(Number.isFinite));
      assert.equal(r.a.weaponRunner.slosh, -1);
      for (let i = 0; i < 1.5 * hz; i++) r.step(1 / hz, { fire: true });
      assert.ok(r.launches.length >= 3, 'hold input repeats through actual runner');
      r.a.weaponRunner.reset();
      for (let i = 0; i < hz / 3; i++) r.step(1 / hz);
      assert.equal(r.a.weaponRunner.slosh, -1);
      r.a.form = 'squid'; r.step(1 / hz); r.a.form = 'kid';
      for (let i = 0; i < hz / 2; i++) r.step(1 / hz);
      assert.equal(r.ch.kid.visible, true);
      const n = r.launches.length; r.step(1 / hz, { fire: true });
      for (let i = 0; i < hz / 3; i++) r.step(1 / hz);
      assert.equal(r.launches.length, n + 1, 'fresh throw works after reset and form return');
    } finally { old.ch.dispose(); r.ch.dispose(); }
  }
});

test('Charger holds its real charge through form return on a held ZR and releases into actual recoil/coil', async () => {
  for (const hz of [30, 60, 120]) {
    const r = await rig('charger');
    try {
      for (let i = 0; i < 2 * hz; i++) r.step(1 / hz, { fire: true });
      assert.equal(r.a.weaponRunner.charge, 1); assert.ok(r.ch.weapon.coil.userData.u.uCharge.value > .999);
      // Charge keep belongs to the held shot, so ZR stays down across the form change.
      r.a.form = 'squid'; for (let i = 0; i < hz / 4; i++) r.step(1 / hz, { fire: true });
      assert.equal(r.a.weaponRunner.s3Stored.charge, 1); assert.equal(r.f.shots.length, 0);
      r.a.form = 'kid'; for (let i = 0; i < hz / 3; i++) r.step(1 / hz, { fire: true });
      assert.equal(r.f.shots.length, 0); assert.ok(r.ch.weapon.coil.userData.u.uCharge.value > .999);
      r.step(1 / hz, { fire: true }); r.step(1 / hz, { fire: false });
      assert.equal(r.f.shots.length, 1); assert.equal(r.f.shots[0].charge, 1);
      assert.ok(r.ch.chargeFlash > .7 && r.ch.lastRelease < .05, 'actual release event drives Character');
      r.a.weaponRunner.reset(); assert.equal(r.ch.chargeFlash, 0);
      for (let i = 0; i < hz / 2; i++) r.step(1 / hz);
      assert.ok(r.ch.weapon.coil.userData.u.uCharge.value < 1e-5);
    } finally { r.ch.dispose(); }
  }
});

test('Splatling actual barrel, charge meter and stream pose follow runner and clear on reset/weapon swap', async () => {
  for (const hz of [30, 60, 120]) {
    const r = await rig('splatling');
    try {
      for (let i = 0; i < 2 * hz; i++) r.step(1 / hz, { fire: true });
      assert.ok(r.ch.spinW > .99 && r.ch.weapon.spinW > 40);
      assert.equal(r.ch.weapon.coil.userData.u.uCharge.value, r.a.weaponRunner.charge);
      const angle = r.ch.weapon.parts.barrels.rotation.z;
      r.step(1 / hz, { fire: false });
      assert.equal(r.a.weaponRunner.streaming, true);
      assert.notEqual(r.ch.weapon.parts.barrels.rotation.z, angle);
      for (let i = 0; i < hz / 4; i++) r.step(1 / hz);
      assert.ok(r.ch.streamW > .95 && r.f.shots.length > 0);
      assert.equal(r.ch.weapon.coil.userData.u.uCharge.value, r.a.weaponRunner.burstFrac);
      r.a.form = 'squid'; for (let i = 0; i < hz / 2; i++) r.step(1 / hz);
      assert.equal(r.a.weaponRunner.streaming, false); assert.equal(r.ch.weapon.coil.userData.u.uCharge.value, 0);
      r.a.form = 'kid'; for (let i = 0; i < hz; i++) r.step(1 / hz);
      assert.ok(r.ch.streamW < .01);
      r.a.weaponRunner.reset(); assert.equal(r.ch.weapon.spinW, 0); assert.equal(r.ch.weapon.parts.barrels.rotation.z, 0);
      r.ch.setWeapon('shooter'); r.ch.setWeapon('splatling');
      assert.equal(r.ch.spinW, 0); assert.equal(r.ch.streamW, 0);
    } finally { r.ch.dispose(); }
  }
});

test('Shooter/Blaster actual shot events drive hand recoil and weapon parts during ground/air walking', async () => {
  for (const kind of ['shooter', 'blaster']) for (const hz of [30, 60, 120]) {
    const r = await rig(kind);
    try {
      const C = r.api.CHARACTER_CHANNELS, quiet = r.ch.P[C.ANCR];
      r.a.vel.set(0, 0, 1.5); const observations = [];
      // The Blaster's 14F first release and 50F repeat put its second shot
      // beyond 1s; observe 1.2s while preserving the recoil-age assertion.
      for (let i = 0; i < (kind === 'blaster' ? Math.ceil(1.2 * hz) : hz); i++) {
        r.a.pos.z += 1.5 / hz; r.a.grounded = i < hz / 2;
        r.step(1 / hz, { fire: true });
        observations.push({ angle: r.ch.P[C.ANCR], moving: r.ch.moving, air: r.ch.wAir,
          part: kind === 'shooter' ? r.ch.weapon.parts.bolt.position.z : r.ch.weapon.pump });
      }
      assert.ok(r.f.shots.length > 0); assert.ok(r.ch.lastShot < .3);
      assert.ok(observations.some(o => Math.abs(o.angle - quiet) > .03));
      assert.ok(Math.max(...observations.map(o => o.part)) - Math.min(...observations.map(o => o.part)) > .0001);
      assert.ok(observations.some(o => o.moving) && r.ch.wAir > .9, 'ground walk and air pose both execute');
      for (let i = 0; i < 2 * hz; i++) { r.a.pos.z += 1.5 / hz; r.step(1 / hz); }
      assert.ok(r.ch.lastShot > 1 && r.ch.wAim < .02, 'release leaves no persistent firing pose');
    } finally { r.ch.dispose(); }
  }
});

test('Bomb hold/throw and Flow material signal use actual runner/actor states without changing special readiness', async () => {
  const r = await rig('dualies');
  try {
    for (let i = 0; i < 30; i++) r.step(1 / 60, { sub: true });
    assert.equal(r.ch.bombHeld, true); assert.ok(r.ch.bombSwap > .99);
    r.step(1 / 60, { subReleased: true }); assert.equal(r.launches.length, 1); assert.equal(r.ch.bombHeld, false);
    for (let i = 0; i < 60; i++) r.step(1 / 60);
    assert.ok(r.ch.bombSwap < .001);
    r.a.s3.flow.active = true; r.a.s3.flow.remaining = 10; r.step(1 / 60);
    assert.ok(r.ch.u.uGlow.value.r > .2 && r.ch.wGlow < .001);
    r.a.s3.flow.active = false; r.a.s3.flow.remaining = 0; r.step(1 / 60);
    assert.ok(r.ch.u.uGlow.value.r < .001);
    r.a.weaponRunner.reset(); assert.equal(r.ch.bombHeld, false); assert.equal(r.ch.bombSwap, 0);
  } finally { r.ch.dispose(); }
});
