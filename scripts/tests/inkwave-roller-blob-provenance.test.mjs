import test from 'node:test';
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

test('real browser observes exact built native music Worker response and creator', { skip: !process.env.INKWAVE_ROLLER_WORKER_SITE }, async () => {
  const fs = await import('node:fs'), path = await import('node:path'), http = await import('node:http');
  const { chromium } = await import('playwright');
  const { observeBlobCreation } = await import('../lib/inkwave-roller-blob-provenance.mjs');
  const site = path.resolve(process.env.INKWAVE_ROLLER_WORKER_SITE);
  const manifest = JSON.parse(fs.readFileSync(path.join(site, 'inkwave-build.json')));
  const files = {};
  for (const rel of ['src/audio/music.js', 'src/audio/streamedTrack.js']) {
    files['/' + rel] = fs.readFileSync(path.join(site, rel));
    assert.equal(hashBytes(files['/' + rel]), manifest.artifacts[rel], 'Probe serves actual manifest-bound bytes');
  }
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', req.url === '/' ? 'text/html' : 'text/javascript');
    if (req.url === '/') res.end('<html><body>Native music Worker provenance probe</body></html>');
    else if (files[req.url]) res.end(files[req.url]);
    else { res.writeHead(404); res.end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const page = await browser.newPage(), origin = 'http://127.0.0.1:' + server.address().port;
    const evidence = { origin, workers: [], creations: [], responses: [], owners: [] }, loaded = {}, tasks = [], errors = [];
    await page.addInitScript(observeBlobCreation);
    page.on('worker', worker => evidence.workers.push(worker.url()));
    page.on('response', response => tasks.push(recordLoadedModuleResponse(response, origin, loaded, evidence).catch(error => errors.push(String(error)))));
    await page.goto(origin);
    await page.evaluate(async () => {
      const { MusicEngine } = await import('/src/audio/music.js');
      window.engine = new MusicEngine(); window.engine._startTimer();
    });
    await page.waitForFunction(() => !!window.engine?.worker);
    // Wait for the actual blob response callback, not only Worker construction.
    const deadline = Date.now() + 10000;
    while (!evidence.responses.length && Date.now() < deadline) await new Promise(r => setTimeout(r, 20));
    evidence.creations = await page.evaluate(() => window.__rollerBlobCreations());
    await Promise.all(tasks); assert.deepEqual(errors, []);
    const verified = verifyMusicWorkers(evidence, loaded, manifest);
    assert.equal(verified.length, 1);
    assert.equal(verified[0].sha256, hashBytes(body));
    // Same exact body from a foreign source is still not authorized.
    const foreign = structuredClone(evidence);
    foreign.creations[0].stack = foreign.creations[0].stack.replace('/src/audio/music.js:', '/src/foreign.js:');
    assert.throws(() => verifyMusicWorkers(foreign, loaded, manifest), /not the native music owner/);
  } finally { await browser?.close(); await new Promise(r => server.close(r)); }
});
