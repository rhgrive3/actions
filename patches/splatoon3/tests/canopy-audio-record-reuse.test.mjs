import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fixture } from './source-fixture.mjs';
import { WEAPON_AUDIO } from '../runtime/audio/weapon-recipes.mjs';

async function setup() {
  const f = await fixture({ fullRuntime: true, productionComposition: true,
    realProjectiles: true, vmMathRandom: () => .5,
    extraExports: "export {installWeaponAudioRuntime} from './patches/splatoon3/runtime/audio/runtime.mjs';" });
  const calls = [];
  f.G.audio = { ctx: {}, prepareWeapon() {}, prewarmChargerChargeRise() {}, duck() {}, play() {},
    playWeapon(id, event, options) {
      const prior = options.actor?.weaponRunner?._mainAudioState?.canopy;
      calls.push({ id, event, options, prior, priorOpen: prior?.open, priorLaunched: prior?.launched });
    },
    loopWeapon() { return { playing: true, set() {}, stop() { this.playing = false; } }; } };
  f.G.physics.segment = (_a, _b, hit) => { hit.hit = false; return hit; };
  f.installWeaponAudioRuntime(f.installedRuntime);
  function make(id = 's3-shelter-compact') {
    const actor = f.make(id);
    actor.form = 'kid'; actor.isLocal = true; actor.grounded = true;
    return actor;
  }
  function tick(actor, fire = true) { actor.ink = 100; actor.intent.fire = fire; f.tick(actor, 1); }
  return { ...f, calls, make, tick };
}

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('Brella snapshots reuse one record while preserving allocating-baseline events and gameplay', async () => {
  const f = await setup(), events = [], snapshots = [], launches = [];
  let frame = 0;
  for (const id of Object.values(WEAPON_AUDIO).filter(r => r.family === 'brella').map(r => r.id)) {
    const actor = f.make(id), runner = actor.weaponRunner;
    let last = null, reused = 0, launchCount = 0;
    function ticks(count, fire) {
      for (let i = 0; i < count; i++) {
        frame++;
        const gameplay = runner.catalogState?.canopy;
        const wasLaunched = gameplay?.launched;
        f.tick(actor, fire);
        if (!wasLaunched && gameplay?.launched) launchCount++;
        const record = runner._mainAudioState?.canopy;
        if (last && record) {
          assert.equal(record, last, `${id}: persistent canopy snapshot must not be replaced`);
          reused++;
        }
        last = record;
        snapshots.push({ id, frame,
          canopy: record ? { open: record.open, launched: record.launched } : null,
          gameplay: runner.catalogState?.canopy ? {
            open: runner.catalogState.canopy.open, launched: runner.catalogState.canopy.launched } : null });
        for (const { id: weaponId, event, options } of f.calls.splice(0)) {
          events.push({ frame, id: weaponId, event, volume: options.volume,
            pos: options.pos ? [options.pos.x, options.pos.y, options.pos.z] : null });
        }
      }
    }
    ticks(80, true); ticks(10, false); ticks(400, true); ticks(10, false);
    const beforeReset = runner._mainAudioState?.canopy;
    runner.reset(); assert.equal(runner._mainAudioState, null); last = null;
    ticks(80, true); ticks(10, false);
    if (beforeReset) assert.notEqual(runner._mainAudioState.canopy, beforeReset, 'reset releases prior ownership');
    actor.form = 'squid'; actor.submerged = true; runner.update(1 / 60, { fire: false });
    assert.equal(runner._mainAudioState.canopy, null); last = null;
    actor.form = 'kid'; actor.submerged = false; ticks(80, true);
    actor.setWeapon('shooter'); ticks(2, false);
    assert.equal(runner._mainAudioState?.canopy, null, 'weapon switch clears canopy');
    assert.ok(reused > 0, `${id}: exercise repeated live snapshots`);
    launches.push(launchCount);
    f.G.actors.length = 0; f.G.projectiles.clear();
  }
  assert.equal(snapshots.length, 2688);
  assert.equal(events.length, 63);
  assert.deepEqual([...new Set(events.map(e => e.event))], ['fire', 'open', 'close']);
  assert.deepEqual(launches, [1, 1, 0, 2], 'real gameplay launches remain covered');
  // Golden transcripts from the pre-optimization allocating implementation:
  // all four Brellas, hold/release/launch, reset, submerge and weapon switch.
  assert.equal(digest(events), 'abb72d96bc4c13f4a31360df653c866ac2354e15d2b581938aa30bec74b56a47');
  assert.equal(digest(snapshots), '2dd9204e26c8272c5d7578731b6fcb98986259a89cbade432ec9d1badd62c733');
});

test('canopy records remain actor-local and callbacks precede writes; splat/removal release ownership', async () => {
  const f = await setup();
  function ready() { const actor = f.make(); for (let i = 0; i < 80; i++) f.tick(actor); return actor; }
  const a = ready(), b = ready(), ra = a.weaponRunner, rb = b.weaponRunner;
  const sa = ra._mainAudioState.canopy, sb = rb._mainAudioState.canopy;
  assert.ok(sa); assert.ok(sb); assert.notEqual(sa, sb);
  assert.notEqual(sa, ra.catalogState.canopy); assert.notEqual(sb, rb.catalogState.canopy);
  assert.deepEqual(Object.keys(sa).sort(), ['launched', 'open']);
  const opens = f.calls.filter(c => c.event === 'open');
  assert.ok(opens.length >= 2);
  for (const call of opens) assert.ok(!call.priorOpen, 'open callback observes previous closed state');
  for (const call of f.calls) {
    for (const record of [sa, sb]) {
      assert.notEqual(call.options, record); assert.notEqual(call.options.pos, record);
    }
  }
  f.emit('splatted', { victim: a });
  assert.equal(ra._mainAudioState.canopy, null); assert.equal(rb._mainAudioState.canopy, sb);
  f.tick(a, false);
  assert.notEqual(ra._mainAudioState?.canopy, sa, 'released record cannot be resurrected');
  f.emit('actor:removed', { actor: b }); assert.equal(rb._mainAudioState.canopy, null);
  ra.reset(); assert.equal(ra._mainAudioState, null);
});
