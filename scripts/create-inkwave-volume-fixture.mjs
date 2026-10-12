#!/usr/bin/env node
// Authored structural test data, never a replacement for the original assets.
import fs from 'node:fs';
import path from 'node:path';
import { bakeVolumes } from './bake-inkwave-volumes.mjs';
const dir = path.resolve(process.argv[2] || '.ci-scratch/volume-fixture'); fs.mkdirSync(dir,{recursive:true});
const paths=[];
for(let pattern=0;pattern<2;pattern++) {
 const width=32,height=32,frames=16,bytes=new Uint8Array(80+width*height*4*frames),v=new DataView(bytes.buffer);
 v.setUint32(0,0x00465456,true);v.setUint32(4,7,true);v.setUint32(8,2,true);v.setUint32(12,80,true);v.setUint16(16,width,true);v.setUint16(18,height,true);v.setUint16(24,frames,true);v.setUint32(52,0,true);bytes[56]=1;v.setUint16(63,1,true);
 for(let frame=0;frame<frames;frame++)for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
  const dx=(x-14)/12,dy=(y-14)/11,r=dx*dx+dy*dy,hole=Math.hypot(x-12-pattern*3,y-12)>3+frame/10;
  const on=r<1&&hole||Math.hypot(x-28,y-27)<1.8;
  bytes.set([255,255,255,on?(x<5?85:255):0],80+(frame*width*height+y*width+x)*4);
 }
 const p=path.join(dir,'authored-test-'+pattern+'.vtf');fs.writeFileSync(p,bytes);paths.push(p);
}
await bakeVolumes(paths,dir);
