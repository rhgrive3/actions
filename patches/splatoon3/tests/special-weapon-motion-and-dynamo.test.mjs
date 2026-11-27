import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { nativeRollerGripGap } from './roller-support-contact.mjs';
import {
  specialAllowsMainWeapon,
  specialAllowsSubWeapon,
  specialKeepsNativeForm,
} from '../runtime/special-presentation-owner.mjs';
import { heldBrellaGuardFacing } from '../runtime/brella-guard-facing.mjs';
import { heldFireAimFacing } from '../runtime/fire-hold-facing.mjs';
import { brushRollIgnoresEnemyInk } from '../runtime/brush-roll-ink.mjs';
import { catalogDualiesMotion } from '../runtime/catalog-dualies-motion.mjs';
import {
  rollerSwingMoveSpeed,
  heavyHorizontalTorsoAge,
  verticalRollerPose,
  HEAVY_ROLLER_SWING,
  VERTICAL_SWING,
  ROLLER_POSE,
} from '../runtime/roller.mjs';

const STEP = 1 / 60;
const wrap = x => Math.atan2(Math.sin(x), Math.cos(x));

let cachedApi;
async function getApi() {
  if (!cachedApi) {
    cachedApi = fixture({
      fullRuntime: true,
      productionComposition: true,
      includeCharacter: true,
      realProjectiles: true,
      vmMathRandom: () => 0.4,
      extraExports: `
        export { rollerDetailMotionSnapshot } from './patches/splatoon3/runtime/roller-detail-motion.mjs';
        export { slosherMotionSnapshot } from './patches/splatoon3/runtime/weapon-motion.mjs';
        export { dualiesMotionSnapshot } from './patches/splatoon3/runtime/dualies-motion.mjs';
        export { bombMotionSnapshot } from './patches/splatoon3/runtime/bomb-motion.mjs';
        export { swimMotionSnapshot } from './patches/splatoon3/runtime/swim-motion.mjs';
        export { specialMotionAllowsAction } from './patches/splatoon3/runtime/action-admission.mjs';
        export { recordMovementLaunch, resetAirborneState } from './patches/splatoon3/runtime/roller-freefall.mjs';
      `,
    });
  }
  return cachedApi;
}

function makeActorRig(f, weaponId) {
  const { G, THREE: T } = f;
  G.time = 10;
  G.scene = new T.Scene();
  G.camera = new T.PerspectiveCamera();
  G.level = new f.Level({
    bounds: { minX: -30, maxX: 30, minZ: -30, maxZ: 30 },
    spawnPads: [[-20, 0, 0], [20, 0, 0]],
    spawnBarrier: 0,
    half: [],
    single: [{ kind: 'box', min: [-30, -0.5, -30], max: [30, 0, 30] }],
  });
  G.physics = new f.Physics(G.level);
  G.projectiles = new f.Projectiles(G.scene);
  const a = new f.Actor({
    team: 0,
    name: 'motion-qa',
    isLocal: true,
    weapon: weaponId,
    CharacterClass: f.Character,
    style: { hair: 0, skin: 2, outfit: 0, eyes: 0 },
  });
  const ch = a.character;
  ch.actor = a;
  ch.onEvent = null;
  G.local = a;
  G.actors = [a];
  G.scene.add(ch.root);
  a.reset();
  a.setWeapon(weaponId);
  a.pos.set(0, 0, 0);
  a.vel.set(0, 0, 0);
  a.grounded = true;
  a.form = 'kid';
  a.kidT = 1;
  a.ink = 100;
  a.yaw = 0;
  a.aimYaw = 0;
  a.aimPitch = 0;
  a.aimDir.set(0, 0, 1);
  a.aimPoint.set(0, 0, 20);
  for (let i = 0; i < 90; i++) {
    G.time += STEP;
    a._finishFrame(STEP);
  }
  ch.fidget = -1;
  ch.idleT = 0;
  ch.shufT = 99;
  return {
    a,
    ch,
    close() {
      ch.dispose();
      G.actors = [];
      G.scene = null;
    },
  };
}

