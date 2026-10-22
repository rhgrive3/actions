import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { validateWallReadiness } from '../../../scripts/check-inkwave-wall-render.mjs';

// CPU composition contract only: real Actor/Character/Physics and paint ownership
// fixture. No renderer, GPU paint, optional source-motion asset loading, or visual acceptance.
test('production wall readiness retains indexed glint while submerged body and ghost stay hidden', async t => {
  const api = await fixture({ fullRuntime: true, productionComposition: true, includeCharacter: true,
    extraExports: `export { wallMotionSnapshot } from './patches/splatoon3/runtime/wall-motion.mjs';` });
  const { Actor, Character, G, THREE, Level, Physics, PLAYER, wallMotionSnapshot } = api;
  const level = new Level({ bounds: { minX: -12, maxX: 12, minZ: -12, maxZ: 12 },
    spawnPads: [[-8, 0, 0], [8, 0, 0]], spawnBarrier: 0, half: [], single: [
      { kind: 'box', min: [-12, -.5, -12], max: [12, 0, 12] },
      { kind: 'box', min: [-3, 0, -1], max: [3, 3, 0] }] });
  Object.assign(G, { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), mode: 'match',
    level, physics: new Physics(level), time: 0, actors: [] });
  G.paint.sample = () => 1;
  const actor = new Actor({ team: 0, name: 'wall-qa', CharacterClass: Character, isLocal: true,
    weapon: 'shooter', style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  const ch = actor.character;
  t.after(() => ch.dispose());
  ch.actor = actor; G.scene.add(ch.root); G.actors.push(actor); ch.setLod('game');
  const step = () => {
    G.time += 1 / 60; actor.anim.time = G.time; actor.update(1 / 60);
    ch.root.updateMatrixWorld(true); ch.skeleton.update();
  };
  actor.spawnAt(new THREE.Vector3(0, 0, 4), 0);
  for (let i = 0; i < 36; i++) step();
  actor.reset(); actor.pos.set(0, .5, PLAYER.radius + .02);
  actor.intent.squid = true; actor.intent.move.set(0, 0, -1);
  for (let i = 0; i < 6; i++) step();
  assert.equal(actor.climbing, true);
  actor.intent.jump = true;
  let ticks = 0;
  while (!wallMotionSnapshot(ch)?.ready && ticks < 48) { step(); ticks++; }
  assert.equal(ticks, 45);
  const star = ch.squid.pivot.getObjectByName('s3-wall-ready-glint');
  const snapshot = wallMotionSnapshot(ch);
  const receipt = { attached: actor.climbing, form: actor.anim.form,
    ready: snapshot.ready, charge: snapshot.charge, glow: snapshot.glow,
    glintPresent: !!star?.parent, glintVisible: star?.visible === true, indexCount: star?.geometry.index?.count,
    bodyVisible: ch.squid.body.visible, ghostVisible: ch.squid.ghost.visible,
    eyesVisible: ch.squid.eyes.visible, darkVisible: ch.squid.dark.visible };
  assert.equal(validateWallReadiness(receipt), true);
  assert.equal(Boolean(star && star.geometry.index.count === 24 && ch.squid.ghost.visible), false,
    'legacy ghost expectation reproduces original false failure');
  assert.throws(() => validateWallReadiness({ ...receipt, glintPresent: false }), /glint missing/);
  assert.throws(() => validateWallReadiness({ ...receipt, ghostVisible: true }), /body leaked/);
});
