import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const helper = fs.readFileSync(new URL('../lib/inkwave-catalog-audio.mjs', import.meta.url), 'utf8');
const root = process.env.CATALOG_AUDIO_SOURCE_ROOT || fileURLToPath(new URL('../../', import.meta.url));
const prefix = '/_versions/' + 'a'.repeat(64) + '/';
const helpers = [
  ['combat-hit-classifier.mjs', 'sourceChargerHitCue'],
  ['blaster-hit.mjs', 'blasterHitCueKind'],
];

// Execute only the serialized graph coordinator with inert mock namespaces.
// No production modules, browser, audio device or gameplay code is executed.
async function probe({ missing, reject, initialized = false, badProtocol = false, badPrewarm = false } = {}) {
  const loaded = [], workers = [];
  const namespaces = new Map([
    ['src/audio/audio.js', {audio: {ctx: initialized ? {} : null, playWeapon() {}, loopWeapon() {}}}],
    ['src/audio/music.js', {music: {play() {}}}],
    ['patches/splatoon3/runtime/audio/runtime.mjs', {installWeaponAudioRuntime() {}}],
    ...helpers.map(([file, name]) => ['patches/splatoon3/runtime/audio/' + file, {[name]() {}}]),
    ['patches/splatoon3/runtime/audio/grain-texture.mjs',{renderTexturePCM:()=>new Float32Array([1,2,3])}],
    ['patches/splatoon3/runtime/audio/reverb-impulse.mjs',{renderReverbPair:()=>[[new Float32Array([4,5]),new Float32Array([6,7])]]}],
    ['patches/splatoon3/runtime/audio/music-preload-owner.mjs',{claimPreloadedMusic(){},cancelPreloadedMusic(){}}],
  ]);
  if (missing) namespaces.set('patches/splatoon3/runtime/audio/' + missing, {});
  class Worker {
    constructor(url, options) { this.url = url; this.options = options; workers.push(this); }
    postMessage(message) { this.message = message; queueMicrotask(() => {
      const data=this.url.endsWith('grain-worker.mjs')?{sampleRate:8000,generation:message.generation,kind:'bubbles',pcm:new Float32Array([badPrewarm?9:1,2,3])}:this.url.endsWith('reverb-worker.mjs')?{sampleRate:8000,generation:message.generation,pair:[[new Float32Array([4,5]),new Float32Array([6,7])]]}:{key:message.key,error:badProtocol?'wrong':'Unknown audio ID'};
      this.onmessage({data});
    }); }
    terminate() { this.terminated = true; }
  }
  const start = helper.indexOf('export async function catalogAudioGraph(');
  assert.ok(start >= 0);
  const source = helper.slice(start).replace(/^export /, '').replace(/\bimport\(/g, 'load(');
  const run = vm.runInNewContext('(' + source + ')', {
    Worker, setTimeout, clearTimeout, Float32Array, Uint8Array,
    load: async url => {
      loaded.push(url);
      assert.ok(url.startsWith(prefix), 'every graph entry keeps immutable prefix');
      const file = url.slice(prefix.length);
      if (file === 'patches/splatoon3/runtime/audio/' + reject) throw Error('mock missing emitted helper');
      assert.ok(namespaces.has(file), 'only production graph entries are imported');
      return namespaces.get(file);
    },
  });
  return { loaded, workers, result: run(prefix) };
}

test('isolated audio graph loads both main-owned helpers without initializing audio', async () => {
  const {loaded, workers, result} = await probe();
  const receipt = await result;
  for (const [file] of helpers) assert.equal(loaded.filter(url => url === prefix + 'patches/splatoon3/runtime/audio/' + file).length, 1);
  assert.equal(loaded.length, 8);
  assert.equal(receipt.deviceInitialized, false);
  assert.equal(receipt.workerProtocol, 'invalid-id-rejected');
  assert.equal(receipt.workerTerminated, true);
  assert.equal(workers.length, 3);
  assert(workers.every(w=>w.terminated));
  assert.equal(receipt.prewarmWorkers.length,2);
  assert.equal(workers[0].terminated, true);
});
for (const [file] of helpers) {
  test('missing export fails closed: ' + file, async () => {
    const {result, workers} = await probe({missing: file});
    await assert.rejects(result, /main audio helper graph missing/);
    assert.equal(workers.length, 0);
  });
  test('missing emitted import fails closed: ' + file, async () => {
    const {result, workers} = await probe({reject: file});
    await assert.rejects(result, /missing emitted helper/);
    assert.equal(workers.length, 0);
  });
}
test('existing initialized-device rejection remains enforced', async () => {
  const {result, workers} = await probe({initialized: true});
  await assert.rejects(result, /unexpectedly initialized device/);
  assert.equal(workers.length, 0);
});
test('existing worker protocol rejection still terminates the worker', async () => {
  const {result, workers} = await probe({badProtocol: true});
  await assert.rejects(result, /protocol mismatch/);
  assert.equal(workers[0].terminated, true);
});
test('graph helpers have canonical composed-main owners and are not the reviewed orphan', () => {
  const adapter = fs.readFileSync(path.join(root, 'patches/splatoon3/audio-adapter.mjs'), 'utf8');
  const mainOwner = adapter.slice(adapter.indexOf("if(rel==='src/main.js')"));
  const build = fs.readFileSync(path.join(root, 'scripts/build-inkwave.mjs'), 'utf8');
  const orphan = fs.readFileSync(path.join(root, 'scripts/lib/inkwave-reviewed-audio-orphan.mjs'), 'utf8');
  for (const [file, name] of helpers) {
    assert.ok(mainOwner.includes("import { " + name + " } from '../patches/splatoon3/runtime/audio/" + file + "';"));
    assert.ok(build.includes("visit('patches/splatoon3/runtime/audio/" + file + "');"));
    assert.ok(!orphan.includes("REVIEWED_AUDIO_ORPHAN = 'patches/splatoon3/runtime/audio/" + file));
  }
  assert.ok(orphan.includes("REVIEWED_AUDIO_ORPHAN = 'patches/splatoon3/runtime/audio/charge-hit-cue.mjs'"));
});

test('lazy module worker PCM corruption rejects and still terminates the worker',async()=>{
 const {result,workers}=await probe({badPrewarm:true});await assert.rejects(result,/PCM bytes differ/);assert(workers.every(w=>w.terminated));
});