test('shared special helpers enforce Killer Wail 40F lock, Zipcaster ready phase, Storm hold, and Tenta Missiles form', () => {
  assert.equal(specialAllowsMainWeapon(null), true);
  assert.equal(specialAllowsMainWeapon({ specialActive: null }), true);
  assert.equal(specialAllowsSubWeapon({ specialActive: null }), true);

  // Killer Wail 5.1: locked before 40F, unlocked at/after 40F
  assert.equal(specialAllowsMainWeapon({ specialActive: { id: 'killerWail', t: 39 / 60 } }), false);
  assert.equal(specialAllowsSubWeapon({ specialActive: { id: 'killerWail', t: 39 / 60 } }), false);
  assert.equal(specialAllowsMainWeapon({ specialActive: { id: 'killerWail', t: 40 / 60 } }), true);
  assert.equal(specialAllowsSubWeapon({ specialActive: { id: 'killerWail', t: 40 / 60 } }), true);
  assert.equal(
    specialAllowsMainWeapon({
      specialActive: { id: 'killerWail', t: 0.1 },
      _s3AllSpecialState: { id: 'killerWail', t: 0.7 },
    }),
    true,
  );

  // Zipcaster: main allowed only in ready phase, sub always replaced by hook
  assert.equal(specialAllowsMainWeapon({ specialActive: { id: 'zipcaster', phase: 'ready', t: 0.2 } }), true);
  assert.equal(specialAllowsSubWeapon({ specialActive: { id: 'zipcaster', phase: 'ready', t: 0.2 } }), false);
  for (const phase of ['hookFlight', 'zip', 'hookWait']) {
    assert.equal(
      specialAllowsMainWeapon({
        specialActive: { id: 'zipcaster', phase: 'ready', t: 0.2 },
        _s3AllSpecialState: { id: 'zipcaster', phase },
      }),
      false,
      `zipcaster ${phase} blocks main weapon`,
    );
  }

  // Storm: sub allowed in hold, main blocked
  assert.equal(specialAllowsMainWeapon({ specialActive: { id: 'storm', phase: 'hold', t: 0.1 } }), false);
  assert.equal(specialAllowsSubWeapon({ specialActive: { id: 'storm', phase: 'hold', t: 0.1 } }), true);
  assert.equal(specialAllowsSubWeapon({ specialActive: { id: 'storm', phase: 'throw', t: 0.2 } }), false);

  // Other specials block main & sub
  for (const id of ['slam', 'booyahBomb', 'crabTank', 'reefslider', 'inkVac', 'tentaMissiles']) {
    assert.equal(specialAllowsMainWeapon({ specialActive: { id, t: 1 } }), false);
    assert.equal(specialAllowsSubWeapon({ specialActive: { id, t: 1 } }), false);
  }

  // Tenta Missiles retains native swim/squid form
  assert.equal(specialKeepsNativeForm('tentaMissiles'), true);
  assert.equal(specialKeepsNativeForm({ specialActive: { id: 'tentaMissiles' } }), true);
  assert.equal(specialKeepsNativeForm('slam'), false);
});

test('Roller flick animation, swing move speed, and detail motion work during Killer Wail post-40F and Zipcaster ready', async () => {
  const f = await getApi();
  for (const special of [
    { id: 'killerWail', t: 45 / 60, phase: 'laser' },
    { id: 'zipcaster', t: 0.5, phase: 'ready' },
  ]) {
    const rig = makeActorRig(f, 'roller');
    try {
      const { a, ch } = rig;
      a.specialActive = { ...special };
      f.resetAirborneState(a);
      a.intent.fire = true;
      a.weaponRunner.update(STEP, { fire: true, firePressed: true });
      f.G.time += STEP;
      a._finishFrame(STEP);
      assert.ok(a.weaponRunner.s3RollerAttack, `${special.id}: roller attack created`);
      assert.notEqual(rollerSwingMoveSpeed(a.weaponRunner), null, `${special.id}: swing move speed active`);
      const snap = f.rollerDetailMotionSnapshot(ch);
      assert.equal(snap.active, true, `${special.id}: roller detail motion stays active`);
      assert.notEqual(snap.phase, 'interrupted', `${special.id}: roller detail motion not interrupted`);
    } finally {
      rig.close();
    }
  }

  // Negative control: killerWail pre-40F blocks roller swing move speed and detail motion
  const rig = makeActorRig(f, 'roller');
  try {
    const { a, ch } = rig;
    a.specialActive = { id: 'killerWail', t: 10 / 60, phase: 'charge' };
    a.weaponRunner.update(STEP, { fire: true, firePressed: true });
    f.G.time += STEP;
    a._finishFrame(STEP);
    assert.equal(rollerSwingMoveSpeed(a.weaponRunner), null);
    assert.equal(f.rollerDetailMotionSnapshot(ch).phase, 'interrupted');
  } finally {
    rig.close();
  }
});

test('Slosher slosh animation stays active during Killer Wail post-40F and Zipcaster ready', async () => {
  const f = await getApi();
  for (const special of [
    { id: 'killerWail', t: 45 / 60, phase: 'laser' },
    { id: 'zipcaster', t: 0.4, phase: 'ready' },
  ]) {
    const rig = makeActorRig(f, 'slosher');
    try {
      const { a, ch } = rig;
      a.specialActive = { ...special };
      a.intent.fire = true;
      a.weaponRunner.update(STEP, { fire: true, firePressed: true });
      f.G.time += STEP;
      a._finishFrame(STEP);
      const snap = f.slosherMotionSnapshot(ch);
      assert.ok(snap, `${special.id}: slosh motion snapshot remains active`);
      assert.ok(snap.elapsed >= 0);
    } finally {
      rig.close();
    }
  }
});

