#!/usr/bin/env node
// Authored structural pixels for CI only. Never game artwork or source match.
import fs from 'node:fs';
import path from 'node:path';
import { bakeVolumes } from './bake-inkwave-volumes.mjs';
const out=path.resolve(process.argv[2]||'.ci-scratch/rods');fs.mkdirSync(out,{recursive:true});const inputs=[];
for(const [name,width,height] of [['line',32,8],['dot',16,16]]) {
 const b=new Uint8Array(80+width*height*4),v=new DataView(b.buffer);v.setUint32(0,0x00465456,true);v.setUint32(4,7,true);v.setUint32(8,2,true);v.setUint32(12,80,true);v.setUint16(16,width,true);v.setUint16(18,height,true);v.setUint16(24,1,true);v.setUint32(52,0,true);b[56]=1;v.setUint16(63,1,true);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++) {const on=name==='line'?x>0&&x<width-1&&y>1&&y<height-2:Math.hypot(x-width/2+.5,y-height/2+.5)<height*.43;b.set([255,255,255,on?255:0],80+(y*width+x)*4);}
 const file=path.join(out,'authored-'+name+'.vtf');fs.writeFileSync(file,b);inputs.push({file,shape:{thickness:1,backRatio:1,upperBias:0,interiorStep:2,fringePixels:1.1,edgeTaper:1,uvWindow:name==='line'?[.3,0,.7,1]:[0,0,1,1]}});
}await bakeVolumes(inputs,out);
