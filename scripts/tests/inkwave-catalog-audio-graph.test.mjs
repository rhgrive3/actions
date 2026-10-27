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
  assert.equal(loaded.length, 7);
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

// Reconcile the external catalogue's one charge Worker, retaining its protocol.
async function chargeProbe(mutation) {
  const {catalogChargeWorker}=await import('../lib/inkwave-catalog-audio.mjs');
  const {stretchChargerPCM}=await import('../../patches/splatoon3/runtime/audio/pitch-preserving-charge.mjs');
  const workers=[],loaded=[];
  class Worker {
    constructor(url,options){this.url=url;this.options=options;this.terminations=0;workers.push(this);}
    postMessage(message,transfer){
      assert.equal(message.serial,901);assert.equal(message.key,'catalog-charger');
      assert.equal(message.samples[0].length,800);assert.equal(message.ratio,1.25);
      const copied=structuredClone(message,{transfer});assert.equal(message.samples[0].byteLength,0);
      queueMicrotask(()=>{
        if(mutation==='error'){this.onerror({message:'probe error'});return;}
        const data={serial:copied.serial,key:copied.key,samples:stretchChargerPCM(copied.samples,copied.sampleRate,copied.ratio)};
        if(mutation==='serial')data.serial++;
        if(mutation==='key')data.key+='wrong';
        if(mutation==='length')data.samples[0]=data.samples[0].slice(1);
        if(mutation==='finite')data.samples[0][2]=Infinity;
        if(mutation==='zero')data.samples[0].fill(0);
        this.onmessage({data});
      });
    }
    terminate(){this.terminations++;}
  }
  const run=vm.runInNewContext('('+catalogChargeWorker.toString().replace(/\bimport\(/g,'load(')+')',{
    Worker,Float32Array,Uint8Array,setTimeout,clearTimeout,
    load:async url=>{loaded.push(url);if(mutation==='import')throw Error('missing canonical import');return mutation==='export'?{}:{stretchChargerPCM};},
  });
  return {workers,loaded,result:run(prefix)};
}
test('single Charger Worker proves original 901 protocol and canonical transferred PCM',async()=>{
  const {workers,loaded,result}=await chargeProbe();const proof=await result;
  assert.equal(workers.length,1);assert.equal(workers[0].terminations,1);assert.equal(workers[0].options.type,'module');
  assert.deepEqual(JSON.parse(JSON.stringify(proof)),{path:prefix+'patches/splatoon3/runtime/audio/pitch-preserving-charge-worker.mjs',protocol:'canonical-pcm-byte-exact',serial:901,key:'catalog-charger',sampleRate:8000,ratio:1.25,sourceFrames:800,outputFrames:1000,channels:1,bytes:4000,terminated:true});
  assert.deepEqual(loaded,[prefix+'patches/splatoon3/runtime/audio/pitch-preserving-charge.mjs']);
});
for(const mutation of ['serial','key','length','finite','zero','error','import','export'])test('single Charger Worker rejects '+mutation,async()=>{
  const {workers,result}=await chargeProbe(mutation);await assert.rejects(result,/Charger WSOLA|missing canonical import/);
  assert(workers.every(w=>w.terminations===1));
});

async function bombProbe(mutation) {
  const {catalogBombFxGraph}=await import('../lib/inkwave-catalog-fx-graph.mjs');
  const oldFx={onSpeck(){},onRipple(){}},oldAudio={},G={fx:oldFx,audio:oldAudio},scene={},actor={};
  const projectiles={scene,bombs:[],throwBomb(a){if(mutation==='no-birth')return;this.bombs.push({owner:a,mesh:{parent:scene},pos:{x:1},vel:{y:2},fuse:-1});}};
  let owner,instances=0;
  const run=vm.runInNewContext('('+catalogBombFxGraph.toString().replace(/\bimport\(/g,'load(')+')',{
    load:async url=>{assert.equal(url,prefix+'src/fx/fxHooks.js');if(mutation==='import')throw Error('missing native entry');
      return mutation==='export'?{}:{initFxHooks(){instances++;owner={enabled:true,bombs:new Map(),_bombs(P){
        const b=P.bombs[0];this.bombs.set(b,{cue:{id:'bomb'}});
        if(mutation!=='no-call')G.fx.bombTrail(b.pos,b.vel);
        if(mutation==='state')b.fuse++;
      }};G.fx.onSpeck=()=>{};G.fx.onRipple=()=>{};return owner;}};
    },
  });
  const result=run(prefix,G,projectiles,actor,()=>JSON.stringify(projectiles.bombs.map(b=>[b.pos,b.vel,b.fuse])));
  return {result,restored:()=>G.fx===oldFx&&G.audio===oldAudio&&!Object.hasOwn(G,'netm'),owner:()=>owner,instances:()=>instances};
}
test('one lazy FX owner consumes one actual throw-method birth and restores services',async()=>{
  const p=await bombProbe();const proof=await p.result;
  assert.equal(p.instances(),1);assert.equal(p.owner().enabled,false);assert(p.restored());
  for(const key of ['nativeBirths','bombVisits','birthTrails'])assert.equal(proof[key],1);
  for(const key of ['gameplayUnchanged','ownerDisabled','callbacksRestored','servicesRestored'])assert.equal(proof[key],true);
});
for(const mutation of ['no-birth','no-call','state','import','export'])test('lazy FX owner rejects '+mutation,async()=>{
  const p=await bombProbe(mutation);await assert.rejects(p.result,/Catalog native|missing native entry/);
  assert(p.restored());if(p.owner())assert.equal(p.owner().enabled,false);
});