test('Dualies dodge-roll motion and catalog dualies motion work during Killer Wail post-40F and Zipcaster ready', async () => {
  const mockCatalogActor = specialActive => ({
    weapon: { catalogRecord: { family: 'dualies' } },
    remote: false,
    alive: true,
    form: 'kid',
    climbing: false,
    specialActive,
    superJumpState: null,
    weaponRunner: { catalogState: { roll: { t: 0.05, dur: 0.15, distance: 3, direction: { x: 1, z: 0 } } } },
  });
  assert.ok(catalogDualiesMotion(mockCatalogActor({ id: 'killerWail', t: 45 / 60 })));
  assert.ok(catalogDualiesMotion(mockCatalogActor({ id: 'zipcaster', phase: 'ready', t: 0.3 })));
  assert.equal(catalogDualiesMotion(mockCatalogActor({ id: 'killerWail', t: 10 / 60 })), null);
  assert.equal(catalogDualiesMotion(mockCatalogActor({ id: 'zipcaster', phase: 'zip', t: 0.3 })), null);
  assert.equal(catalogDualiesMotion(mockCatalogActor({ id: 'slam', phase: 'rise', t: 0.1 })), null);

  const f = await getApi();
  for (const special of [
    { id: 'killerWail', t: 45 / 60, phase: 'laser' },
    { id: 'zipcaster', t: 0.4, phase: 'ready' },
  ]) {
    const rig = makeActorRig(f, 'dualies');
    try {
      const { a, ch } = rig;
      a.specialActive = { ...special };
      a.intent.fire = true;
      a.intent.jump = true;
      a.intent.move.set(1, 0, 0);
      const dodged = a.weaponRunner.tryDodge(a.intent.move);
      assert.equal(dodged, true, `${special.id}: dualies tryDodge admitted`);
      for (let i = 0; i < 6; i++) {
        a.weaponRunner.update(STEP, { fire: true, firePressed: false, move: a.intent.move });
        f.G.time += STEP;
        a._finishFrame(STEP);
      }
      const snap = f.dualiesMotionSnapshot(ch);
      assert.ok(snap && !snap.blockedRoll, `${special.id}: dualies dodge-roll not blocked`);
      assert.equal(snap.phase, 'roll', `${special.id}: dualies enters roll phase (got ${snap.phase})`);
    } finally {
      rig.close();
    }
  }

  // Negative control: Killer Wail pre-40F blocks Dualies dodge-roll motion
  {
    const rig = makeActorRig(f, 'dualies');
    try {
      const { a, ch } = rig;
      a.specialActive = { id: 'killerWail', t: 10 / 60, phase: 'charge' };
      a.intent.fire = true;
      a.intent.move.set(1, 0, 0);
      a.weaponRunner.dodge = { token: 1, t: 0.05, dur: 0.2, startup: 0, startupDur: 0 };
      ch.trigger('dodge', { x: 1, z: 0, t: 0.2 });
      f.G.time += STEP;
      a._finishFrame(STEP);
      const snap = f.dualiesMotionSnapshot(ch);
      assert.notEqual(snap?.phase, 'roll', 'killerWail pre-40F blocks dualies roll phase');
    } finally {
      rig.close();
    }
  }
});

test('Brella guard facing and canopy guard pose work during Killer Wail post-40F and Zipcaster ready', async () => {
  const makeBrellaActor = specialActive => ({
    weaponId: 's3-shelter-normal',
    alive: true,
    remote: false,
    form: 'kid',
    specialActive,
    superJumpState: null,
    intent: { fire: true, sub: false },
    weaponRunner: {
      aimingSub: false,
      catalogState: { id: 's3-shelter-normal', pressed: true, canopy: { open: true, preparing: false, launched: false, hp: 500 } },
    },
  });
  assert.equal(heldBrellaGuardFacing(makeBrellaActor({ id: 'killerWail', t: 45 / 60 })), true);
  assert.equal(heldBrellaGuardFacing(makeBrellaActor({ id: 'zipcaster', phase: 'ready', t: 0.3 })), true);
  assert.equal(heldBrellaGuardFacing(makeBrellaActor({ id: 'killerWail', t: 10 / 60 })), false);
  assert.equal(heldBrellaGuardFacing(makeBrellaActor({ id: 'zipcaster', phase: 'zip', t: 0.3 })), false);
  assert.equal(heldBrellaGuardFacing(makeBrellaActor({ id: 'storm', phase: 'hold', t: 0.2 })), false);

  const f = await getApi();
  const rig = makeActorRig(f, 's3-shelter-normal');
  try {
    const { a, ch } = rig;
    a.specialActive = { id: 'killerWail', t: 45 / 60, phase: 'laser' };
    a.weaponRunner.catalogState = {
      id: 's3-shelter-normal',
      pressed: true,
      canopy: {
        open: true,
        preparing: false,
        launched: false,
        hp: 500,
        pos: new f.THREE.Vector3(0, 1.0, 1.2),
        dir: new f.THREE.Vector3(0, 0, 1),
      },
    };
    const C = f.CHARACTER_CHANNELS;
    a.specialActive = { id: 'killerWail', t: 10 / 60, phase: 'charge' };
    for (let i = 0; i < 8; i++) {
      f.G.time += STEP;
      a._finishFrame(STEP);
    }
    const blockedAncZ = ch.P[C.ANC + 2];
    a.specialActive = { id: 'killerWail', t: 45 / 60, phase: 'laser' };
    for (let i = 0; i < 8; i++) {
      f.G.time += STEP;
      a._finishFrame(STEP);
    }
    const unlockedAncZ = ch.P[C.ANC + 2];
    assert.ok(unlockedAncZ > blockedAncZ + 0.15, `brella guard pose extends anchor forward during Killer Wail post-40F (${unlockedAncZ} vs ${blockedAncZ})`);
  } finally {
    rig.close();
  }
});

