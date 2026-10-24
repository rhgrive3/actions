import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {lightmapLayoutIds,emitLightmapIndex} from '../lib/inkwave-lightmap-index.mjs';
test('lightmap inventory follows complete distributed pairs including future Range assets',()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'iw-lightmaps-'));try{const dir=path.join(root,'assets/lightmaps');assert.deepEqual(lightmapLayoutIds(root),[]);fs.mkdirSync(dir,{recursive:true});for(const name of ['tidewater.json','tidewater.png','range.json','unpaired.png','backup.json.old'])fs.writeFileSync(path.join(dir,name),'');assert.deepEqual(lightmapLayoutIds(root),['tidewater']);const source='export const LIGHTMAP_LAYOUTS = null;';assert.match(emitLightmapIndex(source,root),/\["tidewater"\]/);fs.writeFileSync(path.join(dir,'range.png'),'');assert.deepEqual(lightmapLayoutIds(root),['range','tidewater']);assert.match(emitLightmapIndex(source,root),/"range"/);assert.throws(()=>emitLightmapIndex('',root),/contract changed/);}finally{fs.rmSync(root,{recursive:true,force:true});}});

test('production inventory is emitted once after late overlays and excludes incomplete pairs', async () => {
  const builder = fs.readFileSync(new URL('../build-inkwave.mjs', import.meta.url), 'utf8');
  const marker = '// Final lightmap inventory: all asset overlays are complete before emission.';
  const start = builder.indexOf(marker), end = builder.indexOf('// Re-encode every final lightmap', start);
  assert.ok(start >= 0 && end > start, 'final-output inventory emission is present');
  assert.equal(builder.indexOf(marker, start + marker.length), -1, 'one final emission block');
  assert.doesNotMatch(builder, /emitLightmapIndex\(code, SRC\)/, 'source-only inventory must not suppress overlay assets');
  const deferred = builder.indexOf('pendingLightmapIndex = { code, dst, rel };');
  const range = builder.indexOf('for (const file of walk(RANGE_ROOT))');
  assert.ok(deferred >= 0 && deferred < range && range < start, 'defer initial module until after Range overlay');
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const run = new AsyncFunction('fs', 'path', 'BUILD', 'pendingLightmapIndex', 'emitLightmapIndex', 'stageTransform', 'finishTransforms', 'compactEsm', 'unminified', 'gz',
    'let rawJs = 0, minJs = 0, gzRaw = 0, gzMin = 0;\n' + builder.slice(start, end) + '\nreturn {rawJs,minJs,gzRaw,gzMin};');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'iw-lightmap-overlay-'));
  try {
    const upstream = path.join(root, 'upstream');
    const put = (dir, name) => { fs.mkdirSync(path.join(dir, 'assets/lightmaps'), {recursive:true}); fs.writeFileSync(path.join(dir, 'assets/lightmaps', name), 'fixture'); };
    put(upstream, 'cargo.json'); put(upstream, 'cargo.png');
    const source = 'export const LIGHTMAP_LAYOUTS = null;';
    const values = code => new Function(code.replace('export const LIGHTMAP_LAYOUTS =', 'return'))();
    const old = values(emitLightmapIndex(source, upstream));
    assert.deepEqual(old, ['cargo']);
    assert.throws(() => assert.deepEqual(old, ['cargo', 'range']), 'old source-only emission cannot pass the final inventory contract');
    for (const complete of [false, true]) for (const unminified of [false, true]) {
      const output = path.join(root, `output-${complete}-${unminified}`);
      put(output, 'cargo.json'); put(output, 'cargo.png');
      // These assets arrive after the upstream walk. A JSON without its PNG
      // must remain absent; a complete Range pair must never be suppressed.
      put(output, 'range.json'); if (complete) put(output, 'range.png');
      put(output, 'incomplete.json'); put(output, 'orphan.png');
      const rel = 'src/world/lightmap-assets.js', dst = path.join(output, rel);
      fs.mkdirSync(path.dirname(dst), {recursive:true});
      const events = [], pending = {code:source, dst, rel};
      const counts = await run(fs, path, output, pending, emitLightmapIndex,
        async (code, options, accept) => {
          events.push('transform'); assert.equal(options.loader, 'js'); assert.equal(options.format, 'esm');
          assert.equal(options.minify, true); assert.equal(options.sourcefile, rel);
          accept({code}); // CPU staging oracle, not a replacement minifier test.
        },
        async () => { events.push('flush'); },
        (code, module) => { events.push('compact'); assert.equal(module, rel); return code; },
        unminified, buffer => buffer.length);
      const emitted = fs.readFileSync(dst, 'utf8'), ids = values(emitted);
      assert.deepEqual(ids, complete ? ['cargo', 'range'] : ['cargo']);
      assert.ok(Object.isFrozen(ids)); assert.equal(pending.code, source);
      assert.deepEqual(events, unminified ? ['transform', 'flush'] : ['transform', 'compact', 'flush']);
      const bytes = Buffer.byteLength(emitted);
      assert.deepEqual(counts, {rawJs:bytes,minJs:bytes,gzRaw:bytes,gzMin:bytes}, 'account exactly one emitted module');
    }
  } finally { fs.rmSync(root, {recursive:true,force:true}); }
});
