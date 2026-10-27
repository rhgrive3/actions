#!/usr/bin/env node
// Geometry-only LOD derived from the already bundled ink mesh/coverage.
// Never copies RGB/reference media; the only stored pixel is generated white.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {unpackVolumes} from '../patches/local-quality/ink-volume/pack.mjs';
import {buildInkMesh} from '../patches/local-quality/ink-volume/mesh.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url)),source=path.join(ROOT,'patches/local-quality/ink-volume/assets/roller');
export function generate(out=path.join(ROOT,'patches/local-quality/ink-volume/assets/hissen-fallback')){
 const m=JSON.parse(fs.readFileSync(path.join(source,'manifest.json'))),raw=zlib.gunzipSync(fs.readFileSync(path.join(source,m.binary)));
 if(crypto.createHash('sha256').update(raw).digest('hex')!==m.binarySHA256)throw Error('Canonical pack checksum mismatch');
 const pack=unpackVolumes(m,raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength)),chunks=[];let bytes=0,maxTriangles=0;
 const append=a=>{const pad=(4-bytes%4)%4;if(pad){chunks.push(Buffer.alloc(pad));bytes+=pad;}const d={offset:bytes,length:a.length};chunks.push(Buffer.from(a.buffer,a.byteOffset,a.byteLength));bytes+=a.byteLength;return d;};
 const bounds=p=>{const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(let i=0;i<p.length;i++) {lo[i%3]=Math.min(lo[i%3],p[i]);hi[i%3]=Math.max(hi[i%3],p[i]);}return [lo,hi];};
 const patterns=pack.patterns.map(p=>({name:'canonical-contour-lod',width:1,height:1,meshAspect:1,fps:p.fps,frames:p.frames.map(f=>{
  const size=48,rgba=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   let alpha=0,weight=0;for(let sy=Math.floor(y*p.height/size);sy<Math.ceil((y+1)*p.height/size);sy++)for(let sx=Math.floor(x*p.width/size);sx<Math.ceil((x+1)*p.width/size);sx++){
    const w=Math.max(0,Math.min(sx+1,(x+1)*p.width/size)-Math.max(sx,x*p.width/size))*Math.max(0,Math.min(sy+1,(y+1)*p.height/size)-Math.max(sy,y*p.height/size));alpha+=f.rgba[(sy*p.width+sx)*4+3]*w;weight+=w;
   }
   rgba.set([255,255,255,alpha/weight>=127.5?255:0],(y*size+x)*4);
  }
  const mesh=buildInkMesh(rgba,size,size),[lo,hi]=bounds(mesh.positions),[targetLo,targetHi]=bounds(f.levels[0].positions);
  // LOD filtering must not reinterpret DrawRadius or change the source envelope.
  const axisScale=hi.map((v,k)=>(targetHi[k]-targetLo[k])/(v-lo[k]));
  for(let i=0;i<mesh.positions.length;i++){const k=i%3;mesh.positions[i]=targetLo[k]+(mesh.positions[i]-lo[k])/(hi[k]-lo[k])*(targetHi[k]-targetLo[k]);}
  for(let i=0;i<mesh.normals.length;i+=3){let length=0;for(let k=0;k<3;k++){mesh.normals[i+k]/=axisScale[k];length+=mesh.normals[i+k]**2;}length=Math.sqrt(length);for(let k=0;k<3;k++)mesh.normals[i+k]/=length;}
  const indices=new Uint16Array(mesh.indices),triangles=indices.length/3;maxTriangles=Math.max(maxTriangles,triangles);
  if(mesh.positions.length/3>65535||triangles>10000)throw Error('Fallback geometry exceeds fixed bake bound');
  const index=append(indices);
  const level={positions:append(mesh.positions),normals:append(Int16Array.from(mesh.normals,x=>Math.round(x*32767))),normalBytes:2,uvs:append(mesh.uvs),indices:index,opaqueIndices:index,fringeIndices:append(new Uint16Array()),indexBytes:2};
  return {rgba:append(new Uint8Array([255,255,255,255])),levels:[level]};
 })}));
 const binary=Buffer.concat(chunks),compressed=zlib.gzipSync(binary,{level:9}),manifest={schema:'inkwave-volume-v1',binary:'volumes.bin.gz',compression:'gzip',byteLength:bytes,binarySHA256:crypto.createHash('sha256').update(binary).digest('hex'),derivedFromSHA256:m.binarySHA256,geometryOnly:true,lodCoverageResolution:48,maxTriangles,patterns};
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest)+'\n');fs.writeFileSync(path.join(out,'volumes.bin.gz'),compressed);
 return {bytes,compressedBytes:compressed.length,maxTriangles,frames:patterns.reduce((n,p)=>n+p.frames.length,0)};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(generate(process.argv[2])));
