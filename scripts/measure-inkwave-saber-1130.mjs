// Pure collision microbenchmark; not a browser/GPU or whole-match frame time.
import {performance} from 'node:perf_hooks';
import fs from 'node:fs';
import path from 'node:path';
import {MAIN_WEAPON_CATALOG} from '../patches/splatoon3/runtime/main-weapon-catalog-data.mjs';
import {saberSlashShape,saberSlashContact} from '../patches/splatoon3/runtime/saber-melee.mjs';
const iterations=Number(process.env.INKWAVE_SABER_BENCH_ITERATIONS)||1000000;
const origin={x:0,y:.9,z:.3},feet={x:0,y:0,z:0},out={set(x,y,z){this.x=x;this.y=y;this.z=z;}};
const results=[];
for(const record of MAIN_WEAPON_CATALOG.records.filter(r=>r.family==='splatana'))for(const key of ['saber-horizontal','saber-vertical']){
 const shape=saberSlashShape(record,key),halves=shape.half,c=shape.center;
 origin.x=shape.offset.X;origin.y=shape.offset.Y;origin.z=shape.offset.Z;
 const before=()=>{let hits=0;for(let i=0;i<iterations;i++){
  const x=(i%101)*.1-5,z=(Math.floor(i/101)%101)*.1-5,y=(i%9)*.3-1;
  if(Math.abs(x-c.X)<halves.X+.38&&Math.abs(z-c.Z)<halves.Z+.38&&Math.abs(y)<halves.Y+1.45)hits++;
 }return hits;};
 const after=()=>{let hits=0;for(let i=0;i<iterations;i++){
  feet.x=(i%101)*.1-5;feet.z=(Math.floor(i/101)%101)*.1-5;feet.y=(i%9)*.3-1;
  if(saberSlashContact(shape,origin,0,feet,.35,1.65,out))hits++;
 }return hits;};
 const sample=fn=>{const start=performance.now();const hits=fn();return {ms:performance.now()-start,hits};};
 before();after();const a=[],b=[];for(let i=0;i<5;i++){a.push(sample(before));b.push(sample(after));}
 const median=rows=>rows.sort((a,b)=>a.ms-b.ms)[2];
 results.push({id:record.id,key,iterations,before:median(a),after:median(b),basis:'old terrain-envelope rectangle vs new receiving capsule/source compound shape; changed hit totals are expected'});
}
const report={node:process.version,kind:'single-thread pure collision microbenchmark',results};
const output=process.argv[2];if(output){fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report,null,2));
