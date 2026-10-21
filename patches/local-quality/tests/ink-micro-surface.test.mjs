import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptInkMicroSurface } from '../ink-micro-surface-adapter.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
const path='src/world/inkShading.js';
const raw=fs.readFileSync(new URL('../../../inkwave-public/'+path,import.meta.url),'utf8');
const once=(code,a,b)=>{assert.equal(code.split(a).length,2);return code.replace(a,b);};
test('candidate changes exactly two existing normal amplitudes',()=>{
 const got=adaptInkMicroSurface(path,raw,once);
 assert.equal(got.replace('(0.7125 - 0.375 * gFresh)','(0.95 - 0.5 * gFresh)').replace('* 0.02625 * gf * gInk;','* 0.035 * gf * gInk;'),raw);
 for(const fresh of [0,.25,.5,.75,1]) assert.ok(Math.abs((.7125-.375*fresh)/(.95-.5*fresh)-.75)<1e-12);
 assert.equal((got.match(/textureGrad/g)||[]).length,(raw.match(/textureGrad/g)||[]).length);
 assert.throws(()=>adaptInkMicroSurface(path,got,once));
 assert.equal(adaptInkMicroSurface('src/world/paint.js',raw,once),raw);
});
test('production composition retains 4mm film, color, coverage and wet coat',()=>{
 const got=adaptBuildSource(path,raw);
 assert.ok(got.includes('(0.7125 - 0.375 * gFresh)'));
 assert.ok(got.includes('gInkD *= uPpm * 0.004 / 1.9'));
 for(const anchor of ['roughnessFactor = mix(gBaseRough, mix(0.26, 0.14, gFresh), gInk);','material.clearcoatF90 = mix(1.0, 0.3, gInk);','base = mix(base, gInkCol, gInk);'])assert.ok(got.includes(anchor));
});
