import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { sourceLoadedActorFixture } from '../../splatoon3/tests/source-loaded-actor-fixture.mjs';

const raw = rel => fs.readFileSync(new URL('../../../inkwave-public/' + rel, import.meta.url), 'utf8');

test('production composer installs reversal-safe squid/human pose ownership', () => {
  const motion = adaptBuildSource('src/game/motion/source-controller.js', raw('src/game/motion/source-controller.js'));
  const character = adaptBuildSource('src/game/character.js', raw('src/game/character.js'));
  assert.match(motion, /applyDivePose\(\)\{/);
  assert.match(motion, /this\.returnPivotBlend=nextKid\|\|this\.returnInterrupted/);
  assert.match(motion, /this\.squidPose\.copy\(out\)\.fk\(\)/);
  assert.match(character, /this\.sourceMotion\?\.applyDivePose\?\.\(\)/);
  assert.match(character, /const returnU = clamp\(t \/ 0\.15, 0, 1\)/);
});

test('rapid squid-button changes settle into genuine human and squid idle at 30/60/120 Hz', async () => {
  const fixture = await sourceLoadedActorFixture({ random: () => 0.4 });
  for (const sourced of [true, false]) for (const fps of [30, 60, 120]) {
    const actor = await fixture.make();
    const c = actor.character;
    c.onEvent = null;
    if (!sourced) c.sourceMotion.setEnabled(false);
    const step = (dt = 1 / fps) => {
      fixture.G.time += dt;
      actor._finishFrame(dt);
      c.root.updateMatrixWorld(true);
    };
    const renderedSquid = () => {
      const mesh = c.squid.body, p = new fixture.THREE.Vector3();
      const indices = [0, Math.floor(mesh.geometry.attributes.position.count / 2), mesh.geometry.attributes.position.count - 1];
      return indices.flatMap(i => mesh.getVertexPosition(i, p).applyMatrix4(mesh.matrixWorld).toArray());
    };
    for (let i = 0; i < fps; i++) step();

    for (let tap = 0; tap < 24; tap++) {
      const before = [c.kidScale, c.sqScale], points = sourced ? renderedSquid() : null;
      const shape = [c.kidSY, c.kidSXZ, c.sqSY, c.sqSXZ, c.kidLift];
      const pivot = c.squid.pivot.scale.toArray();
      const interrupted = c.formT < 0.45;
      actor.form = tap % 2 === 0 ? 'squid' : 'kid';
      actor.submerged = false;
      step(0); // A same-frame reversal must not change the rendered shape.
      assert(Math.abs(c.kidScale - before[0]) < 1e-8, 'kid scale continuous on reversal');
      assert(Math.abs(c.sqScale - before[1]) < 1e-8, 'squid scale continuous on reversal');
      if (sourced && c.sqScale > 0.001) {
        const after = renderedSquid();
        assert(Math.max(...after.map((v, i) => Math.abs(v - points[i]))) < 1e-6,
          'source squid vertices remain continuous at input edge');
      }
      if (!sourced && interrupted) {
        const current = [c.kidSY, c.kidSXZ, c.sqSY, c.sqSXZ, c.kidLift];
        assert(Math.max(...current.map((v, i) => Math.abs(v - shape[i]))) < 1e-8,
          'native fallback retains visible squash, stretch and lift on reversal');
        if (before[1] > 0.001) {
          const now = c.squid.pivot.scale.toArray();
          assert(Math.max(...now.map((v, i) => Math.abs(v - pivot[i]))) < 1e-6,
            'native squid mesh preserves world-visible stretch on reversal');
        }
      }
      step();
      step();
      assert(Number.isFinite(c.kidScale) && Number.isFinite(c.sqScale));
      assert(Math.abs(c.kidScale + c.sqScale - 1) < 1e-8, 'no missing or doubled silhouette');
      assert(c.kidScale >= 0 && c.kidScale <= 1 && c.sqScale >= 0 && c.sqScale <= 1);
    }
    actor.form = 'kid';
    for (let i = 0; i < fps; i++) step();
    assert(c.kidScale > 0.999 && c.sqScale < 0.001, 'human idle restored');
    if (sourced) assert.equal(c.sourceMotion.state, 'idle', 'transition clip does not latch over human idle');

    actor.form = 'squid';
    actor.submerged = false; // Dry squid idle uses Sqd_Wait rather than Sqd_Walk.
    for (let i = 0; i < fps; i++) step();
    assert(c.sqScale > 0.999 && c.kidScale < 0.001, 'squid idle restored');
    if (sourced) assert.equal(c.sourceMotion.squidState, 'Sqd_Wait', 'transition clip does not latch over squid idle');

    actor.form = 'kid';
    for (let i = 0; i < fps; i++) step();
    assert(c.kidScale > 0.999 && c.sqScale < 0.001, 'a second human idle recovers cleanly');
    fixture.reset();
  }
});

test('live Actor squid-button edges recover ordinary idle after button-mashing', async () => {
  const fixture = await sourceLoadedActorFixture({random: () => 0.4});
  for (const sourced of [true, false]) for (const fps of [30, 60, 120]) {
    const actor = await fixture.make(), character = actor.character;
    if (!sourced) character.sourceMotion.setEnabled(false);
    const dt = 1 / fps;
    for (let i = 0; i < fps; i++) fixture.tick(actor, dt);
    for (let tap = 0; tap < 36; tap++) {
      actor.intent.squid = tap % 2 === 0;
      fixture.tick(actor, dt);
      assert.equal(actor.form, actor.intent.squid ? 'squid' : 'kid', 'input form remains immediate');
      assert(Number.isFinite(character.kidScale) && Number.isFinite(character.sqScale));
      assert(Math.abs(character.kidScale + character.sqScale - 1) < 1e-8);
    }
    actor.intent.squid = false;
    for (let i = 0; i < fps; i++) fixture.tick(actor, dt);
    assert.equal(actor.form, 'kid');
    assert.equal(character.form, 'kid');
    assert(character.kidScale > 0.999 && character.sqScale < 0.001);
    if (sourced) assert.equal(character.sourceMotion.state, 'idle');
    fixture.reset();
  }
});
