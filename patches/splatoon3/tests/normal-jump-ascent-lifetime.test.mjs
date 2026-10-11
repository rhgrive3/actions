import test from 'node:test';
import assert from 'node:assert/strict';
import { installNormalJumpHold, normalJumpHoldState } from '../runtime/normal-jump-hold.mjs';
import fs from 'node:fs';
import { fixture } from './source-fixture.mjs';

function harness() {
  class Actor {
    constructor() {
      this.alive = true; this.form = 'kid'; this.grounded = true;
      this.vel = { y: 0 }; this.intent = { jump: true }; this.s3JumpSerial = 0;
    }
    update() {
      if (this.launch) { this.s3JumpSerial++; this.vel.y = 8.4; this.grounded = false; this.launch = false; }
    }
    reset() { this.grounded = true; this.vel.y = 0; }
  }
  installNormalJumpHold({ Actor });
  const a = new Actor(); a.launch = true; a.update(1 / 60); return a;
}

for (const vy of [0, -.1]) test(`#890 ascent ending at ${vy} retires an unconsumed early-release response`, () => {
  const a = harness();
  assert.equal(normalJumpHoldState(a).frames, 1);
  a.vel.y = vy; a.update(1 / 60);
  assert.equal(normalJumpHoldState(a), null);
  a.vel.y = 4; a.intent.jump = false; a.update(1 / 60);
  assert.equal(a.vel.y, 4, 'later external rise does not revive an old jump release');
  assert.equal(a.s3JumpSerial, 1);
});

test('#890 a new accepted jump after a blocked ascent owns a fresh short-hop response', () => {
  const a = harness(); a.vel.y = 0; a.update(1 / 60);
  a.grounded = true; a.launch = true; a.update(1 / 60);
  assert.equal(normalJumpHoldState(a).serial, 2);
  a.intent.jump = false; a.update(1 / 60);
  assert.equal(a.vel.y, 8.4 * .7);
  assert.equal(normalJumpHoldState(a).applied, true);
});

test('#890 real ceiling collision retires the hold epoch on its own collision tick', async () => {
  const hold = fs.readFileSync(new URL('../runtime/normal-jump-hold.mjs', import.meta.url), 'utf8');
  const f = await fixture({ productionComposition: true, fullRuntime: true, realProjectiles: true,
    extraExports: "export { normalJumpHoldState } from './patches/splatoon3/runtime/normal-jump-hold.mjs';",
    adaptRuntime: (rel, source) => rel === 'patches/splatoon3/runtime/normal-jump-hold.mjs' ? hold : source });
  const level = new f.Level({ bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
    spawnPads: [[-10, 0, 0], [10, 0, 0]], spawnBarrier: 0, half: [],
    single: [{ kind: 'box', min: [-20, -1, -20], max: [20, 0, 20] },
      { kind: 'box', min: [-2, 1.5, -2], max: [2, 2, 2] }] });
  f.G.level = level; f.G.physics = new f.Physics(level);
  const a = f.make(); delete a._integrate;
  a.pos.set(0, 0, 0); a.vel.set(0, 0, 0); a.form = 'kid';
  a.intent.jump = true; f.tick(a);
  assert.equal(a.s3JumpSerial, 1, 'a real ordinary jump was admitted');
  assert.equal(a.contacts.ceiling, true, 'the real collision resolver ended the ascent');
  assert.equal(a.vel.y, 0);
  assert.equal(f.normalJumpHoldState(a), null, 'retired before the next update');
});
