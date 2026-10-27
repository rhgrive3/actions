import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {drawnBounds} from '../generate-inkwave-hissen-fallback.mjs';
import {dedupeVersionedVolumeAssets} from '../lib/inkwave-volume-packaging.mjs';
const scratch=new URL('../../.ci-scratch/',import.meta.url);fs.mkdirSync(scratch,{recursive:true});
const revision='a'.repeat(64);
function fixture() {
 const root=fs.mkdtempSync(path.join(scratch.pathname,'volume-packaging-'));
 for(const slot of ['roller','shooter','hissen-fallback']) {
  const dir=`patches/local-quality/ink-volume/assets/${slot}`;
  for(const prefix of ['',`_versions/${revision}/`]) {
   const target=path.join(root,prefix,dir);fs.mkdirSync(target,{recursive:true});
   fs.writeFileSync(path.join(target,'manifest.json'),JSON.stringify({binary:'volumes.bin.gz',compression:'gzip',cacheSlot:slot,geometryOnly:slot==='hissen-fallback',binarySHA256:'b'.repeat(64)}));
   fs.writeFileSync(path.join(target,'volumes.bin.gz'),Buffer.alloc(200000,slot==='roller'?7:8));
  }
 }
 return root;
}
test('stable and revision manifests resolve identical bytes with one large copy',()=>{
 const root=fixture();
 try {
  const result=dedupeVersionedVolumeAssets(root,revision);assert.deepEqual(result,{binaryCopiesRemoved:3,duplicateBytesRemoved:600000});
  for(const slot of ['roller','shooter','hissen-fallback']) {
   const rel=`patches/local-quality/ink-volume/assets/${slot}/manifest.json`;
   const stable=JSON.parse(fs.readFileSync(path.join(root,rel)));
   const immutable=JSON.parse(fs.readFileSync(path.join(root,'_versions',revision,rel)));
   assert.equal(immutable.binary,'volumes.bin.gz');assert.equal(immutable.binarySHA256,stable.binarySHA256);
   for(const prefix of ['https://example.test/','https://example.test/actions/'])
    assert.equal(new URL(stable.binary,new URL(rel,prefix)).href,new URL(`_versions/${revision}/patches/local-quality/ink-volume/assets/${slot}/volumes.bin.gz`,prefix).href);
   assert.equal(fs.statSync(path.resolve(path.dirname(path.join(root,rel)),stable.binary)).size,200000);
   assert.equal(fs.existsSync(path.join(root,path.dirname(rel),'volumes.bin.gz')),false);
  }
 } finally {fs.rmSync(root,{recursive:true,force:true});}
});
test('corrupted immutable copy fails before deleting either stable binary',()=>{
 const root=fixture();
 try {
  fs.appendFileSync(path.join(root,'_versions',revision,'patches/local-quality/ink-volume/assets/shooter/volumes.bin.gz'),'corrupt');
  assert.throws(()=>dedupeVersionedVolumeAssets(root,revision),/bytes differ/);
  for(const slot of ['roller','shooter','hissen-fallback'])assert(fs.existsSync(path.join(root,'patches/local-quality/ink-volume/assets',slot,'volumes.bin.gz')));
 } finally {fs.rmSync(root,{recursive:true,force:true});}
});


test('contour bounds ignore unused vertices and include effective opacity passes',()=>{
 const positions=new Float32Array([-1,-2,-3,4,5,6,999,999,999]);
 assert.deepEqual(drawnBounds(positions,[new Uint16Array([0]),new Uint16Array([1])]),[[-1,-2,-3],[4,5,6]]);
});

test('corrupted contour immutable copy fails before removing any generated public binary',()=>{
 const root=fixture();try{fs.appendFileSync(path.join(root,'_versions',revision,'patches/local-quality/ink-volume/assets/hissen-fallback/volumes.bin.gz'),'corrupt');assert.throws(()=>dedupeVersionedVolumeAssets(root,revision),/bytes differ/);for(const slot of ['roller','shooter','hissen-fallback'])assert(fs.existsSync(path.join(root,'patches/local-quality/ink-volume/assets',slot,'volumes.bin.gz')));}finally{fs.rmSync(root,{recursive:true,force:true});}
});