test('Blaster, Splatling, Charger detail motion and Inkbrush roll immunity work during Killer Wail & Zipcaster', async () => {
  const inkbrush = specialActive => ({
    weapon: { catalogRecord: { parameters: { WeaponRollParam: { NoOpInkEffect: true } } } },
    alive: true,
    form: 'kid',
    grounded: true,
    climbing: false,
    specialActive,
    superJumpState: null,
    ink: 80,
    weaponRunner: { rolling: true, aimingSub: false, catalogState: { pending: null } },
    intent: { fire: true, sub: false, move: { x: 0, z: 1 } },
    vel: { x: 0, z: 6 },
    contacts: { wall: false },
  });
  assert.equal(brushRollIgnoresEnemyInk(inkbrush({ id: 'killerWail', t: 45 / 60 })), true);
  assert.equal(brushRollIgnoresEnemyInk(inkbrush({ id: 'zipcaster', phase: 'ready', t: 0.2 })), true);
  assert.equal(brushRollIgnoresEnemyInk(inkbrush({ id: 'killerWail', t: 10 / 60 })), false);
  assert.equal(brushRollIgnoresEnemyInk(inkbrush({ id: 'zipcaster', phase: 'hookFlight', t: 0.2 })), false);
  assert.equal(
    brushRollIgnoresEnemyInk({
      ...inkbrush({ id: 'zipcaster', phase: 'ready', t: 0.2 }),
      ink: 0,
      _s3AllSpecialState: { id: 'zipcaster', phase: 'ready', inkFuel: 45 },
    }),
    true,
    'Inkbrush activated on empty tank keeps enemy-ink immunity via Zipcaster inkFuel',
  );

  const f = await getApi();
  for (const weaponId of ['blaster', 'splatling', 'charger']) {
    const rig = makeActorRig(f, weaponId);
    try {
      const { a, ch } = rig;
      for (const special of [
        { id: 'killerWail', t: 45 / 60, phase: 'laser' },
        { id: 'zipcaster', t: 0.4, phase: 'ready' },
      ]) {
        a.specialActive = { ...special };
        a.ink = 100;
        a.intent.fire = true;
        for (let i = 0; i < 6; i++) {
          a.weaponRunner.update(STEP, { fire: true, firePressed: i === 0 });
          f.G.time += STEP;
          a._finishFrame(STEP);
        }
        assert.equal(f.specialMotionAllowsAction(ch, false), true, `${weaponId}: action allowed during ${special.id}`);
        if (weaponId === 'blaster') {
          assert.ok(
            a.weaponRunner.s3BlasterWindup > 0 || a.weaponRunner.firingT > 0 || a.weaponRunner.cooldown > 0,
            `blaster actually fires during ${special.id}`,
          );
        } else {
          assert.equal(a.weaponRunner.charging, true, `${weaponId} actively charges during ${special.id}`);
          assert.ok(a.weaponRunner.charge > 0, `${weaponId} accumulates charge during ${special.id}`);
        }
        a.intent.fire = false;
        a.weaponRunner.reset();
      }

      a.specialActive = { id: 'killerWail', t: 10 / 60, phase: 'charge' };
      a.intent.fire = true;
      a.weaponRunner.update(STEP, { fire: true, firePressed: true });
      f.G.time += STEP;
      a._finishFrame(STEP);
      assert.equal(f.specialMotionAllowsAction(ch, false), false, `${weaponId}: action blocked during Killer Wail pre-40F`);
    } finally {
      rig.close();
    }
  }
});

test('Sub weapon hold/throw pose works during Killer Wail post-40F and Tenta Missiles keeps native swim form', async () => {
  const f = await getApi();
  const rig = makeActorRig(f, 'shooter');
  try {
    const { a, ch } = rig;
    // Sub aim/throw during Killer Wail post-40F
    a.specialActive = { id: 'killerWail', t: 45 / 60, phase: 'laser' };
    a.intent.sub = true;
    a.weaponRunner.aimingSub = true;
    for (let i = 0; i < 4; i++) {
      f.G.time += STEP;
      a._finishFrame(STEP);
    }
    assert.equal(f.bombMotionSnapshot(ch).phase, 'aim', 'sub hold pose active during Killer Wail post-40F');
    a.intent.sub = false;
    a.weaponRunner.aimingSub = false;
    ch.trigger('throw');
    f.G.time += STEP;
    a._finishFrame(STEP);
    assert.equal(f.bombMotionSnapshot(ch).phase, 'recovery', 'sub throw recovery active during Killer Wail post-40F');

    // Tenta Missiles native swim form
    a.specialActive = { id: 'tentaMissiles', t: 0.5, phase: 'aim' };
    a.form = 'squid';
    a.submerged = true;
    a.vel.set(0, 0, 5);
    for (let i = 0; i < 30; i++) {
      f.G.time += STEP;
      a._finishFrame(STEP);
    }
    assert.equal(ch.form, 'swim', 'character retains swim form during Tenta Missiles');
    assert.ok(ch.sqScale > 0.99, 'squid mesh remains active during Tenta Missiles');
  } finally {
    rig.close();
  }
});

