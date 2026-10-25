import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { audioFixture, idleFixture } from './idle-fixture.mjs';

const source = fs.readFileSync(new URL('../../../inkwave-public/src/audio/music.js', import.meta.url), 'utf8');
const composed = adaptBuildSource('src/audio/music.js', source);

async function fixture({ baseline = false, sampleRate = 48000 } = {}) {
  const f = audioFixture(), convolvers = [];
  f.ctx.sampleRate = sampleRate;
  const createConvolver = f.ctx.createConvolver;
  f.ctx.createConvolver = () => {
    const node = createConvolver();
    node.context = f.ctx;
    node.buffer = null;
    convolvers.push(node);
    return node;
  };
  const api = await idleFixture({ baseline, globals: f.globals,
    transform: (rel, text) => !baseline && rel === 'src/audio/music.js' ? composed : text });
  const music = new api.MusicEngine();
  music._init(f.ctx, f.ctx.createGain(), { offline: true });
  return { ...f, music, convolvers };
}

test('baseline disposed music retains its disconnected graph and complete impulse through the singleton', async () => {
  const f = await fixture({ baseline: true });
  const graph = f.music._nodes, impulse = f.convolvers[0].buffer;
  assert.equal(impulse.length, Math.floor(48000 * 2.2));
  f.music.dispose();
  assert.equal(f.music.ctx, null);
  assert.equal(f.music._nodes, graph);
  assert.equal(graph.length, 17);
  assert.equal(graph[15].buffer, impulse);
  assert.equal(graph[15].context, f.ctx, 'the retired ConvolverNode pins the old context');
});

for (const sampleRate of [44100, 48000, 96000]) {
  test(`composed music disposal releases graph references and IR at ${sampleRate}Hz without closing the SFX context`, async () => {
    const f = await fixture({ sampleRate });
    f.music.play('opening', { seed: 14 });
    const graph = f.music._nodes, impulse = f.convolvers[0].buffer;
    assert.equal(graph.length, 17);
    assert.equal(impulse.length, Math.floor(sampleRate * 2.2));
    const state = f.ctx.state;
    f.music.dispose();
    assert.equal(f.music.ctx, null);
    assert.equal(graph.length, 0, 'the old node array cannot pin its ConvolverNode or context');
    assert.equal(f.convolvers[0].buffer, null, 'retired convolution memory is explicitly released');
    for (const key of ['mix', 'out', 'dlyIn', 'revIn', 'dA', 'dB', '_preparedMusicImpulse']) assert.equal(f.music[key], null, key);
    assert.equal(f.music.players.length, 0);
    assert.equal(f.ctx.state, state, 'music disposal does not close or suspend shared SFX');
    assert.equal(f.counts.suspended, 0);
    f.music.dispose();
    assert.equal(graph.length, 0, 'repeat disposal remains harmless');
  });
}

test('disposing and reinitializing music restores the identical lazy graph and every impulse sample', async () => {
  const f = await fixture({ sampleRate: 8000 });
  f.music.play('opening', { seed: 14 });
  const oldGraph = f.music._nodes, oldOut = f.music.out;
  const expected = [0, 1].map(channel => new Float32Array(f.convolvers[0].buffer.getChannelData(channel)));
  f.music.dispose();
  f.music._init(f.ctx, f.ctx.createGain(), { offline: true });
  assert.notEqual(f.music._nodes, oldGraph);
  assert.equal(f.music._nodes.length, 4, 'reinit keeps procedural delay and reverb lazy');
  assert.equal(f.convolvers.length, 1);
  assert.notEqual(f.music.out, oldOut);
  f.music.play('opening', { seed: 14 });
  assert.equal(f.music._nodes.length, 17);
  assert.equal(f.convolvers.length, 2);
  for (let channel = 0; channel < 2; channel++) assert.deepEqual(f.convolvers[1].buffer.getChannelData(channel), expected[channel]);
  assert.equal(f.music.current.id, 'opening');
  f.music.dispose();
  assert(f.convolvers.every(node => node.buffer === null));
});

test('disposing before lazy FX construction releases a prepared IR without allocating a ConvolverNode', async () => {
  const f = await fixture();
  const impulse = f.ctx.createBuffer(2, 64, 48000);
  f.music._preparedMusicImpulse = impulse;
  assert.equal(f.convolvers.length, 0);
  f.music.dispose();
  assert.equal(f.music._preparedMusicImpulse, null);
  assert.equal(f.music._nodes.length, 0);
  assert.equal(f.convolvers.length, 0);
});
