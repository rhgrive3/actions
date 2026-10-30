import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {assertReviewedMinimapSources,REVIEWED_MINIMAP_SOURCE_EPOCHS} from '../lib/minimap-canvas-probe.mjs';
const epochs=REVIEWED_MINIMAP_SOURCE_EPOCHS;
// The sixth descriptor is already present in f7b705d09 and 7290b01, including
// the unchanged typed-storage native source. Seal all prior descriptors too.
const descriptorPins=Object.freeze([
 'f922056e9d39181106230e904b239e187b9e3de30695627a71d03d3ba6c6d8c9',
 '4bd3b2b7c56d7d42eb3d48304f5e99eb4d3e6ea1a9167a1194035e78f73684a5',
 '296b51be954c524d11212b28e500505240adee708975673eee11852438458d95',
 '503f96cec4971444e2d93676f9291bd1d8eabfb42407d4ca0eaed481cf5ff324',
 '15b44cad2187d28e55a7c8b06eadb22ff9a08d46f6373c8c2b9d65ae09b1cfca',
 'c742ad3e35124c63da6deceb485b8c08a87aa5181d333c9e89f341fd6b33b58b'
]);
const descriptorHash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function assertExactDescriptors(values){
 assert.deepEqual(values.map(descriptorHash),descriptorPins,'independently reviewed six descriptor set');
 assert.equal(descriptorHash(values.slice(0,5)),'33d0d4f029d8414b834bc01a9a5f61b90717eae03fda3be4354bc4f574cc05b6','original five descriptor prefix');
}

test('all independently reviewed minimap source epochs retain their exact pins',()=>{
 assertExactDescriptors(epochs);
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

test('existing sixth epoch stays exact and an unreviewed seventh or replacement fails closed',()=>{
 assert.equal(epochs[5].name,'library-queue-world-minimap-typed-storage-20261028');
 assert.equal(epochs[5].pins['patches/native-stages/runtime/native-minimap.mjs'],'f2012fac76b5ea631b6ba45e4cd6f75d3d27ffe6d76f8fdcb0d491d3666d70d5');
 const unreviewed={name:'unreviewed-seventh',pins:{...epochs[5].pins,'patches/native-stages/runtime/native-minimap.mjs':'1'.repeat(64)}};
 assert.throws(()=>assertExactDescriptors([...epochs,unreviewed]),assert.AssertionError);
 assert.throws(()=>assertExactDescriptors([...epochs.slice(0,5),unreviewed]),assert.AssertionError);
 assert.throws(()=>assertReviewedMinimapSources(unreviewed.pins),/Minimap source pin mismatch/);
 for(let i=0;i<epochs.length;i++){const changed=structuredClone(epochs);changed[i].name+='-edited';assert.throws(()=>assertExactDescriptors(changed),assert.AssertionError);}
});
