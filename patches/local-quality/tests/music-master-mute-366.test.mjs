import test from 'node:test';
import assert from 'node:assert/strict';
import { idleFixture, audioFixture } from './idle-fixture.mjs';

for (const worker of [true, false]) {
  const transport = worker ? 'worker' : 'interval';
  async function rig() {
    const f = audioFixture();
    if (!worker) f.globals.Worker = class { constructor() { throw Error('worker unavailable'); } };
    const { AudioEngine, music } = await idleFixture({ globals: f.globals });
    return { ...f, AudioEngine, music, audio: new AudioEngine({ context: f.ctx }),
      schedulers: () => f.workers.size + f.intervals.size };
  }
  test(`#366 ${transport}: persisted master zero never starts an inaudible music player and resumes the latest requested track`, async () => {
    const f = await rig();
    f.audio.setVolumes({ master: 0, music: .6, sfx: 1 });
    f.music.play('title'); f.audio.init();
    assert.equal(f.music.players.length, 0);
    assert.equal(f.schedulers(), 0);
    const starts = f.counts.starts;
    f.music.play('battle'); f.audio.setVolumes({ music: .8 });
    for (let i = 0; i < 400; i++) { f.ctx.currentTime += .025; f.music._tick(); }
    assert.equal(f.counts.starts, starts, 'effective music volume zero creates no new notes');
    assert.equal(f.counts.suspended, 0, 'the shared audio context is not suspended');
    f.audio.setVolumes({ master: .8 });
    assert.equal(f.music.track, 'battle'); assert.equal(f.schedulers(), 1);
    const beforeSfx = f.counts.starts; f.audio.play('jump');
    assert.ok(f.counts.starts > beforeSfx, 'SFX remain usable after master unmute');
    f.music.dispose(); assert.equal(f.schedulers(), 0);
  });
  test(`#366 ${transport}: either zero bus idles music, repeated toggles and stopped tracks cannot leak schedulers`, async () => {
    const f = await rig(); f.audio.init(); f.music.play('title', { fade: 0 });
    assert.equal(f.schedulers(), 1);
    for (let i = 0; i < 8; i++) {
      f.audio.setVolumes({ master: 0 });
      assert.equal(f.schedulers(), 0); assert.equal(f.music.players.length, 0);
      f.audio.setVolumes({ music: 0 }); f.audio.setVolumes({ master: .8 });
      assert.equal(f.schedulers(), 0, 'master unmute must respect the independent Music=0 setting');
      f.audio.setVolumes({ music: .6 });
      assert.equal(f.schedulers(), 1); assert.equal(f.music.players.length, 1);
    }
    f.audio.setVolumes({ master: 0 }); f.music.stop(); f.audio.setVolumes({ master: .8 });
    assert.equal(f.music.track, null); assert.equal(f.schedulers(), 0);
    assert.equal(f.counts.suspended, 0);
    f.music.dispose();
  });
}

test('#366 a music:false preview engine never changes the shared music singleton mute state', async () => {
  const f = audioFixture(), { AudioEngine, music } = await idleFixture({ globals: f.globals });
  const audio = new AudioEngine({ context: f.ctx }); audio.init(); music.play('title');
  const preview = new AudioEngine({ context: f.ctx, music: false });
  preview.setVolumes({ master: 0, music: 0 }); preview.init();
  assert.equal(music.track, 'title'); assert.equal(music.players.length, 1); assert.equal(f.workers.size, 1);
  music.dispose();
});
