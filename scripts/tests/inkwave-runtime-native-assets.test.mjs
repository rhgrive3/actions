import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {hash,indexPrebuiltRuntimeAssets} from '../lib/inkwave-runtime-evidence.mjs';

function fixture(run) {
 const site=fs.mkdtempSync(path.join(os.tmpdir(),'iw-native-receipt-'));
 const record={id:'test',arrays:{vertices:{chunks:[{file:'vertices.0.bin',bytes:4,sha256:'a'.repeat(64)}]}},
  manifest:{prebuiltTexturePacks:[{file:'packs/color.bin',bytes:8,sha256:'b'.repeat(64)}]}};
 const seal=()=>{
  const bytes=Buffer.from(JSON.stringify(record));
  fs.mkdirSync(path.join(site,'native-prebuilt/test'),{recursive:true});
  fs.writeFileSync(path.join(site,'native-prebuilt/test/stage.json'),bytes);
  return {build:{nativeStages:{prebuilt:{stages:{test:{stageSha256:hash(bytes),bytes:bytes.length}}}}}};
 };
 try{run({site,record,seal});}finally{fs.rmSync(site,{recursive:true,force:true});}
}
test('native runtime index follows sealed records without admitting unrelated paths',()=>fixture(({site,seal})=>{
 const out=indexPrebuiltRuntimeAssets(site,seal());
 assert.deepEqual(Object.keys(out).sort(),['native-prebuilt/packs/color.bin','native-prebuilt/test/stage.json','native-prebuilt/test/vertices.0.bin']);
 assert.equal(out['native-prebuilt/test/vertices.0.bin'],'a'.repeat(64));
}));
test('changed native record cannot authorize data outside the built source identity',()=>fixture(({site,record,seal})=>{
 const manifest=seal();record.arrays.vertices.chunks[0].sha256='c'.repeat(64);seal();
 assert.throws(()=>indexPrebuiltRuntimeAssets(site,manifest),/record changed/);
}));
test('prebuilt chunk traversal and invalid hashes fail closed',()=>fixture(({site,record,seal})=>{
 for(const file of ['../secret','/secret','a/../../secret','a\\secret','a//b','a/./b']){
  record.arrays.vertices.chunks[0].file=file;
  assert.throws(()=>indexPrebuiltRuntimeAssets(site,seal()),/Invalid prebuilt chunk/);
 }
 record.arrays.vertices.chunks[0].file='vertices.0.bin';record.arrays.vertices.chunks[0].sha256='bad';
 assert.throws(()=>indexPrebuiltRuntimeAssets(site,seal()),/Invalid prebuilt runtime receipt/);
}));
test('conflicting pack receipts and mismatched stage identity fail closed',()=>fixture(({site,record,seal})=>{
 record.manifest.prebuiltTexturePacks.push({file:'packs/color.bin',bytes:8,sha256:'c'.repeat(64)});
 assert.throws(()=>indexPrebuiltRuntimeAssets(site,seal()),/Conflicting/);
 record.manifest.prebuiltTexturePacks.pop();record.id='other';
 assert.throws(()=>indexPrebuiltRuntimeAssets(site,seal()),/identity mismatch/);
}));
test('builds without prebuilt stage data retain their original empty index',()=>{
 assert.deepEqual(indexPrebuiltRuntimeAssets('.',{}),{});
});
