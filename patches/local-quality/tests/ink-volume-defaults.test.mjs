import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { DEFAULT_INK_VOLUME_URLS, decodeVolumeBinary, unpackVolumes, loadVolumePack } from '../ink-volume/pack.mjs';
import { decodeVTF } from '../ink-volume/vtf.mjs';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';

test('both shipped default packs retain every source VTF byte and all 34 decoded RGBA frames',async()=>{
  let frames=0;
  for(const [slot,url] of Object.entries(DEFAULT_INK_VOLUME_URLS)){
    const manifest=JSON.parse(fs.readFileSync(new URL(url))),compressed=fs.readFileSync(new URL(manifest.binary,url));
    const buffer=await decodeVolumeBinary(manifest,compressed.buffer.slice(compressed.byteOffset,compressed.byteOffset+compressed.byteLength));
    assert.equal(crypto.createHash('sha256').update(new Uint8Array(buffer)).digest('hex'),manifest.binarySHA256);
    const pack=unpackVolumes(manifest,buffer);assert.equal(manifest.cacheSlot,slot);assert.equal(manifest.compression,'gzip');assert(compressed.length<20*1024*1024);
    for(let p=0;p<pack.patterns.length;p++){
      const source=fs.readFileSync(new URL('../../../reports/ink-volume/source/'+manifest.patterns[p].name,import.meta.url));
      assert.equal(crypto.createHash('sha256').update(source).digest('hex'),manifest.patterns[p].sourceSHA256);
      const decoded=decodeVTF(source);assert.equal(pack.patterns[p].frames.length,decoded.frames.length);
      for(let f=0;f<decoded.frames.length;f++){assert.deepEqual(pack.patterns[p].frames[f].rgba,decoded.frames[f]);assert.equal(pack.patterns[p].frames[f].levels.length,2);frames++;}
    }
  }
  assert.equal(frames,34);
});
test('ordinary FX construction loads both bundled names without configuration, then releases readiness',async()=>{
  const f=await fixture({productionComposition:true,fullRuntime:true,extraExports:"export { FX } from './inkwave-public/src/fx/fx.js';"}),calls=[];
  f.FX.prototype.loadInkVolume=async(name,url)=>{calls.push([name,url]);return {};};
  const fx=new f.FX(new f.THREE.Scene(),{quality:.25});assert.equal(await fx.inkVolumeReady,true);
  assert.deepEqual(calls.map(x=>x[0]),['roller','shooter']);for(const [name,url] of calls)assert(url.endsWith('/ink-volume/assets/'+name+'/manifest.json'));
  fx.dispose();assert.equal(fx.inkVolumeReady,null);
});
test('gzip reader rejects corrupt streams, unsupported codecs and an expanded-size overflow',async()=>{
  const data=gzipSync(new Uint8Array(100));
  await assert.rejects(decodeVolumeBinary({compression:'gzip',byteLength:99},data),/exceeds/);
  await assert.rejects(decodeVolumeBinary({compression:'gzip',byteLength:101},data),/length/);
  await assert.rejects(decodeVolumeBinary({compression:'gzip',byteLength:100},new Uint8Array([1,2,3])));
  await assert.rejects(decodeVolumeBinary({compression:'unknown',byteLength:100},data),/Unsupported/);
});
test('default binary cache reuses verified bytes offline, repairs corruption and evicts the prior slot version',async t=>{
  const originalFetch=globalThis.fetch,originalCaches=globalThis.caches;
  t.after(()=>{globalThis.fetch=originalFetch;if(originalCaches===undefined)delete globalThis.caches;else globalThis.caches=originalCaches;});
  const entries=new Map(),cache={match:async key=>entries.get(key)?.clone(),put:async(key,response)=>entries.set(key,response.clone()),keys:async()=>[...entries.keys()].map(url=>new Request(url)),delete:async key=>entries.delete(typeof key==='string'?key:key.url)};
  globalThis.caches={open:async name=>{assert.equal(name,'inkwave-ink-volume-v1');return cache;}};
  const binary=new Uint8Array(4),compressed=gzipSync(binary),url='https://game.invalid/sub/_versions/abc/pack.json';
  const manifest={schema:'inkwave-volume-v1',byteLength:4,patterns:[],binary:'pack.gz',compression:'gzip',cacheSlot:'roller',binarySHA256:crypto.createHash('sha256').update(binary).digest('hex')};
  let requests=0,offline=false;
  globalThis.fetch=async target=>{
    const response=new Response(String(target).endsWith('.json')?JSON.stringify(manifest):compressed);
    Object.defineProperty(response,'url',{value:String(target)});
    if(!String(target).endsWith('.json')){requests++;if(offline)throw Error('Offline');}
    return response;
  };
  const stale='https://game.invalid/__inkwave_volume_cache__/roller/'+('1'.repeat(64));entries.set(stale,new Response(compressed));
  await loadVolumePack(url);assert.equal(requests,1);assert.equal(entries.size,1);assert(!entries.has(stale));
  offline=true;await loadVolumePack(url);assert.equal(requests,1,'offline binary uses the content hash, not a revision URL');
  const [key]=entries.keys();entries.set(key,new Response(new Uint8Array([1,2,3])));offline=false;
  await loadVolumePack(url);assert.equal(requests,2,'invalid gzip is removed and fetched again');assert.equal(entries.size,1);
  manifest.binarySHA256='2'.repeat(64);await assert.rejects(loadVolumePack(url),/checksum/);assert.equal(entries.size,1,'unverified bytes never enter the cache');
  delete manifest.compression;manifest.byteLength=21*1024*1024;
  globalThis.fetch=async target=>{const response=new Response(String(target).endsWith('.json')?JSON.stringify(manifest):new Uint8Array(manifest.byteLength));Object.defineProperty(response,'url',{value:String(target)});return response;};
  await assert.rejects(loadVolumePack(url),/cache budget/);assert.equal(entries.size,1,'the slot ceiling also bounds an uncompressed extension');
});
