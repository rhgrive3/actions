import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBotSpecialFixture, STEP } from './bot-special-fixture.mjs';
import { FOLLOWTHROUGH_CASES, observeBotSpecialFollowthrough } from '../../../scripts/lib/inkwave-bot-special-followthrough.mjs';

test('all eighteen other specials reach native combat or support effects through BotBrain', async () => {
  const f = await makeBotSpecialFixture();
  const rows = await observeBotSpecialFollowthrough({
    G: f.G, on: f.on, bigBubblerDomes: f.bigBubblerDomes,
    prepare(special, distance) {
      const scene = f.scenario(special);
      if (special === 'waveBreaker') {
        scene.a.setWeapon('s3-shooter-short');
        assert.ok(f.applyCatalogueChoice(scene.a, { sub: 'bomb', special }, f));
        scene.a.special = scene.a.specialCost();
      }
      scene.enemy.pos.z = distance; scene.enemy.hp = 100;
      f.aim(scene.a, scene.b, scene.enemy.pos);
      scene.ally = f.G.actors.find(a => a !== scene.a && a.team === scene.a.team);
      return scene;
    },
    tick(a, b, enemy, ally) {
      f.G.time += STEP; b.update(STEP); a.update(STEP); enemy.update(STEP); ally?.update(STEP);
      f.G.projectiles.update(STEP); f.G.paint.advanceSimulation(STEP);
    },
  });
  assert.equal(rows.length, 18);
  assert.equal(new Set(rows.map(r => r.special)).size, 18);
  for (const [id] of FOLLOWTHROUGH_CASES) assert.ok(rows.some(r => r.special === id), id);
  assert.deepEqual(rows.filter(row => !row.pass), [], JSON.stringify(rows, null, 2));
});
