import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {ringFixture,uploadTracker} from './render-transfer-fixture.mjs';

const names=['aColA','aMisc'];
function birth(f,x=0){f._ringRaw(new THREE.Vector3(x,0,0),new THREE.Vector3(0,1,0),new THREE.Color(.9,.1,.4),1,20,0,.8,1,.1,0,.2);}
const staticRows=f=>names.map(name=>f.rings.geo.attributes[name]);
test('skipped draws retain pending ring uploads without signaling unchanged static arrays again',()=>{
 const f=ringFixture(THREE,true,17);birth(f);f._updateRings(0);
 const before=staticRows(f).map(a=>({version:a.version,array:a.array.slice(),ranges:structuredClone(a.updateRanges)}));
 for(let i=0;i<198;i++)f._updateRings(1/60);
 for(const [i,a]of staticRows(f).entries()){
  assert.deepEqual(a.array,before[i].array,names[i]+' stays unchanged');
  assert.deepEqual(a.updateRanges,before[i].ranges,names[i]+' pending range stays available');
  assert.equal(a.version,before[i].version,names[i]+' has no new dirty signal');
 }
 const upload=uploadTracker();upload.draw(f.rings.geo);
 for(const a of staticRows(f))assert.deepEqual(upload.gpu(a),a.array,'first actual draw receives pending bytes');
});
test('new dirty slots still signal during skipped draws and survive GPU reentry',()=>{
 const f=ringFixture(THREE,true,17);birth(f);f._updateRings(0);
 const first=staticRows(f).map(a=>a.version);
 for(let i=0;i<20;i++)f._updateRings(1/120);
 birth(f,2);f._updateRings(0);
 for(const [i,a]of staticRows(f).entries())assert.equal(a.version,first[i]+1,'new birth extends the pending upload');
 let upload=uploadTracker();upload.draw(f.rings.geo);upload.reset();
 const rendered=staticRows(f).map(a=>a.version);
 for(let i=0;i<20;i++)f._updateRings(1/30);
 for(const [i,a]of staticRows(f).entries())assert.equal(a.version,rendered[i],'clean visible interval stays clean');
 birth(f,3);f._updateRings(0);upload.draw(f.rings.geo);
 for(const a of staticRows(f))assert.deepEqual(upload.gpu(a).slice(0,12),a.array.slice(0,12),'later actual draw receives dirty live slots');
 upload=uploadTracker();upload.draw(f.rings.geo);
 for(const a of staticRows(f))assert.deepEqual(upload.gpu(a),a.array,'GPU recreation uploads complete current bytes');
});

test('real Three WebGLAttributes consumes the retained dirty range on reentry and recreates full buffers',()=>{
 const source=fs.readFileSync(new URL('../../../inkwave-public/vendor/three/build/three.module.js',import.meta.url),'utf8');
 const begin=source.indexOf('function WebGLAttributes( gl ) {'),end=source.indexOf('\nvar alphahash_fragment =',begin);
 assert.ok(begin>=0&&end>begin);
 const WebGLAttributes=new Function('return ('+source.slice(begin,end)+');')();
 const driver=()=>{
  let bound,subUploads=0;
  return {FLOAT:0x1406,ARRAY_BUFFER:0x8892,createBuffer:()=>({}),bindBuffer:(kind,buffer)=>{bound=buffer;},bufferData:(kind,array)=>{bound.data=array.slice();},bufferSubData:(kind,byteOffset,array,start=0,count=array.length-start)=>{bound.data.set(array.subarray(start,start+count),byteOffset/array.BYTES_PER_ELEMENT);subUploads++;},deleteBuffer:()=>{},subUploads:()=>subUploads};
 };
 const f=ringFixture(THREE,true,17);birth(f);f._updateRings(0);
 const gl=driver(),uploader=WebGLAttributes(gl);
 for(const a of staticRows(f))uploader.update(a,gl.ARRAY_BUFFER);
 birth(f,2);f._updateRings(0);
 const dirtyVersions=staticRows(f).map(a=>a.version);
 for(let i=0;i<198;i++)f._updateRings(1/60);
 for(const [i,a]of staticRows(f).entries()){
  assert.equal(a.version,dirtyVersions[i],'pending bytes keep one dirty signal');
  uploader.update(a,gl.ARRAY_BUFFER);
  assert.deepEqual(uploader.get(a).buffer.data.slice(0,8),a.array.slice(0,8),'real uploader receives both live slots');
  assert.equal(a.updateRanges.length,0,'real uploader consumes pending ranges');
 }
 assert.equal(gl.subUploads(),2);
 for(const a of staticRows(f))uploader.update(a,gl.ARRAY_BUFFER);
 assert.equal(gl.subUploads(),2,'unchanged drawn attributes do not upload again');
 const restored=driver(),recreated=WebGLAttributes(restored);
 for(const a of staticRows(f)){
  recreated.update(a,restored.ARRAY_BUFFER);
  assert.deepEqual(recreated.get(a).buffer.data,a.array,'new real uploader creates complete current buffers');
 }
});
