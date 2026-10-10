import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { CURLING, SUCTION, curlingRollTargetSpeed, curlingRollSpeed } from '../runtime/kit-subs.mjs';
import { splatBombKnockbackDelta, fidelityThrowVelocity } from '../runtime/sub-special-fidelity.mjs';
import { CURLING_WARNING_REST, CURLING_LIGHT_RED, CURLING_LIGHT_GREEN, CURLING_CHARGE_GROWTH } from '../runtime/bomb-models.mjs';

// Production composition, real Projectiles/_updateBombs, flat y=0 floor.
// Kit mapping (kit-composition): shooter=Suction, roller=Curling, charger=Splat Bomb.
// Logic measurements only; no Splatoon 3 hardware comparison is claimed.
const near = (a, b, eps, label) => assert.ok(Math.abs(a - b) <= eps, `${label}: ${a} != ${b}`);

async function world({ wallZ = null } = {}) {
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true });
  const V = f.THREE.Vector3;
  f.G.camera = { position: new V(0, 100, 0) };
  f.G.physics.segment = (a, b, out) => {
    out.hit = false;
    if (wallZ != null && a.z <= wallZ && b.z > wallZ) {
      const t = (wallZ - a.z) / (b.z - a.z);
      out.hit = true; out.point = new V(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, wallZ); out.normal = new V(0, 0, -1);
      return out;
    }
    if (a.y >= 0 && b.y < 0) {
      const t = a.y / (a.y - b.y);
      out.hit = true; out.point = new V(a.x + (b.x - a.x) * t, 0, a.z + (b.z - a.z) * t); out.normal = new V(0, 1, 0);
    }
    return out;
  };
  f.G.physics.raycast = (o, d, len, out) => {
    if (d.y < 0 && o.y >= 0 && o.y + d.y * len <= 0) { out.hit = true; out.point = new V(o.x, 0, o.z); out.normal = new V(0, 1, 0); out.dist = o.y; }
    else out.hit = false;
    return out;
  };
  f.G.paint = { sample: () => 1, splat: () => 1 };
  return f;
}

function throwSub(f, weapon, holdFrames, { pitch = 0, vel = [0, 0, 0], arc = false } = {}) {
  const p = f.G.projectiles;
  const a = f.make(weapon);
  a.pos.set(0, 0, 0); a.aimYaw = 0; a.aimPitch = pitch; a.vel.set(...vel);
  a.weaponRunner.reset(); a.ink = 100;
  for (let i = 0; i < holdFrames; i++) {
    f.G.time += 1 / 60;
    a.weaponRunner.update(1 / 60, { sub: true });
    if (arc) p.updateArc(a, true);
  }
  const preview = arc ? { ring: p.arcRing.position.clone(), visible: p.arcRing.visible } : null;
  a.vel.set(...vel);
  a.weaponRunner.update(1 / 60, { subReleased: true });
  for (let i = 0; i < 20 && !p.bombs.length; i++) a.weaponRunner.update(1 / 60, {});
  const b = p.bombs.at(-1);
  assert.ok(b, `${weapon} released a bomb`);
  return { a, b, p, preview };
}

function run(p, b, hz = 60, maxSeconds = 6, each = null) {
  let burst = null, t = 0;
  const explode = p._explodeBomb;
  p._explodeBomb = function (bb) { if (bb === b) burst = { pos: bb.pos.clone(), t }; return explode.call(this, bb); };
  try {
    for (let i = 0; i < maxSeconds * hz && p.bombs.includes(b); i++) { t += 1 / hz; p._updateBombs(1 / hz); if (p.bombs.includes(b)) each?.(b, t); }
  } finally { p._explodeBomb = explode; }
  return burst;
}

