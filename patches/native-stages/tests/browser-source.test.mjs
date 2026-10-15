import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {sourceURL} from '../runtime/source-catalog.mjs';
import {nativeStageCatalog} from '../../../scripts/lib/inkwave-native-stages.mjs';
import {parseSourceOBJ,convertSource} from '../runtime/source-convert.mjs';
import {verifySourceBytes} from '../runtime/source-cache.mjs';
const SOURCE=process.env.INKWAVE_NATIVE_STAGE_SOURCE,ASSETS=process.env.INKWAVE_NATIVE_STAGE_ASSETS;
const selected=process.env.NATIVE_STAGE_IDS&&new Set(process.env.NATIVE_STAGE_IDS.split(','));
const SOURCE_STAGES=nativeStageCatalog().stages.filter(s=>(!selected||selected.has(s.id))&&(!ASSETS||fs.existsSync(path.join(ASSETS,s.id,'manifest.json'))));

test('source parser rejects split/out-of-object indices instead of corrupting UVs',()=>{
 const obj='o Fld_Test\nv 0 0 0\nv 1 0 0\nv 0 0 1\nvn 0 1 0\nvn 0 1 0\nvn 0 1 0\nvt 0 0\nvt 1 0\nvt 0 1\nf 1/1/1 3/3/3 2/2/2\n';
 assert.equal(parseSourceOBJ(obj).indices.length,3);
 assert.throws(()=>parseSourceOBJ(obj.replace('2/2/2','2/1/2')),/separate OBJ/);
 assert.throws(()=>parseSourceOBJ(obj.replace('2/2/2','4/4/4')),/separate OBJ/);
 assert.throws(()=>sourceURL(SOURCE_STAGES[0],'../other.obj'),/Invalid source/);
});
test('source verification rejects altered bytes even when sizes agree',async()=>{
 const b=new TextEncoder().encode('test source bytes'),header=Buffer.from('blob '+b.length+'\0');
 const pin={bytes:b.length,gitSha1:crypto.createHash('sha1').update(header).update(b).digest('hex')};
 await verifySourceBytes(b,pin);const altered=new Uint8Array(b);altered[0]^=1;
 await assert.rejects(verifySourceBytes(altered,pin),/integrity mismatch/);
 await assert.rejects(verifySourceBytes(b,{...pin,bytes:b.length+1}),/byte count mismatch/);
});
for(const stage of SOURCE_STAGES)test('browser conversion preserves source buffers and polygon mask: '+stage.id,{skip:!SOURCE||!ASSETS},()=>{
 const src=path.join(SOURCE,stage.internal),old=path.join(ASSETS,stage.id),files={};
 for(const name of fs.readdirSync(path.join(src,'textures')))files['textures/'+name]={};
 const data=convertSource(stage,fs.readFileSync(path.join(src,stage.internal+'.obj'),'utf8'),fs.readFileSync(path.join(src,stage.internal+'.mtl'),'utf8'),files);
 for(const [key,file] of [['vertices','vertices'],['indices','indices'],['triangles','collision'],['normals','normals'],['flags','flags'],['objectIds','objects'],['triangleFace','triangleFace'],['mask','mask']]){
  const actual=Buffer.from(data[key].buffer),expected=fs.readFileSync(path.join(old,file+'.bin')),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
  assert.equal(actual.length,expected.length,key+' byte count');
  assert.equal(sha(actual),sha(expected),key+' exact buffer digest');
 }
 assert.deepEqual(data.manifest.geometry,JSON.parse(fs.readFileSync(path.join(old,'manifest.json'))).geometry);
 assert.equal(data.manifest.version1130Verified,false);
 const ids=Array.from(data.order).sort((a,b)=>a-b);assert.ok(ids.every((id,i)=>id===i),'BVH visits every collision triangle once');
});
