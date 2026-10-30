import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const root='/workspace/actions-score-main',base='/workspace/actions-score-base';
const raw=zlib.gunzipSync(fs.readFileSync(root+'/reports/inkwave-coverage-prefix-20261030/native/ownership.json.gz'));
const capture=JSON.parse(raw),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
assert.equal(sha(raw),'1fc1eb9de12645487f304f5a145658eac9ce833a1cd5198e51a5c4a0d0278840');
const decode=(text,Type)=>{const bytes=Buffer.from(text,'base64');return new Type(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));};
const grid=decode(capture.grid,Uint8Array),cells=decode(capture.cells,Int32Array),weights=decode(capture.weights,Float64Array);
assert.equal(grid.length,1401174);assert.equal(cells.length,249161);assert.equal(weights.length,cells.length);
const events=capture.events.map(event=>({...event,writes:Int32Array.from(event.writes)}));
const final=grid.slice();
for(const event of events)for(let i=0;i<event.writes.length;i+=2)final[event.writes[i]]=event.writes[i+1];
const change=cell=>{const value=final[cell]===1?2:1;final[cell]=value;return [cell,value];};
events.push({kind:'wall',writes:change(cells[0]),usesOut:false,label:'silent early turf write plus known wall publication'},
  {kind:'turf',writes:change(cells.at(-1)),usesOut:true,label:'later known turf publication observes prior silent early write'},
  {kind:'unknown',writes:change(cells[Math.floor(cells.length/2)]),usesOut:false,label:'unknown version publication'},
  {kind:'turf',writes:[],usesOut:true,label:'known unchanged turf publication'});
const bits=values=>{const bytes=Buffer.allocUnsafe(16);bytes.writeDoubleLE(values[0],0);bytes.writeDoubleLE(values[1],8);return bytes.toString('hex');};
const variants={};
for(const [label,location]of Object.entries({'baseline-source':base+'/patches/splatoon3/runtime/scoring.mjs','baseline-emitted':base+'/_site/patches/splatoon3/runtime/scoring.mjs','candidate-source':root+'/patches/splatoon3/runtime/scoring.mjs','candidate-emitted':root+'/_site/patches/splatoon3/runtime/scoring.mjs'})){
  const api=await import(pathToFileURL(location));class Paint{}api.installScoring({PaintSystem:Paint});
  const owned=grid.slice(),dead=new Uint8Array(grid.length),faces=[];
  const paint=Object.assign(new Paint(),{grid:owned,dead,paintFaces:faces,version:0,_s3CoverageIndex:{grid:owned,dead,faces,cells,weights,area:capture.area}});
  const out=[0,0];assert.equal(bits(paint.coverage(out)),bits(capture.initialResult));
  const results=[];
  for(const event of events){
    for(let i=0;i<event.writes.length;i+=2)paint.grid[event.writes[i]]=event.writes[i+1];
    if(event.kind==='turf')api.notePaintMutation(paint,true);
    else if(event.kind==='wall')api.notePaintMutation(paint,false);
    else if(event.kind==='unknown')paint.version++;
    const actual=paint.coverage(event.usesOut?out:undefined);
    if(event.usesOut)assert.equal(actual,out);
    if(event.expected)assert.equal(bits(actual),bits(event.expected),label+' captured expected');
    results.push(bits(actual));
  }
  variants[label]={module:location,moduleSha256:sha(fs.readFileSync(location)),values:results,finalGridSha256:sha(paint.grid)};
}
const expected=variants['baseline-source'].values;
for(const [label,variant]of Object.entries(variants))assert.deepEqual(variant.values,expected,label+' all binary64 values');
assert.equal(new Set(Object.values(variants).map(v=>v.finalGridSha256)).size,1);
const result={status:'passed',scope:'One untimed functional replay; no browser or performance measurement',captureSha256:sha(raw),nativeSourceSha256:capture.nativeSourceSha256,gridCells:grid.length,eligibleCells:cells.length,capturedEvents:capture.events.length,directedEvents:4,valuesPerVariant:expected.length,variants,mismatches:0};
fs.writeFileSync(path.join(root,'.ci-scratch/score-main-verify/native-replay-parity.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({...result,variants:Object.fromEntries(Object.entries(variants).map(([k,v])=>[k,{...v,values:v.values.length}]))}));