test('Suction and Curling explosions paint their own BlastParam footprint, not the Splat Bomb one', async () => {
  for (const [weapon, hold, first, satellites, satRadius, offset] of [
    ['shooter', 6, SUCTION.paintRadius, SUCTION.splashSatellites, SUCTION.splashSatelliteRadius, SUCTION.paintOffsetY],
    ['roller', 90, CURLING.maxCharge.paintRadius, CURLING.maxCharge.splashSatellites, CURLING.maxCharge.splashSatelliteRadius, 0.1],
  ]) {
    const f = await world();
    const { b, p } = throwSub(f, weapon, hold);
    const calls = [];
    f.G.paint = { sample: () => 1, splat: (c, r) => { calls.push({ r, y: c.y }); return 1; } };
    let at = null;
    const explode = p._explodeBomb;
    p._explodeBomb = function (bb) { at = bb.pos.clone(); calls.length = 0; return explode.call(this, bb); };
    run(p, b);
    assert.ok(at, `${weapon} exploded`);
    assert.equal(calls.length, 1 + satellites, `${weapon}: one centre + SplashAround Num, nothing intercepted or added`);
    assert.equal(calls[0].r, first, `${weapon}: centre PaintRadius`);
    near(calls[0].y, at.y + offset, 1e-9, `${weapon}: PaintOffsetY along the floor normal`);
    assert.ok(calls.slice(1).every(c => c.r === satRadius), `${weapon}: satellite radius`);
    assert.ok(!calls.some(c => c.r === f.SUB.bomb.paintRadius), `${weapon}: no Splat Bomb ${f.SUB.bomb.paintRadius} footprint`);
  }
});

test('blast knockback reaches Splat (12), Suction (12) and Curling (9) victims with the pinned tuples', async () => {
  for (const [weapon, hold, distance, spec] of [
    ['charger', 6, 10, { accel: 700, bias: 0.8, distance: 12 }],
    ['shooter', 6, 10, SUCTION.knockBack],
    ['roller', 6, 8.5, CURLING.blastKnockBack],
    ['roller', 6, 9.5, CURLING.blastKnockBack],
  ]) {
    const f = await world();
    const { b, p } = throwSub(f, weapon, hold);
    const e = f.make('shooter'); e.team = 1; e.remote = false; e.pos.set(0, -100, 0);
    run(p, b, 60, 6, (bb) => { if (bb.fuse >= 0 && bb.fuse < 0.03) { e.pos.set(bb.pos.x + distance, bb.pos.y - 0.7, bb.pos.z); e.vel.set(0, 0, 0); } });
    // the burst reads the victim at pos + 0.7 from the bomb's final position
    const d = Math.hypot(e.pos.x - b.pos.x, e.pos.y + 0.7 - b.pos.y, e.pos.z - b.pos.z);
    near(Math.hypot(e.vel.x, e.vel.y, e.vel.z), splatBombKnockbackDelta(d, spec), 1e-9, `${weapon} at ${d}`);
    if (distance >= spec.distance) assert.equal(e.vel.x, 0, 'outside the KnockBackParam distance');
  }
});

