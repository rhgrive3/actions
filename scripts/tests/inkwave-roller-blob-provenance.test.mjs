import test from 'node:test';
import { staticEsModuleImports } from '../lib/inkwave-module-imports.mjs';
import assert from 'node:assert/strict';
import { MUSIC_TIMER_SOURCE as body, verifyMusicWorkers } from '../lib/inkwave-roller-blob-provenance.mjs';
import { hashBytes, recordLoadedModuleResponse, verifyLoadedModules } from '../lib/inkwave-roller-uuid-comparison.mjs';
const origin = 'http://127.0.0.1:1234', url = 'blob:' + origin + '/native-worker';
function fixture() {
  const owner = 'src/audio/music.js', ownerBody = `const src=${JSON.stringify(body)};`;
  const loaded = { [owner]: { sha256: hashBytes(ownerBody), bytes: Buffer.byteLength(ownerBody) } };
  const manifest = { build: { revision: 'native' }, artifacts: { [owner]: hashBytes(ownerBody) } };
  for (let i=0;i<101;i++) {const rel=`src/fixture-${i}.js`;loaded[rel]={sha256:hashBytes(rel),bytes:rel.length};manifest.artifacts[rel]=hashBytes(rel);}
  const evidence = { origin, workers: [url], owners: [{url:origin+'/'+owner,body:ownerBody}],
    responses: [{url,protocol:'blob:',body,sha256:hashBytes(body),bytes:Buffer.byteLength(body)}],
    creations: [{url,body,mime:'text/javascript',stack:`Error\n    at URL.createObjectURL (<anonymous>:1:1)\n    at MusicEngine._startTimer (${origin}/${owner}:1385:23)`}] };
  return { evidence, loaded, manifest };
}
test('native Blob preserves observed bytes and direct manifest-bound music owner with stable A/A identity', () => {
  const a=fixture(), b=structuredClone(a);
  b.evidence=JSON.parse(JSON.stringify(b.evidence).replaceAll('native-worker','different-random-uuid').replaceAll(':1234',':5678'));
  const identity=verifyLoadedModules(a.loaded,a.manifest,null,a.evidence);
  assert.deepEqual(identity,verifyLoadedModules(b.loaded,b.manifest,null,b.evidence));
  assert.deepEqual(identity,verifyLoadedModules(identity.modules,a.manifest,null,a.evidence));
  assert.equal(identity.dynamicWorkers[0].owner,'src/audio/music.js');
  assert.equal(a.evidence.responses[0].url,url);
  assert.throws(()=>verifyLoadedModules(a.loaded,a.manifest),/requires Blob provenance/);
  const omitted=structuredClone(a.evidence);omitted.workers=[];omitted.responses=[];
  assert.throws(()=>verifyMusicWorkers(omitted,a.loaded,a.manifest),/evidence is required/);
});
test('arbitrary Blob, foreign or absent creator, forged bytes, omitted worker and missing manifest owner all fail closed', () => {
  const mutations = [
    e=>e.responses[0].body+=';Math.random()',
    e=>e.responses[0].url=e.responses[0].url.slice(5),
    e=>e.responses[0].protocol='http:',
    e=>e.responses[0].sha256='0'.repeat(64),
    e=>e.responses[0].bytes++,
    e=>e.creations[0].body+=';',
    e=>e.creations[0].mime='text/plain',
    e=>e.creations=[],
    e=>e.creations.push(e.creations[0]),
    e=>e.creations[0].stack=e.creations[0].stack.replace('src/audio/music.js','src/foreign.js'),
    e=>e.creations[0].stack=e.creations[0].stack.replace(origin,'https://foreign.invalid'),
    e=>e.creations[0].stack=e.creations[0].stack.replace('src/audio/music.js','src/foreign.js')+`\n at MusicEngine._startTimer (${origin}/src/audio/music.js:1:1)`,
    e=>e.workers=[],
    e=>e.workers.push(url),
    e=>e.responses=[],
    e=>e.owners=[],
    e=>e.owners[0].body+=';',
  ];
  for (const mutate of mutations) {const a=fixture();mutate(a.evidence);assert.throws(()=>verifyMusicWorkers(a.evidence,a.loaded,a.manifest));}
  for(const target of ['manifest','loaded']) {const a=fixture();delete (target==='manifest'?a.manifest.artifacts:a.loaded)['src/audio/music.js'];assert.throws(()=>verifyMusicWorkers(a.evidence,a.loaded,a.manifest));}
});
test('versioned creator binds only the actual build revision and exact loaded owner bytes', () => {
  const a=fixture(), rel='_versions/native/src/audio/music.js';
  a.loaded[rel]=a.loaded['src/audio/music.js'];delete a.loaded['src/audio/music.js'];
  a.manifest.artifacts[rel]=a.manifest.artifacts['src/audio/music.js'];delete a.manifest.artifacts['src/audio/music.js'];
  a.evidence=JSON.parse(JSON.stringify(a.evidence).replaceAll('/src/audio/music.js','/'+rel));
  assert.equal(verifyMusicWorkers(a.evidence,a.loaded,a.manifest)[0].owner,rel);
  a.manifest.build.revision='wrong';
  assert.throws(()=>verifyMusicWorkers(a.evidence,a.loaded,a.manifest),/Wrong versioned music owner/);
  a.manifest.build.revision='native';a.loaded[rel].bytes++;
  assert.throws(()=>verifyMusicWorkers(a.evidence,a.loaded,a.manifest),/length differs/);
});
test('collector never flattens blob protocol or exempts unknown executable responses', async () => {
  const a=fixture(), observed={responses:[],owners:[]}, loaded={};
  const response=(u,b=body)=>({url:()=>u,request:()=>({resourceType:()=> 'script'}),headers:()=>({'content-type':'text/javascript'}),ok:()=>true,body:async()=>Buffer.from(b)});
  await assert.rejects(recordLoadedModuleResponse(response(url),origin,loaded),/explicit provenance/);
  await recordLoadedModuleResponse(response(url),origin,loaded,observed);
  assert.deepEqual(loaded,{});assert.equal(observed.responses[0].url,url);assert.equal(observed.responses[0].protocol,'blob:');
  await assert.rejects(recordLoadedModuleResponse(response('blob:https://foreign.invalid/id'),origin,loaded,observed),/Unexpected script origin/);
  await recordLoadedModuleResponse(response(origin+'/unbound.js'),origin,a.loaded,observed);
  assert.throws(()=>verifyLoadedModules(a.loaded,a.manifest,null,a.evidence),/Unbound loaded module/);
});

