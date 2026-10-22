import test from 'node:test';
import assert from 'node:assert/strict';
import {terrainFileReceipt,assertTerrainReceipt} from '../lib/inkwave-terrain-receipt.mjs';
import {convertSource} from '../../patches/native-stages/runtime/source-convert.mjs';
import {validateNativeGeometry} from '../../patches/native-stages/tools/validate-geometry.mjs';
// Deliberately tiny mocked triangle: byte-admission regression only, NOT native
// Urchin coverage, geometry substitution, or evidence of native grounding.
function fixture(){
 const stage={id:'mock',internal:'Vss_Mock',sourceSha256:'mock',tree:'mock',bounds:{minX:0,maxX:2,minZ:0,maxZ:2},spawnPads:[[0,0,0],[1,0,1]]};
 return convertSource(stage,'o Fld_Mock\nusemtl Ground\nv 0 0 0\nv 0 0 2\nv 2 0 0\nvn 0 1 0\nvn 0 1 0\nvn 0 1 0\nf 1//1 2//2 3//3\n','newmtl Ground\nKd 1 1 1\n',{});
}
const mapping={vertices:'vertices',indices:'indices',triangles:'collision',normals:'normals',flags:'flags',objectIds:'objects',nodes:'bvh',order:'order',triangleFace:'triangleFace',mask:'mask'};
function receipt(data){
 const entries=Object.entries(mapping).map(([key,file])=>[file+'.bin',terrainFileReceipt(new Uint8Array(data[key].buffer))]);
 return {...Object.fromEntries(entries),'manifest.json':terrainFileReceipt(Buffer.from(JSON.stringify(data.manifest)))};
}
test('complete audit byte receipt admits unchanged mocked bytes',()=>{const data=fixture(),pin=receipt(data);assertTerrainReceipt(receipt(data),pin);});
for(const name of ['mask','normals'])test('rejects '+name+' corruption that structural audit counts cannot detect',()=>{
 const data=fixture(),counts=validateNativeGeometry(data),pin=receipt(data);
 if(name==='mask'){assert(data.mask.some(x=>x!==0));data.mask.fill(0);}else for(let i=0;i<data.normals.length;i++)data.normals[i]=-data.normals[i];
 assert.deepEqual(validateNativeGeometry(data),counts);
 const changed=receipt(data);assert.deepEqual(changed['vertices.bin'],pin['vertices.bin']);assert.deepEqual(changed['indices.bin'],pin['indices.bin']);
 assert.throws(()=>assertTerrainReceipt(changed,pin),new RegExp(name+'\\.bin'));
});
test('rejects changed manifest bytes even when geometry audit counts are equal',()=>{
 const data=fixture(),counts=validateNativeGeometry(data),pin=receipt(data);data.manifest.cell+=.01;
 assert.deepEqual(validateNativeGeometry(data),counts);assert.throws(()=>assertTerrainReceipt(receipt(data),pin),/manifest.json/);
});
test('rejects absent, missing-file, extra-file, size-corrupt and malformed receipts',()=>{
 const pin=receipt(fixture());assert.throws(()=>assertTerrainReceipt(pin,undefined));
 const missing={...pin};delete missing['mask.bin'];assert.throws(()=>assertTerrainReceipt(pin,missing));
 assert.throws(()=>assertTerrainReceipt(pin,{...pin,'extra.bin':pin['mask.bin']}));
 assert.throws(()=>assertTerrainReceipt(pin,{...pin,'mask.bin':{...pin['mask.bin'],bytes:pin['mask.bin'].bytes+1}}));
 assert.throws(()=>assertTerrainReceipt(pin,{...pin,'mask.bin':{bytes:1,sha256:'bad'}}));
});
