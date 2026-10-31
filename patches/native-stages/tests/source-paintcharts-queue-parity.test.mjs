import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {paintCharts as baseline} from './fixtures/source-paintcharts-before-queue.mjs';
import {sourceTriangleCellOverlap} from '../runtime/source-convert.mjs';
const source=fs.readFileSync(new URL('../runtime/source-convert.mjs',import.meta.url),'utf8');
const body=source.slice(source.indexOf('const roundEven='),source.indexOf('export function parseSourceMaterials'));
const candidate=new Function('F','sourceTriangleCellOverlap',body+'\nreturn paintCharts;')(Math.fround,sourceTriangleCellOverlap);
// The revised converter exposes an optional absent triangle index as an own
// undefined field. Its published chart payload remains otherwise identical.
// Keep every defined field and typed-array byte in the equality check.
const comparableChart = chart => chart && Object.hasOwn(chart,'faceTriangles') && chart.faceTriangles === undefined
  ? Object.fromEntries(Object.entries(chart).filter(([key])=>key!=='faceTriangles')) : chart;
let seed=12345;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
function sample(count){
 const triangles=new Float32Array(count*9),normals=new Float32Array(count*3),flags=new Uint32Array(count),objectIds=new Uint32Array(count),areas=new Float32Array(count);
 for(let i=0;i<count;i++){
  const axis=i%3,plane=(i%4)*.25,off=Math.floor(random()*3)*8-8;
  const coords=[random()+off,random()+off,random()+off,random()+off,random()+off,random()+off];
  for(let j=0;j<3;j++){const k=i*9+j*3;triangles[k+axis]=plane;triangles[k+(axis+1)%3]=coords[j*2];triangles[k+(axis+2)%3]=coords[j*2+1];}
  normals[i*3+axis]=1;flags[i]=i%11===0?0:2;objectIds[i]=i%5;areas[i]=.25;
 }
 return {triangles,normals,flags,objectIds,areas};
}
test('native chart grouping, projection, raster bytes, metadata and triangle IDs match fixed baseline',()=>{
 for(let i=0;i<120;i++){const data=sample(30+i%35),a=baseline(data),b=candidate(data);assert.deepEqual(comparableChart(b),comparableChart(a),'seeded chart set '+i);}
});
test('one final mask allocation replaces per-chart masks without changing output',()=>{
 let allocations=0;const Type=new Proxy(Uint8Array,{construct(t,args){allocations++;return Reflect.construct(t,args);}});
 const run=new Function('F','sourceTriangleCellOverlap','Uint8Array',body+'\nreturn paintCharts;')(Math.fround,sourceTriangleCellOverlap,Type),data=sample(90);
 assert.deepEqual(comparableChart(run(data)),comparableChart(baseline(data)));assert.equal(allocations,1);
});
