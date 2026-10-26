import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {assertReviewedMinimapSources,REVIEWED_MINIMAP_SOURCE_EPOCHS} from '../lib/minimap-canvas-probe.mjs';
const epochs=REVIEWED_MINIMAP_SOURCE_EPOCHS;
test('all independently reviewed minimap source epochs retain their exact pins',()=>{
 assert.equal(epochs.length,5);
 for(const epoch of epochs){assert.equal(Object.keys(epoch.pins).length,Object.hasOwn(epoch.pins,'patches/native-stages/runtime/native-minimap.mjs')?5:4);assert.equal(assertReviewedMinimapSources(epoch.pins),epoch.name);}
 const actual=Object.fromEntries(Object.keys(epochs.at(-1).pins).map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(new URL('../../'+file,import.meta.url))).digest('hex')]));
 assert.equal(assertReviewedMinimapSources(actual),epochs.at(-1).name);
});
test('every missing or byte-edited minimap source fails closed in either epoch',()=>{
 for(const {pins} of epochs)for(const file of Object.keys(pins)){
  const missing={...pins};delete missing[file];assert.throws(()=>assertReviewedMinimapSources(missing),/Minimap source pin mismatch/);
  const changed={...pins,[file]:'0'.repeat(64)};assert.throws(()=>assertReviewedMinimapSources(changed),/Minimap source pin mismatch/);
 }
 assert.throws(()=>assertReviewedMinimapSources(null),/Minimap source pin mismatch/);
});
test('old runtime/new adapter and new runtime/old adapter cannot form a third epoch',()=>{
 const runtime='patches/splatoon3/runtime/minimap-dirty.mjs',adapter='patches/splatoon3/minimap-dirty-adapter.mjs';
 assert.notEqual(epochs[0].pins[runtime],epochs[1].pins[runtime]);assert.notEqual(epochs[0].pins[adapter],epochs[1].pins[adapter]);
 for(const file of[runtime,adapter])assert.throws(()=>assertReviewedMinimapSources({...epochs[0].pins,[file]:epochs[1].pins[file]}),/Minimap source pin mismatch/);
});
