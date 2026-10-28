import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { replaceOnce, qualityIdentity } from '../adapter.mjs';
import { adaptRenderTransfers } from '../render-transfer-optimization-adapter.mjs';
import { BUILD_ONLY_PATCH_MODULES } from '../../../scripts/lib/inkwave-build-only-modules.mjs';
import { ringFixture, uploadTracker, randomStream } from './render-transfer-fixture.mjs';

const attributes = ['aPosR', 'aNrmT', 'aColA', 'aMisc'];
function same(a, b, ta, tb) {
  assert.equal(a.rings.n, b.rings.n);
  assert.equal(a.rings.geo.instanceCount, b.rings.geo.instanceCount);
  for (const name of attributes) {
    const aa = a.rings.geo.attributes[name], bb = b.rings.geo.attributes[name], count = a.rings.geo.instanceCount * aa.itemSize;
    assert.deepEqual(aa.array.slice(0, count), bb.array.slice(0, count), name);
    if (ta) assert.deepEqual(ta.gpu(aa).slice(0, count), tb.gpu(bb).slice(0, count), 'GPU ' + name);
  }
  for (const name of ['P','V','N','C','X']) assert.deepEqual(a.rings[name], b.rings[name], name);
}

test('ring transfer adapter is registered, composed once, and fails closed on changed ownership', () => {
  const raw = fs.readFileSync(new URL('../../../inkwave-public/src/fx/fx.js', import.meta.url), 'utf8');
  const built = adaptBuildSource('src/fx/fx.js', raw);
  assert.ok(BUILD_ONLY_PATCH_MODULES.has('patches/local-quality/render-transfer-optimization-adapter.mjs'));
  assert.ok(qualityIdentity()['render-transfer-optimization-adapter.mjs']);
  assert.equal(adaptRenderTransfers('src/fx/fx.js', built, replaceOnce), built);
  assert.ok(built.includes('a === staticAttribute || a === staticAttribute2 || a._fxStatic'), 'both owned static ring streams avoid full-update overwrite');
  assert.ok(raw.includes('    if (a === staticAttribute) continue;'), 'fixture uses original single-attribute ownership');
  assert.throws(() => adaptRenderTransfers('src/fx/fx.js', raw.replace('    if (a === staticAttribute) continue;', '    if (a.attribute === staticAttribute) continue;'), replaceOnce), /static FX/);
});

test('main paired staticAttribute2 ownership composes with fine-grained ring uploads', () => {
  const raw = fs.readFileSync(new URL('../../../inkwave-public/src/fx/fx.js', import.meta.url), 'utf8');
  const sourceCopy = '      aC[i4] = R.C[i3]; aC[i4 + 1] = R.C[i3 + 1]; aC[i4 + 2] = R.C[i3 + 2]; aC[i4 + 3] = X[x + 3];\n      aM[i4] = X[x + 6]; aM[i4 + 1] = X[x + 4]; aM[i4 + 2] = X[x + 5]; aM[i4 + 3] = 0;';
  let main = raw.replace('function markUpdated(geo, count, staticAttribute = null) {',
    'function markUpdated(geo, count, staticAttribute = null, staticAttribute2 = null) {');
  main = main.replace('if (a === staticAttribute) continue;',
    'if (a === staticAttribute || a === staticAttribute2) continue;');
  main = main.replace(sourceCopy,
    '      if (R.staticDirty) {\n' + sourceCopy.split('\n').map(line=>'  '+line).join('\n') + '\n      }');
  main = main.replace('    M.n = 0;\n    R.geo.instanceCount = n;\n    markUpdated(R.geo, n);',
    '    M.n = 0;\n    R.geo.instanceCount = n;\n    markUpdated(R.geo, n, R.staticDirty ? null : R.geo.attributes.aColA, R.staticDirty ? null : R.geo.attributes.aMisc);\n    R.staticDirty = false;');
  assert.ok(main.includes('if (R.staticDirty) {'), 'preimage accurately reflects the main adapter');
  const optimized = adaptRenderTransfers('src/fx/fx.js', main, replaceOnce);
  assert.ok(optimized.includes('a === staticAttribute || a === staticAttribute2 || a._fxStatic'));
  assert.ok(optimized.includes('if (i >= R.dirtyStart && i < R.dirtyEnd)'));
  assert.ok(optimized.includes('markUpdated(R.geo, n, R.geo.attributes.aColA, R.geo.attributes.aMisc);'));
  assert.equal(adaptRenderTransfers('src/fx/fx.js', optimized, replaceOnce), optimized);
});

test('live rings halve attribute transfers with exact simulation and render attributes', () => {
  const a=ringFixture(THREE,false,300), b=ringFixture(THREE,true,300), ta=uploadTracker(), tb=uploadTracker();
  for(let i=0;i<300;i++) for(const f of [a,b]) f._ringRaw(new THREE.Vector3(i*.01,0,0),new THREE.Vector3(0,1,0),new THREE.Color(.9,.1,.4),1,10,i%8,.8,1,.1,0,.2);
  for(const f of [a,b]) f._updateRings(0);
  ta.draw(a.rings.geo);tb.draw(b.rings.geo);ta.reset();tb.reset();
  for(let i=0;i<120;i++){
    a._updateRings(1/60);b._updateRings(1/60);ta.draw(a.rings.geo);tb.draw(b.rings.geo);same(a,b,ta,tb);
  }
  assert.equal(ta.stats().bytes,300*64*120);
  assert.equal(tb.stats().bytes,300*32*120);
  assert.equal(ta.stats().calls,480);assert.equal(tb.stats().calls,240);
});

test('birth, overflow recycle, compaction, marks, skipped render, clear and GPU recreation stay exact', () => {
  const a=ringFixture(THREE,false,17),b=ringFixture(THREE,true,17),rnd=randomStream(2481);
  let ta=uploadTracker(),tb=uploadTracker();
  for(let frame=0;frame<900;frame++){
    if(frame%131===0){a.clear();b.clear();}
    const births=frame%49===0?30:Math.floor(rnd()*4);
    for(let i=0;i<births;i++){
      const args=[new THREE.Vector3(rnd(),rnd(),rnd()),new THREE.Vector3(rnd()-.5,rnd()-.5,rnd()-.5),new THREE.Color(rnd(),rnd(),rnd()),rnd()*3,.03+rnd()*1.2,Math.floor(rnd()*8),rnd(),rnd(),rnd()-.5,rnd()-.5,rnd()-.5];
      a._ringRaw(...args);b._ringRaw(...args);
    }
    const marks=frame%23===0?48:Math.floor(rnd()*5);
    for(let i=0;i<marks;i++){
      const args=[new THREE.Vector3(rnd(),rnd(),rnd()),new THREE.Vector3(rnd(),rnd(),rnd()),new THREE.Color(rnd(),rnd(),rnd()),rnd(),Math.floor(rnd()*8),rnd(),rnd(),rnd(),rnd()];
      a.mark(...args);b.mark(...args);
    }
    const dt=[1/30,1/60,1/120,0][frame%4];a._updateRings(dt);b._updateRings(dt);same(a,b);
    if(frame%17===0){ta=uploadTracker();tb=uploadTracker();}
    if(frame%5===0){ta.draw(a.rings.geo);tb.draw(b.rings.geo);same(a,b,ta,tb);}
  }
});
