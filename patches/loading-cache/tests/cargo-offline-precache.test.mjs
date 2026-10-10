import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { coldOfflineLightmap } from '../adapter.mjs';

test('PWA 5 MiB cold snapshot retains every offline-playable lightmap and lazy-caches online-only Cargo',()=>{
  for(const id of ['tidewater','kelpline','halyard']) {
    assert.equal(coldOfflineLightmap('assets/lightmaps/'+id+'.png'),true,id+' offline gameplay lightmap');
    assert.equal(coldOfflineLightmap('assets/lightmaps/'+id+'.json'),true,id+' lightmap metadata');
  }
  assert.equal(coldOfflineLightmap('assets/lightmaps/cargo.png'),false,
    'Cargo lightmap is cache-on-request; its stage is not playable offline');
  assert.equal(coldOfflineLightmap('assets/lightmaps/cargo.json'),true,'small integrity metadata stays precached');
  assert.equal(coldOfflineLightmap('assets/stages/manifest.json'),false,
    'manifest remains included by the separate mandatory dependency');
  const native=fs.readFileSync(new URL('../../../inkwave-public/src/config.js',import.meta.url),'utf8');
  assert.match(native,/\{ id:\s*'cargo'[^\n]*onlineOnly:\s*true/,
    'explicit online-only native stage admission backs the cache decision');
});