test('Body aim-facing faces aimYaw when firing during Killer Wail post-40F and Zipcaster ready across weapon classes', async () => {
  const AIM = Math.PI / 2;
  const BACK = AIM + Math.PI;
  const plain = specialActive => ({
    alive: true,
    remote: false,
    form: 'kid',
    specialActive,
    superJumpState: null,
    intent: { fire: true, sub: false },
    weapon: { kind: 'shooter', behaviorKind: 'shooter' },
  });
  assert.equal(heldFireAimFacing(plain({ id: 'killerWail', t: 45 / 60 }), false), true);
  assert.equal(heldFireAimFacing(plain({ id: 'zipcaster', phase: 'ready', t: 0.3 }), false), true);
  assert.equal(heldFireAimFacing(plain({ id: 'killerWail', t: 10 / 60 }), false), false);
  assert.equal(heldFireAimFacing(plain({ id: 'zipcaster', phase: 'zip', t: 0.3 }), false), false);

  const f = await getApi();
  // Negative control: Killer Wail pre-40F keeps velocity-facing instead of turning to aimYaw
  {
    const rig = makeActorRig(f, 'shooter');
    try {
      const { a } = rig;
      a.specialActive = { id: 'killerWail', t: 10 / 60, phase: 'charge' };
      a.aimYaw = AIM;
      a.yaw = BACK;
      a.yawVel = 0;
      a.intent.fire = true;
      a.intent.move.set(Math.sin(BACK), 0, Math.cos(BACK));
      a.vel.set(Math.sin(BACK) * 3, 0, Math.cos(BACK) * 3);
      a.fireFacing = 0;
      for (let i = 0; i < 20; i++) {
        a._face(STEP, false);
      }
      assert.ok(
        Math.abs(wrap(a.yaw - BACK)) < 0.1,
        `killerWail pre-40F should not face aimYaw (diff from BACK=${Math.abs(wrap(a.yaw - BACK)).toFixed(3)})`,
      );
    } finally {
      rig.close();
    }
  }

  for (const weaponId of ['shooter', 'blaster', 'charger', 'splatling', 'slosher', 'dualies', 'roller']) {
    for (const special of [
      { id: 'killerWail', t: 45 / 60, phase: 'laser' },
      { id: 'zipcaster', t: 0.4, phase: 'ready' },
    ]) {
      const rig = makeActorRig(f, weaponId);
      try {
        const { a } = rig;
        a.specialActive = { ...special };
        a.aimYaw = AIM;
        a.yaw = BACK;
        a.yawVel = 0;
        a.intent.fire = true;
        a.intent.move.set(Math.sin(BACK), 0, Math.cos(BACK));
        a.vel.set(Math.sin(BACK) * 3, 0, Math.cos(BACK) * 3);
        a.weaponRunner.rolling = false;
        a.fireFacing = 0;
        for (let i = 0; i < 30; i++) {
          a._face(STEP, false);
        }
        assert.ok(
          Math.abs(wrap(a.yaw - AIM)) < 0.05,
          `${weaponId} during ${special.id} should turn from BACK to aimYaw (diff=${Math.abs(wrap(a.yaw - AIM)).toFixed(3)})`,
        );
      } finally {
        rig.close();
      }
    }
  }
});

test('Dynamo Roller horizontal torso age stays synced to HEAVY_ROLLER_SWING phases with no premature whip or early recovery', async () => {
  const windup = 45 / 60;
  const interval = 66 / 60;

  // Phase 1: 0 -> 22F coil (0 -> 0.15)
  assert.equal(heavyHorizontalTorsoAge(0, windup, interval), 0);
  assert.ok(Math.abs(heavyHorizontalTorsoAge(22 / 60, windup, interval) - 0.15) < 1e-9);

  // Phase 2: 22F -> 42F overhead hold stays pinned at 0.15 (no premature whip)
  for (const frame of [22, 28, 35, 42]) {
    assert.ok(
      Math.abs(heavyHorizontalTorsoAge(frame / 60, windup, interval) - 0.15) < 1e-9,
      `frame ${frame} holds coil at 0.15`,
    );
  }

  // Phase 3: 42F -> 45F whip forward (0.15 -> 0.23)
  assert.ok(Math.abs(heavyHorizontalTorsoAge(45 / 60, windup, interval) - 0.23) < 1e-9);

  // Phase 4: 45F -> 66F floor rest stays in follow-through (0.23 -> 0.42, no early recovery)
  for (const frame of [45, 52, 60, 66]) {
    const age = heavyHorizontalTorsoAge(frame / 60, windup, interval);
    assert.ok(age >= 0.23 - 1e-9 && age <= 0.42 + 1e-9, `frame ${frame} stays in follow-through (${age})`);
  }

  // Phase 5: 66F -> 76F recover (0.42 -> 0.68)
  assert.ok(Math.abs(heavyHorizontalTorsoAge(66 / 60, windup, interval) - 0.42) < 1e-9);
  assert.ok(Math.abs(heavyHorizontalTorsoAge(76 / 60, windup, interval) - 0.68) < 1e-9);

  // Live Character verification on s3-roller-heavy
  const f = await getApi();
  const rig = makeActorRig(f, 's3-roller-heavy');
  try {
    const { a, ch } = rig;
    const C = f.CHARACTER_CHANNELS;
    f.resetAirborneState(a);
    const spineAt = new Map();
    for (let tick = 0; tick <= 78; tick++) {
      a.intent.fire = tick === 0;
      a.weaponRunner.update(STEP, { fire: a.intent.fire, firePressed: tick === 0 });
      f.G.time += STEP;
      a._finishFrame(STEP);
      spineAt.set(tick, ch.P[C.SPINE]);
    }
    // During overhead hold (24F..41F), torso remains coiled back (negative spine pitch)
    assert.ok(spineAt.get(24) < 0, `frame 24 coiled (${spineAt.get(24)})`);
    assert.ok(spineAt.get(38) < 0, `frame 38 still coiled, no premature whip (${spineAt.get(38)})`);
    assert.ok(Math.abs(spineAt.get(38) - spineAt.get(24)) < 0.05, 'overhead hold torso stays steady');
    // At release (45F) and late floor rest (62F), torso is whipped forward (positive spine pitch)
    assert.ok(spineAt.get(46) > 0.15, `frame 46 whipped forward (${spineAt.get(46)})`);
    assert.ok(spineAt.get(62) > 0.15, `frame 62 still forward during floor rest, no early recovery (${spineAt.get(62)})`);
    // By 76F, torso recovers back toward neutral
    assert.ok(spineAt.get(76) < spineAt.get(62) - 0.1, 'torso recovers during 66F..76F lift-back');
  } finally {
    rig.close();
  }
});

