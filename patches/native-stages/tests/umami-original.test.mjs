import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {readStage} from './fixture.mjs';
const SOURCE=process.env.INKWAVE_NATIVE_STAGE_SOURCE,ASSETS=process.env.INKWAVE_NATIVE_STAGE_ASSETS;
const enabled=!!SOURCE&&!!ASSETS&&fs.existsSync(path.join(ASSETS,'umami/manifest.json'));
// Independent original text comparison: no source converter/parser imports.
test('Umami original text preserves every float32 position normal UV and uint32 face index',{skip:!enabled},async()=>{
 const d=readStage(ASSETS,'umami'),file=path.join(SOURCE,'Vss_Factory00/Vss_Factory00.obj');
 let positions=0,normals=0,uvs=0,indices=0,offset=0;
 const lines=readline.createInterface({input:fs.createReadStream(file),crlfDelay:Infinity});
 for await(const line of lines){
  if(line.startsWith('o ')){offset=positions;continue;}
  let attribute=-1,count=0,row=0;
  if(line.startsWith('v ')){attribute=0;count=3;row=positions++;}
  else if(line.startsWith('vn ')){attribute=3;count=3;row=normals++;}
  else if(line.startsWith('vt ')){attribute=6;count=2;row=uvs++;}
  if(attribute>=0){const values=line.trim().split(/\s+/);for(let k=0;k<count;k++)assert.equal(d.vertices[row*8+attribute+k],Math.fround(Number(values[k+1])));continue;}
  if(line.startsWith('f ')){
   const ids=line.trim().split(/\s+/).slice(1).map(t=>Number(t.split('/')[0])-1-offset);
   for(let k=1;k<ids.length-1;k++)for(const id of [ids[0],ids[k],ids[k+1]])assert.equal(d.indices[indices++],id);
  }
 }
 assert.equal(positions,486036);assert.equal(normals,positions);assert.equal(uvs,positions);assert.equal(indices,1170666);
 assert.equal(d.vertices.length,positions*8);assert.equal(d.indices.length,indices);
});
