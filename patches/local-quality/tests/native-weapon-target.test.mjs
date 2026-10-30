import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeWeaponTargetPair, nativeWeaponTargetSnapshot} from './native-weapon-target-fixture.mjs';

test('native weapon target guard preserves complete real Character, source contacts and shots', async () => {
  const apis = await nativeWeaponTargetPair();
  let frames = 0, skinFrames = 0, sourceFrames = 0, inactiveFrames = 0, dualFrames = 0;
  const coverage = new Set();
  const compare = (actors, label, skin = false) => {
    assert.deepEqual(nativeWeaponTargetSnapshot(apis[1], actors[1], skin),
      nativeWeaponTargetSnapshot(apis[0], actors[0], skin), label);
    frames++; if (skin) skinFrames++;
    const ch = actors[1].character;
    if (ch.sourceMotion.active && ch.sourceMotion.keepSourceArms) sourceFrames++;
    if (!ch.sourceMotion.active) inactiveFrames++;
    if (ch.dual) dualFrames++;
    coverage.add(label.split(':')[0]);
  };
  try {
    for (const hz of [30, 60, 120]) {
      const actors = await Promise.all(apis.map(api => api.make()));
      const chars = actors.map(actor => actor.character), dt = 1 / hz;
      for (const mode of ['active', 'inactive']) {
        chars.forEach(ch => { ch.sourceMotion.setEnabled(mode === 'active'); ch.tr.fill(99); ch.fidget = -1; });
        const phases = [
          ['idle', 'shooter', 0, false], ['move', 'shooter', 4, false], ['fire', 'shooter', 4, true],
          ['native', 'dualies', 2, true], ['charge', 'charger', 2, true], ['slosh', 'slosher', 1, true],
          ['roller', 'roller', 2, false], ['return', 'shooter', 1, false],
        ];
        for (const [phase, weapon, speed, fire] of phases) {
          chars.forEach(ch => ch.setWeapon(weapon));
          for (let frame = 0; frame < Math.ceil(hz * .3); frame++) {
            for (let k = 0; k < 2; k++) {
              const ch = chars[k], actor = actors[k], api = apis[k], step = frame === 3 ? 0 : dt;
              api.G.time += step; ch.root.position.z += speed * step; ch.root.rotation.y += step * .3;
              actor.pos.copy(ch.root.position); actor.yaw = ch.root.rotation.y;
              if (fire && frame % 6 === 0) ch.trigger(weapon === 'slosher' ? 'slosh' : 'shoot');
              ch.update(step, {form: 'kid', grounded: true, speed, localMove: {x: 0, z: 1},
                firing: fire, charge: fire ? .7 : 0, ink: 1, hp: 1, aimPitch: .2});
            }
            compare(actors, `${mode}:${hz}:${phase}:${frame}`, frame === Math.ceil(hz * .3) - 1);
          }
        }
      }
      chars.forEach(ch => { ch.sourceMotion.setEnabled(true); ch.setWeapon('shooter'); });
      for (const frame of [0, 12.25, 5, -1, 1000]) {
        for (const ch of chars) {
          ch.sourceMotion.playClip('WalkHold_Nrml', {frame});
          ch.update(0, {form: 'kid', grounded: true, speed: 0, localMove: {x: 0, z: 0}, ink: 1, hp: 1});
        }
        compare(actors, `manual:${hz}:${frame}`, true);
      }
      chars.forEach(ch => ch.sourceMotion.stopClip());
      for (let frame = 0; frame < Math.ceil(hz * .7); frame++) {
        for (let k = 0; k < 2; k++) {
          const ch = chars[k], actor = actors[k], api = apis[k], air = frame < hz * .35;
          api.G.time += dt; actor.pos.z += 2 * dt; ch.root.position.copy(actor.pos);
          if (frame === 0) ch.trigger('jump');
          if (frame === Math.ceil(hz * .35)) ch.trigger('land');
          ch.update(dt, {form: 'kid', grounded: !air, speed: 2, localMove: {x: 0, z: 1},
            ink: 1, hp: 1, vy: air ? 2 : 0});
        }
        compare(actors, `air:${hz}:${frame}`, frame === Math.ceil(hz * .7) - 1);
      }
      for (const mode of ['active', 'inactive']) {
        for (const actor of actors) {
          actor.character.sourceMotion.setEnabled(mode === 'active'); actor.setWeapon('shooter');
          actor.character.tr.fill(99); actor.intent.fire = true;
        }
        const count = apis[0].G.projectiles.list.length;
        for (let frame = 0; frame < hz; frame++) {
          for (let k = 0; k < 2; k++) apis[k].tick(actors[k], dt);
          compare(actors, `shots-${mode}:${hz}:${frame}`, frame === hz - 1);
        }
        assert.ok(apis[0].G.projectiles.list.length > count, 'actual Actor/WeaponRunner shots added');
      }
      for (let k = 0; k < 2; k++) { actors[k].splat(null, 'weapon'); apis[k].tick(actors[k], dt); }
      compare(actors, `dead:${hz}`, true);
      apis.forEach(api => api.reset());
    }
    assert.equal(frames, 1593); assert.equal(skinFrames, 75);
    assert.ok(sourceFrames > 100 && inactiveFrames > 100 && dualFrames > 50,
      JSON.stringify({sourceFrames, inactiveFrames, dualFrames}));
    assert.deepEqual([...coverage], ['active', 'inactive', 'manual', 'air', 'shots-active', 'shots-inactive', 'dead']);
    console.log(JSON.stringify({frames, skinFrames, sourceFrames, inactiveFrames, dualFrames, differenceCount: 0}));
  } finally { apis.forEach(api => api.reset()); }
});