test('Dynamo Roller vertical swing settles promptly into low follow-through and preserves reachable grips', async () => {
  const windup = 55 / 60;
  const interval = 75 / 60;

  // Release at 55F hits VERTICAL_SWING.release
  const atRelease = verticalRollerPose(windup, windup, interval, 'heavy', false);
  assert.ok(Math.abs(atRelease.rotation[0] - VERTICAL_SWING.release) < 1e-9);

  // Settles promptly by 55F + 5F = 60F to HEAVY_ROLLER_SWING.verticalFollowPitch (1.4 rad), not hovering at 0.6 rad
  const settled = verticalRollerPose(windup + 5 / 60, windup, interval, 'heavy', false);
  assert.ok(
    Math.abs(settled.rotation[0] - HEAVY_ROLLER_SWING.verticalFollowPitch) < 1e-9,
    `vertical follow-through settled at ${settled.rotation[0]}`,
  );
  assert.ok(settled.rotation[0] > 1.2, 'low follow-through pitch instead of 0.6 rad mid-air hover');

  // Holds low follow-through through restEnd (75F)
  const midRest = verticalRollerPose(70 / 60, windup, interval, 'heavy', false);
  assert.ok(Math.abs(midRest.rotation[0] - HEAVY_ROLLER_SWING.verticalFollowPitch) < 1e-6);
  assert.equal(midRest.whip, 1);

  // Overhead coil holds through 22F..52F
  assert.equal(verticalRollerPose(35 / 60, windup, interval, 'heavy', false).coil, 1);
  assert.equal(verticalRollerPose(35 / 60, windup, interval, 'heavy', false).whip, 0);

  // Cleanly returns to READY_ANCHOR at end (85F)
  const atEnd = verticalRollerPose(85 / 60, windup, interval, 'heavy', false);
  assert.deepEqual(atEnd.anchor, ROLLER_POSE.READY_ANCHOR);
  assert.equal(atEnd.weight, 0);

  // Live Character verification on s3-roller-heavy vertical flick
  const f = await getApi();
  const rig = makeActorRig(f, 's3-roller-heavy');
  try {
    const { a, ch } = rig;
    const T = f.THREE;
    f.recordMovementLaunch(a);
    let maxGapR = 0;
    let maxGapL = 0;
    let settledAxis = null;
    for (let tick = 0; tick <= 88; tick++) {
      const flying = tick < 45;
      a.pos.set(0, flying ? 1.2 * Math.sin((Math.PI * tick) / 45) : 0, 0);
      a.vel.set(0, flying ? ((1.2 * Math.PI) / (45 / 60)) * Math.cos((Math.PI * tick) / 45) : 0, 0);
      a.grounded = !flying;
      a.intent.fire = tick === 0;
      a.weaponRunner.update(STEP, { fire: a.intent.fire, firePressed: tick === 0 });
      f.G.time += STEP;
      a._finishFrame(STEP);
      ch.root.updateMatrixWorld(true);
      maxGapR = Math.max(maxGapR, nativeRollerGripGap(ch, T, 'handR', f.CHARACTER_CHANNELS));
      maxGapL = Math.max(maxGapL, nativeRollerGripGap(ch, T, 'handL', f.CHARACTER_CHANNELS));
      if (tick === 62) {
        settledAxis = new T.Vector3(1, 0, 0).transformDirection(ch.weapon.drum.matrixWorld).toArray();
      }
    }
    assert.ok(settledAxis && settledAxis[2] > 0.9 && Math.abs(settledAxis[1]) < 0.35, `settled vertical drum axis points forward/level (${settledAxis})`);
    assert.ok(maxGapR < 0.002, `handR grip stays within reach (${maxGapR})`);
    assert.ok(maxGapL < 0.02, `handL grip stays within reach (${maxGapL})`);
  } finally {
    rig.close();
  }
});

