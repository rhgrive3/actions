// #53: the RESULT screen must not keep authoritative actor/projectile
// simulation running behind it. The test drives the actual installed fixed
// 60Hz driver (runtime/clock.mjs runSimulation), not a mirror of the guard.
// Presentation ticks and input consumption keep their existing cadence;
// online matches keep owner/remote snapshot application (once per tick)
// without any local authoritative acting.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installClock, runSimulation } from '../runtime/clock.mjs';

function rig({ state = 'results', netm = null } = {}) {
  const calls = { controller: 0, sim: 0, projectile: 0, endFrame: 0, applied: 0 };
  const G = { time: 0, projectiles: { update() { calls.projectile++; } }, netm };
  installClock({ G });
  const input = {
    padPressed: new Set(), mouse: { dx: 0 }, pressed: new Set(), mobile: { lookDX: 0, lookDY: 0 },
    pollPad() { this.padPressed.clear(); },
    endFrame() { calls.endFrame++; },
  };
  const match = {
    attract: false, paused: false, state, actors: [],
    updateController() { calls.controller++; },
    update() { calls.sim++; },
    controller: null, local: null,
  };
  const game = { input, _padMenus() {}, match, rig: { mode: '', target: null, follow() {} }, showcase: null };
  return { G, game, calls, match, input };
}

test('RESULT does not continue authoritative actor or projectile simulation', () => {
  const { G, game, calls } = rig({ state: 'results' });
  for (let i = 0; i < 60; i++) runSimulation(game, 1 / 60);
  assert.equal(calls.sim, 0, 'Match.update must not run behind the results screen');
  assert.equal(calls.controller, 0, 'controller admission must not run behind the results screen');
  assert.equal(calls.projectile, 0, 'Projectiles.update must not run behind the results screen');
  assert.ok(G.time > 0, 'the fixed presentation/input clock still advances');
  assert.equal(calls.endFrame, 60, 'input edges are still consumed once per tick for menu navigation');
});

test('a new match resumes simulation from the same fixed clock, and results freeze again', () => {
  const { game, calls, match } = rig({ state: 'results' });
  runSimulation(game, 1 / 60);
  assert.equal(calls.sim, 0);
  match.state = 'playing';
  runSimulation(game, 1 / 60);
  assert.equal(calls.sim, 1, 'playing resumes without a duplicate chain');
  assert.equal(calls.controller, 1);
  assert.equal(calls.projectile, 1);
  match.state = 'results';
  runSimulation(game, 1 / 60);
  assert.equal(calls.sim, 1, 'the results freeze applies again after a later match');
});

test('online RESULT stops local authoritative acting while owner/remote application and the pump stay healthy', () => {
  const { G, game, calls, match } = rig({ state: 'results', netm: { myId: 'me', applyRemote() { calls.applied++; } } });
  match.actors.push({ remote: true }, { remote: false });
  const pumps = [];
  G.net = { update(dt) { pumps.push(dt); } };   // NetSession/NetMatch pump, control, event delivery
  for (let i = 0; i < 60; i++) runSimulation(game, 1 / 60);
  assert.equal(calls.sim, 0, 'network RESULT must not keep Match.update acting behind the results screen');
  assert.equal(calls.controller, 0, 'controller admission stops with local acting');
  assert.equal(calls.projectile, 0, 'projectile simulation stops with local acting');
  assert.equal(calls.applied, 60, 'remote owner snapshots apply exactly once per tick — never frozen or double-applied');
  assert.equal(pumps.length, 60, 'network pump/control/event delivery keeps one update per rendered frame');
  assert.ok(G.time > 0, 'the fixed presentation/input clock still advances');
  assert.equal(calls.endFrame, 60, 'input edges are still consumed once per tick for menu navigation');
});

test('ordinary playing matches and paused matches keep their current behaviour', () => {
  const { game, calls, match } = rig({ state: 'playing' });
  runSimulation(game, 1 / 60);
  assert.equal(calls.sim, 1);
  match.paused = true;
  runSimulation(game, 1 / 60);
  assert.equal(calls.sim, 2, 'Match.update still runs and self-returns while paused');
  assert.equal(calls.controller, 2, 'paused PLAYING retains its existing controller update cadence');
  assert.equal(calls.projectile, 1, 'paused matches still skip Projectiles.update exactly as before');
  assert.equal(calls.endFrame, 2, 'paused PLAYING still consumes input edges once per tick');
});
