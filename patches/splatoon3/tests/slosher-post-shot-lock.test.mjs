import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';

// #926: after the Slosher glob is emitted S3 keeps the player committed for 16F before swim-form entry;
// the community v10.0.1 table records sub admission separately at 15F. Logic-only: real adapted Actor.update / WeaponRunner.update with fireSlosh/throwBomb
// stubbed. Not a browser run and not a Switch comparison.
async function setup() {
  const f = await fixture(), a = f.make('slosher'), log = { slosh: [], bomb: [] };
  f.G.camera = { position: new f.THREE.Vector3(0, 20, 0) }; f.G.actors = [a]; f.G.match.canRespawn = () => false;
  let tick = 0;
  f.G.projectiles.fireSlosh = () => log.slosh.push(tick);
  f.G.projectiles.throwBomb = () => log.bomb.push(tick);
  const step = (n = 1) => { for (let i = 0; i < n; i++) { tick++; f.tick(a); } };
  f.tick(a, 600); // settle out of any emerge delay
  return { f, a, log, step, get tick() { return tick; } };
}
// Press ZR once, release it next tick, and advance to the emission tick (12F windup). Returns that tick.
function shootOnce(r) {
  r.a.intent.fire = true; r.step(); r.a.intent.fire = false;
  while (!r.log.slosh.length) r.step();
  return r.log.slosh[0];
}

test('#926 swim-form entry is rejected for 15 post-shot ticks and legal on the 16th', async () => {
  const r = await setup(), w = r.a.weapon;
  assert.ok(Math.abs(w.postShotLock - 16 / 60) < 1e-12);
  r.a.intent.squid = true; // ZL held through the whole windup
  const emitted = shootOnce(r);
  assert.equal(emitted - 1, 12, 'glob emission is 12 ticks after the trigger tick');
  assert.equal(r.a.form, 'kid');
  const entered = [];
  for (let k = 1; k <= 20; k++) { r.step(); entered.push(r.a.form); }
  assert.deepEqual(entered.map(x => x === 'squid'), Array.from({ length: 20 }, (_, i) => i + 1 >= 16),
    'kid for post-shot ticks 1..15, squid from tick 16');
});

test('#926 sub use is blocked for the post-shot window; a buffered sub resolves once on tick 15', async () => {
  const r = await setup();
  shootOnce(r);
  r.a.intent.sub = true; r.step(2); r.a.intent.sub = false; // tap SUB right after the emission
  assert.deepEqual(r.log.bomb, [], 'no throw inside the gate');
  r.step(40);
  assert.equal(r.log.bomb.length, 1, 'exactly one throw');
  assert.equal(r.log.bomb[0] - r.log.slosh[0], 15, 'throw lands on the 15th post-shot tick, not stale or duplicated');
});

test('#926 sub resumes its normal readiness and 1F use gate after the main lock expires', async () => {
  const r = await setup();
  shootOnce(r); r.step(20);
  r.a.intent.sub = true; r.step(6); r.a.intent.sub = false; r.step();
  assert.equal(r.log.bomb.length, 0, 'release owns one separate use-startup tick'); r.step();
  assert.equal(r.log.bomb.length, 1);
  assert.equal(r.log.bomb[0], r.tick, 'throw follows the normal 1F use-startup');
});

test('#926 the 29F repeat interval and the held-ZR carry are unchanged', async () => {
  const r = await setup();
  r.a.intent.fire = true; r.step(110);
  assert.deepEqual(r.log.slosh.slice(1).map((t, i) => t - r.log.slosh[i]), [29, 29, 29]);
  assert.equal(r.log.slosh.length, 4);
});

test('#926 reset clears the post-shot lock', async () => {
  const r = await setup(), runner = r.a.weaponRunner;
  shootOnce(r); assert.ok(runner.s3SloshPostShot > 0); assert.equal(runner.busy(), true);
  runner.reset(); assert.equal(runner.s3SloshPostShot, 0);
  assert.equal(runner.busy(), false);
});

test('#926 only Slosher is gated: other weapons keep an unlocked busy() after a shot', async () => {
  const f = await fixture();
  for (const id of ['shooter', 'roller', 'blaster', 'splatling']) {
    const a = f.make(id);
    assert.equal(a.weaponRunner.s3SloshPostShot ?? 0, 0, id);
    a.weaponRunner.s3SloshPostShot = 1;
    assert.equal(a.weaponRunner.busy(), false, `${id} ignores a stray slosher timer`);
  }
});
