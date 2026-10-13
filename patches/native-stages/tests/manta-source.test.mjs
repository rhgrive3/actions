import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readStage} from './fixture.mjs';

const SOURCE=process.env.INKWAVE_NATIVE_STAGE_SOURCE,ASSETS=process.env.INKWAVE_NATIVE_STAGE_ASSETS;
const REV='0611f51b35c9736ee986fb2218461e2585b7875e';

test('Manta independently compares every OBJ position, normal, UV and face index plus all pinned PNG/MTL blobs',{skip:!SOURCE||!ASSETS},async()=>{
 const data=readStage(ASSETS,'manta'),src=path.join(SOURCE,'Vss_Pillar03'),obj=path.join(src,'Vss_Pillar03.obj');
 const digest=crypto.createHash('sha256');let byteCount=0;
 for await(const chunk of fs.createReadStream(obj)){digest.update(chunk);byteCount+=chunk.length;}
 assert.equal(byteCount,63601709);
 assert.equal(digest.digest('hex'),data.manifest.sourceSha256);
 let position=0,normal=0,uv=0,index=0,object=0,vertexBase=0,uvBase=0,normalBase=0,localVertices=0,localNormals=0,localUVs=0;
 for await(const line of readline.createInterface({input:fs.createReadStream(obj),crlfDelay:Infinity})){
  if(line.startsWith('o ')){
   vertexBase+=localVertices;normalBase+=localNormals;uvBase+=localUVs;localVertices=localNormals=localUVs=0;
   assert.equal(line.slice(2).trim(),data.manifest.objects[object++].name);
  }else if(line.startsWith('v ')){
   const values=line.trim().split(/\s+/).slice(1,4).map(Number);
   for(let k=0;k<3;k++)assert.equal(Math.fround(values[k]),data.vertices[position*8+k]);
   position++;localVertices++;
  }else if(line.startsWith('vn ')){
   const values=line.trim().split(/\s+/).slice(1,4).map(Number);
   for(let k=0;k<3;k++)assert.equal(Math.fround(values[k]),data.vertices[normal*8+3+k]);
   normal++;localNormals++;
  }else if(line.startsWith('vt ')){
   const values=line.trim().split(/\s+/).slice(1,3).map(Number),row=vertexBase+localUVs;
   for(let k=0;k<2;k++)assert.equal(Math.fround(values[k]),data.vertices[row*8+6+k]);
   uv++;localUVs++;
  }else if(line.startsWith('f ')){
   const refs=line.trim().split(/\s+/).slice(1).map(t=>t.split('/').map(Number));
   for(const r of refs){assert.equal(r[0]-vertexBase,r[2]-normalBase);if(r[1])assert.equal(r[0]-vertexBase,r[1]-uvBase);}
   for(let j=1;j<refs.length-1;j++)for(const ref of [refs[0],refs[j],refs[j+1]])assert.equal(data.indices[index++],ref[0]-1-vertexBase);
  }
 }
 assert.equal(position,595742);assert.equal(normal,position);assert.equal(object,163);assert.equal(index,data.indices.length);assert.equal(index/3,317651);
 const repository=process.env.INKWAVE_NATIVE_STAGE_PINNED_REPO||path.dirname(SOURCE),rows=execFileSync('git',['-C',repository,'ls-tree','-rz',REV+':stages/Vss_Pillar03']);
 const pinned=new Map(rows.toString().split('\0').filter(Boolean).map(r=>{const [meta,name]=r.split('\t');return[name,meta.split(' ')[2]];}));
 let png=0,mtl=0,bytes=0;
 for(const [name,oid] of pinned){
  if(!name.endsWith('.png')&&!name.endsWith('.mtl'))continue;
  const raw=fs.readFileSync(path.join(src,name)),hash=crypto.createHash('sha1').update(Buffer.from('blob '+raw.length+'\0')).update(raw).digest('hex');
  assert.equal(hash,oid,name);bytes+=raw.length;name.endsWith('.png')?png++:mtl++;
 }
 assert(png>100);assert.equal(mtl,2);
 console.log(JSON.stringify({id:'manta',positionsFloat32Identical:position,normalsFloat32Identical:normal,uvFloat32Identical:uv,indicesUint32Identical:index,allPNG:png,allMTL:mtl,verifiedPNGAndMTLBytes:bytes,maxDifference:0}));
});
