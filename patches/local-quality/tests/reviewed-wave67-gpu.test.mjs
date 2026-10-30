import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {adaptReviewedWave67Gpu} from '../reviewed-wave67-gpu-adapter.mjs';

const source=readFileSync(new URL('../reviewed-wave67-gpu-adapter.mjs',import.meta.url),'utf8');
const labels=[...source.matchAll(/'GPU-[A-Za-z0-9]+ [^']*'/g)].map(m=>m[0]);

test('reviewed Wave 6/7 selects exactly the audited operations',()=>{
  assert.equal(labels.length,21);
  assert.equal(new Set(labels).size,21);
  for(const bad of ['GPU-03b','GPU-TEX1','GPU-SFX1a','GPU-22b','GPU-SFX3'])
    assert.ok(!labels.some(x=>x.startsWith("'"+bad+' ')),bad);
});

test('unknown modules remain unchanged and mismatched anchors fail closed',()=>{
  assert.equal(adaptReviewedWave67Gpu('src/game/netmatch.js','untouched',()=>{throw Error('not called')}),'untouched');
  assert.throws(()=>adaptReviewedWave67Gpu('src/world/paint.js','wrong upstream',()=>{}),/anchor missing/);
});

test('particle early discard is only taken when original would discard',()=>{
  for(let i=0;i<=1300;i++){
    const r=i/1000;
    for(const a of [0,0.001,0.002,0.5,1]){
      const previous=Math.pow(Math.max(1-r,0),2.4)*a<0.002;
      const early=r*r>=1||a<0.002;
      assert.ok(!early||previous);
    }
  }
});

test('current combat adapter hooks the reviewed changes without rewriting locked source',()=>{
  const adapter=readFileSync(new URL('../combat-gpu-cpu-perfect-adapter.mjs',import.meta.url),'utf8');
  assert.ok(adapter.includes("import { adaptReviewedWave67Gpu } from './reviewed-wave67-gpu-adapter.mjs';"));
  assert.ok(adapter.includes('code = adaptReviewedWave67Gpu(rel, code, replaceOnce);'));
  assert.ok(source.includes('if (cop != 0.0)'));
  assert.ok(source.includes('uPulse != 0.0 ?'));
});