// Match the shipped immutable module tree, including every patched dependency.
// A two-file server is insufficient: music imports audio/platform patches too.
function nativeProbeFiles(manifest, readFile) {
  assert.match(manifest.build?.revision ?? '', /^[a-f0-9]{64}$/, 'Missing build revision');
  const prefix = `_versions/${manifest.build.revision}/`;
  const owner = prefix + 'src/audio/music.js';
  assert(Object.hasOwn(manifest.artifacts, owner), 'Missing versioned music owner');
  const files = new Map(), pending = ['/' + owner];
  while (pending.length) {
    const url = pending.pop();
    if (files.has(url)) continue;
    const rel = url.slice(1);
    assert(rel.startsWith(prefix) && /\.(?:js|mjs)$/.test(rel), 'Native dependency escaped build revision');
    assert(rel.split('/').every(part => part && part !== '.' && part !== '..') && !/[\\?#%]/.test(rel), 'Invalid probe artifact path');
    assert(Object.hasOwn(manifest.artifacts, rel), `Missing manifest-bound native dependency: ${rel}`);
    const bytes = readFile(rel);
    assert.equal(hashBytes(bytes), manifest.artifacts[rel], `Probe serves actual manifest-bound bytes: ${rel}`);
    files.set(url, bytes);
    for (const specifier of staticEsModuleImports(bytes.toString())) {
      assert(specifier.startsWith('./') || specifier.startsWith('../'), 'Unexpected native dependency import');
      const dependency = new URL(specifier, 'http://localhost' + url);
      assert.equal(dependency.search + dependency.hash, '', 'Unexpected native dependency suffix');
      pending.push(dependency.pathname);
    }
  }
  return { owner: '/' + owner, files };
}

test('native probe serves the manifest revision and complete patched module graph, never root or foreign aliases', () => {
  const revision = 'a'.repeat(64), prefix = `_versions/${revision}/`;
  const modules = {
    'src/audio/music.js': 'import "../../patches/audio.mjs"; import "./streamedTrack.js";',
    'src/audio/streamedTrack.js': 'export {};',
    'patches/audio.mjs': 'import "./lifecycle.mjs";',
    'patches/lifecycle.mjs': 'export {};',
  };
  const bytes = Object.fromEntries(Object.entries(modules).map(([rel, text]) => [prefix + rel, Buffer.from(text)]));
  const manifest = { build: { revision }, artifacts: Object.fromEntries(Object.entries(bytes).map(([rel, text]) => [rel, hashBytes(text)])) };
  manifest.artifacts['src/audio/music.js'] = hashBytes('wrong root');
  manifest.artifacts['_versions/' + 'b'.repeat(64) + '/src/audio/music.js'] = hashBytes('wrong revision');
  const probe = nativeProbeFiles(manifest, rel => bytes[rel]);
  assert.equal(probe.owner, '/' + prefix + 'src/audio/music.js');
  assert.equal(probe.files.size, 4);
  for (const [url, text] of probe.files) {
    for (const match of text.toString().matchAll(/import "([^"]+)"/g)) {
      assert(probe.files.has(new URL(match[1], 'http://localhost' + url).pathname), 'Every transitive import is served');
    }
  }
  assert(!probe.files.has('/src/audio/music.js'));
  assert(!probe.files.has('/_versions/' + 'b'.repeat(64) + '/src/audio/music.js'));
  assert.throws(() => nativeProbeFiles(manifest, () => Buffer.from('altered')), /manifest-bound bytes/);
  const missing = structuredClone(manifest); delete missing.artifacts[prefix + 'src/audio/music.js'];
  assert.throws(() => nativeProbeFiles(missing, rel => bytes[rel]), /Missing versioned music owner/);
  const missingDependency = structuredClone(manifest); delete missingDependency.artifacts[prefix + 'patches/lifecycle.mjs'];
  assert.throws(() => nativeProbeFiles(missingDependency, rel => bytes[rel]), /Missing manifest-bound native dependency/);
  const wrong = structuredClone(manifest); wrong.build.revision = 'c'.repeat(64);
  assert.throws(() => nativeProbeFiles(wrong, rel => bytes[rel]), /Missing versioned music owner/);
  const escapedBytes = { ...bytes, [prefix + 'patches/lifecycle.mjs']: Buffer.from('import "../../../../escape.mjs";') };
  const escaped = structuredClone(manifest); escaped.artifacts[prefix + 'patches/lifecycle.mjs'] = hashBytes(escapedBytes[prefix + 'patches/lifecycle.mjs']);
  assert.throws(() => nativeProbeFiles(escaped, rel => escapedBytes[rel]), /escaped build revision/);
});

// This function is serialized by Playwright; keep it independent of Node scope.
// Injected dependencies are used only by the lifecycle regression below.
async function startNativeMusicProbe(owner, loadMusic = value => import(value), AudioContextCtor = globalThis.AudioContext) {
  const { MusicEngine } = await loadMusic(owner);
  const context = globalThis.__rollerMusicContext = new AudioContextCtor();
  const engine = globalThis.engine = new MusicEngine();
  // Menu and battle are streamed recordings and intentionally do not start
  // the procedural scheduler. Boss remains a real procedural track.
  engine._init(context, context.destination, { level: 0 });
  engine.play('boss', { fade: 0 });
  const state = {
    context: !!engine.ctx, contextState: context.state, offline: !!engine.offline,
    players: engine.players.length, worker: !!engine.worker, fallbackTimer: engine.timer != null,
    enabled: engine._musicIdle?.enabled, lifecycleInstalled: !!engine._platformMusic,
  };
  if (!state.context || state.offline || !state.players || !state.worker || state.fallbackTimer) {
    throw new Error('Native music Worker activation failed after real init/boss playback: ' + JSON.stringify(state));
  }
  return state;
}

test('native Worker probe requires real initialization and active playback, never a bare timer call', async () => {
  const previousEngine = globalThis.engine, previousContext = globalThis.__rollerMusicContext;
  const calls = [];
  class Context {
    constructor() { this.destination = {}; this.state = 'suspended'; }
  }
  class Engine {
    constructor() { this.ctx = null; this.players = []; }
    _init(context, destination, options) {
      assert.equal(destination, context.destination); assert.deepEqual(options, { level: 0 });
      this.ctx = context; calls.push('init'); return this;
    }
    _startTimer() {
      if (!this.ctx || !this.players.length) return;
      this.worker = {};
    }
    play(track, options) {
      assert.equal(track, 'boss'); assert.deepEqual(options, { fade: 0 });
      calls.push('play'); this.players.push({}); this._startTimer();
    }
  }
  try {
    const bare = new Engine(); bare._startTimer(); assert.equal(bare.worker, undefined);
    bare.ctx = new Context(); bare._startTimer(); assert.equal(bare.worker, undefined);
    const result = await startNativeMusicProbe('fixture', async () => ({ MusicEngine: Engine }), Context);
    assert.deepEqual(calls, ['init', 'play']); assert.equal(result.worker, true);
    class NoWorker extends Engine { _startTimer() {} }
    await assert.rejects(startNativeMusicProbe('fixture', async () => ({ MusicEngine: NoWorker }), Context),
      /activation failed.*"players":1,"worker":false/);
    class Fallback extends Engine { _startTimer() { this.timer = 1; } }
    await assert.rejects(startNativeMusicProbe('fixture', async () => ({ MusicEngine: Fallback }), Context),
      /"fallbackTimer":true/);
  } finally {
    if (previousEngine === undefined) delete globalThis.engine; else globalThis.engine = previousEngine;
    if (previousContext === undefined) delete globalThis.__rollerMusicContext; else globalThis.__rollerMusicContext = previousContext;
  }
});

test('real browser observes exact built native music Worker response and creator', { skip: !process.env.INKWAVE_ROLLER_WORKER_SITE }, async () => {
  const fs = await import('node:fs'), path = await import('node:path'), http = await import('node:http');
  const { chromium } = await import('playwright');
  const { observeBlobCreation } = await import('../lib/inkwave-roller-blob-provenance.mjs');
  const site = path.resolve(process.env.INKWAVE_ROLLER_WORKER_SITE);
  const manifest = JSON.parse(fs.readFileSync(path.join(site, 'inkwave-build.json')));
  const { owner, files } = nativeProbeFiles(manifest, rel => fs.readFileSync(path.join(site, rel)));
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', req.url === '/' ? 'text/html' : 'text/javascript');
    if (req.url === '/') res.end('<html><body>Native music Worker provenance probe</body></html>');
    else if (files.has(req.url)) res.end(files.get(req.url));
    else { res.writeHead(404); res.end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  let browser, page;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    page = await browser.newPage();
    const origin = 'http://127.0.0.1:' + server.address().port;
    const evidence = { origin, workers: [], creations: [], responses: [], owners: [] }, loaded = {}, tasks = [], errors = [];
    await page.addInitScript(observeBlobCreation);
    page.on('worker', worker => evidence.workers.push(worker.url()));
    page.on('response', response => tasks.push(recordLoadedModuleResponse(response, origin, loaded, evidence).catch(error => errors.push(String(error)))));
    await page.goto(origin);
    await page.evaluate(startNativeMusicProbe, owner);
    // Wait for the actual blob response callback, not only Worker construction.
    const deadline = Date.now() + 10000;
    while (!evidence.responses.length && Date.now() < deadline) await new Promise(r => setTimeout(r, 20));
    evidence.creations = await page.evaluate(() => window.__rollerBlobCreations());
    await Promise.all(tasks); assert.deepEqual(errors, []);
    const verified = verifyMusicWorkers(evidence, loaded, manifest);
    assert.equal(verified.length, 1);
    assert.equal(verified[0].owner, owner.slice(1));
    assert.equal(verified[0].bytes, Buffer.byteLength(body));
    assert.equal(verified[0].sha256, hashBytes(body));
    // Same exact body from a foreign source is still not authorized.
    const foreign = structuredClone(evidence);
    foreign.creations[0].stack = foreign.creations[0].stack.replace('/src/audio/music.js:', '/src/foreign.js:');
    assert.throws(() => verifyMusicWorkers(foreign, loaded, manifest), /not the native music owner/);
  } finally {
    try {
      if (page && !page.isClosed()) await page.evaluate(async () => {
        try { globalThis.engine?.dispose(); }
        finally { await globalThis.__rollerMusicContext?.close(); }
      });
    } finally {
      try { await browser?.close(); }
      finally { await new Promise(r => server.close(r)); }
    }
  }
});