test('per-sub launch: Curling SpawnSpeedY/YWorldMin and X/Z/Y player-velocity rates, Suction ZRate', () => {
  const actor = { aimPitch: 0, aimYaw: 0, vel: { x: 10, y: 5, z: 10 } };
  const out = { set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
  fidelityThrowVelocity(actor, 'bomb', out, 24, CURLING.launch);
  near(out.x, 10 * 0.8, 1e-9, 'Curling XRate (lateral)');
  near(out.y, 0.12 * 60 + Math.min(5 * 2.0, 0.16 * 60), 1e-9, 'Curling SpawnSpeedY + YPlusRate capped by YMax');
  near(out.z, 24 + 10 * 1.2, 1e-9, 'Curling ZRate (forward)');
  fidelityThrowVelocity(actor, 'bomb', out, 67.2, SUCTION.launch);
  near(out.x, 16, 1e-9, 'Suction XRate'); near(out.z, 67.2 + 10 * 2.0, 1e-9, 'Suction ZRate');
  fidelityThrowVelocity(actor, 'bomb', out, 67.2);
  near(out.z, 67.2 + 16, 1e-9, 'Splat Bomb has no ZRate: XRate on both axes, as before');
  fidelityThrowVelocity({ aimPitch: -1, aimYaw: 0, vel: { x: 0, y: 0, z: 0 } }, 'bomb', out, 24, CURLING.launch);
  assert.ok(out.y >= -0.5 * 60 - 1e-9, 'Curling SpawnSpeedYWorldMin -0.5');
});

test('real Curling throw launches at 7.2/s up and its fuse runs from release (210F tap, 90F full)', async () => {
  for (const [hold, fuse] of [[90, 90 / 60]]) {
    const f = await world();
    const { b, p } = throwSub(f, 'roller', hold);
    near(b.vel.y, 7.2, 1e-9, 'SpawnSpeedY');
    near(b.vel.z, 12, 1e-9, 'SpawnSpeedZMaxCharge');
    const burst = run(p, b);
    near(burst.t, fuse, 1e-9, 'burst at the resolved fuse after release');
  }
});

test('Curling flight drag and BaseSpeed law are per elapsed time, not per contact (60/30/120 Hz)', async () => {
  const travel = [];
  for (const hz of [60, 30, 120]) {
    const f = await world();
    const { b, p } = throwSub(f, 'roller', 90);
    let flightChecked = false;
    const burst = run(p, b, hz, 6, (bb) => {
      if (!flightChecked && bb.s3Mode === 'flight') {
        flightChecked = true;
        // after one step the horizontal speed keeps (1 - FlyPositionAirResist)^(dt*60)
        near(Math.hypot(bb.vel.x, bb.vel.z), 12 * Math.pow(1 - CURLING.flyPositionAirResist, 60 / hz), 1e-6, `flight drag ${hz} Hz`);
      }
      // snapped to the 0.21 clearance every step: at most one step of GroundGravity below it
      if (bb.s3Mode === 'rolling') near(bb.pos.y, 0.21, 0.01, `rolling puck stays on the floor ${hz} Hz`);
    });
    assert.ok(flightChecked);
    travel.push(burst.pos.z);
  }
  const [r60, r30, r120] = travel;
  assert.ok(Math.abs(r30 - r60) < 0.6 && Math.abs(r120 - r60) < 0.4, `travel ${travel.join(' / ')}`);
  // the law itself: base 13.2/s, slowing to 0 inside the last 90F
  near(curlingRollTargetSpeed(CURLING, 3), 0.22 * 60, 1e-12, 'BaseSpeedMinCharge');
  near(curlingRollTargetSpeed(CURLING, 0.75), 13.2 * Math.pow(0.5, 0.41), 1e-12, 'BurstTimingSpeedStopBias');
  assert.equal(curlingRollTargetSpeed(CURLING, 0), 0);
  near(curlingRollSpeed(24, 13.2, CURLING, 1 / 30), curlingRollSpeed(curlingRollSpeed(24, 13.2, CURLING, 1 / 60), 13.2, CURLING, 1 / 60), 1e-12, 'ComeOverRate compounds per step');
});

test('Curling guide ends where the bomb bursts, including a wall reflection', async () => {
  for (const wallZ of [null, 6]) {
    const f = await world({ wallZ });
    const { b, p, preview } = throwSub(f, 'roller', 90, { arc: true });
    const burst = run(p, b);
    assert.ok(preview.visible, 'marker shown at the predicted burst point');
    near(preview.ring.x, burst.pos.x, 1e-6, 'x'); near(preview.ring.z, burst.pos.z, 1e-6, 'z');
    near(preview.ring.y, burst.pos.y - 0.21 + 0.03, 1e-6, 'marker on the floor');
    if (wallZ != null) assert.ok(burst.pos.z < wallZ, 'reflected back off the wall');
  }
});

test('Splat Bomb ground resistance applies while resting between swept hits (bounded slide)', async () => {
  const slides = [];
  for (const hz of [60, 30, 120]) {
    const f = await world();
    const { b, p } = throwSub(f, 'charger', 6);
    let landed = null;
    const burst = run(p, b, hz, 6, (bb) => { if (landed == null && bb.fuse >= 0) landed = bb.pos.z; });
    slides.push(burst.pos.z - landed);
  }
  // Before this change the per-hit-only drag let the bomb slide 22-28 units.
  assert.ok(slides.every(s => s > 1 && s < 13), `slides ${slides.join(' / ')}`);
});

test('thrown models: per-sub silhouette, native fuse pulse rebound to the model, Curling lights and Suction cup', async () => {
  const ids = [];
  for (const [weapon, hold, id] of [['charger', 6, 'bomb'], ['shooter', 6, 'suction'], ['roller', 6, 'curling']]) {
    const f = await world({ wallZ: id === 'suction' ? 5 : null });
    const { b, p } = throwSub(f, weapon, hold);
    p._updateBombs(1 / 60);
    assert.equal(b.s3Model?.id, id);
    ids.push(id);
    assert.equal(b.mesh.children.length, 1, 'native sphere and cap replaced by one model group');
    assert.ok(b.mesh.children[0].children.includes(b.body), 'native emissive pulse drives the model ink part');
    if (id === 'curling') {
      near(b.s3Model.root.scale.x, 1 + (CURLING_CHARGE_GROWTH - 1) * b.s3Charge, 1e-12, 'cooking grows the puck by the trail ratio');
      assert.ok(b.fuse > CURLING_WARNING_REST);
      assert.equal(b.s3Model.light.emissive.getHex(), CURLING_LIGHT_GREEN, 'green while more than 90F remain');
      let red = 0;
      run(p, b, 60, 6, (bb) => { if (bb.fuse <= CURLING_WARNING_REST && bb.fuse > 0) { red++; assert.equal(bb.s3Model.light.emissive.getHex(), CURLING_LIGHT_RED); } });
      assert.ok(red > 80, 'red for the last WarningAnimRestFrame');
      assert.equal(b.mesh.rotation.x, 0, 'a curling stone does not tumble');
    }
    if (id === 'suction') {
      run(p, b, 60, 0.6);
      assert.equal(b.s3StuckOn, 'wall');
      const up = new f.THREE.Vector3(0, 1, 0).applyQuaternion(b.mesh.quaternion);
      near(up.z, -1, 1e-9, 'cup (-Y) pressed into the wall, can pointing out along the normal');
    }
  }
  assert.deepEqual(ids, ['bomb', 'suction', 'curling']);
});

test('replayed (ghost) bombs take the model of the packet sub id; unknown ids stay Splat Bomb', async () => {
  const f = await world();
  const p = f.G.projectiles;
  const owner = f.make('shooter'); owner.remote = true; owner.team = 1;
  for (const [kit, charge, id] of [['curling', 1, 'curling'], ['suction', 0, 'suction'], ['', 0, 'bomb'], ['bogus', 0, 'bomb']]) {
    const b = p.ghostBomb(owner, 'bomb', 0, 1.35, 0, 0, 7.2, 12, null, kit, charge);
    p._updateBombs(1 / 60);
    assert.equal(b.ghost, true);
    assert.equal(b.s3Model?.id, id, `packet '${kit}'`);
    if (id === 'curling') near(b.s3Model.root.scale.x, CURLING_CHARGE_GROWTH, 1e-12, 'packet charge drives the size');
  }
});

test('held prop follows the owner kit through the real Character update, and team recolour reaches it', async () => {
  const f = await fixture({ fullRuntime: true, productionComposition: true, includeCharacter: true });
  const actor = new f.Actor({ team: 0, name: 'held', weapon: 'roller', CharacterClass: f.Character });
  actor.character.actor = actor; f.G.actors.push(actor);
  const ch = actor.character, view = { form: 'kid', hp: 100, grounded: true };
  const hold = () => { ch.bombHeld = true; actor.weaponRunner.aimingSub = true; ch.update(1 / 60, view); };
  const native = ch.bomb.group.children.slice();
  hold();
  assert.equal(actor.weapon.sub, 'curling');
  assert.ok(native.every(c => !c.visible), 'native Splat Bomb bulb hidden');
  const custom = ch.bomb.group.children.filter(c => !native.includes(c));
  assert.equal(custom.length, 1, 'one held Curling prop');
  const ink = new f.THREE.MeshStandardMaterial();
  ch.bomb.ink.material = ink;
  assert.ok(custom[0].children.some(c => c.material === ink), 'colour refresh reaches the held ink band');
  actor.setWeapon('charger'); hold();
  assert.equal(actor.weapon.sub, 'bomb');
  assert.ok(native.every(c => c.visible), 'Splat Bomb kit shows the native bulb again');
  assert.equal(ch.bomb.group.children.filter(c => !native.includes(c)).length, 0);
});
