import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';

test('menu bot aim settles on a stationary target across touch/LOW and render intervals', async () => {
  for (const tier of ['touch', 'low', 'desktop']) for (const fps of [20, 30, 60, 120]) {
    const f = await fixture({ productionComposition: true,
      extraExports: `export { BotBrain } from './inkwave-public/src/game/bots.js';
        export { installAttractBotBudget } from './patches/local-quality/offline-offscreen-budget.mjs';` });
    const { G, THREE } = f, actor = f.make();
    actor.isBot = true; actor.team = 0; actor.slot = 0; actor.grounded = false;
    actor.yaw = 0;
    const move = new THREE.Vector3();
    // Exercise the real native spring and steering tail with a fixed target;
    // perception/navigation are intentionally held constant in this control case.
    class Brain extends f.BotBrain {
      update(dt) { this._tail(dt, move, 0.4, -0.3, 6, false); }
    }
    const brain = actor.bot = new Brain(actor);
    brain.mode = 'fight'; brain.target = actor; brain.aimYaw = 0;
    const samples = [], steps = [];
    const match = G.match = { attract: true, state: 'playing', paused: false, actors: [actor],
      updateController() {},
      update(dt) { steps.push(dt); brain.update(dt); samples.push([brain.aimYaw, brain.aimPitch]); },
    };
    G.mode = 'menu'; G.netm = null;
    G.projectiles = { update() {} };
    const game = G.game = { match, mobile: { touch: tier === 'touch' },
      settings: { quality: tier === 'low' ? 'low' : 'high' }, showcase: {},
      input: { padPressed: new Set(), pollPad() {}, endFrame() {} },
      _padMenus() {}, _updateAttract() {},
    };
    f.installAttractBotBudget({ BotBrain: Brain }, G); f.installClock({ G });
    for (let i = 0; i < 2 * fps; i++) f.runSimulation(game, 1 / fps);
    for (const [yaw, pitch] of samples.slice(-10)) {
      assert.ok(Math.abs(yaw - 0.4) < 0.001, `${tier}/${fps}: yaw settles, got ${yaw}`);
      assert.ok(Math.abs(pitch + 0.3) < 0.001, `${tier}/${fps}: pitch settles, got ${pitch}`);
    }
    assert.equal(steps.length, 120, `${tier}/${fps}: physical ticks`);
    assert.ok(steps.every(dt => Math.abs(dt - 1 / 60) < 1e-10));
  }
});
