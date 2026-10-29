import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const source=fs.readFileSync(new URL('../paint-profile-batch.mjs',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replaceAll('export ','');
const install=new Function('PROFILE_BATCH_LIMIT',source+'\nreturn installPaintProfileBatch;')(64);
test('ineligible quad counts never inspect materials/GPU state yet preserve native draw and restoration',()=>{
 for(const count of [0,-1,65,6000,1.5,NaN,Infinity]){let calls=0,restores=0;class Paint{_initGPU(){}_drawQuads(value){calls++;assert.equal(this._iwPaintProfileBatch.prepared,false);return value}dispose(){}}install(Paint);const p=new Paint();p.quads=count;p._iwPaintProfileBatch={restore(){restores++}};Object.defineProperty(p,'mat',{get(){throw Error('irrelevant material scan')}});assert.equal(p._drawQuads('native'),'native');assert.equal(calls,1);assert.equal(restores,1);assert.equal(p._iwPaintProfileBatch.prepared,false);}
});
