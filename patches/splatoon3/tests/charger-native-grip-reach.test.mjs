import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceLoadedActorFixture } from './source-loaded-actor-fixture.mjs';

// The weapon-model browser gate's real source-bank recipe, without rendering.
// This checks physical sockets, not ikErr (which may report a clamped target).
// In BUILT mode the existing fixture loads actual emitted modules, no fallback.
test('loaded native Charger preserves retry order and both physical grips through landing', async t => {
  const f = await sourceLoadedActorFixture({ extraExports: `export {getWeaponDef} from './src/game/character-weapons.js';` });
  const { Actor, Character, THREE, G, Physics, CHARACTER_CHANNELS: C } = f;
  G.scene = new THREE.Scene(); G.settings = null; G.mode = 'boot'; G.local = null; G.renderer = null;
  G.teamColors = [new THREE.Color('#ff8825'), new THREE.Color('#484ce8')];
  const camera = new THREE.PerspectiveCamera(34, 960 / 720, .01, 50); G.camera = camera;
  G.level = { blocks: [], groundHeight: () => 0, queryBlocks: (_a, _b, _c, _d, out) => { out.length = 0; return out; } };
  G.physics = new Physics(G.level); G.paint = { sample: () => 1, splat: () => 0 };
  G.match = { playing: () => true }; G.time = 0;
  const shots = [];
  G.projectiles = Object.fromEntries(['fireShooter', 'fireDualies', 'fireBlaster', 'fireSlosh', 'fireFlick', 'fireCharger', 'fireSplatling', 'throwBomb'].map(method => [method, () => shots.push(method)]));
  // Keep the real 270-tick Shooter prefix: it is part of the original failure.
  for (const kind of ['shooter', 'charger']) {
    const d = f.getWeaponDef(kind), model = new THREE.Group();
    model.add(new THREE.Mesh(d.body), new THREE.Mesh(d.ink));
    if (d.glow) model.add(new THREE.Mesh(d.glow));
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model), center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    camera.position.copy(center).add(new THREE.Vector3(-.9, .45, 1.1).normalize().multiplyScalar(Math.max(...size.toArray()) * 2.45));
    camera.lookAt(center); camera.updateMatrixWorld(true);
    const a = new Actor({ team: 0, weapon: kind, isLocal: true, name: kind, CharacterClass: Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
    const ch = a.character; ch.actor = a; ch.onEvent = null;
    a.grounded = a.ground.hit = true; G.actors = [a]; G.scene.add(ch.root);
    const ownSolve = Object.getOwnPropertyDescriptor(ch, '_solveLimb'), solve = ch._solveLimb;
    let initialClavicleY = null, leftCalls = 0, preExhaustionChecks = 0;
    // A good final socket alone would miss a correction performed too early:
    // moving the right side before native left retries changes next-frame feedback.
    ch._solveLimb = function(limb, ...args) {
      if (limb === this.limbs.armR) { initialClavicleY = this.bones.clavL.rotation.y; leftCalls = 0; }
      const left = limb === this.limbs.armL;
      if (left) leftCalls++;
      const beforeExhaustion = left && initialClavicleY !== null && leftCalls < 4 && this.bones.clavL.rotation.y > initialClavicleY - .55;
      const before = beforeExhaustion ? this.bones.handR.getWorldPosition(new THREE.Vector3()) : null;
      const result = Reflect.apply(solve, this, [limb, ...args]);
      if (before) {
        preExhaustionChecks++;
        const after = this.bones.handR.getWorldPosition(new THREE.Vector3());
        assert.ok(before.distanceTo(after) < 1e-12, `${kind}: left solve must not translate the right wrist before native retries exhaust`);
      }
      return result;
    };
    try {
      await ch._sourceMotionLoader;
      if (ch.sourceMotion?.ready) await ch.sourceMotion.ready;
      assert.equal(ch.sourceMotion?.status, 'ready', 'actual production source bank is ready');
      const definition = JSON.stringify([d.handL.pos.toArray(), d.handL.quat.toArray(), d.handR.pos.toArray(), d.handR.quat.toArray()]);
      const lengths = [ch.limbs.armL.a, ch.limbs.armL.b, ch.limbs.armR.a, ch.limbs.armR.b];
      let held = 0, nativeAttack = 0, landing = 0, maxLeft = 0, maxRight = 0;
      for (let frame = 0; frame < 270; frame++) {
        const input = { fire: frame >= 90 && frame < 190, sub: frame >= 220 && frame < 230 };
        a.ink = 100; a.intent.fire = input.fire; a.intent.sub = input.sub;
        a.grounded = !(frame >= 130 && frame < 145); a.aimPitch = frame >= 130 && frame < 145 ? .75 : 0;
        if (frame >= 45 && frame < 90) { a.vel.set(0, 0, 3); a.pos.z += 3 / 60; } else a.vel.set(0, 0, 0);
        G.time += 1 / 60; a.weaponRunner.update(1 / 60, input); a._finishFrame(1 / 60);
        ch.root.updateMatrixWorld(true); ch.skeleton.update();
        assert.ok([...ch.P].every(Number.isFinite), `${kind} frame ${frame}: finite pose`);
        if (input.fire && !ch.sourceMotion.sourceUpper) nativeAttack++;
        if (!ch.dual && ch.P[C.IKL] > .99 && ch.P[C.LTW] < .001) {
          held++;
          if (frame === 145 || frame === 146) landing++;
          const live = ch.weapon.def;
          const left = ch.weapon.off.localToWorld(live.handL.pos.clone()).distanceTo(ch.bones.handL.getWorldPosition(new THREE.Vector3()));
          const right = ch.weapon.off.localToWorld(live.handR.pos.clone()).distanceTo(ch.bones.handR.getWorldPosition(new THREE.Vector3()));
          maxLeft = Math.max(maxLeft, left); maxRight = Math.max(maxRight, right);
          assert.ok(left < .006, `${kind} frame ${frame}: actual left socket gap ${left} exceeds unchanged 6 mm gate`);
          assert.ok(right < .002, `${kind} frame ${frame}: actual right socket gap ${right}`);
        }
        if (frame === 80 || frame === 150) {
          camera.position.copy(a.pos).add(new THREE.Vector3(-1.8, 1.25, 3.25));
          camera.lookAt(a.pos.clone().add(new THREE.Vector3(0, .8, .12))); camera.updateMatrixWorld(true);
          ch._camHook({ getRenderTarget: () => null, getPixelRatio: () => 1, getSize: out => out.set(960, 720), info: { render: { frame: frame === 80 ? 1 : 2 } } }, G.scene, camera);
        }
      }
      assert.ok(held > 100 && nativeAttack > 0, `${kind}: actual native held/attack path exercised`);
      assert.equal(landing, 2, 'both landing frames measured');
      assert.equal(JSON.stringify([d.handL.pos.toArray(), d.handL.quat.toArray(), d.handR.pos.toArray(), d.handR.quat.toArray()]), definition, 'authored sockets unchanged');
      assert.deepEqual([ch.limbs.armL.a, ch.limbs.armL.b, ch.limbs.armR.a, ch.limbs.armR.b], lengths, 'limb lengths unchanged');
      assert.ok(preExhaustionChecks > 270, 'actual pre-exhaustion solves were checked, including retries');
      t.diagnostic(JSON.stringify({ kind, frames: 270, held, nativeAttack, maxLeft, maxRight, preExhaustionChecks }));
    } finally {
      if (ownSolve) Object.defineProperty(ch, '_solveLimb', ownSolve); else delete ch._solveLimb;
      G.scene.remove(ch.root); ch.dispose(); G.actors = [];
    }
  }
  assert.ok(shots.includes('fireShooter') && shots.includes('fireCharger'), 'actual WeaponRunner emits both weapon method calls; no projectile collision claim');
});
