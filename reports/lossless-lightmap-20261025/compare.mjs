import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {optimizeLightmapPng as after, decodeGrayLightmap, crc32} from '../../scripts/lib/inkwave-lossless-lightmap.mjs';
const base='dd90aa241aabd5f0b972cc3471386ba3d4da86dc';
const old=execFileSync('git',['show',base+':scripts/lib/inkwave-lossless-lightmap.mjs'],{cwd:fileURLToPath(new URL('../../',import.meta.url)),encoding:'utf8'});
const {optimizeLightmapPng:before}=await import('data:text/javascript;base64,'+Buffer.from(old).toString('base64'));
import {deflateSync} from 'node:zlib';
const root=fileURLToPath(new URL('../../',import.meta.url));
const paths=[...fs.readdirSync(root+'inkwave-public/assets/lightmaps').filter(x=>x.endsWith('.png')).map(x=>'inkwave-public/assets/lightmaps/'+x),'patches/practice-range/assets/lightmaps/range.png'];
const fixtures=paths.map(p=>({path:p,bytes:fs.readFileSync(root+p)}));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const chunk=(type,data)=>{const out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);out.write(type,4,'ascii');data.copy(out,8);out.writeUInt32BE(crc32(out.subarray(4,-4)),out.length-4);return out;};
let seed=0x12345678;
const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed>>>24;};
const extra=[];
for (const width of [1,2,3,7,31,32,127,320]) for (const height of [1,2,9]) for(const style of [0,1,2,3,4]) {
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(height,4);ihdr[8]=8;
 const packed=Buffer.alloc((width+1)*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)packed[y*(width+1)+x+1]=style===0?0:style===1?255:style===2?((x+y)&1?127:128):style===3?((x*7+y*31)&255):rand();
 const bytes=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(packed)),chunk('IEND',Buffer.alloc(0))]);
 extra.push({path:`${width}x${height}/style${style}`,bytes});
}
const comparisons=[];
for(const f of [...fixtures,...extra]) {const a=before(f.bytes),b=after(f.bytes);assert.deepEqual(b,a,f.path);if(fixtures.includes(f))comparisons.push({path:f.path,inputBytes:f.bytes.length,outputBytes:b.length,sha256:hash(b),height:decodeGrayLightmap(f.bytes).height});}
const samples={before:[],after:[]};
for(let run=0;run<10;run++) for(const name of run%2?['after','before']:['before','after']) {const fn=name==='before'?before:after;const start=performance.now();for(const f of fixtures)fn(f.bytes);if(run>0)samples[name].push(performance.now()-start);}
const median=a=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];
const result={node:process.version,baseline:'dd90aa241aabd5f0b972cc3471386ba3d4da86dc',byteIdenticalFixtures:fixtures.length+extra.length,production:comparisons,samples,medianMs:{before:median(samples.before),after:median(samples.after)},scratchBuffers:{before:comparisons.reduce((n,x)=>n+5*x.height,0),after:2*fixtures.length}};
result.reductionPercent=(1-result.medianMs.after/result.medianMs.before)*100;
if(process.argv.includes('--write-result'))fs.writeFileSync(new URL('comparison.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
