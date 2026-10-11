import test from 'node:test';
import assert from 'node:assert/strict';
import { idleFixture, audioFixture } from './idle-fixture.mjs';

async function rig(volumes) {
  const f = audioFixture(), { AudioEngine, music } = await idleFixture({ globals: f.globals });
  const audio = new AudioEngine({ context: f.ctx });
  if (volumes) audio.setVolumes(volumes);
  audio.init();
  return { ...f, audio, music };
}

test('#461 persisted Master=0 prevents native one-shot and ambience construction while retaining a deferred request', async () => {
  const f = await rig({ master: 0, sfx: 1, music: .6 });
  const before = { ...f.counts };
  assert.equal(f.audio.play('jump'), null);
  const h = f.audio.loop('harbor_ambience', { volume: .55 });
  assert.equal(h.playing, false);
  assert.equal(f.audio._sfxReq.size, 1);
  assert.equal(f.counts.nodes, before.nodes); assert.equal(f.counts.starts, before.starts);
  assert.equal(f.counts.suspended, 0);
  h.stop(); f.music.dispose();
});

test('#461 Master mute parks a live ambience handle and resumes its latest parameters once', async () => {
  const f = await rig({ master: .8, sfx: 1 });
  const h = f.audio.loop('harbor_ambience', { volume: .55 });
  assert.equal(h.playing, true);
  f.audio.setVolumes({ master: 0 });
  assert.equal(h.playing, false); assert.equal(f.audio.loops.size, 0);
  const muted = { ...f.counts };
  h.set({ volume: .3, pitch: 1.2, pos: { x: 2, y: 0, z: 1 } });
  for (let i = 0; i < 20; i++) assert.equal(f.audio.play('jump'), null);
  assert.equal(f.counts.nodes, muted.nodes); assert.equal(f.counts.starts, muted.starts);
  f.audio.setVolumes({ master: .8 });
  assert.equal(h.playing, true); assert.equal(f.audio.loops.size, 1); assert.equal(f.audio._sfxReq.size, 1);
  const rec = [...f.audio._sfxReq][0]; assert.equal(rec.o.volume, .3); assert.equal(rec.o.pitch, 1.2);
  const restored = f.counts.starts;
  f.audio.setVolumes({ master: .8 }); assert.equal(f.counts.starts, restored);
  h.stop(); assert.equal(f.audio._sfxReq.size, 0); f.music.dispose();
});

test('#461 either muted bus blocks SFX resume, and stop/stopAll cannot resurrect deferred loops', async () => {
  const f = await rig({ master: 0, sfx: 1 }), h = f.audio.loop('harbor_ambience');
  for (let i = 0; i < 8; i++) {
    f.audio.setVolumes({ sfx: 0 }); f.audio.setVolumes({ master: .8 });
    assert.equal(h.playing, false); assert.equal(f.audio.loops.size, 0);
    f.audio.setVolumes({ sfx: .7 }); assert.equal(h.playing, true); assert.equal(f.audio.loops.size, 1);
    f.audio.setVolumes({ master: 0 }); assert.equal(h.playing, false); assert.equal(f.audio.loops.size, 0);
  }
  h.stop(); f.audio.loop('harbor_ambience'); f.audio.stopAll();
  const before = f.counts.starts; f.audio.setVolumes({ master: .8 });
  assert.equal(f.counts.starts, before); assert.equal(f.audio._sfxReq.size, 0); assert.equal(f.audio.loops.size, 0);
  assert.equal(f.counts.suspended, 0); f.music.dispose();
});

test('#461 SFX toggles retain the independent music player and normal future audible effects', async () => {
  const f = await rig({ master: .8, music: .6, sfx: 1 }); f.music.play('title');
  const player = f.music.current;
  f.audio.setVolumes({ sfx: 0 }); assert.equal(f.music.current, player); assert.equal(f.workers.size, 1);
  f.audio.setVolumes({ sfx: .7 }); assert.equal(f.music.current, player);
  const before = f.counts.starts; assert.notEqual(f.audio.play('jump'), null); assert.ok(f.counts.starts > before);
  f.audio.stopAll(); f.music.dispose();
});

for (const key of ['master', 'sfx']) test(`#461 ${key}-muted handle birth retains changes and joins steady-state dedupe after resume`, async () => {
  const f = await rig({ master: .8, sfx: 1, [key]: 0 });
  const h = f.audio.loop('harbor_ambience', { volume: .55, pitch: 1 });
  h.set({ volume: .3, pitch: 1.2 });
  const rec = [...f.audio._sfxReq][0];
  assert.equal(rec.o.volume, .3); assert.equal(rec.o.pitch, 1.2);
  f.audio.setVolumes({ [key]: .8 }); assert.equal(h.playing, true);
  const set = rec.live.set; let calls = 0;
  rec.live.set = function (...args) { calls++; return set.apply(this, args); };
  for (let i = 0; i < 120; i++) h.set({ volume: .3, pitch: 1.2 });
  assert.equal(calls, 0, 'a handle born muted must still suppress duplicate live parameter work');
  h.set({ volume: .4 }); assert.equal(calls, 1);
  h.stop(); h.set({ volume: .2 }); assert.equal(calls, 1, 'stopped requests stay retired');
  f.music.dispose();
});

for (const key of ['master', 'sfx']) test(`#461 ${key}-muted live handle keeps the latest deferred parameters`, async () => {
  const f = await rig({ master: .8, sfx: 1 });
  const h = f.audio.loop('harbor_ambience', { volume: .55 });
  f.audio.setVolumes({ [key]: 0 });
  h.set({ volume: .3, pitch: 1.2 });
  const rec = [...f.audio._sfxReq][0]; assert.equal(rec.o.volume, .3); assert.equal(rec.o.pitch, 1.2);
  f.audio.setVolumes({ [key]: .8 }); assert.equal(h.playing, true);
  h.stop(); f.music.dispose();
});
