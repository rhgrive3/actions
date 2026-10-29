import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const EXTRA = "export { blockExpiredGuestInput } from './patches/splatoon3/runtime/turf-finish.mjs';";
async function run({ storm, expired }) {
  const f = await fixture({ fullRuntime: true, productionComposition: true, extraExports: EXTRA });
  const actor = f.make(); actor._resolve = () => {};
  if (storm) actor.specialActive = { id: 'storm', t: 0, phase: 'hold', subWasDown: false, subArmed: false };
  const match = { follower: true, mode: 'turf', attract: false, state: 'playing', time: expired ? 0 : 10,
    local: actor, playing: () => true };
  f.G.match = match;
  let jumps = 0;
  f.on('actor:jump', event => {
    if (event.actor === actor && ++jumps === 1) actor.intent.jumpPressed = true;
  });
  actor.intent.jump = true; actor.intent.jumpPressed = true;
  actor.update(1 / 60);
  assert.equal(jumps, 1);
  assert.equal(actor.intent.jumpPressed, true, 'synchronous listener queues a later jump edge');
  actor.grounded = true; actor.ground.hit = true; actor.ground.face = 0;
  assert.equal(f.blockExpiredGuestInput(match), expired);
  actor.update(1 / 60);
  return jumps;
}

test('guest deadline drops queued jump edges while live input remains accepted', async () => {
  for (const storm of [false, true]) {
    assert.equal(await run({ storm, expired: true }), 1, `expired guest, storm=${storm}`);
    assert.equal(await run({ storm, expired: false }), 2, `active guest, storm=${storm}`);
  }
});