test('Dynamo Roller held=true and mid-recovery ZR release preserve continuity without C0 snap', async () => {
  const vWindup = 55 / 60;
  const vInterval = 75 / 60;
  const hWindup = 45 / 60;
  const hInterval = 66 / 60;

  // Held horizontal torso age stays at 0.42 past restEnd
  assert.ok(Math.abs(heavyHorizontalTorsoAge(70 / 60, hWindup, hInterval, true) - 0.42) < 1e-9);

  // Held vertical pose settles to ROLL_ANCHOR at end with weight = 1
  const heldEnd = verticalRollerPose(vInterval, vWindup, vInterval, 'heavy', true);
  assert.deepEqual(heldEnd.anchor, ROLLER_POSE.ROLL_ANCHOR);
  assert.equal(heldEnd.weight, 1);

  const f = await getApi();
  // Grounded vertical swing with ZR held, then released mid-recovery (past restEnd = 65F)
  const rig = makeActorRig(f, 's3-roller-heavy');
  try {
    const { a, ch } = rig;
    const C = f.CHARACTER_CHANNELS;
    f.recordMovementLaunch(a);
    let prevAnc = null;
    let prevRot = null;
    let maxAncJump = 0;
    let maxRotJump = 0;
    for (let tick = 0; tick <= 80; tick++) {
      const flying = tick < 40;
      a.pos.set(0, flying ? 1.0 * Math.sin((Math.PI * tick) / 40) : 0, 0);
      a.vel.set(0, flying ? ((1.0 * Math.PI) / (40 / 60)) * Math.cos((Math.PI * tick) / 40) : 0, 0);
      a.grounded = !flying;
      // Hold ZR through tick 67, then release mid-recovery at tick 68 (past restEnd = 65F)
      a.intent.fire = tick <= 67;
      a.weaponRunner.update(STEP, { fire: a.intent.fire, firePressed: tick === 0 });
      f.G.time += STEP;
      a._finishFrame(STEP);
      if (tick >= 64 && tick <= 74) {
        const anc = [ch.P[C.ANC], ch.P[C.ANC + 1], ch.P[C.ANC + 2]];
        const rot = [ch.P[C.ANCR], ch.P[C.ANCR + 1], ch.P[C.ANCR + 2]];
        if (prevAnc) {
          maxAncJump = Math.max(maxAncJump, Math.hypot(anc[0] - prevAnc[0], anc[1] - prevAnc[1], anc[2] - prevAnc[2]));
          maxRotJump = Math.max(maxRotJump, Math.hypot(rot[0] - prevRot[0], rot[1] - prevRot[1], rot[2] - prevRot[2]));
        }
        prevAnc = anc;
        prevRot = rot;
      }
    }
    assert.ok(maxAncJump < 0.15, `mid-recovery ZR release anchor stays continuous (maxJump=${maxAncJump.toFixed(4)})`);
    assert.ok(maxRotJump < 0.32, `mid-recovery ZR release rotation stays continuous without C0 snap (maxJump=${maxRotJump.toFixed(4)})`);
  } finally {
    rig.close();
  }

  // Airborne vertical swing with ZR held must not hold weight=1 until 85F
  const airRig = makeActorRig(f, 's3-roller-heavy');
  try {
    const { a, ch } = airRig;
    f.recordMovementLaunch(a);
    for (let tick = 0; tick <= 80; tick++) {
      a.pos.set(0, 5, 0);
      a.vel.set(0, 0, 0);
      a.grounded = false;
      a.intent.fire = true;
      a.weaponRunner.update(STEP, { fire: true, firePressed: tick === 0 });
      f.G.time += STEP;
      a._finishFrame(STEP);
      if (tick === 70) {
        assert.equal(ch.s3RollerFlick?.holdRoll, false, 'airborne vertical swing does not latch holdRoll');
      }
    }
  } finally {
    airRig.close();
  }
});

test('Remote killerWail and zipcaster symmetry via specialAllowsMainWeapon and brella-network', async () => {
  // Remote zipcaster without explicit phase defaults to ready; explicit non-ready phase blocks
  assert.equal(specialAllowsMainWeapon({ specialActive: { id: 'zipcaster', net: true } }), true);
  assert.equal(specialAllowsMainWeapon({ specialActive: { id: 'zipcaster', net: true, phase: 'zip' } }), false);
  assert.equal(specialAllowsMainWeapon({ specialActive: { id: 'zipcaster', net: true, phase: 'hookFlight' } }), false);

  // Remote killerWail tracks s.t
  assert.equal(specialAllowsMainWeapon({ specialActive: { id: 'killerWail', net: true, t: 10 / 60 } }), false);
  assert.equal(specialAllowsMainWeapon({ specialActive: { id: 'killerWail', net: true, t: 45 / 60 } }), true);
  assert.equal(specialAllowsSubWeapon({ specialActive: { id: 'killerWail', net: true, t: 45 / 60 } }), true);

  // Remote Brella held canopy view over network with F.special (8192) set
  const f = await getApi();
  const rig = makeActorRig(f, 's3-shelter-normal');
  try {
    const { a, ch } = rig;
    a.remote = true;
    a.owner = 'peer-2';
    a.nid = 7;
    a.alive = true;
    const net = new f.NetMatch({ myId: 'peer-1', isHost: false }, { map: 'standard' });
    net.byNid.set(a.nid, a);
    const F_ALIVE = 1;
    const F_SPECIAL = 8192;
    const makeRow = (life, tick) => [
      'inkwave.brella-view.v1', life, tick, 's3-shelter-normal', 2, 0,
      0, 1.0, 1.2, 0, 0, 1, 0,
    ];

    // 1. Remote Zipcaster (net: true, no phase) -> held canopy accepted & shown
    a.specialActive = { id: 'zipcaster', net: true, t: 0.4 };
    const snap1 = { t: 1.0, tp: 0, life: 1, f: F_ALIVE | F_SPECIAL, s3BrellaOwner: 'peer-2', s3Brella: makeRow(1, 10) };
    a.net = { ready: true, lastLife: 1, cur: snap1, buf: [snap1], err: new f.THREE.Vector3() };
    net.peers.set('peer-2', { tr: 1.0, lastTs: 0.9, physicsPoints: [1.0, 10] });
    net.applyRemote(a, STEP);
    assert.ok(ch.s3BrellaPresentation?.canopy?.open, 'remote Brella held canopy stays open during remote Zipcaster');

    // 2. Remote Killer Wail post-40F -> held canopy stays open
    a.specialActive = { id: 'killerWail', net: true, t: 45 / 60 };
    net.applyRemote(a, STEP);
    assert.ok(ch.s3BrellaPresentation?.canopy?.open, 'remote Brella held canopy stays open during remote Killer Wail post-40F');

    // 3. Remote Killer Wail pre-40F -> held canopy suppressed
    a.specialActive = { id: 'killerWail', net: true, t: 10 / 60 };
    net.applyRemote(a, STEP);
    assert.equal(ch.s3BrellaPresentation?.canopy, null, 'remote Brella held canopy suppressed during remote Killer Wail pre-40F');

    // 4. Remote Tidal Slam -> held canopy suppressed
    a.specialActive = { id: 'slam', net: true, t: 0.5 };
    net.applyRemote(a, STEP);
    assert.equal(ch.s3BrellaPresentation?.canopy, null, 'remote Brella held canopy suppressed during remote Tidal Slam');

    net.dispose();
  } finally {
    rig.close();
  }
});

test('Dynamo mid-recovery ZR release fades smoothly through swing end without ~170° snap, and superjump-motion survives specialKeepsNativeForm', async () => {
  const f = await getApi();
  // Verify _poseFlick releaseFade smoothly decays weight to 0 across HEAVY_ROLLER_SWING.ret
  const a = new f.Actor({ team: 0, name: 'dynamo-fade', isLocal: true, weapon: 's3-roller-heavy', CharacterClass: f.Character, style: { hair: 0, skin: 0, outfit: 0, eyes: 0 } });
  const ch = a.character;
  a.grounded = true;
  ch.s3RollerFlick = {
    vertical: true, windup: 55 / 60, interval: 85 / 60, swingInterval: 76 / 60,
    elapsed: 68 / 60, released: true, rolling: false, holdRoll: true, rollHoldBroken: true,
    swingShape: 'heavy', releaseFadeAt: 68 / 60,
  };
  let prevRot = null, maxJump = 0;
  for (let tick = 68; tick <= 80; tick++) {
    ch.s3RollerFlick.elapsed = tick / 60;
    ch.P.fill(0);
    ch._poseWeapon?.(1 / 60, a.anim);
    ch._poseFlick(1 / 60, a.anim);
    const rot = [ch.P[f.CHARACTER_CHANNELS.ANCR], ch.P[f.CHARACTER_CHANNELS.ANCR + 1], ch.P[f.CHARACTER_CHANNELS.ANCR + 2]];
    if (prevRot) {
      const d = Math.hypot(rot[0] - prevRot[0], rot[1] - prevRot[1], rot[2] - prevRot[2]);
      maxJump = Math.max(maxJump, d);
    }
    prevRot = rot;
  }
  // At tick 78 (releaseFadeAt + 10/60 = 78/60), releaseFade reaches 0 so clearing s3RollerFlick has near-zero jump
  assert.ok(maxJump < 1.0, `vertical mid-recovery release fades smoothly (maxJump=${maxJump})`);

  // Verify superjump-motion lifecycle hook preserves state for specialKeepsNativeForm specials
  const sjActor = new f.Actor({ team: 0, name: 'sj-keep', isLocal: true, weapon: 'shooter', CharacterClass: f.Character, style: { hair: 0, skin: 0, outfit: 0, eyes: 0 } });
  sjActor.anim.movementMotion = { superJumpVelocity: new f.THREE.Vector3(0, 5, 0) };
  sjActor.specialActive = { id: 'killerWail', t: 0.2 };
  sjActor._startSpecial?.();
  assert.ok(sjActor.anim.movementMotion.superJumpVelocity, 'superJumpVelocity preserved for specialKeepsNativeForm special');
});
